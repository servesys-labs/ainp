/**
 * Discovery Ranking Tests (Web4 POU-lite)
 * Tests combined score calculation and ranking behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoveryService } from '../discovery';
import { DatabaseClient } from '../../lib/db-client';
import { EmbeddingService } from '../embeddings';
import { RedisClient } from '../../lib/redis-client';
import { SemanticAddress } from '@ainp/core';

// Mock dependencies
vi.mock('../../lib/db-client');
vi.mock('../embeddings');
vi.mock('../../lib/redis-client');

describe('Discovery Ranking (Web4 POU-lite)', () => {
  let discoveryService: DiscoveryService;
  let mockDbClient: DatabaseClient;
  let mockEmbeddingService: EmbeddingService;
  let mockRedisClient: RedisClient;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.WEB4_POU_DISCOVERY_ENABLED;
    delete process.env.DISCOVERY_SIMILARITY_WEIGHT;
    delete process.env.DISCOVERY_TRUST_WEIGHT;
    delete process.env.DISCOVERY_USEFULNESS_WEIGHT;

    // Create mocks
    mockDbClient = vi.mocked(new DatabaseClient('mock'));
    mockEmbeddingService = vi.mocked(new EmbeddingService('mock-key'));
    mockRedisClient = vi.mocked(new RedisClient('mock-url'));

    discoveryService = new DiscoveryService(
      mockDbClient,
      mockEmbeddingService,
      mockRedisClient
    );
  });

  describe('calculateCombinedScore', () => {
    it('should calculate combined score with default weights', () => {
      // Access private method via any cast (for testing)
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 0.8,
        trust: { score: 0.9 },
        usefulness_score_cached: 50, // 50/100 = 0.5
      };

      // (0.8 × 0.6) + (0.9 × 0.3) + (0.5 × 0.1) = 0.48 + 0.27 + 0.05 = 0.80
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(0.80, 2);
    });

    it('should handle missing usefulness score', () => {
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 0.8,
        trust: { score: 0.9 },
        // No usefulness_score_cached
      };

      // (0.8 × 0.6) + (0.9 × 0.3) + (0 × 0.1) = 0.48 + 0.27 + 0 = 0.75
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(0.75, 2);
    });

    it('should handle missing trust score', () => {
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 0.8,
        usefulness_score_cached: 50,
      };

      // (0.8 × 0.6) + (0 × 0.3) + (0.5 × 0.1) = 0.48 + 0 + 0.05 = 0.53
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(0.53, 2);
    });

    it('should handle missing similarity score', () => {
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        trust: { score: 0.9 },
        usefulness_score_cached: 50,
      };

      // (0 × 0.6) + (0.9 × 0.3) + (0.5 × 0.1) = 0 + 0.27 + 0.05 = 0.32
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(0.32, 2);
    });

    it('should use custom weights from environment variables', () => {
      process.env.DISCOVERY_SIMILARITY_WEIGHT = '0.5';
      process.env.DISCOVERY_TRUST_WEIGHT = '0.4';
      process.env.DISCOVERY_USEFULNESS_WEIGHT = '0.1';

      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 0.8,
        trust: { score: 0.9 },
        usefulness_score_cached: 50,
      };

      // (0.8 × 0.5) + (0.9 × 0.4) + (0.5 × 0.1) = 0.4 + 0.36 + 0.05 = 0.81
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(0.81, 2);
    });

    it('should handle edge case: all scores are 0', () => {
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 0,
        trust: { score: 0 },
        usefulness_score_cached: 0,
      };

      const score = calculateScore(agent);
      expect(score).toBe(0);
    });

    it('should handle edge case: all scores are max (1.0 or 100)', () => {
      const calculateScore = (discoveryService as any).calculateCombinedScore.bind(discoveryService);

      const agent = {
        similarity: 1.0,
        trust: { score: 1.0 },
        usefulness_score_cached: 100,
      };

      // (1.0 × 0.6) + (1.0 × 0.3) + (1.0 × 0.1) = 0.6 + 0.3 + 0.1 = 1.0
      const score = calculateScore(agent);
      expect(score).toBeCloseTo(1.0, 2);
    });
  });

  describe('discover with Web4 ranking', () => {
    beforeEach(() => {
      // Mock Redis cache miss
      mockRedisClient.getCachedDiscoveryResult = vi.fn().mockResolvedValue(null);
      mockRedisClient.cacheDiscoveryResult = vi.fn().mockResolvedValue(undefined);

      // Mock embedding generation
      mockEmbeddingService.embed = vi.fn().mockResolvedValue('mock-embedding-base64');
    });

    it('should rank by combined score when Web4 enabled', async () => {
      process.env.WEB4_POU_DISCOVERY_ENABLED = 'true';

      const mockAgents: SemanticAddress[] = [
        {
          did: 'did:key:agent1',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key1'],
          trust: { score: 0.5, dimensions: { reliability: 0.5, honesty: 0.5, competence: 0.5, timeliness: 0.5 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.9,
          usefulness_score_cached: 20,
        },
        {
          did: 'did:key:agent2',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key2'],
          trust: { score: 0.9, dimensions: { reliability: 0.9, honesty: 0.9, competence: 0.9, timeliness: 0.9 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.7,
          usefulness_score_cached: 80,
        },
        {
          did: 'did:key:agent3',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key3'],
          trust: { score: 0.8, dimensions: { reliability: 0.8, honesty: 0.8, competence: 0.8, timeliness: 0.8 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.8,
          usefulness_score_cached: 50,
        },
      ];

      mockDbClient.searchAgentsByEmbedding = vi.fn().mockResolvedValue(mockAgents);

      const results = await discoveryService.discover({
        description: 'test query',
      });

      // Calculate expected scores:
      // agent1: (0.9×0.6) + (0.5×0.3) + (0.2×0.1) = 0.54 + 0.15 + 0.02 = 0.71
      // agent2: (0.7×0.6) + (0.9×0.3) + (0.8×0.1) = 0.42 + 0.27 + 0.08 = 0.77
      // agent3: (0.8×0.6) + (0.8×0.3) + (0.5×0.1) = 0.48 + 0.24 + 0.05 = 0.77

      // Expected order: agent2, agent3, agent1 (or agent3, agent2, agent1 due to tie)
      expect(results[0].did).toBe('did:key:agent2'); // Highest combined score
      expect(results[2].did).toBe('did:key:agent1'); // Lowest combined score
    });

    it('should use legacy similarity ranking when Web4 disabled', async () => {
      process.env.WEB4_POU_DISCOVERY_ENABLED = 'false';

      // Mock agents already sorted by similarity DESC (as database would return them)
      const mockAgents: SemanticAddress[] = [
        {
          did: 'did:key:agent1',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key1'],
          trust: { score: 0.5, dimensions: { reliability: 0.5, honesty: 0.5, competence: 0.5, timeliness: 0.5 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.9,
          usefulness_score_cached: 20,
        },
        {
          did: 'did:key:agent3',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key3'],
          trust: { score: 0.8, dimensions: { reliability: 0.8, honesty: 0.8, competence: 0.8, timeliness: 0.8 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.8,
          usefulness_score_cached: 50,
        },
        {
          did: 'did:key:agent2',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key2'],
          trust: { score: 0.9, dimensions: { reliability: 0.9, honesty: 0.9, competence: 0.9, timeliness: 0.9 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.7,
          usefulness_score_cached: 80,
        },
      ];

      mockDbClient.searchAgentsByEmbedding = vi.fn().mockResolvedValue(mockAgents);

      const results = await discoveryService.discover({
        description: 'test query',
      });

      // Legacy mode: Database already sorted by similarity DESC
      // Expected order: agent1 (0.9), agent3 (0.8), agent2 (0.7)
      expect(results[0].did).toBe('did:key:agent1');
      expect(results[1].did).toBe('did:key:agent3');
      expect(results[2].did).toBe('did:key:agent2');
    });

    it('should apply min_trust filter before ranking', async () => {
      process.env.WEB4_POU_DISCOVERY_ENABLED = 'true';

      const mockAgents: SemanticAddress[] = [
        {
          did: 'did:key:agent1',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key1'],
          trust: { score: 0.5, dimensions: { reliability: 0.5, honesty: 0.5, competence: 0.5, timeliness: 0.5 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.9,
          usefulness_score_cached: 20,
        },
        {
          did: 'did:key:agent2',
          capabilities: [{ description: 'test', tags: [], version: '1.0' }],
          credentials: ['key2'],
          trust: { score: 0.9, dimensions: { reliability: 0.9, honesty: 0.9, competence: 0.9, timeliness: 0.9 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.7,
          usefulness_score_cached: 80,
        },
      ];

      mockDbClient.searchAgentsByEmbedding = vi.fn().mockResolvedValue(mockAgents);

      const results = await discoveryService.discover({
        description: 'test query',
        min_trust: 0.8, // Filter out agent1 (trust 0.5)
      });

      // Only agent2 should remain (trust 0.9 >= 0.8)
      expect(results).toHaveLength(1);
      expect(results[0].did).toBe('did:key:agent2');
    });

    it('should apply tag filter before ranking', async () => {
      process.env.WEB4_POU_DISCOVERY_ENABLED = 'true';

      const mockAgents: SemanticAddress[] = [
        {
          did: 'did:key:agent1',
          capabilities: [{ description: 'test', tags: ['ai', 'nlp'], version: '1.0' }],
          credentials: ['key1'],
          trust: { score: 0.9, dimensions: { reliability: 0.9, honesty: 0.9, competence: 0.9, timeliness: 0.9 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.9,
          usefulness_score_cached: 50,
        },
        {
          did: 'did:key:agent2',
          capabilities: [{ description: 'test', tags: ['blockchain', 'web3'], version: '1.0' }],
          credentials: ['key2'],
          trust: { score: 0.9, dimensions: { reliability: 0.9, honesty: 0.9, competence: 0.9, timeliness: 0.9 }, decay_rate: 0.977, last_updated: Date.now() },
          similarity: 0.8,
          usefulness_score_cached: 80,
        },
      ];

      mockDbClient.searchAgentsByEmbedding = vi.fn().mockResolvedValue(mockAgents);

      const results = await discoveryService.discover({
        description: 'test query',
        tags: ['ai'], // Filter for 'ai' tag
      });

      // Only agent1 should remain (has 'ai' tag)
      expect(results).toHaveLength(1);
      expect(results[0].did).toBe('did:key:agent1');
    });
  });
});
