/**
 * NegotiationService Unit Tests
 * Comprehensive tests for multi-round negotiation protocol
 *
 * Coverage:
 * - initiate() - Creates negotiation in 'initiated' state
 * - propose() - Adds rounds, calculates convergence, transitions states
 * - accept() - Transitions to 'accepted', reserves credits
 * - reject() - Transitions to 'rejected'
 * - getSession() - Fetches and parses JSONB fields
 * - getSessionsByAgent() - Queries by initiator/responder
 * - calculateConvergence() - Calculates proposal similarity
 * - validateStateTransition() - Enforces state machine rules
 * - settle() - Releases credits and distributes incentives
 *
 * Edge Cases:
 * - Invalid state transitions
 * - Expired negotiations
 * - Max rounds exceeded
 * - Missing negotiation
 * - Convergence calculation with missing terms
 * - Settlement without reserved credits
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DatabaseClient } from '../../lib/db-client';
import { NegotiationService } from '../negotiation';
import {
  NegotiationNotFoundError,
  InvalidStateTransitionError,
  ExpiredNegotiationError,
  MaxRoundsExceededError,
} from '@ainp/core';
import {
  createTestNegotiation,
  createTestProposal,
  createMockCreditService,
  createMockIncentiveService,
} from '../../../tests/helpers/negotiation-helpers';
import {
  setupTestDatabase,
  applyMigration,
  cleanupNegotiations,
  createTestAgent,
  cleanupAgents,
} from '../../../tests/helpers/db';

// Mock environment variables
process.env.NEGOTIATION_ENABLED = 'true';
process.env.CREDIT_LEDGER_ENABLED = 'true';

describe.skipIf(!process.env.DATABASE_URL)('NegotiationService', () => {
  let db: DatabaseClient;
  let service: NegotiationService;
  let mockCreditService: ReturnType<typeof createMockCreditService>;
  const testAgentDIDs: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping negotiation tests: DATABASE_URL not set');
      return;
    }

    db = await setupTestDatabase();

    // Apply negotiations migration
    await applyMigration(db, '004_add_negotiation_sessions.sql');
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    // Cleanup all test data
    await cleanupNegotiations(db);
    await cleanupAgents(db, testAgentDIDs);
    await db.disconnect();
  });

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !db) {
      return;
    }

    // Reset database state
    await cleanupNegotiations(db);

    // Create fresh mock credit service
    mockCreditService = createMockCreditService();

    // @ts-ignore - Mock type compatibility
    service = new NegotiationService(db, mockCreditService);
  });

  describe('initiate', () => {
    it('should create negotiation in initiated state', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      // Create test agents
      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      expect(session.state).toBe('initiated');
      expect(session.intent_id).toBe(params.intent_id);
      expect(session.initiator_did).toBe(params.initiator_did);
      expect(session.responder_did).toBe(params.responder_did);
      expect(session.rounds).toHaveLength(1);
      expect(session.rounds[0].proposal).toEqual(params.initial_proposal);
      expect(session.rounds[0].round_number).toBe(1);
      expect(session.rounds[0].proposer_did).toBe(params.initiator_did);
      expect(session.convergence_score).toBe(0.0);
      expect(session.max_rounds).toBe(params.max_rounds);
    });

    it('should set expiration based on ttl_minutes', async () => {
      const params = createTestNegotiation({ ttl_minutes: 10 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const before = new Date(Date.now() + 10 * 60 * 1000);
      const session = await service.initiate(params);
      const after = new Date(Date.now() + 10 * 60 * 1000);

      expect(session.expires_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(session.expires_at.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('should use default incentive split if not provided', async () => {
      const params = createTestNegotiation({
        initial_proposal: { price: 100 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      expect(session.incentive_split).toEqual({
        agent: 0.7,
        broker: 0.1,
        validator: 0.1,
        pool: 0.1,
      });
    });

    it('should use custom incentive split if provided', async () => {
      const customSplit = {
        agent: 0.8,
        broker: 0.05,
        validator: 0.05,
        pool: 0.1,
      };
      const params = createTestNegotiation({
        initial_proposal: {
          price: 100,
          incentive_split: customSplit,
        },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      expect(session.incentive_split).toEqual(customSplit);
    });

    it('should throw when initiator and responder are the same', async () => {
      const did = 'did:key:same-agent-' + randomUUID();
      const params = createTestNegotiation({
        initiator_did: did,
        responder_did: did,
      });

      await expect(service.initiate(params)).rejects.toThrow(
        'Initiator and responder must be different agents'
      );
    });

    it('should throw when max_rounds is invalid (too low)', async () => {
      const params = createTestNegotiation({ max_rounds: 0 });

      await expect(service.initiate(params)).rejects.toThrow(
        'max_rounds must be between 1 and 20'
      );
    });

    it('should throw when max_rounds is invalid (too high)', async () => {
      const params = createTestNegotiation({ max_rounds: 25 });

      await expect(service.initiate(params)).rejects.toThrow(
        'max_rounds must be between 1 and 20'
      );
    });

    it('should throw when NEGOTIATION_ENABLED is false', async () => {
      process.env.NEGOTIATION_ENABLED = 'false';
      const params = createTestNegotiation();

      await expect(service.initiate(params)).rejects.toThrow(
        'Negotiation protocol is disabled'
      );

      process.env.NEGOTIATION_ENABLED = 'true';
    });
  });

  describe('propose', () => {
    it('should add round and transition to proposed state', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      const counterProposal = createTestProposal({
        price: 90,
        delivery_time: 3000,
        quality_sla: 0.95,
      });

      const updated = await service.propose(session.id, params.responder_did, counterProposal);

      expect(updated.state).toBe('proposed');
      expect(updated.rounds).toHaveLength(2);
      expect(updated.rounds[1].proposal).toEqual(counterProposal);
      expect(updated.rounds[1].proposer_did).toBe(params.responder_did);
      expect(updated.rounds[1].round_number).toBe(2);
      expect(updated.current_proposal).toEqual(counterProposal);
      expect(updated.convergence_score).toBeGreaterThan(0);
    });

    it('should transition to counter_proposed on subsequent rounds', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Responder proposes (initiated → proposed)
      await service.propose(session.id, params.responder_did, createTestProposal({ price: 90 }));

      // Initiator counter-proposes (proposed → counter_proposed)
      const updated = await service.propose(
        session.id,
        params.initiator_did,
        createTestProposal({ price: 95 })
      );

      expect(updated.state).toBe('counter_proposed');
      expect(updated.rounds).toHaveLength(3);
    });

    it('should calculate convergence across rounds', async () => {
      const params = createTestNegotiation({
        initial_proposal: { price: 100, delivery_time: 5000, quality_sla: 0.99 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Round 2: Responder proposes similar terms
      const round2 = await service.propose(session.id, params.responder_did, {
        price: 95,
        delivery_time: 4800,
        quality_sla: 0.98,
      });

      expect(round2.convergence_score).toBeGreaterThan(0.8);
      expect(round2.rounds[1].convergence_delta).toBeDefined();
      expect(round2.rounds[1].convergence_delta).toBeGreaterThan(0.8);
    });

    it('should throw when negotiation not found', async () => {
      const fakeId = randomUUID();

      await expect(
        service.propose(fakeId, 'did:key:test', createTestProposal())
      ).rejects.toThrow(NegotiationNotFoundError);
    });

    it('should throw when negotiation expired', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0 }); // Expires immediately
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(
        service.propose(session.id, params.responder_did, createTestProposal())
      ).rejects.toThrow(ExpiredNegotiationError);
    });

    it('should throw when max rounds exceeded', async () => {
      const params = createTestNegotiation({ max_rounds: 2 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Round 2 (responder)
      await service.propose(session.id, params.responder_did, createTestProposal({ price: 90 }));

      // Round 3 would exceed max_rounds (2)
      await expect(
        service.propose(session.id, params.initiator_did, createTestProposal({ price: 85 }))
      ).rejects.toThrow(MaxRoundsExceededError);
    });

    it('should throw when proposing from invalid state (accepted)', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, createTestProposal({ price: 90 }));
      await service.accept(session.id, params.initiator_did);

      // Cannot propose after accepted
      await expect(
        service.propose(session.id, params.responder_did, createTestProposal({ price: 85 }))
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  describe('accept', () => {
    it('should transition to accepted state', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      const proposal = createTestProposal({ price: 90 });
      await service.propose(session.id, params.responder_did, proposal);

      const accepted = await service.accept(session.id, params.initiator_did);

      expect(accepted.state).toBe('accepted');
      expect(accepted.final_proposal).toEqual(proposal);
    });

    it('should reserve credits when accepting proposal', async () => {
      const params = createTestNegotiation({
        initial_proposal: { price: 100 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 90 });

      await service.accept(session.id, params.initiator_did);

      expect(mockCreditService.reserve).toHaveBeenCalledWith(
        params.initiator_did,
        90000n, // 90 * 1000 atomic units
        params.intent_id
      );
    });

    it('should store reserved amount in proposal metadata', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });
      await service.accept(session.id, params.initiator_did);

      const updated = await service.getSession(session.id);
      expect(updated?.current_proposal?.custom_terms?.reserved_credits).toBe('100000');
    });

    it('should throw when negotiation not found', async () => {
      const fakeId = randomUUID();

      await expect(service.accept(fakeId, 'did:key:test')).rejects.toThrow(
        NegotiationNotFoundError
      );
    });

    it('should throw when negotiation expired', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0.001 }); // 60ms TTL
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, createTestProposal());

      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for expiration

      await expect(service.accept(session.id, params.initiator_did)).rejects.toThrow(
        ExpiredNegotiationError
      );
    });

    it('should throw when accepting from invalid state (initiated)', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Cannot accept without at least one counter-proposal
      await expect(service.accept(session.id, params.initiator_did)).rejects.toThrow(
        InvalidStateTransitionError
      );
    });

    it('should throw when acceptor is not a participant', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, createTestProposal());

      const outsider = 'did:key:outsider-' + randomUUID();

      await expect(service.accept(session.id, outsider)).rejects.toThrow(
        'Acceptor did:key:outsider'
      );
    });

    it('should throw when no current proposal to accept', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      // Manually delete current_proposal in database
      await db.query('UPDATE negotiations SET current_proposal = NULL WHERE id = $1', [
        session.id,
      ]);

      await expect(service.accept(session.id, params.initiator_did)).rejects.toThrow(
        'Cannot accept: no current proposal to accept'
      );
    });

    it('should throw when credit reservation fails', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      // Mock credit service to throw error
      mockCreditService.reserve.mockRejectedValueOnce(new Error('Insufficient balance'));

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });

      await expect(service.accept(session.id, params.initiator_did)).rejects.toThrow(
        'Credit reservation failed: Insufficient balance'
      );
    });
  });

  describe('reject', () => {
    it('should transition to rejected state', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      const rejected = await service.reject(session.id, params.responder_did, 'Terms unacceptable');

      expect(rejected.state).toBe('rejected');
      expect(rejected.rounds[rejected.rounds.length - 1].proposal.custom_terms?.rejected).toBe(
        true
      );
      expect(rejected.rounds[rejected.rounds.length - 1].proposal.custom_terms?.reason).toBe(
        'Terms unacceptable'
      );
    });

    it('should allow rejection without reason', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);

      const rejected = await service.reject(session.id, params.responder_did);

      expect(rejected.state).toBe('rejected');
      expect(rejected.rounds[rejected.rounds.length - 1].proposal.custom_terms?.rejected).toBe(
        true
      );
    });

    it('should throw when rejector is not a participant', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      const outsider = 'did:key:outsider-' + randomUUID();

      await expect(service.reject(session.id, outsider)).rejects.toThrow(
        'Rejector did:key:outsider'
      );
    });

    it('should throw when negotiation not found', async () => {
      const fakeId = randomUUID();

      await expect(service.reject(fakeId, 'did:key:test')).rejects.toThrow(
        NegotiationNotFoundError
      );
    });
  });

  describe('getSession', () => {
    it('should fetch and parse JSONB fields correctly', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const created = await service.initiate(params);
      const fetched = await service.getSession(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.rounds).toEqual(created.rounds);
      expect(fetched!.current_proposal).toEqual(created.current_proposal);
      expect(fetched!.incentive_split).toEqual(created.incentive_split);
    });

    it('should return null when negotiation not found', async () => {
      const fakeId = randomUUID();
      const result = await service.getSession(fakeId);

      expect(result).toBeNull();
    });
  });

  describe('getSessionsByAgent', () => {
    it('should query by initiator', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      await service.initiate(params);

      const sessions = await service.getSessionsByAgent(params.initiator_did);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].initiator_did).toBe(params.initiator_did);
    });

    it('should query by responder', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      await service.initiate(params);

      const sessions = await service.getSessionsByAgent(params.responder_did);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].responder_did).toBe(params.responder_did);
    });

    it('should filter by state', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, createTestProposal());

      const initiated = await service.getSessionsByAgent(params.initiator_did, 'initiated');
      const proposed = await service.getSessionsByAgent(params.initiator_did, 'proposed');

      expect(initiated).toHaveLength(0);
      expect(proposed).toHaveLength(1);
    });

    it('should return empty array when no sessions found', async () => {
      const sessions = await service.getSessionsByAgent('did:key:nonexistent');

      expect(sessions).toEqual([]);
    });
  });

  describe('calculateConvergence', () => {
    it('should return 0 for less than 2 rounds', async () => {
      const rounds = [
        {
          round_number: 1,
          proposer_did: 'did:key:test',
          proposal: { price: 100 },
          timestamp: Date.now(),
        },
      ];

      const score = service.calculateConvergence(rounds);

      expect(score).toBe(0.0);
    });

    it('should calculate similarity between last two proposals', async () => {
      const rounds = [
        {
          round_number: 1,
          proposer_did: 'did:key:test1',
          proposal: { price: 100, delivery_time: 5000, quality_sla: 0.99 },
          timestamp: Date.now(),
        },
        {
          round_number: 2,
          proposer_did: 'did:key:test2',
          proposal: { price: 95, delivery_time: 4800, quality_sla: 0.98 },
          timestamp: Date.now(),
        },
      ];

      const score = service.calculateConvergence(rounds);

      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should handle missing terms gracefully', async () => {
      const rounds = [
        {
          round_number: 1,
          proposer_did: 'did:key:test1',
          proposal: { price: 100 },
          timestamp: Date.now(),
        },
        {
          round_number: 2,
          proposer_did: 'did:key:test2',
          proposal: { delivery_time: 5000 },
          timestamp: Date.now(),
        },
      ];

      const score = service.calculateConvergence(rounds);

      expect(score).toBe(0.0); // No comparable terms
    });

    it('should return 1.0 for identical proposals', async () => {
      const proposal = { price: 100, delivery_time: 5000, quality_sla: 0.99 };
      const rounds = [
        {
          round_number: 1,
          proposer_did: 'did:key:test1',
          proposal,
          timestamp: Date.now(),
        },
        {
          round_number: 2,
          proposer_did: 'did:key:test2',
          proposal,
          timestamp: Date.now(),
        },
      ];

      const score = service.calculateConvergence(rounds);

      expect(score).toBe(1.0);
    });
  });

  describe('validateStateTransition', () => {
    it('should allow valid propose transition from initiated', () => {
      expect(() => service.validateStateTransition('initiated', 'propose')).not.toThrow();
    });

    it('should allow valid accept transition from proposed', () => {
      expect(() => service.validateStateTransition('proposed', 'accept')).not.toThrow();
    });

    it('should throw for invalid transition (accepted → propose)', () => {
      expect(() => service.validateStateTransition('accepted', 'propose')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should throw for invalid transition (rejected → accept)', () => {
      expect(() => service.validateStateTransition('rejected', 'accept')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should allow reject from any active state', () => {
      expect(() => service.validateStateTransition('initiated', 'reject')).not.toThrow();
      expect(() => service.validateStateTransition('proposed', 'reject')).not.toThrow();
      expect(() => service.validateStateTransition('counter_proposed', 'reject')).not.toThrow();
    });
  });

  describe('settle', () => {
    it('should release credits and distribute incentives', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const mockIncentiveService = createMockIncentiveService();

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });
      await service.accept(session.id, params.initiator_did);

      await service.settle(session.id, mockIncentiveService as any);

      // Verify credits released
      expect(mockCreditService.release).toHaveBeenCalledWith(
        params.initiator_did,
        100000n, // Reserved amount
        100000n, // All spent
        params.intent_id
      );

      // Verify incentives distributed
      expect(mockIncentiveService.distribute).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_id: params.intent_id,
          total_amount: 100000n,
          agent_did: params.responder_did,
          incentive_split: session.incentive_split,
        })
      );
    });

    it('should pass validator DID to distribution', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const mockIncentiveService = createMockIncentiveService();
      const validatorDID = 'did:key:validator-' + randomUUID();

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });
      await service.accept(session.id, params.initiator_did);

      await service.settle(session.id, mockIncentiveService as any, validatorDID);

      expect(mockIncentiveService.distribute).toHaveBeenCalledWith(
        expect.objectContaining({
          validator_did: validatorDID,
        })
      );
    });

    it('should pass usefulness proof ID to distribution', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const mockIncentiveService = createMockIncentiveService();
      const proofId = randomUUID();

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });
      await service.accept(session.id, params.initiator_did);

      await service.settle(session.id, mockIncentiveService as any, undefined, proofId);

      expect(mockIncentiveService.distribute).toHaveBeenCalledWith(
        expect.objectContaining({
          usefulness_proof_id: proofId,
        })
      );
    });

    it('should throw when negotiation not found', async () => {
      const fakeId = randomUUID();
      const mockIncentiveService = createMockIncentiveService();

      await expect(service.settle(fakeId, mockIncentiveService as any)).rejects.toThrow(
        NegotiationNotFoundError
      );
    });

    it('should throw when negotiation not accepted', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const mockIncentiveService = createMockIncentiveService();

      const session = await service.initiate(params);

      await expect(service.settle(session.id, mockIncentiveService as any)).rejects.toThrow(
        'Cannot settle negotiation in state initiated'
      );
    });

    it('should throw when no credits reserved', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const mockIncentiveService = createMockIncentiveService();

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, { price: 100 });

      // Manually accept without triggering credit reservation
      await db.query(
        `UPDATE negotiations SET state = 'accepted', final_proposal = current_proposal WHERE id = $1`,
        [session.id]
      );

      await expect(service.settle(session.id, mockIncentiveService as any)).rejects.toThrow(
        'No credits reserved for this negotiation'
      );
    });
  });

  describe('expireStaleNegotiations', () => {
    it('should expire negotiations past TTL', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      await service.initiate(params);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      const count = await service.expireStaleNegotiations();

      expect(count).toBe(1);

      const sessions = await service.getSessionsByAgent(params.initiator_did, 'expired');
      expect(sessions).toHaveLength(1);
    });

    it('should not expire active negotiations', async () => {
      const params = createTestNegotiation({ ttl_minutes: 60 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      await service.initiate(params);

      const count = await service.expireStaleNegotiations();

      expect(count).toBe(0);
    });

    it('should not expire already accepted negotiations', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0.001 }); // 60ms TTL
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await service.initiate(params);
      await service.propose(session.id, params.responder_did, createTestProposal());
      await service.accept(session.id, params.initiator_did);

      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait past expiration

      const count = await service.expireStaleNegotiations();

      expect(count).toBe(0); // Accepted negotiations should not expire
    });
  });
});
