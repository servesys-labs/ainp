/**
 * Redis Client for AINP Broker
 * Caching and rate limiting
 */

import { createClient, RedisClientType } from 'redis';

/**
 * Validate REDIS_URL environment variable
 * @throws {Error} If REDIS_URL is not set (unless url parameter provided)
 */
function validateRedisUrl(url?: string): void {
  if (!url && !process.env.REDIS_URL) {
    throw new Error(
      'REDIS_URL environment variable is required. ' +
      'Example: redis://localhost:6379 or rediss://host:6380 (TLS)'
    );
  }
}

/**
 * Health check for Redis connection
 * @param client Redis client instance
 * @returns true if connected, false otherwise
 */
export async function isConnected(client: RedisClientType): Promise<boolean> {
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export class RedisClient {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor(url?: string) {
    // Validate REDIS_URL if no url provided
    validateRedisUrl(url);

    this.client = createClient({
      url: url || process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnect attempts exceeded');
            this.connected = false;
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000); // Exponential backoff
        }
      }
    });

    // Connection error handler
    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.connected = false;
    });
  }

  /**
   * Connect to Redis with retry logic
   */
  async connect(): Promise<void> {
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        await this.client.connect();
        this.connected = true;
        console.log('✅ Redis connected');
        return;
      } catch (err) {
        console.error(`Redis connection attempt ${i + 1}/${retries} failed:`, err);
        if (i === retries - 1) {
          this.connected = false;
          console.warn('⚠️ Redis unavailable - continuing in degraded mode');
          return; // Don't crash, just warn
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  /**
   * Health check for this client instance
   * @returns true if connected, false otherwise
   */
  async isConnected(): Promise<boolean> {
    if (!this.connected) return false;
    return isConnected(this.client);
  }

  /**
   * Cache discovery result
   */
  async cacheDiscoveryResult(key: string, result: unknown, ttl: number = 300): Promise<void> {
    try {
      if (!this.connected) return;
      await this.client.setEx(key, ttl, JSON.stringify(result));
    } catch (err) {
      console.warn(`[Redis] Failed to cache: ${err}`);
    }
  }

  /**
   * Get cached discovery result
   */
  async getCachedDiscoveryResult<T>(key: string): Promise<T | null> {
    try {
      if (!this.connected) return null;
      const result = await this.client.get(key);
      return result ? JSON.parse(result) : null;
    } catch (err) {
      console.warn(`[Redis] Failed to get cache: ${err}`);
      return null;
    }
  }

  /**
   * Increment rate limit counter
   * @returns count on success, -1 on error (degraded mode)
   */
  async incrementRateLimit(key: string, window: number = 60): Promise<number> {
    try {
      if (!this.connected) return -1;
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, window);
      }
      return count;
    } catch (err) {
      console.error(`[Redis] Rate limit error: ${err}`);
      return -1;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}
