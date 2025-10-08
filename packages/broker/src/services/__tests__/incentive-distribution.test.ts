/**
 * IncentiveDistributionService Unit Tests
 * Tests credit distribution according to incentive splits
 *
 * Coverage:
 * - distribute() - Allocates credits per incentive split
 * - Split validation (must total 1.0)
 * - Remainder handling (pool gets rounding remainder)
 * - Agent/broker/validator allocation
 * - Usefulness proof ID association
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DatabaseClient } from '../../lib/db-client';
import { IncentiveDistributionService, DistributionParams } from '../incentive-distribution';
import { IncentiveSplit } from '@ainp/core';
import {
  createMockCreditService,
  createTestIncentiveSplit,
} from '../../../tests/helpers/negotiation-helpers';
import {
  setupTestDatabase,
  applyMigration,
} from '../../../tests/helpers/db';

describe.skipIf(!process.env.DATABASE_URL)('IncentiveDistributionService', () => {
  let db: DatabaseClient;
  let service: IncentiveDistributionService;
  let mockCreditService: ReturnType<typeof createMockCreditService>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping incentive-distribution tests: DATABASE_URL not set');
      return;
    }

    db = await setupTestDatabase();
    await applyMigration(db, '003_add_credit_system.sql');
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL || !db) return;
    await db.disconnect();
  });

  beforeEach(() => {
    mockCreditService = createMockCreditService();

    // @ts-ignore - Mock type compatibility
    service = new IncentiveDistributionService(db, mockCreditService);
  });

  describe('distribute', () => {
    it('should allocate credits according to default split', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(), // 70/10/10/10
      };

      const result = await service.distribute(params);

      expect(result.distributed.agent).toBe(70000n);
      expect(result.distributed.broker).toBe(10000n);
      expect(result.distributed.validator).toBe(10000n);
      expect(result.distributed.pool).toBe(10000n);

      // Verify credits earned by agent
      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:agent',
        70000n,
        params.intent_id,
        undefined
      );
    });

    it('should allocate credits with custom split', async () => {
      const customSplit: IncentiveSplit = {
        agent: 0.8,
        broker: 0.05,
        validator: 0.05,
        pool: 0.1,
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: customSplit,
      };

      const result = await service.distribute(params);

      expect(result.distributed.agent).toBe(80000n);
      expect(result.distributed.broker).toBe(5000n);
      expect(result.distributed.validator).toBe(5000n);
      expect(result.distributed.pool).toBe(10000n);
    });

    it('should handle rounding remainder correctly (pool gets remainder)', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100001n, // Odd amount to test rounding
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      const result = await service.distribute(params);

      // agent: floor(100001 * 0.7) = 70000
      // broker: floor(100001 * 0.1) = 10000
      // validator: floor(100001 * 0.1) = 10000
      // pool: 100001 - 70000 - 10000 - 10000 = 10001 (gets remainder)

      expect(result.distributed.agent).toBe(70000n);
      expect(result.distributed.broker).toBe(10000n);
      expect(result.distributed.validator).toBe(10000n);
      expect(result.distributed.pool).toBe(10001n); // Remainder goes here

      // Total should equal input
      const total =
        result.distributed.agent +
        result.distributed.broker +
        result.distributed.validator +
        result.distributed.pool;
      expect(total).toBe(100001n);
    });

    it('should call earn for agent with usefulness proof ID', async () => {
      const proofId = randomUUID();
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
        usefulness_proof_id: proofId,
      };

      await service.distribute(params);

      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:agent',
        70000n,
        params.intent_id,
        proofId
      );
    });

    it('should call earn for broker when broker_did provided', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      await service.distribute(params);

      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:broker',
        10000n,
        params.intent_id
      );
    });

    it('should call earn for validator when validator_did provided', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      await service.distribute(params);

      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:validator',
        10000n,
        params.intent_id
      );
    });

    it('should skip broker distribution when broker_did not provided', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        incentive_split: createTestIncentiveSplit(),
      };

      await service.distribute(params);

      // Agent should still get their share
      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:agent',
        70000n,
        params.intent_id,
        undefined
      );

      // Broker and validator should not be called
      expect(mockCreditService.earn).toHaveBeenCalledTimes(1);
    });

    it('should skip validator distribution when validator_did not provided', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        incentive_split: createTestIncentiveSplit(),
      };

      await service.distribute(params);

      // Agent and broker called
      expect(mockCreditService.earn).toHaveBeenCalledTimes(2);
    });

    it('should skip broker distribution when broker amount is 0', async () => {
      const split: IncentiveSplit = {
        agent: 0.9,
        broker: 0.0,
        validator: 0.05,
        pool: 0.05,
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: split,
      };

      await service.distribute(params);

      // Only agent and validator should be called
      expect(mockCreditService.earn).toHaveBeenCalledTimes(2);
      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:agent',
        90000n,
        params.intent_id,
        undefined
      );
      expect(mockCreditService.earn).toHaveBeenCalledWith(
        'did:key:validator',
        5000n,
        params.intent_id
      );
    });

    it('should return complete distribution result', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      const result = await service.distribute(params);

      expect(result.intent_id).toBe(params.intent_id);
      expect(result.total_amount).toBe(100000n);
      expect(result.recipients.agent_did).toBe('did:key:agent');
      expect(result.recipients.broker_did).toBe('did:key:broker');
      expect(result.recipients.validator_did).toBe('did:key:validator');
    });

    it('should handle very small amounts', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 10n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      const result = await service.distribute(params);

      // agent: floor(10 * 0.7) = 7
      // broker: floor(10 * 0.1) = 1
      // validator: floor(10 * 0.1) = 1
      // pool: 10 - 7 - 1 - 1 = 1

      expect(result.distributed.agent).toBe(7n);
      expect(result.distributed.broker).toBe(1n);
      expect(result.distributed.validator).toBe(1n);
      expect(result.distributed.pool).toBe(1n);

      // Total preserved
      const total =
        result.distributed.agent +
        result.distributed.broker +
        result.distributed.validator +
        result.distributed.pool;
      expect(total).toBe(10n);
    });

    it('should handle very large amounts', async () => {
      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 1000000000000n, // 1 trillion
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      const result = await service.distribute(params);

      expect(result.distributed.agent).toBe(700000000000n);
      expect(result.distributed.broker).toBe(100000000000n);
      expect(result.distributed.validator).toBe(100000000000n);
      expect(result.distributed.pool).toBe(100000000000n);

      // Total preserved
      const total =
        result.distributed.agent +
        result.distributed.broker +
        result.distributed.validator +
        result.distributed.pool;
      expect(total).toBe(1000000000000n);
    });
  });

  describe('split validation', () => {
    it('should throw when split does not total 1.0', async () => {
      const invalidSplit: IncentiveSplit = {
        agent: 0.7,
        broker: 0.1,
        validator: 0.1,
        pool: 0.05, // Totals 0.95 (invalid)
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        incentive_split: invalidSplit,
      };

      await expect(service.distribute(params)).rejects.toThrow(
        'Invalid incentive split: totals 0.95, expected 1.0'
      );
    });

    it('should throw when split exceeds 1.0', async () => {
      const invalidSplit: IncentiveSplit = {
        agent: 0.7,
        broker: 0.2,
        validator: 0.2,
        pool: 0.2, // Totals 1.3 (invalid)
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        incentive_split: invalidSplit,
      };

      await expect(service.distribute(params)).rejects.toThrow(
        'Invalid incentive split: totals 1.3, expected 1.0'
      );
    });

    it('should allow split with floating point tolerance', async () => {
      // 0.7 + 0.1 + 0.1 + 0.1 = 0.9999999999999999 (floating point error)
      const split: IncentiveSplit = {
        agent: 0.7,
        broker: 0.1,
        validator: 0.1,
        pool: 0.09999999,
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: split,
      };

      // Should not throw (within tolerance)
      await expect(service.distribute(params)).resolves.toBeDefined();
    });

    it('should accept split with all zeros except agent', async () => {
      const split: IncentiveSplit = {
        agent: 1.0,
        broker: 0.0,
        validator: 0.0,
        pool: 0.0,
      };

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        incentive_split: split,
      };

      const result = await service.distribute(params);

      expect(result.distributed.agent).toBe(100000n);
      expect(result.distributed.broker).toBe(0n);
      expect(result.distributed.validator).toBe(0n);
      expect(result.distributed.pool).toBe(0n);
    });
  });

  describe('credit operation failures', () => {
    it('should propagate credit service errors', async () => {
      mockCreditService.earn.mockRejectedValueOnce(new Error('Database connection lost'));

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        incentive_split: createTestIncentiveSplit(),
      };

      await expect(service.distribute(params)).rejects.toThrow('Database connection lost');
    });

    it('should fail on broker distribution error', async () => {
      // Agent succeeds, broker fails
      mockCreditService.earn.mockResolvedValueOnce(undefined); // Agent
      mockCreditService.earn.mockRejectedValueOnce(new Error('Broker account not found'));

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        incentive_split: createTestIncentiveSplit(),
      };

      await expect(service.distribute(params)).rejects.toThrow('Broker account not found');
    });

    it('should fail on validator distribution error', async () => {
      // Agent and broker succeed, validator fails
      mockCreditService.earn.mockResolvedValueOnce(undefined); // Agent
      mockCreditService.earn.mockResolvedValueOnce(undefined); // Broker
      mockCreditService.earn.mockRejectedValueOnce(new Error('Validator account not found'));

      const params: DistributionParams = {
        intent_id: randomUUID(),
        total_amount: 100000n,
        agent_did: 'did:key:agent',
        broker_did: 'did:key:broker',
        validator_did: 'did:key:validator',
        incentive_split: createTestIncentiveSplit(),
      };

      await expect(service.distribute(params)).rejects.toThrow('Validator account not found');
    });
  });
});
