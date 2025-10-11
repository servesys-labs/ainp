/**
 * pgvector Client for AINP
 * Phase 0.1 - Foundation (Day 1 pgvector)
 */

import { Pool, PoolClient } from 'pg'
import { Logger } from './logger.js'

const logger = new Logger({ serviceName: 'ainp-core:vector' })

export interface VectorConfig {
  connectionString?: string
}

export interface UpsertCapabilityParams {
  agentId: string
  description: string
  embedding: number[]  // 1536-dim float array
  tags: string[]
  version: string
  evidenceVc?: string
}

export interface SearchSimilarParams {
  queryEmbedding: number[]
  limit?: number
  threshold?: number
  tags?: string[]
  minTrust?: number
}

export interface VectorSearchResult {
  agentId: string
  capability: {
    id: string
    description: string
    tags: string[]
    version: string
  }
  similarity: number
  trustScore?: number
}

/**
 * pgvector client wrapper for AINP
 */
export class VectorClient {
  private pool: Pool
  private config: VectorConfig

  constructor(config: VectorConfig = {}) {
    this.config = {
      connectionString:
        config.connectionString ||
        process.env.DATABASE_URL ||
        'postgresql://ainp:ainp@localhost:5432/ainp',
    }

    this.pool = new Pool({
      connectionString: this.config.connectionString,
    })
  }

  /**
   * Upsert capability with embedding (stored directly in Postgres)
   */
  async upsertCapability(params: UpsertCapabilityParams): Promise<string> {
    const { agentId, description, embedding, tags, version, evidenceVc } =
      params

    if (embedding.length !== 1536) {
      throw new Error(
        `Invalid embedding dimension: expected 1536, got ${embedding.length}`
      )
    }

    const result = await this.pool.query(
      `INSERT INTO capabilities (agent_id, description, embedding, tags, version, evidence_vc)
       VALUES ($1, $2, $3::vector, $4, $5, $6)
       ON CONFLICT (agent_id, description) DO UPDATE
       SET embedding = EXCLUDED.embedding,
           tags = EXCLUDED.tags,
           version = EXCLUDED.version,
           evidence_vc = EXCLUDED.evidence_vc,
           updated_at = NOW()
       RETURNING id`,
      [
        agentId,
        description,
        `[${embedding.join(',')}]`,
        tags,
        version,
        evidenceVc || null,
      ]
    )

    const capabilityId = result.rows[0].id
    logger.debug('Upserted capability', { capabilityId, agentId })
    return capabilityId
  }

  /**
   * Search for similar capabilities using cosine similarity
   */
  async searchSimilar(
    params: SearchSimilarParams
  ): Promise<VectorSearchResult[]> {
    const {
      queryEmbedding,
      limit = 10,
      threshold = 0.7,
      tags,
      minTrust,
    } = params

    if (queryEmbedding.length !== 1536) {
      throw new Error(
        `Invalid embedding dimension: expected 1536, got ${queryEmbedding.length}`
      )
    }

    let query = `
      SELECT
        c.id,
        c.agent_id,
        c.description,
        c.tags,
        c.version,
        1 - (c.embedding <=> $1::vector) AS similarity,
        COALESCE(t.score, 0.5) AS trust_score
      FROM capabilities c
      LEFT JOIN trust_scores t ON c.agent_id = t.agent_id
      WHERE 1 - (c.embedding <=> $1::vector) >= $2
    `

    const params_array: any[] = [`[${queryEmbedding.join(',')}]`, threshold]
    let paramIndex = 3

    if (tags && tags.length > 0) {
      query += ` AND c.tags && $${paramIndex}::text[]`
      params_array.push(tags)
      paramIndex++
    }

    if (minTrust !== undefined) {
      query += ` AND COALESCE(t.score, 0.5) >= $${paramIndex}`
      params_array.push(minTrust)
      paramIndex++
    }

    query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`
    params_array.push(limit)

    const result = await this.pool.query(query, params_array)

    return result.rows.map((row) => ({
      agentId: row.agent_id,
      capability: {
        id: row.id,
        description: row.description,
        tags: row.tags,
        version: row.version,
      },
      similarity: parseFloat(row.similarity),
      trustScore: row.trust_score ? parseFloat(row.trust_score) : undefined,
    }))
  }

  /**
   * Delete all capabilities for an agent
   */
  async deleteCapabilities(agentId: string): Promise<void> {
    await this.pool.query('DELETE FROM capabilities WHERE agent_id = $1', [
      agentId,
    ])
    logger.debug('Deleted capabilities', { agentId })
  }

  /**
   * Get capability by ID
   */
  async getCapability(capabilityId: string): Promise<VectorSearchResult | null> {
    const result = await this.pool.query(
      `SELECT
         c.id,
         c.agent_id,
         c.description,
         c.tags,
         c.version,
         COALESCE(t.score, 0.5) AS trust_score
       FROM capabilities c
       LEFT JOIN trust_scores t ON c.agent_id = t.agent_id
       WHERE c.id = $1`,
      [capabilityId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      agentId: row.agent_id,
      capability: {
        id: row.id,
        description: row.description,
        tags: row.tags,
        version: row.version,
      },
      similarity: 1.0, // Perfect match for direct lookup
      trustScore: row.trust_score ? parseFloat(row.trust_score) : undefined,
    }
  }

  /**
   * Count capabilities in database
   */
  async countCapabilities(): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM capabilities'
    )
    return parseInt(result.rows[0].count)
  }

  /**
   * Cache intent routing decision
   */
  async cacheRoutingDecision(params: {
    queryText: string
    queryEmbedding: number[]
    matchedAgents: string[]
    similarityScores: number[]
  }): Promise<string> {
    const { queryText, queryEmbedding, matchedAgents, similarityScores } =
      params

    if (queryEmbedding.length !== 1536) {
      throw new Error(
        `Invalid embedding dimension: expected 1536, got ${queryEmbedding.length}`
      )
    }

    const result = await this.pool.query(
      `INSERT INTO intent_routing_cache
       (query_text, query_embedding, matched_agents, similarity_scores)
       VALUES ($1, $2::vector, $3, $4)
       RETURNING id`,
      [
        queryText,
        `[${queryEmbedding.join(',')}]`,
        matchedAgents,
        similarityScores,
      ]
    )

    return result.rows[0].id
  }

  /**
   * Search cached routing decisions
   */
  async searchCachedRouting(queryEmbedding: number[]): Promise<{
    matchedAgents: string[]
    similarityScores: number[]
    cacheHitSimilarity: number
  } | null> {
    if (queryEmbedding.length !== 1536) {
      throw new Error(
        `Invalid embedding dimension: expected 1536, got ${queryEmbedding.length}`
      )
    }

    const result = await this.pool.query(
      `SELECT
         matched_agents,
         similarity_scores,
         1 - (query_embedding <=> $1::vector) AS cache_hit_similarity
       FROM intent_routing_cache
       WHERE expires_at > NOW()
         AND 1 - (query_embedding <=> $1::vector) >= 0.95
       ORDER BY cache_hit_similarity DESC
       LIMIT 1`,
      [`[${queryEmbedding.join(',')}]`]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      matchedAgents: row.matched_agents,
      similarityScores: row.similarity_scores.map((s: any) => parseFloat(s)),
      cacheHitSimilarity: parseFloat(row.cache_hit_similarity),
    }
  }

  /**
   * Cleanup expired routing cache entries
   */
  async cleanupRoutingCache(): Promise<void> {
    await this.pool.query('SELECT cleanup_expired_routing_cache()')
    logger.info('Cleaned up expired routing cache entries')
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query(
        "SELECT 1 as check, extname FROM pg_extension WHERE extname = 'vector'"
      )
      return result.rows.length > 0 && result.rows[0].extname === 'vector'
    } catch (error) {
      return false
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end()
    logger.info('Vector client connection pool closed')
  }
}

/**
 * Create a vector client
 */
export function createVectorClient(config?: VectorConfig): VectorClient {
  return new VectorClient(config)
}
