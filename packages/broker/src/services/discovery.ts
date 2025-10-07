/**
 * Discovery Service
 * Semantic agent discovery and ranking
 */

import { DiscoveryQuery, SemanticAddress } from '@ainp/core';
import { DatabaseClient } from '../lib/db-client';
import { EmbeddingService } from './embeddings';
import { RedisClient } from '../lib/redis-client';
import { createHash } from 'crypto';

export class DiscoveryService {
  constructor(
    private dbClient: DatabaseClient,
    private embeddingService: EmbeddingService,
    private redisClient: RedisClient
  ) {}

  /**
   * Discover agents by semantic query
   */
  async discover(query: DiscoveryQuery): Promise<SemanticAddress[]> {
    // Generate cache key
    const cacheKey = `discovery:${createHash('sha256')
      .update(JSON.stringify(query))
      .digest('hex')}`;

    // Check cache
    const cached = await this.redisClient.getCachedDiscoveryResult<SemanticAddress[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate query embedding if not provided
    let queryEmbedding = query.embedding;
    if (!queryEmbedding && query.description) {
      queryEmbedding = await this.embeddingService.embed(query.description);
    }

    if (!queryEmbedding) {
      throw new Error('Query must have either embedding or description');
    }

    // Search by embedding similarity
    const minSimilarity = 0.7; // Default minimum similarity
    let agents = await this.dbClient.searchAgentsByEmbedding(queryEmbedding, minSimilarity, 50);

    // Apply filters
    if (query.min_trust) {
      agents = agents.filter((agent) => agent.trust.score >= query.min_trust!);
    }

    if (query.tags && query.tags.length > 0) {
      agents = agents.filter((agent) =>
        agent.capabilities.some((cap) => query.tags!.some((tag) => cap.tags.includes(tag)))
      );
    }

    // Sort by combined score (similarity + trust)
    // Note: similarity comes from database query, trust is in the agent object

    // Limit results
    const results = agents.slice(0, 20);

    // Cache for 5 minutes
    await this.redisClient.cacheDiscoveryResult(cacheKey, results, 300);

    return results;
  }

  /**
   * Register agent in discovery index
   */
  async registerAgent(address: SemanticAddress, ttl: number): Promise<void> {
    // Generate embeddings for capabilities if missing
    for (const capability of address.capabilities) {
      if (!capability.embedding) {
        capability.embedding = await this.embeddingService.embed(capability.description);
      }
    }

    await this.dbClient.registerAgent(address, ttl);
  }

  /**
   * Get agent by DID
   */
  async getAgent(did: string): Promise<SemanticAddress | null> {
    return this.dbClient.getAgent(did);
  }
}
