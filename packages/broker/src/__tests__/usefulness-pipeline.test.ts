/**
 * End-to-end tests for usefulness proof pipeline
 * Tests the complete flow: proof submission → aggregation → credit distribution → discovery ranking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseClient } from '../lib/db-client';
import { RedisClient } from '../lib/redis-client';
import { UsefulnessAggregatorService } from '../services/usefulness-aggregator';
import { IncentiveDistributionService } from '../services/incentive-distribution';
import { CreditService } from '../services/credits';
import { ProofSubmissionRequest } from '@ainp/core';

const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://localhost/ainp_test';
const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe.skipIf(!process.env.DATABASE_URL)('Usefulness Proof Pipeline (E2E)', () => {
  let db: DatabaseClient;
  let redisClient: RedisClient;
  let aggregator: UsefulnessAggregatorService;
  let creditService: CreditService;
  let incentiveDistribution: IncentiveDistributionService;

  const TEST_AGENT_1 = 'did:key:z6MkTestUsefulAgent1' + Date.now();
  const TEST_AGENT_2 = 'did:key:z6MkTestUsefulAgent2' + Date.now();
  const TEST_AGENT_3 = 'did:key:z6MkTestUsefulAgent3' + Date.now();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping usefulness pipeline tests: DATABASE_URL not set');
      return;
    }

    db = new DatabaseClient(TEST_DB_URL);
    await db.connect();

    redisClient = new RedisClient(TEST_REDIS_URL);
    await redisClient.connect();

    aggregator = new UsefulnessAggregatorService(db);
    creditService = new CreditService(db);
    incentiveDistribution = new IncentiveDistributionService(db, creditService);

    // Register test agents
    for (const did of [TEST_AGENT_1, TEST_AGENT_2, TEST_AGENT_3]) {
      await db.query(
        `INSERT INTO agents (did, created_at)
         VALUES ($1, NOW())
         ON CONFLICT (did) DO NOTHING`,
        [did]
      );

      // Initialize credit accounts
      await db.query(
        `INSERT INTO credit_accounts (agent_did, balance, earned, spent)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (agent_did) DO NOTHING`,
        [did]
      );
    }
  });

  afterAll(async () => {
    if (db) {
      await db.disconnect();
    }
    if (redisClient) {
      await redisClient.disconnect();
    }
  });

  describe('Phase 2A: Proof Validation', () => {
    it('should accept valid proof submission', async () => {
      const proof: ProofSubmissionRequest = {
        intent_id: 'test-intent-' + Date.now(),
        trace_id: 'test-trace-' + Date.now(),
        work_type: 'compute',
        metrics: {
          compute_ms: 5000, // 5 seconds of compute
        },
      };

      const result = await aggregator.submitProof(TEST_AGENT_1, proof);

      expect(result.id).toBeTruthy();
      expect(result.usefulness_score).toBeGreaterThan(0);
      expect(result.created_at).toBeDefined();
    });

    it('should reject duplicate proof (same trace_id + agent_did)', async () => {
      const traceId = 'duplicate-test-trace-' + Date.now();

      const proof: ProofSubmissionRequest = {
        intent_id: 'test-intent-' + Date.now(),
        trace_id: traceId,
        work_type: 'compute',
        metrics: {
          compute_ms: 1000,
        },
      };

      // First submission should succeed
      await aggregator.submitProof(TEST_AGENT_1, proof);

      // Second submission with same trace_id should fail
      await expect(
        aggregator.submitProof(TEST_AGENT_1, proof)
      ).rejects.toThrow(/Duplicate proof/);
    });

    it('should enforce minimum interval between proofs (fraud detection)', async () => {
      const proof1: ProofSubmissionRequest = {
        intent_id: 'test-intent-1-' + Date.now(),
        trace_id: 'test-trace-1-' + Date.now(),
        work_type: 'compute',
        metrics: {
          compute_ms: 1000,
        },
      };

      const proof2: ProofSubmissionRequest = {
        intent_id: 'test-intent-2-' + Date.now(),
        trace_id: 'test-trace-2-' + Date.now(),
        work_type: 'compute',
        metrics: {
          compute_ms: 1000,
        },
      };

      await aggregator.submitProof(TEST_AGENT_2, proof1);

      // Immediate submission should fail (< 5 seconds)
      await expect(
        aggregator.submitProof(TEST_AGENT_2, proof2)
      ).rejects.toThrow(/too frequent/);
    });

    it('should validate metrics ranges (fraud detection)', async () => {
      const invalidProof: ProofSubmissionRequest = {
        intent_id: 'test-intent-' + Date.now(),
        trace_id: 'test-trace-' + Date.now(),
        work_type: 'compute',
        metrics: {
          compute_ms: 9999999999, // Way too high (> 1 hour)
        },
      };

      await expect(
        aggregator.submitProof(TEST_AGENT_3, invalidProof)
      ).rejects.toThrow(/Invalid compute_ms/);
    });
  });

  describe('Phase 2B: Aggregation and Credit Distribution', () => {
    it('should aggregate usefulness scores across all agents', async () => {
      // Submit multiple proofs for different agents
      const proofs = [
        {
          agent: TEST_AGENT_1,
          proof: {
            intent_id: 'agg-test-1-' + Date.now(),
            trace_id: 'agg-trace-1-' + Date.now(),
            work_type: 'compute' as const,
            metrics: { compute_ms: 10000 }, // Score: 100 (max)
          },
        },
        {
          agent: TEST_AGENT_2,
          proof: {
            intent_id: 'agg-test-2-' + Date.now(),
            trace_id: 'agg-trace-2-' + Date.now(),
            work_type: 'compute' as const,
            metrics: { compute_ms: 5000 }, // Score: 50
          },
        },
      ];

      // Submit proofs with 6-second delay to avoid rate limit
      for (const { agent, proof } of proofs) {
        await aggregator.submitProof(agent, proof);
        await new Promise(resolve => setTimeout(resolve, 6000));
      }

      // Run aggregation
      const updateCount = await aggregator.updateCachedScores();
      expect(updateCount).toBeGreaterThan(0);

      // Verify scores were updated
      const agent1Score = await aggregator.getAgentScore(TEST_AGENT_1);
      const agent2Score = await aggregator.getAgentScore(TEST_AGENT_2);

      expect(agent1Score).toBeDefined();
      expect(agent2Score).toBeDefined();
      expect(agent1Score!.usefulness_score).toBeGreaterThan(0);
      expect(agent2Score!.usefulness_score).toBeGreaterThan(0);
    });

    it('should distribute credits proportionally based on usefulness scores', async () => {
      // Get initial balances
      const initialBalance1 = await creditService.getBalance(TEST_AGENT_1);
      const initialBalance2 = await creditService.getBalance(TEST_AGENT_2);

      // Distribute rewards (10000 credits = 10000000 atomic units)
      const rewardPool = BigInt(10000000);
      const result = await incentiveDistribution.distributeUsefulnessRewards(
        rewardPool,
        10 // minScore
      );

      expect(result.total_distributed).toBeGreaterThan(0n);
      expect(result.recipients.length).toBeGreaterThan(0);

      // Verify credits were distributed
      const finalBalance1 = await creditService.getBalance(TEST_AGENT_1);
      const finalBalance2 = await creditService.getBalance(TEST_AGENT_2);

      expect(finalBalance1).toBeGreaterThan(initialBalance1);
      expect(finalBalance2).toBeGreaterThan(initialBalance2);

      // Agent 1 should have more credits (higher score)
      const agent1Increase = finalBalance1 - initialBalance1;
      const agent2Increase = finalBalance2 - initialBalance2;
      expect(agent1Increase).toBeGreaterThan(agent2Increase);
    });
  });

  describe('Phase 2C: Discovery Integration', () => {
    it('should rank agents with higher usefulness scores higher in discovery', async () => {
      // This test verifies that usefulness_score_cached is used in discovery ranking
      // The actual discovery integration is tested in discovery.test.ts
      // Here we just verify the scores are cached correctly

      const agent1Score = await aggregator.getAgentScore(TEST_AGENT_1);
      const agent2Score = await aggregator.getAgentScore(TEST_AGENT_2);

      expect(agent1Score).toBeDefined();
      expect(agent2Score).toBeDefined();

      // Verify scores are cached in agents table
      const agent1Result = await db.query(
        'SELECT usefulness_score_cached FROM agents WHERE did = $1',
        [TEST_AGENT_1]
      );
      const agent2Result = await db.query(
        'SELECT usefulness_score_cached FROM agents WHERE did = $1',
        [TEST_AGENT_2]
      );

      expect(agent1Result.rows[0].usefulness_score_cached).toBe(
        agent1Score!.usefulness_score
      );
      expect(agent2Result.rows[0].usefulness_score_cached).toBe(
        agent2Score!.usefulness_score
      );
    });
  });

  describe('Complete Pipeline', () => {
    it('should complete full pipeline: proof → aggregation → distribution → ranking', async () => {
      const testAgent = 'did:key:z6MkPipelineTest' + Date.now();

      // 1. Register agent
      await db.query(
        `INSERT INTO agents (did, created_at)
         VALUES ($1, NOW())
         ON CONFLICT (did) DO NOTHING`,
        [testAgent]
      );
      await db.query(
        `INSERT INTO credit_accounts (agent_did, balance, earned, spent)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (agent_did) DO NOTHING`,
        [testAgent]
      );

      // 2. Submit proof
      const proof: ProofSubmissionRequest = {
        intent_id: 'pipeline-test-' + Date.now(),
        trace_id: 'pipeline-trace-' + Date.now(),
        work_type: 'compute',
        metrics: {
          compute_ms: 8000, // High score
        },
      };

      const proofResult = await aggregator.submitProof(testAgent, proof);
      expect(proofResult.usefulness_score).toBeGreaterThan(0);

      // 3. Run aggregation
      await aggregator.updateCachedScores();

      // 4. Verify score cached
      const score = await aggregator.getAgentScore(testAgent);
      expect(score).toBeDefined();
      expect(score!.usefulness_score).toBeGreaterThan(0);

      // 5. Distribute credits
      const initialBalance = await creditService.getBalance(testAgent);
      await incentiveDistribution.distributeUsefulnessRewards(BigInt(5000000), 10);
      const finalBalance = await creditService.getBalance(testAgent);

      expect(finalBalance).toBeGreaterThan(initialBalance);

      // 6. Verify discovery ranking would use this score
      const agentData = await db.query(
        'SELECT usefulness_score_cached FROM agents WHERE did = $1',
        [testAgent]
      );
      expect(agentData.rows[0].usefulness_score_cached).toBeGreaterThan(0);
    });
  });
});
