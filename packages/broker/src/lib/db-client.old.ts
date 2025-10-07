/**
 * Database Client for AINP Broker
 * PostgreSQL + pgvector operations
 */

import { Pool, PoolClient } from 'pg';
import { SemanticAddress, TrustVector } from '@ainp/core';

export class DatabaseClient {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Register agent in discovery index
   */
  async registerAgent(address: SemanticAddress, ttl: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert or update agent
      await client.query(
        `
        INSERT INTO agents (did, capabilities, credentials, ttl, expires_at)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 millisecond' * $4)
        ON CONFLICT (did) DO UPDATE SET
          capabilities = $2,
          credentials = $3,
          ttl = $4,
          expires_at = NOW() + INTERVAL '1 millisecond' * $4,
          updated_at = NOW()
        `,
        [address.did, JSON.stringify(address.capabilities), address.credentials || [], ttl]
      );

      // Insert capability embeddings for vector search
      for (const capability of address.capabilities) {
        await client.query(
          `
          INSERT INTO capability_embeddings (did, capability_description, embedding, tags)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (did, capability_description) DO UPDATE SET
            embedding = $3,
            tags = $4,
            updated_at = NOW()
          `,
          [address.did, capability.description, capability.embedding, capability.tags]
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
   */
  async searchAgentsByEmbedding(
    queryEmbedding: string,
    minSimilarity: number = 0.7,
    limit: number = 10
  ): Promise<SemanticAddress[]> {
    const result = await this.pool.query(
      `
      SELECT DISTINCT ON (a.did)
        a.did,
        a.capabilities,
        a.credentials,
        ts.score,
        ts.reliability,
        ts.honesty,
        ts.competence,
        ts.timeliness,
        ts.decay_rate,
        ts.last_updated,
        (ce.embedding <=> $1::vector) AS similarity
      FROM agents a
      JOIN capability_embeddings ce ON a.did = ce.did
      LEFT JOIN trust_scores ts ON a.did = ts.did
      WHERE a.expires_at > NOW()
        AND (ce.embedding <=> $1::vector) <= $2
      ORDER BY a.did, similarity ASC
      LIMIT $3
      `,
      [queryEmbedding, 1 - minSimilarity, limit]
    );

    return result.rows.map((row) => ({
      did: row.did,
      capabilities: row.capabilities,
      credentials: row.credentials || [],
      trust: {
        score: row.score || 0.5,
        dimensions: {
          reliability: row.reliability || 0.5,
          honesty: row.honesty || 0.5,
          competence: row.competence || 0.5,
          timeliness: row.timeliness || 0.5,
        },
        decay_rate: row.decay_rate || 0.977,
        last_updated: row.last_updated || Date.now(),
      },
    }));
  }

  /**
   * Get agent by DID
   */
  async getAgent(did: string): Promise<SemanticAddress | null> {
    const result = await this.pool.query(
      `
      SELECT a.did, a.capabilities, a.credentials, ts.*
      FROM agents a
      LEFT JOIN trust_scores ts ON a.did = ts.did
      WHERE a.did = $1 AND a.expires_at > NOW()
      `,
      [did]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      did: row.did,
      capabilities: row.capabilities,
      credentials: row.credentials || [],
      trust: {
        score: row.score || 0.5,
        dimensions: {
          reliability: row.reliability || 0.5,
          honesty: row.honesty || 0.5,
          competence: row.competence || 0.5,
          timeliness: row.timeliness || 0.5,
        },
        decay_rate: row.decay_rate || 0.977,
        last_updated: row.last_updated || Date.now(),
      },
    };
  }

  /**
   * Update trust score
   */
  async updateTrustScore(did: string, trust: TrustVector): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO trust_scores (did, score, reliability, honesty, competence, timeliness, decay_rate, last_updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (did) DO UPDATE SET
        score = $2,
        reliability = $3,
        honesty = $4,
        competence = $5,
        timeliness = $6,
        decay_rate = $7,
        last_updated = $8
      `,
      [
        did,
        trust.score,
        trust.dimensions.reliability,
        trust.dimensions.honesty,
        trust.dimensions.competence,
        trust.dimensions.timeliness,
        trust.decay_rate,
        trust.last_updated,
      ]
    );
  }

  /**
   * Cleanup expired agents
   */
  async cleanupExpiredAgents(): Promise<number> {
    const result = await this.pool.query(
      `
      DELETE FROM agents WHERE expires_at <= NOW()
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
