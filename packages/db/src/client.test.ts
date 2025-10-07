/**
 * Database Client Tests
 * Test Author & Coverage Enforcer (TA)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DatabaseClient,
  type CreateAgentParams,
  type CreateCapabilityParams,
  type UpdateTrustScoreParams,
  type LogAuditEventParams,
} from './client'

// Mock the pg library
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }

  const mockPool = {
    query: vi.fn(),
    connect: vi.fn(() => Promise.resolve(mockClient)),
    end: vi.fn(),
    on: vi.fn(),
  }

  return {
    Pool: vi.fn(() => mockPool),
    __mockPool: mockPool,
    __mockClient: mockClient,
  }
})

describe('DatabaseClient', () => {
  let client: DatabaseClient
  let pg: any
  let mockPool: any
  let mockClient: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get mocks
    pg = vi.mocked(await import('pg'))
    mockPool = (pg as any).__mockPool
    mockClient = (pg as any).__mockClient

    // Setup default mock behaviors
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 })
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 })
    mockPool.end.mockResolvedValue(undefined)
    mockClient.release.mockReturnValue(undefined)
  })

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  describe('Initialization', () => {
    it('test_creates_pool_with_provided_connection_string', () => {
      client = new DatabaseClient('postgresql://test:pass@host:5432/db')

      expect(pg.Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:pass@host:5432/db',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      })
    })

    it('test_registers_pool_error_handler', () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('test_close_ends_pool', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.close()

      expect(mockPool.end).toHaveBeenCalled()
    })
  })

  describe('Query Execution', () => {
    it('test_query_executes_sql_with_params', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.query('SELECT * FROM users WHERE id = $1', [1])

      expect(result.rows).toEqual([{ id: 1, name: 'test' }])
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1])
    })

    it('test_query_executes_sql_without_params', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.query('SELECT NOW()')

      expect(mockPool.query).toHaveBeenCalledWith('SELECT NOW()', undefined)
    })

    it('test_query_handles_database_error', async () => {
      mockPool.query.mockRejectedValue(new Error('syntax error'))

      client = new DatabaseClient('postgresql://test:5432/db')

      await expect(client.query('INVALID SQL')).rejects.toThrow('syntax error')
    })
  })

  describe('Transaction Handling', () => {
    it('test_with_transaction_executes_callback_and_commits', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 })

      client = new DatabaseClient('postgresql://test:5432/db')

      const callback = vi.fn().mockResolvedValue('success')

      const result = await client.withTransaction(callback)

      expect(result).toBe('success')
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('test_with_transaction_rolls_back_on_error', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 })

      client = new DatabaseClient('postgresql://test:5432/db')

      const callback = vi.fn().mockRejectedValue(new Error('callback failed'))

      await expect(client.withTransaction(callback)).rejects.toThrow('callback failed')

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalled()
    })

    it('test_with_transaction_releases_client_even_on_commit_error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(new Error('commit failed')) // COMMIT

      client = new DatabaseClient('postgresql://test:5432/db')

      const callback = vi.fn().mockResolvedValue('success')

      await expect(client.withTransaction(callback)).rejects.toThrow('commit failed')

      expect(mockClient.release).toHaveBeenCalled()
    })
  })

  describe('Agent Operations', () => {
    it('test_create_agent_inserts_and_returns_agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        did: 'did:key:z6Mk...',
        public_key: 'pubkey123',
        created_at: new Date(),
        last_seen_at: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockAgent],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const params: CreateAgentParams = {
        did: 'did:key:z6Mk...',
        public_key: 'pubkey123',
      }

      const result = await client.createAgent(params)

      expect(result).toEqual(mockAgent)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        ['did:key:z6Mk...', 'pubkey123']
      )
    })

    it('test_get_agent_by_did_returns_agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        did: 'did:key:test',
        public_key: 'key',
        created_at: new Date(),
        last_seen_at: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockAgent],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getAgentByDID('did:key:test')

      expect(result).toEqual(mockAgent)
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM agents WHERE did = $1',
        ['did:key:test']
      )
    })

    it('test_get_agent_by_did_returns_null_when_not_found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getAgentByDID('did:key:missing')

      expect(result).toBeNull()
    })

    it('test_get_agent_by_id_returns_agent', async () => {
      const mockAgent = {
        id: 'agent-456',
        did: 'did:key:test',
        public_key: 'key',
        created_at: new Date(),
        last_seen_at: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockAgent],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getAgentById('agent-456')

      expect(result).toEqual(mockAgent)
    })

    it('test_update_agent_last_seen_updates_timestamp', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.updateAgentLastSeen('agent-123')

      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE agents SET last_seen_at = NOW() WHERE id = $1',
        ['agent-123']
      )
    })

    it('test_list_agents_returns_paginated_results', async () => {
      const mockAgents = [
        { id: 'agent-1', did: 'did:1', public_key: 'key1', created_at: new Date(), last_seen_at: new Date() },
        { id: 'agent-2', did: 'did:2', public_key: 'key2', created_at: new Date(), last_seen_at: new Date() },
      ]

      mockPool.query.mockResolvedValue({
        rows: mockAgents,
        rowCount: 2,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.listAgents(50, 10)

      expect(result).toEqual(mockAgents)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [50, 10]
      )
    })

    it('test_list_agents_uses_default_pagination', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.listAgents()

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [100, 0]
      )
    })
  })

  describe('Capability Operations', () => {
    it('test_create_capability_inserts_and_returns_capability', async () => {
      const mockCapability = {
        id: 'cap-123',
        agent_id: 'agent-456',
        description: 'Image processing',
        embedding_ref: 'emb-789',
        tags: ['image', 'ai'],
        version: '1.0.0',
        evidence_vc: null,
        created_at: new Date(),
        updated_at: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockCapability],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const params: CreateCapabilityParams = {
        agent_id: 'agent-456',
        description: 'Image processing',
        embedding_ref: 'emb-789',
        tags: ['image', 'ai'],
        version: '1.0.0',
      }

      const result = await client.createCapability(params)

      expect(result).toEqual(mockCapability)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO capabilities'),
        ['agent-456', 'Image processing', 'emb-789', ['image', 'ai'], '1.0.0', null]
      )
    })

    it('test_get_capabilities_by_agent_returns_list', async () => {
      const mockCapabilities = [
        {
          id: 'cap-1',
          agent_id: 'agent-123',
          description: 'Cap 1',
          embedding_ref: null,
          tags: [],
          version: '1.0.0',
          evidence_vc: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]

      mockPool.query.mockResolvedValue({
        rows: mockCapabilities,
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getCapabilitiesByAgent('agent-123')

      expect(result).toEqual(mockCapabilities)
    })

    it('test_get_capability_by_id_returns_capability', async () => {
      const mockCapability = {
        id: 'cap-456',
        agent_id: 'agent-123',
        description: 'Test',
        embedding_ref: null,
        tags: [],
        version: '1.0.0',
        evidence_vc: null,
        created_at: new Date(),
        updated_at: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockCapability],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getCapabilityById('cap-456')

      expect(result).toEqual(mockCapability)
    })

    it('test_get_capability_by_id_returns_null_when_not_found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getCapabilityById('missing')

      expect(result).toBeNull()
    })

    it('test_search_capabilities_by_tags_filters_results', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.searchCapabilitiesByTags(['image', 'ai'])

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tags && $1'),
        [['image', 'ai']]
      )
    })

    it('test_delete_capabilities_by_agent_removes_all', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.deleteCapabilitiesByAgent('agent-123')

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM capabilities WHERE agent_id = $1',
        ['agent-123']
      )
    })
  })

  describe('Trust Score Operations', () => {
    it('test_upsert_trust_score_calculates_and_inserts_score', async () => {
      const mockTrustScore = {
        agent_id: 'agent-123',
        score: 0.785, // 0.8*0.35 + 0.9*0.35 + 0.7*0.2 + 0.75*0.1
        reliability: 0.8,
        honesty: 0.9,
        competence: 0.7,
        timeliness: 0.75,
        decay_rate: 0.977,
        last_updated: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockTrustScore],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const params: UpdateTrustScoreParams = {
        agent_id: 'agent-123',
        reliability: 0.8,
        honesty: 0.9,
        competence: 0.7,
        timeliness: 0.75,
      }

      const result = await client.upsertTrustScore(params)

      expect(result).toMatchObject({
        agent_id: 'agent-123',
        reliability: 0.8,
        honesty: 0.9,
        competence: 0.7,
        timeliness: 0.75,
      })

      // Verify score calculation
      const expectedScore = 0.8 * 0.35 + 0.9 * 0.35 + 0.7 * 0.2 + 0.75 * 0.1
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trust_scores'),
        expect.arrayContaining([
          'agent-123',
          expectedScore,
          0.8,
          0.9,
          0.7,
          0.75,
          0.977, // default decay rate
        ])
      )
    })

    it('test_upsert_trust_score_uses_custom_decay_rate', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{}],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      await client.upsertTrustScore({
        agent_id: 'agent-123',
        reliability: 0.5,
        honesty: 0.5,
        competence: 0.5,
        timeliness: 0.5,
        decay_rate: 0.95,
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(String), expect.any(Number), 0.5, 0.5, 0.5, 0.5, 0.95])
      )
    })

    it('test_get_trust_score_returns_score', async () => {
      const mockScore = {
        agent_id: 'agent-123',
        score: 0.8,
        reliability: 0.8,
        honesty: 0.9,
        competence: 0.7,
        timeliness: 0.8,
        decay_rate: 0.977,
        last_updated: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockScore],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getTrustScore('agent-123')

      expect(result).toEqual(mockScore)
    })

    it('test_get_trust_score_returns_null_when_not_found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getTrustScore('agent-missing')

      expect(result).toBeNull()
    })

    it('test_get_trust_score_with_decay_applies_time_based_decay', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ decayed_score: 0.75 }],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getTrustScoreWithDecay('agent-123')

      expect(result).toBe(0.75)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('apply_trust_decay'),
        ['agent-123']
      )
    })

    it('test_get_trust_score_with_decay_returns_null_when_not_found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getTrustScoreWithDecay('agent-missing')

      expect(result).toBeNull()
    })
  })

  describe('Audit Log Operations', () => {
    it('test_log_audit_event_inserts_event', async () => {
      const mockEntry = {
        id: 'audit-123',
        agent_id: 'agent-456',
        event_type: 'capability_registered',
        details: { capability_id: 'cap-789' },
        ip_address: '192.168.1.1',
        timestamp: new Date(),
      }

      mockPool.query.mockResolvedValue({
        rows: [mockEntry],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const params: LogAuditEventParams = {
        agent_id: 'agent-456',
        event_type: 'capability_registered',
        details: { capability_id: 'cap-789' },
        ip_address: '192.168.1.1',
      }

      const result = await client.logAuditEvent(params)

      expect(result).toEqual(mockEntry)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_log'),
        ['agent-456', 'capability_registered', JSON.stringify({ capability_id: 'cap-789' }), '192.168.1.1']
      )
    })

    it('test_log_audit_event_handles_null_optional_fields', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{}],
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      await client.logAuditEvent({
        event_type: 'system_startup',
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [null, 'system_startup', null, null]
      )
    })

    it('test_get_audit_logs_by_agent_returns_filtered_logs', async () => {
      const mockLogs = [
        {
          id: 'audit-1',
          agent_id: 'agent-123',
          event_type: 'test',
          details: null,
          ip_address: null,
          timestamp: new Date(),
        },
      ]

      mockPool.query.mockResolvedValue({
        rows: mockLogs,
        rowCount: 1,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.getAuditLogsByAgent('agent-123', 50)

      expect(result).toEqual(mockLogs)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE agent_id = $1'),
        ['agent-123', 50]
      )
    })

    it('test_get_audit_logs_by_event_type_filters_correctly', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.getAuditLogsByEventType('capability_registered', 25)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_type = $1'),
        ['capability_registered', 25]
      )
    })

    it('test_get_recent_audit_logs_returns_latest_entries', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.getRecentAuditLogs(200)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY timestamp DESC LIMIT $1'),
        [200]
      )
    })
  })

  describe('Edge Cases', () => {
    it('test_handles_connection_pool_error', async () => {
      mockPool.query.mockRejectedValue(new Error('connection pool exhausted'))

      client = new DatabaseClient('postgresql://test:5432/db')

      await expect(client.query('SELECT 1')).rejects.toThrow('connection pool exhausted')
    })

    it('test_handles_empty_result_set', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.query('SELECT * FROM empty_table')

      expect(result.rows).toEqual([])
      expect(result.rowCount).toBe(0)
    })

    it('test_handles_very_large_result_set', async () => {
      const largeRows = Array(10000).fill({ id: 1, data: 'test' })

      mockPool.query.mockResolvedValue({
        rows: largeRows,
        rowCount: 10000,
      })

      client = new DatabaseClient('postgresql://test:5432/db')

      const result = await client.query('SELECT * FROM large_table')

      expect(result.rows).toHaveLength(10000)
    })

    it('test_transaction_with_multiple_operations', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 })

      client = new DatabaseClient('postgresql://test:5432/db')

      const callback = async (txClient: any) => {
        await txClient.query('INSERT INTO table1 VALUES (1)')
        await txClient.query('INSERT INTO table2 VALUES (2)')
        return 'done'
      }

      await client.withTransaction(callback)

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO table1 VALUES (1)')
      expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO table2 VALUES (2)')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
    })

    it('test_handles_special_characters_in_query_params', async () => {
      client = new DatabaseClient('postgresql://test:5432/db')

      await client.query('SELECT * FROM users WHERE name = $1', ["O'Brien"])

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ["O'Brien"]
      )
    })
  })
})
