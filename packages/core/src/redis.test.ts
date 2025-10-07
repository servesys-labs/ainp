/**
 * Redis Cache Client Tests
 * Test Author & Coverage Enforcer (TA)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RedisClient, type CacheEmbeddingParams, type RateLimitParams } from './redis'

// Mock the redis library
vi.mock('redis', () => {
  const mockClient = {
    connect: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    setEx: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    flushAll: vi.fn(),
    keys: vi.fn(),
    ping: vi.fn(),
    zRemRangeByScore: vi.fn(),
    zCard: vi.fn(),
    zRange: vi.fn(),
    zAdd: vi.fn(),
  }

  return {
    createClient: vi.fn(() => mockClient),
    __mockClient: mockClient,
  }
})

describe('RedisClient', () => {
  let client: RedisClient
  let redis: any
  let mockClient: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Get mocks
    redis = vi.mocked(await import('redis'))
    mockClient = (redis as any).__mockClient

    // Setup default mock behaviors
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.quit.mockResolvedValue(undefined)
    mockClient.setEx.mockResolvedValue('OK')
    mockClient.get.mockResolvedValue(null)
    mockClient.set.mockResolvedValue('OK')
    mockClient.del.mockResolvedValue(1)
    mockClient.exists.mockResolvedValue(0)
    mockClient.expire.mockResolvedValue(true)
    mockClient.ttl.mockResolvedValue(-1)
    mockClient.ping.mockResolvedValue('PONG')
    mockClient.zCard.mockResolvedValue(0)
    mockClient.zRange.mockResolvedValue([])
  })

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  describe('Connection Management', () => {
    it('test_connect_establishes_redis_connection', async () => {
      client = new RedisClient({ url: 'redis://test:6379' })

      await client.connect()

      expect(redis.createClient).toHaveBeenCalledWith({
        url: 'redis://test:6379',
      })
      expect(mockClient.connect).toHaveBeenCalled()
    })

    it('test_connect_uses_default_url_when_not_provided', async () => {
      // Clear env var to test default
      const originalEnv = process.env.REDIS_URL
      delete process.env.REDIS_URL

      client = new RedisClient()

      await client.connect()

      expect(redis.createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
      })

      // Restore env
      if (originalEnv) {
        process.env.REDIS_URL = originalEnv
      }
    })

    it('test_connect_idempotent_does_not_reconnect', async () => {
      client = new RedisClient()

      await client.connect()
      await client.connect()

      expect(mockClient.connect).toHaveBeenCalledTimes(1)
    })

    it('test_close_terminates_connection', async () => {
      client = new RedisClient()
      await client.connect()

      await client.close()

      expect(mockClient.quit).toHaveBeenCalled()
    })

    it('test_close_handles_null_client', async () => {
      client = new RedisClient()

      await expect(client.close()).resolves.not.toThrow()
    })

    it('test_connect_registers_error_handler', async () => {
      client = new RedisClient()

      await client.connect()

      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('test_connect_registers_connect_handler', async () => {
      client = new RedisClient()

      await client.connect()

      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function))
    })
  })

  describe('Embedding Cache Operations', () => {
    it('test_cache_embedding_stores_with_default_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      const params: CacheEmbeddingParams = {
        text: 'test embedding',
        embedding: [0.1, 0.2, 0.3],
      }

      await client.cacheEmbedding(params)

      expect(mockClient.setEx).toHaveBeenCalledWith(
        expect.stringMatching(/^embedding:[a-f0-9]{64}$/),
        60 * 24 * 60 * 60, // 60 days
        JSON.stringify([0.1, 0.2, 0.3])
      )
    })

    it('test_cache_embedding_uses_custom_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      await client.cacheEmbedding({
        text: 'test',
        embedding: [0.1],
        ttl: 3600,
      })

      expect(mockClient.setEx).toHaveBeenCalledWith(
        expect.any(String),
        3600,
        expect.any(String)
      )
    })

    it('test_get_cached_embedding_returns_null_when_not_found', async () => {
      mockClient.get.mockResolvedValue(null)

      client = new RedisClient()
      await client.connect()

      const result = await client.getCachedEmbedding('test')

      expect(result).toBeNull()
    })

    it('test_get_cached_embedding_returns_parsed_array', async () => {
      const embedding = [0.1, 0.2, 0.3]
      mockClient.get.mockResolvedValue(JSON.stringify(embedding))

      client = new RedisClient()
      await client.connect()

      const result = await client.getCachedEmbedding('test')

      expect(result).toEqual(embedding)
    })

    it('test_cache_embedding_throws_when_not_connected', async () => {
      client = new RedisClient()

      await expect(
        client.cacheEmbedding({ text: 'test', embedding: [0.1] })
      ).rejects.toThrow('Redis client not connected')
    })
  })

  describe('Query Cache Operations', () => {
    it('test_cache_query_stores_with_default_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      await client.cacheQuery('test-query', { data: 'result' })

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'query:test-query',
        300,
        JSON.stringify({ data: 'result' })
      )
    })

    it('test_cache_query_uses_custom_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      await client.cacheQuery('test-query', { data: 'result' }, 600)

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'query:test-query',
        600,
        expect.any(String)
      )
    })

    it('test_get_cached_query_returns_null_when_not_found', async () => {
      mockClient.get.mockResolvedValue(null)

      client = new RedisClient()
      await client.connect()

      const result = await client.getCachedQuery('test-query')

      expect(result).toBeNull()
    })

    it('test_get_cached_query_returns_parsed_object', async () => {
      const queryResult = { rows: [{ id: 1 }], count: 1 }
      mockClient.get.mockResolvedValue(JSON.stringify(queryResult))

      client = new RedisClient()
      await client.connect()

      const result = await client.getCachedQuery('test-query')

      expect(result).toEqual(queryResult)
    })
  })

  describe('Rate Limiting', () => {
    it('test_check_rate_limit_allows_when_under_limit', async () => {
      mockClient.zCard.mockResolvedValue(5)

      client = new RedisClient()
      await client.connect()

      const params: RateLimitParams = {
        agentId: 'agent-123',
        limit: 10,
        window: 60,
      }

      const result = await client.checkRateLimit(params)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
      expect(mockClient.zAdd).toHaveBeenCalled()
    })

    it('test_check_rate_limit_blocks_when_over_limit', async () => {
      mockClient.zCard.mockResolvedValue(10)
      mockClient.zRange.mockResolvedValue(['1000000000'])

      client = new RedisClient()
      await client.connect()

      const params: RateLimitParams = {
        agentId: 'agent-123',
        limit: 10,
        window: 60,
      }

      const result = await client.checkRateLimit(params)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(mockClient.zAdd).not.toHaveBeenCalled()
    })

    it('test_check_rate_limit_removes_expired_entries', async () => {
      client = new RedisClient()
      await client.connect()

      await client.checkRateLimit({
        agentId: 'agent-123',
        limit: 10,
        window: 60,
      })

      expect(mockClient.zRemRangeByScore).toHaveBeenCalledWith(
        'ratelimit:agent-123',
        0,
        expect.any(Number)
      )
    })

    it('test_check_rate_limit_sets_key_expiry', async () => {
      client = new RedisClient()
      await client.connect()

      const params: RateLimitParams = {
        agentId: 'agent-123',
        limit: 10,
        window: 300,
      }

      await client.checkRateLimit(params)

      expect(mockClient.expire).toHaveBeenCalledWith('ratelimit:agent-123', 300)
    })

    it('test_get_rate_limit_status_returns_count_and_remaining', async () => {
      mockClient.zCard.mockResolvedValue(3)

      client = new RedisClient()
      await client.connect()

      const result = await client.getRateLimitStatus({
        agentId: 'agent-123',
        limit: 10,
        window: 60,
      })

      expect(result).toEqual({
        count: 3,
        remaining: 7,
      })
    })

    it('test_get_rate_limit_status_returns_zero_remaining_when_over_limit', async () => {
      mockClient.zCard.mockResolvedValue(15)

      client = new RedisClient()
      await client.connect()

      const result = await client.getRateLimitStatus({
        agentId: 'agent-123',
        limit: 10,
        window: 60,
      })

      expect(result.remaining).toBe(0)
    })
  })

  describe('General Cache Operations', () => {
    it('test_set_stores_value_without_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      await client.set('test-key', 'test-value')

      expect(mockClient.set).toHaveBeenCalledWith('test-key', 'test-value')
    })

    it('test_set_stores_value_with_ttl', async () => {
      client = new RedisClient()
      await client.connect()

      await client.set('test-key', 'test-value', 3600)

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 3600, 'test-value')
    })

    it('test_get_returns_value', async () => {
      mockClient.get.mockResolvedValue('test-value')

      client = new RedisClient()
      await client.connect()

      const result = await client.get('test-key')

      expect(result).toBe('test-value')
    })

    it('test_delete_removes_key', async () => {
      client = new RedisClient()
      await client.connect()

      await client.delete('test-key')

      expect(mockClient.del).toHaveBeenCalledWith('test-key')
    })

    it('test_exists_returns_true_when_key_exists', async () => {
      mockClient.exists.mockResolvedValue(1)

      client = new RedisClient()
      await client.connect()

      const result = await client.exists('test-key')

      expect(result).toBe(true)
    })

    it('test_exists_returns_false_when_key_not_exists', async () => {
      mockClient.exists.mockResolvedValue(0)

      client = new RedisClient()
      await client.connect()

      const result = await client.exists('test-key')

      expect(result).toBe(false)
    })

    it('test_ttl_returns_remaining_seconds', async () => {
      mockClient.ttl.mockResolvedValue(3600)

      client = new RedisClient()
      await client.connect()

      const result = await client.ttl('test-key')

      expect(result).toBe(3600)
    })

    it('test_expire_sets_expiration', async () => {
      client = new RedisClient()
      await client.connect()

      await client.expire('test-key', 7200)

      expect(mockClient.expire).toHaveBeenCalledWith('test-key', 7200)
    })
  })

  describe('Statistics and Health', () => {
    it('test_get_stats_returns_cache_sizes', async () => {
      mockClient.keys
        .mockResolvedValueOnce(['embedding:1', 'embedding:2'])
        .mockResolvedValueOnce(['query:1'])
        .mockResolvedValueOnce(['ratelimit:1', 'ratelimit:2', 'ratelimit:3'])

      client = new RedisClient()
      await client.connect()

      const stats = await client.getStats()

      expect(stats).toEqual({
        embeddingCacheSize: 2,
        queryCacheSize: 1,
        rateLimitKeys: 3,
      })
    })

    it('test_health_check_returns_true_when_connected', async () => {
      client = new RedisClient()
      await client.connect()

      const healthy = await client.healthCheck()

      expect(healthy).toBe(true)
      expect(mockClient.ping).toHaveBeenCalled()
    })

    it('test_health_check_returns_false_when_ping_fails', async () => {
      mockClient.ping.mockRejectedValue(new Error('connection lost'))

      client = new RedisClient()
      await client.connect()

      const healthy = await client.healthCheck()

      expect(healthy).toBe(false)
    })

    it('test_flush_all_clears_all_keys', async () => {
      client = new RedisClient()
      await client.connect()

      await client.flushAll()

      expect(mockClient.flushAll).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('test_handles_empty_string_key', async () => {
      client = new RedisClient()
      await client.connect()

      await expect(client.set('', 'value')).resolves.not.toThrow()
    })

    it('test_handles_very_long_key', async () => {
      const longKey = 'a'.repeat(10000)

      client = new RedisClient()
      await client.connect()

      await expect(client.set(longKey, 'value')).resolves.not.toThrow()
    })

    it('test_handles_null_value_in_get', async () => {
      mockClient.get.mockResolvedValue(null)

      client = new RedisClient()
      await client.connect()

      const result = await client.get('missing-key')

      expect(result).toBeNull()
    })

    it('test_handles_connection_failure', async () => {
      mockClient.connect.mockRejectedValue(new Error('ECONNREFUSED'))

      client = new RedisClient()

      await expect(client.connect()).rejects.toThrow('ECONNREFUSED')
    })

    it('test_operations_throw_when_not_connected', async () => {
      client = new RedisClient()

      await expect(client.get('key')).rejects.toThrow('not connected')
      await expect(client.set('key', 'value')).rejects.toThrow('not connected')
      await expect(client.delete('key')).rejects.toThrow('not connected')
    })
  })

  describe('Data Type Handling', () => {
    it('test_handles_complex_json_objects_in_query_cache', async () => {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
        timestamp: new Date().toISOString(),
      }

      client = new RedisClient()
      await client.connect()

      await client.cacheQuery('complex', complexObject)

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'query:complex',
        300,
        JSON.stringify(complexObject)
      )
    })

    it('test_handles_array_embeddings_with_many_dimensions', async () => {
      const largeEmbedding = Array(1536).fill(0.1)

      client = new RedisClient()
      await client.connect()

      await client.cacheEmbedding({
        text: 'test',
        embedding: largeEmbedding,
      })

      expect(mockClient.setEx).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        JSON.stringify(largeEmbedding)
      )
    })

    it('test_handles_unicode_text_in_embedding_keys', async () => {
      client = new RedisClient()
      await client.connect()

      await client.cacheEmbedding({
        text: '你好世界 🌍',
        embedding: [0.1, 0.2],
      })

      expect(mockClient.setEx).toHaveBeenCalledWith(
        expect.stringMatching(/^embedding:[a-f0-9]{64}$/),
        expect.any(Number),
        expect.any(String)
      )
    })
  })
})
