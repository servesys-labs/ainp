/**
 * Embedding Service
 * Centralized embedding generation with caching
 */

import { VectorClient } from '../lib/vector-client.js';
import { RedisClient } from '../lib/redis-client.js';
import { createHash } from 'crypto';

export class EmbeddingService {
  constructor(
    private vectorClient: VectorClient,
    private redisClient: RedisClient
  ) {}

  /**
   * Generate embedding with cache
   */
  async embed(text: string): Promise<string> {
    const cacheKey = `embedding:${createHash('sha256').update(text).digest('hex')}`;

    // Check cache
    const cached = await this.redisClient.getCachedDiscoveryResult<string>(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.vectorClient.generateEmbedding(text);

    // Cache for 1 hour
    await this.redisClient.cacheDiscoveryResult(cacheKey, embedding, 3600);

    return embedding;
  }

  /**
   * Batch embed with cache
   */
  async embedBatch(texts: string[]): Promise<string[]> {
    const results: string[] = [];

    for (const text of texts) {
      results.push(await this.embed(text));
    }

    return results;
  }
}
