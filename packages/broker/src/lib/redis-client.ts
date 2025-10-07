/**
 * Redis Client for AINP Broker
 * Caching and rate limiting
 */

import { createClient, RedisClientType } from 'redis';

export class RedisClient {
  private client: RedisClientType;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Cache discovery result
   */
  async cacheDiscoveryResult(key: string, result: unknown, ttl: number = 300): Promise<void> {
    await this.client.setEx(key, ttl, JSON.stringify(result));
  }

  /**
   * Get cached discovery result
   */
  async getCachedDiscoveryResult<T>(key: string): Promise<T | null> {
    const result = await this.client.get(key);
    return result ? JSON.parse(result) : null;
  }

  /**
   * Increment rate limit counter
   */
  async incrementRateLimit(key: string, window: number = 60): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, window);
    }
    return count;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}
