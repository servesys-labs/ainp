/**
 * Vector Client (pgvector) Tests
 * Test Author & Coverage Enforcer (TA)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VectorClient, type UpsertCapabilityParams, type SearchSimilarParams } from './vector'

// Mock the pg library
vi.mock('pg', () => {
  const mockPool = {
    query: vi.fn(),
    end: vi.fn(),
  }

  return {
    Pool: vi.fn(() => mockPool),
    __mockPool: mockPool,
  }
})

describe('VectorClient', () => {
  let client: VectorClient
  let pg: any
  let mockPool: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get mocks
    pg = vi.mocked(await import('pg'))
    mockPool = (pg as any).__mockPool

    // Setup default mock behaviors
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 })
    mockPool.end.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  describe('Initialization', () => {
    it('test_creates_pool_with_default_connection_string', () => {
      client = new VectorClient()

      expect(pg.Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://ainp:ainp@localhost:5432/ainp',
      })
    })

    it('test_creates_pool_with_custom_connection_string', () => {
      client = new VectorClient({
        connectionString: 'postgresql://custom:password@host:5432/db',
      })

      expect(pg.Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://custom:password@host:5432/db',
      })
    })

    it('test_close_ends_pool_connection', async () => {
      client = new VectorClient()

      await client.close()

      expect(mockPool.end).toHaveBeenCalled()
    })
  })

  describe('Capability Upsert', () => {
    it('test_upsert_capability_inserts_new_capability', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const params: UpsertCapabilityParams = {
        agentId: 'agent-456',
        description: 'Image processing',
        embedding: Array(1536).fill(0.1),
        tags: ['image', 'ai'],
        version: '1.0.0',
        evidenceVc: 'did:key:evidence',
      }

      const result = await client.upsertCapability(params)

      expect(result).toBe('cap-123')
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO capabilities'),
        expect.arrayContaining([
          'agent-456',
          'Image processing',
          expect.stringContaining('[0.1,'),
          ['image', 'ai'],
          '1.0.0',
          'did:key:evidence',
        ])
      )
    })

    it('test_upsert_capability_throws_on_invalid_embedding_dimension', async () => {
      client = new VectorClient()

      const params: UpsertCapabilityParams = {
        agentId: 'agent-123',
        description: 'test',
        embedding: [0.1, 0.2], // Invalid: only 2 dimensions
        tags: [],
        version: '1.0.0',
      }

      await expect(client.upsertCapability(params)).rejects.toThrow(
        'Invalid embedding dimension: expected 1536, got 2'
      )
    })

    it('test_upsert_capability_handles_null_evidence', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-789' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const params: UpsertCapabilityParams = {
        agentId: 'agent-123',
        description: 'test',
        embedding: Array(1536).fill(0.5),
        tags: ['test'],
        version: '1.0.0',
      }

      await client.upsertCapability(params)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(Array),
          expect.any(String),
          null, // evidenceVc should be null
        ])
      )
    })

    it('test_upsert_capability_updates_existing_capability', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-existing' }],
        rowCount: 1,
      })

      client = new VectorClient()

      await client.upsertCapability({
        agentId: 'agent-123',
        description: 'duplicate description',
        embedding: Array(1536).fill(0.3),
        tags: ['updated'],
        version: '2.0.0',
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      )
    })
  })

  describe('Similarity Search', () => {
    it('test_search_similar_returns_ranked_results', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'cap-1',
            agent_id: 'agent-1',
            description: 'Image processing',
            tags: ['image', 'ai'],
            version: '1.0.0',
            similarity: '0.95',
            trust_score: '0.8',
          },
          {
            id: 'cap-2',
            agent_id: 'agent-2',
            description: 'Video processing',
            tags: ['video', 'ai'],
            version: '1.0.0',
            similarity: '0.85',
            trust_score: '0.7',
          },
        ],
        rowCount: 2,
      })

      client = new VectorClient()

      const params: SearchSimilarParams = {
        queryEmbedding: Array(1536).fill(0.1),
        limit: 10,
        threshold: 0.7,
      }

      const results = await client.searchSimilar(params)

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        agentId: 'agent-1',
        capability: {
          id: 'cap-1',
          description: 'Image processing',
          tags: ['image', 'ai'],
          version: '1.0.0',
        },
        similarity: 0.95,
        trustScore: 0.8,
      })
    })

    it('test_search_similar_filters_by_tags', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
        tags: ['image', 'ai'],
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('c.tags && $3::text[]'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(Number),
          ['image', 'ai'],
          expect.any(Number),
        ])
      )
    })

    it('test_search_similar_filters_by_min_trust', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
        minTrust: 0.6,
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(t.score, 0.5) >= $3'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(Number),
          0.6,
          expect.any(Number),
        ])
      )
    })

    it('test_search_similar_throws_on_invalid_embedding_dimension', async () => {
      client = new VectorClient()

      await expect(
        client.searchSimilar({
          queryEmbedding: [0.1, 0.2], // Invalid
        })
      ).rejects.toThrow('Invalid embedding dimension: expected 1536, got 2')
    })

    it('test_search_similar_uses_default_parameters', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1 - (c.embedding <=> $1::vector) >= $2'),
        expect.arrayContaining([
          expect.any(String),
          0.7, // default threshold
          10, // default limit
        ])
      )
    })

    it('test_search_similar_handles_null_trust_scores', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'cap-1',
            agent_id: 'agent-1',
            description: 'Test',
            tags: [],
            version: '1.0.0',
            similarity: '0.9',
            trust_score: null,
          },
        ],
        rowCount: 1,
      })

      client = new VectorClient()

      const results = await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
      })

      expect(results[0].trustScore).toBeUndefined()
    })
  })

  describe('Capability Management', () => {
    it('test_delete_capabilities_removes_all_for_agent', async () => {
      client = new VectorClient()

      await client.deleteCapabilities('agent-123')

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM capabilities WHERE agent_id = $1',
        ['agent-123']
      )
    })

    it('test_get_capability_returns_capability_by_id', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'cap-123',
            agent_id: 'agent-456',
            description: 'Test capability',
            tags: ['test'],
            version: '1.0.0',
            trust_score: '0.85',
          },
        ],
        rowCount: 1,
      })

      client = new VectorClient()

      const result = await client.getCapability('cap-123')

      expect(result).toMatchObject({
        agentId: 'agent-456',
        capability: {
          id: 'cap-123',
          description: 'Test capability',
          tags: ['test'],
          version: '1.0.0',
        },
        similarity: 1.0,
        trustScore: 0.85,
      })
    })

    it('test_get_capability_returns_null_when_not_found', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      const result = await client.getCapability('missing-cap')

      expect(result).toBeNull()
    })

    it('test_count_capabilities_returns_total_count', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ count: '42' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const count = await client.countCapabilities()

      expect(count).toBe(42)
    })
  })

  describe('Routing Cache', () => {
    it('test_cache_routing_decision_stores_query_and_results', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cache-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const result = await client.cacheRoutingDecision({
        queryText: 'find image processor',
        queryEmbedding: Array(1536).fill(0.2),
        matchedAgents: ['agent-1', 'agent-2'],
        similarityScores: [0.9, 0.8],
      })

      expect(result).toBe('cache-123')
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO intent_routing_cache'),
        expect.arrayContaining([
          'find image processor',
          expect.any(String),
          ['agent-1', 'agent-2'],
          [0.9, 0.8],
        ])
      )
    })

    it('test_cache_routing_decision_throws_on_invalid_embedding', async () => {
      client = new VectorClient()

      await expect(
        client.cacheRoutingDecision({
          queryText: 'test',
          queryEmbedding: [0.1], // Invalid
          matchedAgents: [],
          similarityScores: [],
        })
      ).rejects.toThrow('Invalid embedding dimension')
    })

    it('test_search_cached_routing_returns_cached_result', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            matched_agents: ['agent-1', 'agent-2'],
            similarity_scores: ['0.9', '0.8'],
            cache_hit_similarity: '0.98',
          },
        ],
        rowCount: 1,
      })

      client = new VectorClient()

      const result = await client.searchCachedRouting(Array(1536).fill(0.2))

      expect(result).toEqual({
        matchedAgents: ['agent-1', 'agent-2'],
        similarityScores: [0.9, 0.8],
        cacheHitSimilarity: 0.98,
      })
    })

    it('test_search_cached_routing_returns_null_when_no_match', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      const result = await client.searchCachedRouting(Array(1536).fill(0.2))

      expect(result).toBeNull()
    })

    it('test_cleanup_routing_cache_calls_stored_procedure', async () => {
      client = new VectorClient()

      await client.cleanupRoutingCache()

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT cleanup_expired_routing_cache()'
      )
    })
  })

  describe('Health Check', () => {
    it('test_health_check_returns_true_when_pgvector_available', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ check: 1, extname: 'vector' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const healthy = await client.healthCheck()

      expect(healthy).toBe(true)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT 1 as check, extname FROM pg_extension WHERE extname = 'vector'")
      )
    })

    it('test_health_check_returns_false_when_pgvector_missing', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      const healthy = await client.healthCheck()

      expect(healthy).toBe(false)
    })

    it('test_health_check_returns_false_on_connection_error', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'))

      client = new VectorClient()

      const healthy = await client.healthCheck()

      expect(healthy).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('test_handles_empty_tags_array', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      await expect(
        client.upsertCapability({
          agentId: 'agent-123',
          description: 'test',
          embedding: Array(1536).fill(0.1),
          tags: [],
          version: '1.0.0',
        })
      ).resolves.toBe('cap-123')
    })

    it('test_handles_very_long_description', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      const longDescription = 'A'.repeat(10000)

      await expect(
        client.upsertCapability({
          agentId: 'agent-123',
          description: longDescription,
          embedding: Array(1536).fill(0.1),
          tags: ['test'],
          version: '1.0.0',
        })
      ).resolves.toBe('cap-123')
    })

    it('test_handles_special_characters_in_agent_id', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      await client.upsertCapability({
        agentId: 'agent-with-special.chars_123',
        description: 'test',
        embedding: Array(1536).fill(0.1),
        tags: ['test'],
        version: '1.0.0',
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['agent-with-special.chars_123', expect.any(String)])
      )
    })

    it('test_search_with_zero_threshold_returns_all_matches', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
        threshold: 0,
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('>= $2'),
        expect.arrayContaining([expect.any(String), 0, expect.any(Number)])
      )
    })

    it('test_search_with_high_threshold_filters_aggressively', async () => {
      mockPool.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
      })

      client = new VectorClient()

      await client.searchSimilar({
        queryEmbedding: Array(1536).fill(0.1),
        threshold: 0.95,
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(String), 0.95, expect.any(Number)])
      )
    })

    it('test_handles_database_query_error', async () => {
      mockPool.query.mockRejectedValue(new Error('database error'))

      client = new VectorClient()

      await expect(
        client.upsertCapability({
          agentId: 'agent-123',
          description: 'test',
          embedding: Array(1536).fill(0.1),
          tags: ['test'],
          version: '1.0.0',
        })
      ).rejects.toThrow('database error')
    })
  })

  describe('Embedding Format', () => {
    it('test_embedding_array_formatted_correctly_for_postgres', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      await client.upsertCapability({
        agentId: 'agent-123',
        description: 'test',
        embedding: [0.1, 0.2, 0.3, ...Array(1533).fill(0.5)],
        tags: ['test'],
        version: '1.0.0',
      })

      const callArgs = mockPool.query.mock.calls[0][1]
      const embeddingString = callArgs[2]

      expect(embeddingString).toMatch(/^\[0\.1,0\.2,0\.3/)
      expect(embeddingString).toMatch(/\]$/)
    })

    it('test_handles_negative_embedding_values', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'cap-123' }],
        rowCount: 1,
      })

      client = new VectorClient()

      await client.upsertCapability({
        agentId: 'agent-123',
        description: 'test',
        embedding: [-0.5, 0.5, ...Array(1534).fill(0)],
        tags: ['test'],
        version: '1.0.0',
      })

      expect(mockPool.query).toHaveBeenCalled()
    })
  })
})
