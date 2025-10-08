/**
 * Negotiation Integration Tests
 * Tests full negotiation flow from initiation to settlement
 *
 * Coverage:
 * - Full negotiation flow: Initiate → Propose → Counter-propose → Accept → Settle
 * - Multi-round negotiation (3+ rounds)
 * - Convergence tracking across rounds
 * - Credit reservation on acceptance
 * - Credit distribution on settlement
 * - API endpoints integration
 * - Error scenarios (expired, max rounds, insufficient funds)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { DatabaseClient } from '../lib/db-client';
import { NegotiationService } from '../services/negotiation';
import { IncentiveDistributionService } from '../services/incentive-distribution';
import { CreditService } from '../services/credits';
import {
  createTestNegotiation,
  createTestProposal,
} from '../../tests/helpers/negotiation-helpers';
import {
  setupTestDatabase,
  applyMigration,
  cleanupNegotiations,
  cleanupCredits,
  createTestAgent,
  cleanupAgents,
} from '../../tests/helpers/db';

// Enable features for integration tests
process.env.NEGOTIATION_ENABLED = 'true';
process.env.CREDIT_LEDGER_ENABLED = 'true';

describe('Negotiation Integration Tests', () => {
  let db: DatabaseClient;
  let negotiationService: NegotiationService;
  let creditService: CreditService;
  let incentiveService: IncentiveDistributionService;
  const testAgentDIDs: string[] = [];

  beforeAll(async () => {
    // Skip tests if DATABASE_URL not set
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️  Skipping negotiation-integration tests: DATABASE_URL not set');
      return;
    }

    db = await setupTestDatabase();

    // Apply migrations
    await applyMigration(db, '009_add_credit_ledger.sql');
    await applyMigration(db, '004_add_negotiation_sessions.sql');

    // Initialize services
    creditService = new CreditService(db);
    incentiveService = new IncentiveDistributionService(db, creditService);
    negotiationService = new NegotiationService(db, creditService);
  });

  afterAll(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    await cleanupNegotiations(db);
    await cleanupCredits(db);
    await cleanupAgents(db, testAgentDIDs);
    await db.disconnect();
  });

  beforeEach(async () => {
    if (!process.env.DATABASE_URL || !db) return;

    await cleanupNegotiations(db);
    await cleanupCredits(db);
  });

  describe.skipIf(!process.env.DATABASE_URL)('Full Negotiation Flow', () => {
    it('should complete full negotiation: Initiate → Propose → Accept → Settle', async () => {
      const params = createTestNegotiation({
        initial_proposal: {
          price: 100,
          delivery_time: 5000,
          quality_sla: 0.99,
        },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      // Setup: Create agents and fund initiator
      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 1000000n);
      await creditService.createAccount(params.responder_did, 0n);

      // Step 1: Initiate negotiation
      const session = await negotiationService.initiate(params);
      expect(session.state).toBe('initiated');
      expect(session.rounds).toHaveLength(1);

      // Step 2: Responder proposes
      const counterProposal = createTestProposal({
        price: 90,
        delivery_time: 4500,
        quality_sla: 0.97,
      });
      const proposed = await negotiationService.propose(
        session.id,
        params.responder_did,
        counterProposal
      );
      expect(proposed.state).toBe('proposed');
      expect(proposed.rounds).toHaveLength(2);
      expect(proposed.convergence_score).toBeGreaterThan(0);

      // Step 3: Initiator accepts
      const accepted = await negotiationService.accept(session.id, params.initiator_did);
      expect(accepted.state).toBe('accepted');
      expect(accepted.final_proposal).toEqual(counterProposal);

      // Verify credits reserved
      const initiatorAccount = await creditService.getAccount(params.initiator_did);
      expect(initiatorAccount!.reserved).toBe(90000n); // 90 * 1000 atomic units

      // Step 4: Settle negotiation
      await negotiationService.settle(session.id, incentiveService);

      // Verify credits distributed
      const initiatorFinal = await creditService.getAccount(params.initiator_did);
      const responderFinal = await creditService.getAccount(params.responder_did);

      expect(initiatorFinal!.reserved).toBe(0n); // Released
      expect(initiatorFinal!.spent).toBe(90000n); // Marked as spent
      expect(responderFinal!.earned).toBe(63000n); // 90000 * 0.7 (agent share)
    });

    it('should handle multi-round negotiation with convergence', async () => {
      const params = createTestNegotiation({
        initial_proposal: { price: 100 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 1000000n);
      await creditService.createAccount(params.responder_did, 0n);

      // Round 1: Initiate (price: 100)
      const session = await negotiationService.initiate(params);

      // Round 2: Responder proposes (price: 80)
      const round2 = await negotiationService.propose(session.id, params.responder_did, {
        price: 80,
      });
      expect(round2.state).toBe('proposed');
      expect(round2.rounds).toHaveLength(2);

      // Round 3: Initiator counter-proposes (price: 90)
      const round3 = await negotiationService.propose(session.id, params.initiator_did, {
        price: 90,
      });
      expect(round3.state).toBe('counter_proposed');
      expect(round3.rounds).toHaveLength(3);

      // Round 4: Responder counter-proposes (price: 87)
      const round4 = await negotiationService.propose(session.id, params.responder_did, {
        price: 87,
      });
      expect(round4.rounds).toHaveLength(4);

      // Round 5: Initiator counter-proposes (price: 88)
      const round5 = await negotiationService.propose(session.id, params.initiator_did, {
        price: 88,
      });
      expect(round5.rounds).toHaveLength(5);

      // Convergence should increase as prices get closer
      expect(round3.convergence_score).toBeGreaterThan(round2.convergence_score);
      expect(round5.convergence_score).toBeGreaterThan(round4.convergence_score);

      // Accept and settle
      await negotiationService.accept(session.id, params.responder_did);
      await negotiationService.settle(session.id, incentiveService);

      // Verify final settlement
      const responderAccount = await creditService.getAccount(params.responder_did);
      expect(responderAccount!.earned).toBe(61600n); // 88000 * 0.7
    });

    it('should handle negotiation with validator', async () => {
      const validatorDID = 'did:key:validator-' + randomUUID();
      const params = createTestNegotiation({
        initial_proposal: { price: 100 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did, validatorDID);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await createTestAgent(db, validatorDID);
      await creditService.createAccount(params.initiator_did, 1000000n);
      await creditService.createAccount(params.responder_did, 0n);
      await creditService.createAccount(validatorDID, 0n);

      const session = await negotiationService.initiate(params);
      await negotiationService.propose(session.id, params.responder_did, { price: 100 });
      await negotiationService.accept(session.id, params.initiator_did);

      // Settle with validator
      await negotiationService.settle(session.id, incentiveService, validatorDID);

      // Verify validator received their share
      const validatorAccount = await creditService.getAccount(validatorDID);
      expect(validatorAccount!.earned).toBe(10000n); // 100000 * 0.1
    });

    it('should handle negotiation with usefulness proof', async () => {
      const proofId = randomUUID();
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 1000000n);
      await creditService.createAccount(params.responder_did, 0n);

      const session = await negotiationService.initiate(params);
      await negotiationService.propose(session.id, params.responder_did, { price: 100 });
      await negotiationService.accept(session.id, params.initiator_did);

      await negotiationService.settle(session.id, incentiveService, undefined, proofId);

      // Verify transaction recorded with proof ID
      const history = await creditService.getTransactionHistory(params.responder_did);
      const earnTx = history.find((tx) => tx.tx_type === 'earn');
      expect(earnTx?.usefulness_proof_id).toBe(proofId);
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Error Scenarios', () => {
    it('should fail when negotiation expires', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0 }); // Expires immediately
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await negotiationService.initiate(params);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Attempting to propose should fail
      await expect(
        negotiationService.propose(session.id, params.responder_did, createTestProposal())
      ).rejects.toThrow('Negotiation expired');
    });

    it('should fail when max rounds exceeded', async () => {
      const params = createTestNegotiation({ max_rounds: 3 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await negotiationService.initiate(params);

      // Round 2
      await negotiationService.propose(session.id, params.responder_did, { price: 90 });

      // Round 3
      await negotiationService.propose(session.id, params.initiator_did, { price: 95 });

      // Round 4 should fail (exceeds max_rounds = 3)
      await expect(
        negotiationService.propose(session.id, params.responder_did, { price: 92 })
      ).rejects.toThrow('Negotiation exceeded max rounds');
    });

    it('should fail when initiator has insufficient funds', async () => {
      const params = createTestNegotiation({
        initial_proposal: { price: 100 },
      });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 50000n); // Only 50 credits
      await creditService.createAccount(params.responder_did, 0n);

      const session = await negotiationService.initiate(params);
      await negotiationService.propose(session.id, params.responder_did, { price: 100 });

      // Accept should fail (cannot reserve 100000 with only 50000 balance)
      await expect(negotiationService.accept(session.id, params.initiator_did)).rejects.toThrow(
        'Credit reservation failed'
      );
    });

    it('should fail settlement without acceptance', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await negotiationService.initiate(params);

      // Cannot settle before acceptance
      await expect(negotiationService.settle(session.id, incentiveService)).rejects.toThrow(
        'Cannot settle negotiation in state initiated'
      );
    });

    it('should reject negotiation and prevent acceptance', async () => {
      const params = createTestNegotiation();
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 1000000n);

      const session = await negotiationService.initiate(params);
      await negotiationService.propose(session.id, params.responder_did, { price: 90 });

      // Reject negotiation
      const rejected = await negotiationService.reject(
        session.id,
        params.initiator_did,
        'Price too high'
      );
      expect(rejected.state).toBe('rejected');

      // Cannot accept after rejection
      await expect(negotiationService.accept(session.id, params.initiator_did)).rejects.toThrow(
        'Invalid state transition'
      );
    });

    it('should handle concurrent reservations correctly', async () => {
      const initiatorDID = 'did:key:concurrent-initiator-' + randomUUID();
      testAgentDIDs.push(initiatorDID);

      await createTestAgent(db, initiatorDID);
      await creditService.createAccount(initiatorDID, 200000n); // Can afford 2 negotiations

      // Create 3 concurrent negotiations
      const negotiations = await Promise.all([
        createTestNegotiation({ initiator_did: initiatorDID }),
        createTestNegotiation({ initiator_did: initiatorDID }),
        createTestNegotiation({ initiator_did: initiatorDID }),
      ]);

      // Track all test DIDs
      for (const params of negotiations) {
        testAgentDIDs.push(params.responder_did);
        await createTestAgent(db, params.responder_did);
        await creditService.createAccount(params.responder_did, 0n);
      }

      // Initiate all
      const sessions = await Promise.all(
        negotiations.map((params) => negotiationService.initiate(params))
      );

      // Propose on all
      await Promise.all(
        sessions.map((session, i) =>
          negotiationService.propose(session.id, negotiations[i].responder_did, { price: 100 })
        )
      );

      // Try to accept all concurrently (only 2 should succeed)
      const acceptResults = await Promise.allSettled(
        sessions.map((session, i) =>
          negotiationService.accept(session.id, negotiations[i].initiator_did)
        )
      );

      const succeeded = acceptResults.filter((r) => r.status === 'fulfilled').length;
      const failed = acceptResults.filter((r) => r.status === 'rejected').length;

      expect(succeeded).toBe(2);
      expect(failed).toBe(1);

      // Verify account state
      const account = await creditService.getAccount(initiatorDID);
      expect(account!.reserved).toBe(200000n); // 2 × 100000
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Query Operations', () => {
    it('should query negotiations by agent', async () => {
      const agentDID = 'did:key:query-agent-' + randomUUID();
      testAgentDIDs.push(agentDID);
      await createTestAgent(db, agentDID);

      // Create 3 negotiations as initiator
      for (let i = 0; i < 3; i++) {
        const responderDID = 'did:key:responder-' + i + '-' + randomUUID();
        testAgentDIDs.push(responderDID);
        await createTestAgent(db, responderDID);

        const params = createTestNegotiation({
          initiator_did: agentDID,
          responder_did: responderDID,
        });
        await negotiationService.initiate(params);
      }

      const sessions = await negotiationService.getSessionsByAgent(agentDID);

      expect(sessions).toHaveLength(3);
      expect(sessions.every((s) => s.initiator_did === agentDID)).toBe(true);
    });

    it('should filter negotiations by state', async () => {
      const agentDID = 'did:key:filter-agent-' + randomUUID();
      testAgentDIDs.push(agentDID);
      await createTestAgent(db, agentDID);
      await creditService.createAccount(agentDID, 1000000n);

      // Create 2 negotiations
      const params1 = createTestNegotiation({ initiator_did: agentDID });
      const params2 = createTestNegotiation({ initiator_did: agentDID });
      testAgentDIDs.push(params1.responder_did, params2.responder_did);

      await createTestAgent(db, params1.responder_did);
      await createTestAgent(db, params2.responder_did);
      await creditService.createAccount(params1.responder_did, 0n);
      await creditService.createAccount(params2.responder_did, 0n);

      const session1 = await negotiationService.initiate(params1);
      const session2 = await negotiationService.initiate(params2);

      // Accept session1
      await negotiationService.propose(session1.id, params1.responder_did, { price: 100 });
      await negotiationService.accept(session1.id, params1.initiator_did);

      // Query by state
      const initiated = await negotiationService.getSessionsByAgent(agentDID, 'initiated');
      const accepted = await negotiationService.getSessionsByAgent(agentDID, 'accepted');

      expect(initiated).toHaveLength(1);
      expect(initiated[0].id).toBe(session2.id);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].id).toBe(session1.id);
    });

    it('should return negotiations ordered by created_at DESC', async () => {
      const agentDID = 'did:key:ordered-agent-' + randomUUID();
      testAgentDIDs.push(agentDID);
      await createTestAgent(db, agentDID);

      // Create 3 negotiations with delays
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const responderDID = 'did:key:ordered-responder-' + i + '-' + randomUUID();
        testAgentDIDs.push(responderDID);
        await createTestAgent(db, responderDID);

        const params = createTestNegotiation({
          initiator_did: agentDID,
          responder_did: responderDID,
        });
        const session = await negotiationService.initiate(params);
        sessionIds.push(session.id);

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const sessions = await negotiationService.getSessionsByAgent(agentDID);

      // Should be in reverse order (newest first)
      expect(sessions[0].id).toBe(sessionIds[2]);
      expect(sessions[1].id).toBe(sessionIds[1]);
      expect(sessions[2].id).toBe(sessionIds[0]);
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Expiration Management', () => {
    it('should expire stale negotiations via cron', async () => {
      // Create negotiation that expires immediately
      const params = createTestNegotiation({ ttl_minutes: 0 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);

      const session = await negotiationService.initiate(params);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run expiration cron
      const count = await negotiationService.expireStaleNegotiations();

      expect(count).toBe(1);

      // Verify state changed
      const expired = await negotiationService.getSession(session.id);
      expect(expired!.state).toBe('expired');
    });

    it('should not expire accepted negotiations', async () => {
      const params = createTestNegotiation({ ttl_minutes: 0 });
      testAgentDIDs.push(params.initiator_did, params.responder_did);

      await createTestAgent(db, params.initiator_did);
      await createTestAgent(db, params.responder_did);
      await creditService.createAccount(params.initiator_did, 1000000n);

      const session = await negotiationService.initiate(params);
      await negotiationService.propose(session.id, params.responder_did, { price: 100 });
      await negotiationService.accept(session.id, params.initiator_did);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const count = await negotiationService.expireStaleNegotiations();

      expect(count).toBe(0);

      const accepted = await negotiationService.getSession(session.id);
      expect(accepted!.state).toBe('accepted'); // Still accepted
    });
  });
});
