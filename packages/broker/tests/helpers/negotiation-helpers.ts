/**
 * Test Helpers for Negotiation Protocol Tests
 * Provides factory functions and mock builders for test setup
 */

import { randomUUID } from 'crypto';
import { InitiateNegotiationParams, ProposalTerms, IncentiveSplit } from '@ainp/core';
import { CreditService } from '../../src/services/credits';

/**
 * Create test negotiation parameters with sensible defaults
 * All fields can be overridden via the overrides parameter
 */
export function createTestNegotiation(
  overrides?: Partial<InitiateNegotiationParams>
): InitiateNegotiationParams {
  return {
    intent_id: randomUUID(),
    initiator_did: 'did:key:test-initiator-' + randomUUID(),
    responder_did: 'did:key:test-responder-' + randomUUID(),
    initial_proposal: {
      price: 100,
      delivery_time: 3600,
      quality_sla: 0.99,
    },
    max_rounds: 10,
    ttl_minutes: 30, // Long TTL to avoid expiration during test execution
    ...overrides,
  };
}

/**
 * Create test proposal terms with sensible defaults
 */
export function createTestProposal(overrides?: Partial<ProposalTerms>): ProposalTerms {
  return {
    price: 100,
    delivery_time: 3600,
    quality_sla: 0.99,
    ...overrides,
  };
}

/**
 * Create mock CreditService with vitest spy functions
 * Tracks all calls for assertion in tests
 */
export function createMockCreditService() {
  // Use dynamic import to avoid vitest dependency in production
  const vi = (global as any).vi || {
    fn: (impl?: any) => {
      const fn = impl || (() => {});
      return Object.assign(fn, {
        mockResolvedValue: (val: any) => fn,
        mockRejectedValue: (val: any) => fn,
        mockReturnValue: (val: any) => fn,
      });
    },
  };

  return {
    reserve: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    earn: vi.fn().mockResolvedValue(undefined),
    deposit: vi.fn().mockResolvedValue(undefined),
    getAccount: vi.fn().mockResolvedValue({
      agent_did: 'did:key:test',
      balance: 1000000n,
      reserved: 0n,
      earned: 0n,
      spent: 0n,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    createAccount: vi.fn().mockResolvedValue({
      agent_did: 'did:key:test',
      balance: 1000000n,
      reserved: 0n,
      earned: 0n,
      spent: 0n,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    getTransactionHistory: vi.fn().mockResolvedValue([]),
  } as any;
}

/**
 * Create mock IncentiveDistributionService
 */
export function createMockIncentiveService() {
  const vi = (global as any).vi || {
    fn: (impl?: any) => {
      const fn = impl || (() => {});
      return Object.assign(fn, {
        mockResolvedValue: (val: any) => fn,
        mockRejectedValue: (val: any) => fn,
      });
    },
  };

  return {
    distribute: vi.fn().mockResolvedValue({
      intent_id: randomUUID(),
      total_amount: 100000n,
      distributed: {
        agent: 70000n,
        broker: 10000n,
        validator: 10000n,
        pool: 10000n,
      },
      recipients: {
        agent_did: 'did:key:test-agent',
        broker_did: 'did:key:test-broker',
        validator_did: 'did:key:test-validator',
      },
    }),
  };
}

/**
 * Create test incentive split
 */
export function createTestIncentiveSplit(overrides?: Partial<IncentiveSplit>): IncentiveSplit {
  return {
    agent: 0.7,
    broker: 0.1,
    validator: 0.1,
    pool: 0.1,
    ...overrides,
  };
}

/**
 * Wait for a specified duration (useful for timing-sensitive tests)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock current time for expiration tests
 * Returns cleanup function to restore original Date implementation
 */
export function mockCurrentTime(fixedTime: Date): () => void {
  const realDate = Date;
  const fixedTimestamp = fixedTime.getTime();

  // @ts-ignore - Mocking Date constructor
  global.Date = class extends realDate {
    constructor() {
      super();
      return new realDate(fixedTimestamp);
    }

    static now() {
      return fixedTimestamp;
    }
  } as DateConstructor;

  // Return cleanup function
  return () => {
    global.Date = realDate;
  };
}
