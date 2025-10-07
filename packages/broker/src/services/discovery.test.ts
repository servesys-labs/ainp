/**
 * Tests for Discovery Service
 * Testing semantic agent discovery and ranking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoveryService } from './discovery';
import { DiscoveryQuery, SemanticAddress } from '@ainp/core/src/types';
import { DatabaseClient } from '../lib/db-client';
import { EmbeddingService } from './embeddings';
import { RedisClient } from '../lib/redis-client';

// Mock dependencies
vi.mock('../lib/db-client');
vi.mock('./embeddings');
vi.mock('../lib/redis-client');

describe('Discovery Service', () => {
  let discoveryService: DiscoveryService;
  let mockDbClient: any;
  let mockEmbeddingService: any;
  let mockRedisClient: any;

  const sampleAgent: SemanticAddress = {
    did: 'did:key:z123',
    capabilities: [
      {
        '@type': 'search.capability',
        description: 'Search documents',
        tags: ['search', 'documents'],
        embedding: [0.1, 0.2, 0.3],
      },
    ],
    endpoint: 'ws://agent1.example.com',
    trust: {
      score: 0.85,
      dimensions: {
        reliability: 0.9,
        honesty: 0.8,
        competence: 0.85,
        timeliness: 0.8,
      },
      decay_rate: 0.977,
      last_updated: Date.now(),
    },
  };

  beforeEach(() => {
    mockDbClient = {
      searchAgentsByEmbedding: vi.fn(),
      registerAgent: vi.fn(),
      getAgent: vi.fn(),
    };

    mockEmbeddingService = {
      embed: vi.fn(),
    };

    mockRedisClient = {
      getCachedDiscoveryResult: vi.fn(),
      cacheDiscoveryResult: vi.fn(),
    };

    discoveryService = new DiscoveryService(
      mockDbClient,
      mockEmbeddingService,
      mockRedisClient
    );
  });

  describe('discover', () => {
    it('should discover agents by embedding', async () => {
      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
        min_trust: 0.7,
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([sampleAgent]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(1);
      expect(results[0].did).toBe('did:key:z123');
      expect(mockDbClient.searchAgentsByEmbedding).toHaveBeenCalledWith(
        query.embedding,
        0.7,
        50
      );
    });

    it('should generate embedding from description if not provided', async () => {
      const query: DiscoveryQuery = {
        description: 'search for documents',
      };

      const generatedEmbedding = [0.1, 0.2, 0.3];

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockEmbeddingService.embed.mockResolvedValue(generatedEmbedding);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([sampleAgent]);

      await discoveryService.discover(query);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('search for documents');
      expect(mockDbClient.searchAgentsByEmbedding).toHaveBeenCalledWith(
        generatedEmbedding,
        0.7,
        50
      );
    });

    it('should throw error if no embedding or description provided', async () => {
      const query: DiscoveryQuery = {};

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);

      await expect(discoveryService.discover(query)).rejects.toThrow(
        'Query must have either embedding or description'
      );
    });

    it('should filter agents by minimum trust score', async () => {
      const lowTrustAgent: SemanticAddress = {
        ...sampleAgent,
        did: 'did:key:z456',
        trust: { ...sampleAgent.trust, score: 0.5 },
      };

      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
        min_trust: 0.7,
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([
        sampleAgent,
        lowTrustAgent,
      ]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(1);
      expect(results[0].trust.score).toBeGreaterThanOrEqual(0.7);
    });

    it('should filter agents by tags', async () => {
      const agentWithoutTag: SemanticAddress = {
        ...sampleAgent,
        did: 'did:key:z789',
        capabilities: [
          {
            '@type': 'other.capability',
            description: 'Other service',
            tags: ['other'],
          },
        ],
      };

      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
        tags: ['search'],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([
        sampleAgent,
        agentWithoutTag,
      ]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(1);
      expect(results[0].capabilities[0].tags).toContain('search');
    });

    it('should return cached results if available', async () => {
      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue([sampleAgent]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(1);
      expect(mockDbClient.searchAgentsByEmbedding).not.toHaveBeenCalled();
    });

    it('should cache discovery results', async () => {
      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([sampleAgent]);

      await discoveryService.discover(query);

      expect(mockRedisClient.cacheDiscoveryResult).toHaveBeenCalled();
      const cacheCall = mockRedisClient.cacheDiscoveryResult.mock.calls[0];
      expect(cacheCall[1]).toEqual([sampleAgent]);
      expect(cacheCall[2]).toBe(300); // 5 minutes TTL
    });

    it('should limit results to 20 agents', async () => {
      const manyAgents = Array.from({ length: 50 }, (_, i) => ({
        ...sampleAgent,
        did: `did:key:z${i}`,
      }));

      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue(manyAgents);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(20);
    });
  });

  describe('registerAgent', () => {
    it('should register agent with existing embeddings', async () => {
      const address: SemanticAddress = {
        ...sampleAgent,
        capabilities: [
          {
            '@type': 'search.capability',
            description: 'Search documents',
            tags: ['search'],
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      };

      await discoveryService.registerAgent(address, 3600);

      expect(mockDbClient.registerAgent).toHaveBeenCalledWith(address, 3600);
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should generate embeddings for capabilities without them', async () => {
      const address: SemanticAddress = {
        ...sampleAgent,
        capabilities: [
          {
            '@type': 'search.capability',
            description: 'Search documents',
            tags: ['search'],
          },
        ],
      };

      const generatedEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.embed.mockResolvedValue(generatedEmbedding);

      await discoveryService.registerAgent(address, 3600);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('Search documents');
      expect(address.capabilities[0].embedding).toEqual(generatedEmbedding);
      expect(mockDbClient.registerAgent).toHaveBeenCalledWith(address, 3600);
    });

    it('should handle multiple capabilities', async () => {
      const address: SemanticAddress = {
        ...sampleAgent,
        capabilities: [
          {
            '@type': 'search.capability',
            description: 'Search documents',
            tags: ['search'],
          },
          {
            '@type': 'analyze.capability',
            description: 'Analyze data',
            tags: ['analysis'],
          },
        ],
      };

      mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);

      await discoveryService.registerAgent(address, 3600);

      expect(mockEmbeddingService.embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAgent', () => {
    it('should retrieve agent by DID', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const result = await discoveryService.getAgent('did:key:z123');

      expect(result).toEqual(sampleAgent);
      expect(mockDbClient.getAgent).toHaveBeenCalledWith('did:key:z123');
    });

    it('should return null if agent not found', async () => {
      mockDbClient.getAgent.mockResolvedValue(null);

      const result = await discoveryService.getAgent('did:key:z999');

      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty agent results', async () => {
      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(0);
    });

    it('should handle agents without trust scores', async () => {
      const agentNoTrust: SemanticAddress = {
        ...sampleAgent,
        trust: {
          score: 0,
          dimensions: {
            reliability: 0,
            honesty: 0,
            competence: 0,
            timeliness: 0,
          },
          decay_rate: 0.977,
          last_updated: Date.now(),
        },
      };

      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
        min_trust: 0.5,
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([agentNoTrust]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(0);
    });

    it('should handle capabilities without tags', async () => {
      const agentNoTags: SemanticAddress = {
        ...sampleAgent,
        capabilities: [
          {
            '@type': 'test.capability',
            description: 'Test',
            tags: [],
          },
        ],
      };

      const query: DiscoveryQuery = {
        embedding: [0.1, 0.2, 0.3],
        tags: ['search'],
      };

      mockRedisClient.getCachedDiscoveryResult.mockResolvedValue(null);
      mockDbClient.searchAgentsByEmbedding.mockResolvedValue([agentNoTags]);

      const results = await discoveryService.discover(query);

      expect(results).toHaveLength(0);
    });
  });
});
