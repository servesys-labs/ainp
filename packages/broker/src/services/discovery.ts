/**
 * Discovery Service
 * Semantic agent discovery and ranking
 */

import { DiscoveryQuery, SemanticAddress } from '@ainp/core';
import { DatabaseClient } from '../lib/db-client';
import { EmbeddingService } from './embeddings';
import { RedisClient } from '../lib/redis-client';
import { getDiscoveryWeights } from '../lib/feature-flags';
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
    const minSimilarity = 0.5; // Default minimum similarity (lowered for MVP)
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

    // Web4 POU-lite ranking enhancement
    const enableWeb4Ranking = process.env.WEB4_POU_DISCOVERY_ENABLED === 'true';

    if (enableWeb4Ranking) {
      // Sort by combined score: (similarity × 0.6) + (trust × 0.3) + (usefulness × 0.1)
      agents = agents
        .map(agent => ({
          ...agent,
          _combinedScore: this.calculateCombinedScore(agent as any)
        }))
        .sort((a, b) => (b as any)._combinedScore - (a as any)._combinedScore);
    }
    // Legacy: Database already sorted by similarity

    // Limit results
    const results = agents.slice(0, 20);

    // Cache for 5 minutes
    await this.redisClient.cacheDiscoveryResult(cacheKey, results, 300);

    return results;
  }

  /**
   * Calculate combined ranking score for Web4 POU-lite discovery
   * @param agent Agent with similarity, trust, and usefulness scores
   * @returns Combined score 0-1
   */
  private calculateCombinedScore(agent: SemanticAddress & { similarity?: number; usefulness_score_cached?: number }): number {
    // Weights (configured via feature flags with validation)
    const weights = getDiscoveryWeights();
    const SIMILARITY_WEIGHT = weights.similarity;
    const TRUST_WEIGHT = weights.trust;
    const USEFULNESS_WEIGHT = weights.usefulness;

    // Normalize scores to 0-1 range
    const similarity = agent.similarity || 0; // From database query (cosine similarity)
    const trust = agent.trust?.score || 0;
    const usefulness = (agent.usefulness_score_cached || 0) / 100; // Scale 0-100 to 0-1

    return (similarity * SIMILARITY_WEIGHT) +
           (trust * TRUST_WEIGHT) +
           (usefulness * USEFULNESS_WEIGHT);
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
