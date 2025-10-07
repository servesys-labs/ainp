/**
 * PostgreSQL Database Client for AINP
 * Phase 0.1 - Foundation
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { Logger } from '@ainp/sdk'

const logger = new Logger({ serviceName: 'ainp-db:client' })

export interface Agent {
  id: string
  did: string
  public_key: string
  created_at: Date
  last_seen_at: Date
}

export interface Capability {
  id: string
  agent_id: string
  description: string
  embedding_ref: string | null
  tags: string[]
  version: string
  evidence_vc: string | null
  created_at: Date
  updated_at: Date
}

export interface TrustScore {
  agent_id: string
  score: number
  reliability: number
  honesty: number
  competence: number
  timeliness: number
  decay_rate: number
  last_updated: Date
}

export interface AuditLogEntry {
  id: string
  agent_id: string | null
  event_type: string
  details: Record<string, any> | null
  ip_address: string | null
  timestamp: Date
}

export interface CreateAgentParams {
  did: string
  public_key: string
}

export interface CreateCapabilityParams {
  agent_id: string
  description: string
  embedding_ref: string | null
  tags: string[]
  version: string
  evidence_vc?: string | null
}

export interface UpdateTrustScoreParams {
  agent_id: string
  reliability: number
  honesty: number
  competence: number
  timeliness: number
  decay_rate?: number
}

export interface LogAuditEventParams {
  agent_id?: string | null
  event_type: string
  details?: Record<string, any>
  ip_address?: string | null
}

/**
 * Database client with connection pooling
 */
export class DatabaseClient {
  private pool: Pool

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20, // max connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message })
    })
  }

  /**
   * Execute a query
   */
  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params)
  }

  /**
   * Execute a transaction
   */
  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end()
  }

  // ============================================================================
  // AGENTS
  // ============================================================================

  /**
   * Create a new agent
   */
  async createAgent(params: CreateAgentParams): Promise<Agent> {
    const result = await this.query<Agent>(
      `INSERT INTO agents (did, public_key)
       VALUES ($1, $2)
       RETURNING *`,
      [params.did, params.public_key]
    )
    return result.rows[0]
  }

  /**
   * Get agent by DID
   */
  async getAgentByDID(did: string): Promise<Agent | null> {
    const result = await this.query<Agent>(
      `SELECT * FROM agents WHERE did = $1`,
      [did]
    )
    return result.rows[0] || null
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string): Promise<Agent | null> {
    const result = await this.query<Agent>(
      `SELECT * FROM agents WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  /**
   * Update agent last_seen_at
   */
  async updateAgentLastSeen(agent_id: string): Promise<void> {
    await this.query(
      `UPDATE agents SET last_seen_at = NOW() WHERE id = $1`,
      [agent_id]
    )
  }

  /**
   * List all agents
   */
  async listAgents(limit = 100, offset = 0): Promise<Agent[]> {
    const result = await this.query<Agent>(
      `SELECT * FROM agents
       ORDER BY last_seen_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    return result.rows
  }

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  /**
   * Create a new capability
   */
  async createCapability(params: CreateCapabilityParams): Promise<Capability> {
    const result = await this.query<Capability>(
      `INSERT INTO capabilities (agent_id, description, embedding_ref, tags, version, evidence_vc)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.agent_id,
        params.description,
        params.embedding_ref,
        params.tags,
        params.version,
        params.evidence_vc || null,
      ]
    )
    return result.rows[0]
  }

  /**
   * Get capabilities by agent ID
   */
  async getCapabilitiesByAgent(agent_id: string): Promise<Capability[]> {
    const result = await this.query<Capability>(
      `SELECT * FROM capabilities WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agent_id]
    )
    return result.rows
  }

  /**
   * Get capability by ID
   */
  async getCapabilityById(id: string): Promise<Capability | null> {
    const result = await this.query<Capability>(
      `SELECT * FROM capabilities WHERE id = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  /**
   * Search capabilities by tags
   */
  async searchCapabilitiesByTags(tags: string[]): Promise<Capability[]> {
    const result = await this.query<Capability>(
      `SELECT * FROM capabilities WHERE tags && $1 ORDER BY created_at DESC`,
      [tags]
    )
    return result.rows
  }

  /**
   * Delete capabilities by agent ID
   */
  async deleteCapabilitiesByAgent(agent_id: string): Promise<void> {
    await this.query(`DELETE FROM capabilities WHERE agent_id = $1`, [agent_id])
  }

  // ============================================================================
  // TRUST SCORES
  // ============================================================================

  /**
   * Upsert trust score
   */
  async upsertTrustScore(params: UpdateTrustScoreParams): Promise<TrustScore> {
    // Calculate aggregate score
    const score =
      params.reliability * 0.35 +
      params.honesty * 0.35 +
      params.competence * 0.2 +
      params.timeliness * 0.1

    const result = await this.query<TrustScore>(
      `INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness, decay_rate, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (agent_id) DO UPDATE SET
         score = EXCLUDED.score,
         reliability = EXCLUDED.reliability,
         honesty = EXCLUDED.honesty,
         competence = EXCLUDED.competence,
         timeliness = EXCLUDED.timeliness,
         decay_rate = EXCLUDED.decay_rate,
         last_updated = NOW()
       RETURNING *`,
      [
        params.agent_id,
        score,
        params.reliability,
        params.honesty,
        params.competence,
        params.timeliness,
        params.decay_rate || 0.977,
      ]
    )
    return result.rows[0]
  }

  /**
   * Get trust score by agent ID
   */
  async getTrustScore(agent_id: string): Promise<TrustScore | null> {
    const result = await this.query<TrustScore>(
      `SELECT * FROM trust_scores WHERE agent_id = $1`,
      [agent_id]
    )
    return result.rows[0] || null
  }

  /**
   * Get trust score with decay applied
   */
  async getTrustScoreWithDecay(agent_id: string): Promise<number | null> {
    const result = await this.query<{ decayed_score: number }>(
      `SELECT apply_trust_decay(
         score,
         decay_rate,
         EXTRACT(EPOCH FROM (NOW() - last_updated)) / 86400.0
       ) AS decayed_score
       FROM trust_scores WHERE agent_id = $1`,
      [agent_id]
    )
    return result.rows[0]?.decayed_score || null
  }

  // ============================================================================
  // AUDIT LOG
  // ============================================================================

  /**
   * Log an audit event
   */
  async logAuditEvent(params: LogAuditEventParams): Promise<AuditLogEntry> {
    const result = await this.query<AuditLogEntry>(
      `INSERT INTO audit_log (agent_id, event_type, details, ip_address)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        params.agent_id || null,
        params.event_type,
        params.details ? JSON.stringify(params.details) : null,
        params.ip_address || null,
      ]
    )
    return result.rows[0]
  }

  /**
   * Get audit logs by agent ID
   */
  async getAuditLogsByAgent(
    agent_id: string,
    limit = 100
  ): Promise<AuditLogEntry[]> {
    const result = await this.query<AuditLogEntry>(
      `SELECT * FROM audit_log WHERE agent_id = $1
       ORDER BY timestamp DESC LIMIT $2`,
      [agent_id, limit]
    )
    return result.rows
  }

  /**
   * Get audit logs by event type
   */
  async getAuditLogsByEventType(
    event_type: string,
    limit = 100
  ): Promise<AuditLogEntry[]> {
    const result = await this.query<AuditLogEntry>(
      `SELECT * FROM audit_log WHERE event_type = $1
       ORDER BY timestamp DESC LIMIT $2`,
      [event_type, limit]
    )
    return result.rows
  }

  /**
   * Get recent audit logs
   */
  async getRecentAuditLogs(limit = 100): Promise<AuditLogEntry[]> {
    const result = await this.query<AuditLogEntry>(
      `SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    )
    return result.rows
  }
}

/**
 * Create a database client
 */
export function createDatabaseClient(connectionString?: string): DatabaseClient {
  const dbUrl =
    connectionString || process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp'
  return new DatabaseClient(dbUrl)
}
