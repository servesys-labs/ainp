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

  constructor(url?: string) {
    // Validate REDIS_URL if no url provided
    validateRedisUrl(url);

    this.client = createClient({
      url: url || process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnect attempts exceeded');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000); // Exponential backoff
        }
      }
    });

    // Connection error handler
    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
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
        console.log('✅ Redis connected');
        return;
      } catch (err) {
        console.error(`Redis connection attempt ${i + 1}/${retries} failed:`, err);
        if (i === retries - 1) {
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
    return isConnected(this.client);
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
