/**
 * Redis Cache Client for AINP
 * Phase 0.1 - Foundation
 */

import { createClient, RedisClientType } from 'redis'
import { Logger } from '@ainp/sdk'

const logger = new Logger({ serviceName: 'ainp-core:redis' })

export interface RedisConfig {
  url?: string
}

export interface CacheEmbeddingParams {
  text: string
  embedding: number[]
  ttl?: number // TTL in seconds
}

export interface RateLimitParams {
  agentId: string
  limit: number
  window: number // Window in seconds
}

/**
 * Redis client wrapper for AINP
 */
export class RedisClient {
  private client: RedisClientType | null = null
  private config: RedisConfig

  constructor(config: RedisConfig = {}) {
    this.config = {
      url: config.url || process.env.REDIS_URL || 'redis://localhost:6379',
    }
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.client) {
      return
    }

    this.client = createClient({
      url: this.config.url,
    })

    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err.message, url: this.config.url })
    })

    this.client.on('connect', () => {
      logger.info('Connected to Redis', { url: this.config.url })
    })

    await this.client.connect()
  }

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.client) {
      throw new Error('Redis client not connected. Call connect() first.')
    }
  }

  // ============================================================================
  // EMBEDDING CACHE
  // ============================================================================

  /**
   * Cache an embedding with 60-day TTL
   */
  async cacheEmbedding(params: CacheEmbeddingParams): Promise<void> {
    this.ensureConnected()

    const key = `embedding:${this.hashText(params.text)}`
    const value = JSON.stringify(params.embedding)
    const ttl = params.ttl || 60 * 24 * 60 * 60 // 60 days in seconds

    await this.client!.setEx(key, ttl, value)
  }

  /**
   * Get cached embedding
   */
  async getCachedEmbedding(text: string): Promise<number[] | null> {
    this.ensureConnected()

    const key = `embedding:${this.hashText(text)}`
    const value = await this.client!.get(key)

    if (!value) {
      return null
    }

    return JSON.parse(value)
  }

  /**
   * Hash text for cache key (SHA-256)
   */
  private hashText(text: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(text).digest('hex')
  }

  // ============================================================================
  // QUERY CACHE
  // ============================================================================

  /**
   * Cache a query result with 5-minute TTL
   */
  async cacheQuery(
    queryKey: string,
    result: any,
    ttl: number = 300
  ): Promise<void> {
    this.ensureConnected()

    const key = `query:${queryKey}`
    const value = JSON.stringify(result)

    await this.client!.setEx(key, ttl, value)
  }

  /**
   * Get cached query result
   */
  async getCachedQuery(queryKey: string): Promise<any | null> {
    this.ensureConnected()

    const key = `query:${queryKey}`
    const value = await this.client!.get(key)

    if (!value) {
      return null
    }

    return JSON.parse(value)
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Check if agent is within rate limit
   */
  async checkRateLimit(params: RateLimitParams): Promise<{
    allowed: boolean
    remaining: number
    resetAt: number
  }> {
    this.ensureConnected()

    const key = `ratelimit:${params.agentId}`
    const now = Date.now()
    const windowMs = params.window * 1000

    // Remove old entries outside the window
    await this.client!.zRemRangeByScore(key, 0, now - windowMs)

    // Count requests in current window
    const count = await this.client!.zCard(key)

    if (count >= params.limit) {
      // Get oldest entry to calculate reset time
      const oldest = await this.client!.zRange(key, 0, 0)

      const resetAt = oldest.length > 0
        ? parseInt(oldest[0]) + windowMs
        : now + windowMs

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      }
    }

    // Add current request
    await this.client!.zAdd(key, {
      score: now,
      value: `${now}:${crypto.randomUUID()}`,
    })

    // Set expiry on key
    await this.client!.expire(key, params.window)

    return {
      allowed: true,
      remaining: params.limit - count - 1,
      resetAt: now + windowMs,
    }
  }

  /**
   * Get rate limit status without incrementing
   */
  async getRateLimitStatus(params: {
    agentId: string
    limit: number
    window: number
  }): Promise<{ count: number; remaining: number }> {
    this.ensureConnected()

    const key = `ratelimit:${params.agentId}`
    const now = Date.now()
    const windowMs = params.window * 1000

    // Remove old entries
    await this.client!.zRemRangeByScore(key, 0, now - windowMs)

    // Count current requests
    const count = await this.client!.zCard(key)

    return {
      count,
      remaining: Math.max(0, params.limit - count),
    }
  }

  // ============================================================================
  // GENERAL CACHE OPERATIONS
  // ============================================================================

  /**
   * Set a key-value pair
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.ensureConnected()

    if (ttl) {
      await this.client!.setEx(key, ttl, value)
    } else {
      await this.client!.set(key, value)
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    this.ensureConnected()
    return await this.client!.get(key)
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<void> {
    this.ensureConnected()
    await this.client!.del(key)
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    this.ensureConnected()
    const result = await this.client!.exists(key)
    return result === 1
  }

  /**
   * Set expiry on a key
   */
  async expire(key: string, seconds: number): Promise<void> {
    this.ensureConnected()
    await this.client!.expire(key, seconds)
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    this.ensureConnected()
    return await this.client!.ttl(key)
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    this.ensureConnected()
    await this.client!.flushAll()
    logger.info('Redis cache flushed')
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    embeddingCacheSize: number
    queryCacheSize: number
    rateLimitKeys: number
  }> {
    this.ensureConnected()

    const embeddingKeys = await this.client!.keys('embedding:*')
    const queryKeys = await this.client!.keys('query:*')
    const rateLimitKeys = await this.client!.keys('ratelimit:*')

    return {
      embeddingCacheSize: embeddingKeys.length,
      queryCacheSize: queryKeys.length,
      rateLimitKeys: rateLimitKeys.length,
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.ensureConnected()
      await this.client!.ping()
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.client = null
      logger.info('Redis connection closed')
    }
  }
}

/**
 * Create a Redis client
 */
export function createRedisClient(config?: RedisConfig): RedisClient {
  return new RedisClient(config)
}
