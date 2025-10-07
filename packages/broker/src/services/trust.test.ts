/**
 * Tests for Trust Service
 * Testing trust score updates, decay, and exponential moving average
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrustService } from './trust';
import { TrustVector, SemanticAddress } from '@ainp/core/src/types';
import { DatabaseClient } from '../lib/db-client';

// Mock dependencies
vi.mock('../lib/db-client');

describe('Trust Service', () => {
  let trustService: TrustService;
  let mockDbClient: any;

  const defaultTrust: TrustVector = {
    score: 0.5,
    dimensions: {
      reliability: 0.5,
      honesty: 0.5,
      competence: 0.5,
      timeliness: 0.5,
    },
    decay_rate: 0.977,
    last_updated: Date.now(),
  };

  const sampleAgent: SemanticAddress = {
    did: 'did:key:z123',
    capabilities: [],
    endpoint: 'ws://agent.example.com',
    trust: defaultTrust,
  };

  beforeEach(() => {
    mockDbClient = {
      getAgent: vi.fn(),
      updateTrustScore: vi.fn(),
    };

    trustService = new TrustService(mockDbClient);
  });

  describe('updateTrust', () => {
    it('should update trust score on successful outcome', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.dimensions.reliability).toBeGreaterThan(0.5);
      expect(result.score).toBeGreaterThan(0.5);
      expect(mockDbClient.updateTrustScore).toHaveBeenCalledWith(
        'did:key:z123',
        expect.any(Object)
      );
    });

    it('should decrease trust score on failure', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: false,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.dimensions.reliability).toBeLessThan(0.5);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should use exponential moving average for dimension updates', async () => {
      const existingTrust: TrustVector = {
        score: 0.8,
        dimensions: {
          reliability: 0.8,
          honesty: 0.8,
          competence: 0.8,
          timeliness: 0.8,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: existingTrust });

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Alpha = 0.2, so new = 0.8 * 0.8 + 0.2 * 0.95 = 0.83
      expect(result.dimensions.reliability).toBeCloseTo(0.83, 2);
    });

    it('should apply decay based on time since last update', async () => {
      const oldTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      const oldTrust: TrustVector = {
        score: 0.8,
        dimensions: {
          reliability: 0.8,
          honesty: 0.8,
          competence: 0.8,
          timeliness: 0.8,
        },
        decay_rate: 0.977,
        last_updated: oldTimestamp,
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: oldTrust });

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Score should be lower due to 30-day decay
      expect(result.score).toBeLessThan(0.8);
    });

    it('should calculate timeliness based on latency', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 10000, // 2x expected
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Timeliness should decrease when latency > expected
      expect(result.dimensions.timeliness).toBeLessThan(0.5);
    });

    it('should handle perfect timeliness (latency < expected)', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 2000, // Under expected
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Timeliness should increase
      expect(result.dimensions.timeliness).toBeGreaterThan(0.5);
    });

    it('should use default trust for new agents', async () => {
      mockDbClient.getAgent.mockResolvedValue(null);

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z999', outcome);

      expect(result.dimensions.reliability).toBeGreaterThan(0.5);
      expect(result.dimensions.honesty).toBe(0.5); // Should remain default
      expect(result.dimensions.competence).toBe(0.5); // Should remain default
    });

    it('should calculate weighted trust score correctly', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Score = reliability*0.35 + honesty*0.35 + competence*0.2 + timeliness*0.1
      const expectedScore =
        result.dimensions.reliability * 0.35 +
        result.dimensions.honesty * 0.35 +
        result.dimensions.competence * 0.2 +
        result.dimensions.timeliness * 0.1;

      expect(result.score).toBeCloseTo(expectedScore, 5);
    });

    it('should preserve honesty and competence dimensions', async () => {
      const customTrust: TrustVector = {
        score: 0.7,
        dimensions: {
          reliability: 0.7,
          honesty: 0.9,
          competence: 0.8,
          timeliness: 0.6,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: customTrust });

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // These should not change (only reliability and timeliness are updated)
      expect(result.dimensions.honesty).toBe(0.9);
      expect(result.dimensions.competence).toBe(0.8);
    });

    it('should update last_updated timestamp', async () => {
      const oldTimestamp = Date.now() - 1000;
      const oldTrust: TrustVector = {
        ...defaultTrust,
        last_updated: oldTimestamp,
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: oldTrust });

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.last_updated).toBeGreaterThan(oldTimestamp);
    });
  });

  describe('Trust Score Bounds', () => {
    it('should handle trust score at upper bound (1.0)', async () => {
      const maxTrust: TrustVector = {
        score: 1.0,
        dimensions: {
          reliability: 1.0,
          honesty: 1.0,
          competence: 1.0,
          timeliness: 1.0,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: maxTrust });

      const outcome = {
        success: true,
        latency_ms: 100,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Score should remain near 1.0
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.score).toBeGreaterThan(0.9);
    });

    it('should handle trust score at lower bound (0.0)', async () => {
      const minTrust: TrustVector = {
        score: 0.0,
        dimensions: {
          reliability: 0.0,
          honesty: 0.0,
          competence: 0.0,
          timeliness: 0.0,
        },
        decay_rate: 0.977,
        last_updated: Date.now(),
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: minTrust });

      const outcome = {
        success: false,
        latency_ms: 10000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.score).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero expected latency', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 0,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Should not crash, timeliness calculation should handle division
      expect(result).toBeDefined();
      expect(result.dimensions.timeliness).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative latency gracefully', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: -1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.dimensions.timeliness).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large latency values', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: true,
        latency_ms: 1000000, // 1000 seconds
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result.dimensions.timeliness).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThan(defaultTrust.score);
    });

    it('should handle very old trust scores (years of decay)', async () => {
      const veryOldTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
      const veryOldTrust: TrustVector = {
        score: 0.9,
        dimensions: {
          reliability: 0.9,
          honesty: 0.9,
          competence: 0.9,
          timeliness: 0.9,
        },
        decay_rate: 0.977,
        last_updated: veryOldTimestamp,
      };

      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: veryOldTrust });

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      // Score should decay significantly after 1 year
      expect(result.score).toBeLessThan(0.5);
    });
  });

  describe('Negative Cases', () => {
    it('should handle agent without trust field', async () => {
      const agentNoTrust = {
        did: 'did:key:z123',
        capabilities: [],
        endpoint: 'ws://agent.example.com',
      };

      mockDbClient.getAgent.mockResolvedValue(agentNoTrust);

      const outcome = {
        success: true,
        latency_ms: 1000,
        expected_latency_ms: 5000,
      };

      const result = await trustService.updateTrust('did:key:z123', outcome);

      expect(result).toBeDefined();
      expect(result.score).toBeGreaterThan(0.5);
    });

    it('should handle consecutive failures', async () => {
      mockDbClient.getAgent.mockResolvedValue(sampleAgent);

      const outcome = {
        success: false,
        latency_ms: 10000,
        expected_latency_ms: 5000,
      };

      // First failure
      const result1 = await trustService.updateTrust('did:key:z123', outcome);
      mockDbClient.getAgent.mockResolvedValue({ ...sampleAgent, trust: result1 });

      // Second failure
      const result2 = await trustService.updateTrust('did:key:z123', outcome);

      expect(result2.score).toBeLessThan(result1.score);
      expect(result2.dimensions.reliability).toBeLessThan(result1.dimensions.reliability);
    });
  });
});
