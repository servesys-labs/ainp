/**
 * Database Client for AINP Broker
 * PostgreSQL + pgvector operations
 *
 * Updated to match normalized schema (agents + capabilities tables)
 */

import { Pool, PoolClient } from 'pg';
import { SemanticAddress, TrustVector, Capability } from '@ainp/core';

/**
 * Validate DATABASE_URL environment variable
 * @throws {Error} If DATABASE_URL is not set
 */
function validateDatabaseUrl(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is required. ' +
      'Example: postgres://user:pass@host:5432/dbname'
    );
  }
}

/**
 * Connect to database with retry logic
 * Handles Railway connection failures gracefully
 */
async function connectWithRetry(pool: Pool, retries: number = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('✅ Database connected');
      return;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1}/${retries} failed:`, err);
      if (i === retries - 1) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Health check for database connection
 * @param pool Database connection pool
 * @returns true if connected, false otherwise
 */
export async function isConnected(pool: Pool): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

export class DatabaseClient {
  public pool: Pool; // Expose pool for transaction access

  constructor(connectionString?: string) {
    // Validate DATABASE_URL if no connectionString provided
    if (!connectionString) {
      validateDatabaseUrl();
    }

    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // Railway timeout (increased from 2000)
    });
  }

  /**
   * Connect to database (for testing)
   * Uses retry logic for Railway connection failures
   */
  async connect(): Promise<void> {
    await connectWithRetry(this.pool);
  }

  /**
   * Health check for this client instance
   * @returns true if connected, false otherwise
   */
  async isConnected(): Promise<boolean> {
    return isConnected(this.pool);
  }

  /**
   * Disconnect from database (for testing)
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Execute a query (convenience method)
   */
  async query(text: string, params?: any[]): Promise<any> {
    return this.pool.query(text, params);
  }

  /**
   * Convert embedding to PostgreSQL vector format
   * Handles both base64-encoded and array formats
   */
  private embeddingToVector(embedding: string | number[]): string {
    if (Array.isArray(embedding)) {
      // Already an array, convert to PostgreSQL vector format
      return `[${embedding.join(',')}]`;
    }

    // Base64 string - decode to Float32Array then convert
    const buffer = Buffer.from(embedding, 'base64');
    const float32Array = new Float32Array(buffer.buffer);
    return `[${Array.from(float32Array).join(',')}]`;
  }

  /**
   * Register agent in discovery index
   * Uses normalized schema: agents + capabilities tables
   */
  async registerAgent(address: SemanticAddress, ttl: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Calculate expiration timestamp
      const expiresAt = new Date(Date.now() + ttl);

      // Insert or update agent
      const agentResult = await client.query(
        `
        INSERT INTO agents (did, public_key, ttl, expires_at, last_seen_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (did) DO UPDATE SET
          ttl = $3,
          expires_at = $4,
          last_seen_at = NOW()
        RETURNING id
        `,
        [address.did, address.credentials?.[0] || 'placeholder-public-key', ttl, expiresAt]
      );

      const agentId = agentResult.rows[0].id;

      // Delete existing capabilities for this agent (will be re-inserted)
      await client.query(
        `DELETE FROM capabilities WHERE agent_id = $1`,
        [agentId]
      );

      // Insert capability embeddings for vector search
      for (const capability of address.capabilities) {
        const vectorStr = this.embeddingToVector(capability.embedding);

        await client.query(
          `
          INSERT INTO capabilities (agent_id, description, embedding, tags, version, evidence_vc)
          VALUES ($1, $2, $3::vector, $4, $5, $6)
          `,
          [
            agentId,
            capability.description,
            vectorStr,
            capability.tags,
            capability.version,
            capability.evidence || null,
          ]
        );
      }

      // Insert or update trust score
      if (address.trust) {
        await client.query(
          `
          INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness, decay_rate, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (agent_id) DO UPDATE SET
            score = $2,
            reliability = $3,
            honesty = $4,
            competence = $5,
            timeliness = $6,
            decay_rate = $7,
            last_updated = NOW()
          `,
          [
            agentId,
            address.trust.score,
            address.trust.dimensions.reliability,
            address.trust.dimensions.honesty,
            address.trust.dimensions.competence,
            address.trust.dimensions.timeliness,
            address.trust.decay_rate,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search agents by embedding similarity
   * Uses normalized schema with JOIN between capabilities and agents
   * Web4 POU-lite: Returns usefulness_score_cached for ranking
   */
  async searchAgentsByEmbedding(
    queryEmbedding: string,
    minSimilarity: number = 0.7,
    limit: number = 10
  ): Promise<SemanticAddress[]> {
    // Convert base64 embedding to PostgreSQL vector format
    const vectorStr = this.embeddingToVector(queryEmbedding);

    const result = await this.pool.query(
      `
      WITH capability_matches AS (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.did,
          a.public_key,
          a.usefulness_score_cached,
          a.usefulness_last_updated,
          ts.score,
          ts.reliability,
          ts.honesty,
          ts.competence,
          ts.timeliness,
          ts.decay_rate,
          ts.last_updated,
          (c.embedding <=> $1::vector) AS distance
        FROM agents a
        JOIN capabilities c ON a.id = c.agent_id
        LEFT JOIN trust_scores ts ON a.id = ts.agent_id
        WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
          AND (c.embedding <=> $1::vector) <= $2
        ORDER BY a.id, distance ASC
      )
      SELECT
        cm.*,
        json_agg(
          json_build_object(
            'description', c.description,
            'embedding', c.embedding::text,
            'tags', c.tags,
            'version', c.version,
            'evidence', c.evidence_vc
          )
        ) AS capabilities
      FROM capability_matches cm
      JOIN agents a ON cm.id = a.id
      JOIN capabilities c ON a.id = c.agent_id
      GROUP BY cm.id, cm.did, cm.public_key, cm.usefulness_score_cached, cm.usefulness_last_updated, cm.score, cm.reliability, cm.honesty, cm.competence, cm.timeliness, cm.decay_rate, cm.last_updated, cm.distance
      ORDER BY cm.distance ASC
      LIMIT $3
      `,
      [vectorStr, 1 - minSimilarity, limit]
    );

    return result.rows.map((row) => ({
      did: row.did,
      capabilities: row.capabilities as Capability[],
      credentials: [row.public_key],
      trust: {
        score: row.score || 0.5,
        dimensions: {
          reliability: row.reliability || 0.5,
          honesty: row.honesty || 0.5,
          competence: row.competence || 0.5,
          timeliness: row.timeliness || 0.5,
        },
        decay_rate: row.decay_rate || 0.977,
        last_updated: row.last_updated ? new Date(row.last_updated).getTime() : Date.now(),
      },
      usefulness_score_cached: row.usefulness_score_cached || 0,
      usefulness_last_updated: row.usefulness_last_updated ? new Date(row.usefulness_last_updated).getTime() : undefined,
      similarity: 1 - row.distance, // Convert distance to similarity for ranking
    }));
  }

  /**
   * Get agent by DID
   * Uses normalized schema with JOIN
   */
  async getAgent(did: string): Promise<SemanticAddress | null> {
    const result = await this.pool.query(
      `
      SELECT
        a.id,
        a.did,
        a.public_key,
        ts.score,
        ts.reliability,
        ts.honesty,
        ts.competence,
        ts.timeliness,
        ts.decay_rate,
        ts.last_updated,
        json_agg(
          json_build_object(
            'description', c.description,
            'embedding', c.embedding::text,
            'tags', c.tags,
            'version', c.version,
            'evidence', c.evidence_vc
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS capabilities
      FROM agents a
      LEFT JOIN capabilities c ON a.id = c.agent_id
      LEFT JOIN trust_scores ts ON a.id = ts.agent_id
      WHERE a.did = $1 AND (a.expires_at IS NULL OR a.expires_at > NOW())
      GROUP BY a.id, a.did, a.public_key, ts.score, ts.reliability, ts.honesty, ts.competence, ts.timeliness, ts.decay_rate, ts.last_updated
      `,
      [did]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      did: row.did,
      capabilities: row.capabilities || [],
      credentials: [row.public_key],
      trust: {
        score: row.score || 0.5,
        dimensions: {
          reliability: row.reliability || 0.5,
          honesty: row.honesty || 0.5,
          competence: row.competence || 0.5,
          timeliness: row.timeliness || 0.5,
        },
        decay_rate: row.decay_rate || 0.977,
        last_updated: row.last_updated ? new Date(row.last_updated).getTime() : Date.now(),
      },
    };
  }

  /**
   * Update trust score
   * Fixed: trust_scores uses agent_id (UUID), not did (TEXT)
   */
  async updateTrustScore(did: string, trust: TrustVector): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness, decay_rate, last_updated)
      SELECT id, $2, $3, $4, $5, $6, $7, NOW()
      FROM agents
      WHERE did = $1
      ON CONFLICT (agent_id) DO UPDATE SET
        score = $2,
        reliability = $3,
        honesty = $4,
        competence = $5,
        timeliness = $6,
        decay_rate = $7,
        last_updated = NOW()
      `,
      [
        did,
        trust.score,
        trust.dimensions.reliability,
        trust.dimensions.honesty,
        trust.dimensions.competence,
        trust.dimensions.timeliness,
        trust.decay_rate,
      ]
    );
  }

  /**
   * Cleanup expired agents
   */
  async cleanupExpiredAgents(): Promise<number> {
    const result = await this.pool.query(
      `
      DELETE FROM agents WHERE expires_at IS NOT NULL AND expires_at <= NOW()
      `
    );

    return result.rowCount || 0;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
