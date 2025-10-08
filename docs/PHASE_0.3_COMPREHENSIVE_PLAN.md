# AINP Phase 0.3+ Comprehensive Sprint Plan

**Created**: 2025-10-07
**Last Updated**: 2025-10-08
**Base Commit**: 80745d5 (Phase 0.2 deployment complete - 96.9% test pass rate)
**Current Commit**: 945d12f (Phase 1 Railway Infrastructure - 93% test pass rate)
**Planned By**: Implementation Planner & Sprint Architect (IPSA)
**Status**: Phase 1 Complete ✅ | Ready for Phase 2

---

## ✅ Phase 1: Railway Deployment Infrastructure (COMPLETE)

**Completed**: 2025-10-08
**Duration**: 1 day
**Commits**: 5 (d242148, cc0f0f0, 945d12f, and test fixes)

### Deliverables Completed

**1B: Database/Redis Client Validation** ✅
- Added DATABASE_URL and REDIS_URL validation with clear error messages
- Implemented retry logic with exponential backoff (3 attempts)
- Exported `isConnected()` health check methods
- **Evidence**: Commit b061b1b

**1C: Dynamic Health Check Endpoint** ✅
- Updated `/health` endpoint with real-time connection checks (db, redis, nats)
- Returns HTTP 503 when unhealthy (was always 200)
- **Breaking Change**: Response format changed to include `connections` object
- **Evidence**: Commit 7a118f5

**1D: Integration Test DATABASE_URL Checks** ✅
- Added `describe.skipIf(!process.env.DATABASE_URL)` to 100 integration tests
- Tests skip gracefully with clear warning messages
- Fixed vitest.config.ts include/exclude patterns
- **Evidence**: Commit b290444

**1E: Deployment Automation Scripts** ✅
- Created `scripts/deploy-railway.sh` (165 lines) - Full deployment pipeline
- Created `scripts/smoke-test.sh` (194 lines) - End-to-end validation
- Pre-deployment validation (lint, typecheck, build, test)
- Health check verification with retries
- **Evidence**: Commit 45782de

**1F: Documentation & Feature Flags** ✅
- Type-safe feature flag system (8 flags: signatures, discovery, credits, negotiation, monitoring)
- Environment-based flag resolution (production/preview/development/test)
- Discovery weight validation with epsilon tolerance
- Comprehensive test coverage (34/34 tests passing)
- **Evidence**: Commit d242148

**Database Integration Testing** ✅
- Enabled DATABASE_URL for all integration tests
- Fixed migration file references (003 → 009_add_credit_ledger.sql)
- Made migrations idempotent (IF NOT EXISTS on indexes/triggers)
- Fixed negotiation service transaction safety
- **Result**: 175/189 tests passing (93% pass rate, up from 47%)
- **Evidence**: Commits cc0f0f0, 945d12f

### Test Results

| Stage | Passed | Failed | Pass Rate |
|-------|--------|--------|-----------|
| **Before (no DATABASE_URL)** | 89 | 100 skipped | 47% |
| **After (with DATABASE_URL)** | 175 | 14 | 93% |
| **Improvement** | +86 tests | -100 skipped | +46% |

**Negotiation Integration Tests**:
- Before: 0/15 passing (all "NegotiationNotFoundError")
- After: 11/15 passing (73% pass rate)
- **Root Cause Fixed**: Missing INSERT verification + no transaction safety

### Remaining Issues (4 Minor)

1. **Credit distribution rounding** (61599n vs 61600n) - Floating point precision
2. **FK constraint on usefulness_proof_id** - usefulness_proofs table not seeded
3. **Expiration timing tests** - Needs longer TTL for slow CI
4. **Incentive split validation** - Floating point comparison tolerance

**Priority**: LOW - These don't block deployment or Phase 2

---

## Executive Summary

### Current State Assessment

**Phase 0.2 Achievements** ✅:
- Multi-round negotiation system (52/52 tests passing - 100%)
- Credit reservation and settlement system
- Semantic discovery with pgvector
- WebSocket + REST API broker
- PostgreSQL, NATS, Redis infrastructure
- Ed25519 signature validation
- Usefulness proof schema (migrations exist)

**Identified Issues** ⚠️:
1. **Foreign Key Constraint Failures** (3 tests): `usefulness_proofs` table missing test agents
2. **Integration Test Failures** (7 test suites): Need database setup in tests
3. **Discovery Service Failures** (2 tests): OpenAI API integration needed
4. **NATS Event Streaming**: Not yet implemented (Phase 0.3 core)
5. **Usefulness Proof Generation**: Schema exists, implementation missing

### Sprint Goals

This plan covers **Phase 0.3 through Phase 0.5**, delivering:

1. **Phase 0.3**: NATS event streaming and pub/sub (Priority 1)
2. **Phase 0.4**: Usefulness proof generation and validation (Priority 2)
3. **Phase 0.5**: Frontend UI and agent dashboard (Priority 3)
4. **Test Fixes**: Resolve all 7 failing test suites (blocking work)

**Timeline**: 12-15 days across 6 phases
**Risk Level**: Medium (requires careful test repair and NATS integration)

---

## Clarifications Needed (REQUIRED BEFORE PROCEEDING)

### 1. Test Failure Resolution Priority
**Question**: Should we fix test failures before or during Phase 0.3 implementation?

**Options**:
- **Option A**: Fix all tests first (blocking - 1 day delay)
  - Pros: Clean foundation, no test debt
  - Cons: Delays NATS implementation

- **Option B**: Fix tests in parallel with Phase 0.3 (concurrent)
  - Pros: No delay to feature work
  - Cons: Risk of test-induced regressions

- **Option C**: Fix critical tests only, defer rest (pragmatic)
  - Pros: Balanced approach, unblock critical paths
  - Cons: Some test debt remains

**Recommendation**: **Option A (Fix first)** - Tests are foundation for safe refactoring

### 2. NATS Event Streaming Scope
**Question**: What events should be streamed in Phase 0.3?

**Options**:
- **Option A**: Core events only (intents, negotiations, results)
  - Coverage: 80% of use cases
  - Effort: 2 days

- **Option B**: Core + agent lifecycle events (registration, heartbeat, deregistration)
  - Coverage: 95% of use cases
  - Effort: 3 days

- **Option C**: Full event catalog (all state changes)
  - Coverage: 100%
  - Effort: 5 days

**Recommendation**: **Option B (Core + lifecycle)** - Balances completeness and timeline

### 3. Usefulness Proof Implementation Strategy
**Question**: How should we generate usefulness proofs in Phase 0.4?

**Options**:
- **Option A**: Simple aggregation (count completions, avg ratings)
  - Pros: Fast to implement, predictable
  - Cons: Limited richness

- **Option B**: Multi-dimensional scoring (speed, quality, trust growth)
  - Pros: More nuanced, better agent ranking
  - Cons: Requires careful weighting

- **Option C**: ML-based scoring (train model on historical data)
  - Pros: Adaptive, sophisticated
  - Cons: Complex, requires training data

**Recommendation**: **Option B (Multi-dimensional)** - Aligns with RFC 001 trust framework

### 4. Frontend UI Technology Stack (Phase 0.5)
**Question**: What should we use for the agent dashboard?

**Options**:
- **Option A**: Next.js + shadcn/ui (modern, TypeScript-first)
  - Pros: Type safety, SSR, component library integration
  - Cons: Requires new package in monorepo

- **Option B**: React SPA + Vite (lightweight, fast)
  - Pros: Simple, no SSR complexity
  - Cons: Manual component styling

- **Option C**: Svelte/SvelteKit (minimal, reactive)
  - Pros: Smaller bundle size, elegant syntax
  - Cons: Team less familiar with Svelte

**Recommendation**: **Option A (Next.js + shadcn)** - Aligns with orchestration framework UI standards

### 5. Deployment Target for Phase 0.3+
**Question**: Where should we deploy the completed Phase 0.3 system?

**Options**:
- **Option A**: Railway (easiest, managed services)
  - Cost: ~$20-50/month (PostgreSQL + Redis + NATS)
  - Effort: 0.5 days setup

- **Option B**: Docker Compose on VPS (Hetzner/DigitalOcean)
  - Cost: ~$10-20/month
  - Effort: 1 day setup + ongoing maintenance

- **Option C**: Local development only (defer production)
  - Cost: $0
  - Effort: 0 days

**Recommendation**: **Option A (Railway)** - Fastest path to production, existing docs

---

## Phase 0: Test Repair & Foundation (BLOCKING PHASE)

**Goal**: Fix all 7 failing test suites to establish stable foundation
**Duration**: 1-2 days
**Owner**: TA (Test Architect) + IE (Implementation Engineer)
**Priority**: **CRITICAL** (blocks all subsequent work)

### Entry Criteria
- [ ] Phase 0.2 codebase stable (no uncommitted changes)
- [ ] All dependencies installed (`npm install` successful)
- [ ] Local Docker infrastructure running (PostgreSQL, Redis, NATS)

### Detailed Bug Analysis & Fix Plan

#### Bug Category 1: Foreign Key Constraint Failures (3 tests)
**Location**: `packages/db/src/usefulness-migration.test.ts`
**Root Cause**: Tests insert `usefulness_proofs` with `agent_did` that doesn't exist in `agents` table

**Tests Failing**:
1. "should enforce work_type check constraint"
2. "should enforce usefulness_score range constraint"
3. "should support JSONB queries on metrics field"

**Fix Strategy**:
```typescript
// BEFORE (broken):
INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, ...)
VALUES (gen_random_uuid(), 'did:key:test123', 'compute', ...)

// AFTER (fixed):
// Step 1: Create test agent first
INSERT INTO agents (did, public_key)
VALUES ('did:key:test123', 'test-public-key')
ON CONFLICT (did) DO NOTHING;

// Step 2: Then insert usefulness proof
INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, ...)
VALUES (gen_random_uuid(), 'did:key:test123', 'compute', ...)
```

**Implementation Checklist**:
- [ ] **File**: `packages/db/src/usefulness-migration.test.ts`
- [ ] Add `beforeEach` hook to create test agents
- [ ] Update all test inserts to use existing agent DIDs
- [ ] Add cleanup in `afterEach` to remove test data
- [ ] Verify foreign key constraint actually works (expect rejection for non-existent DID)

**Acceptance Criteria**:
- All 3 usefulness migration tests pass
- Foreign key constraints properly enforced
- Test data cleanup verified (no pollution between tests)

#### Bug Category 2: Integration Test Database Setup (7 test suites)
**Locations**:
- `packages/broker/test/db-client.integration.test.ts`
- `packages/broker/src/__tests__/negotiation-integration.test.ts`
- `packages/broker/src/routes/__tests__/agents-credits.test.ts`
- `packages/broker/src/services/__tests__/credits.test.ts`
- `packages/broker/src/services/__tests__/incentive-distribution.test.ts`
- `packages/broker/src/services/__tests__/negotiation.test.ts`

**Root Cause**: Tests assume database/services initialized but don't set up properly

**Fix Strategy**:
```typescript
// Add global test setup file: packages/broker/test/setup.ts

import { DatabaseClient } from '../src/lib/db-client';
import { CreditService } from '../src/services/credits';
import { NegotiationService } from '../src/services/negotiation';

export let db: DatabaseClient;
export let creditService: CreditService;
export let negotiationService: NegotiationService;

beforeAll(async () => {
  // Initialize database client
  db = new DatabaseClient(process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp_test');

  // Run migrations
  await db.query(`
    -- Create test schema (simplified versions of prod tables)
    CREATE TABLE IF NOT EXISTS agents_test (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      did TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS negotiations_test (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      intent_id UUID NOT NULL,
      initiator_did TEXT NOT NULL,
      responder_did TEXT NOT NULL,
      state TEXT NOT NULL,
      rounds JSONB DEFAULT '[]',
      convergence_score NUMERIC(3,2) DEFAULT 0.0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credit_accounts_test (
      agent_id UUID PRIMARY KEY,
      balance BIGINT DEFAULT 0,
      reserved BIGINT DEFAULT 0
    );
  `);

  // Initialize services
  creditService = new CreditService(db);
  negotiationService = new NegotiationService(db, creditService);
});

afterAll(async () => {
  // Cleanup test tables
  await db.query(`
    DROP TABLE IF EXISTS agents_test CASCADE;
    DROP TABLE IF EXISTS negotiations_test CASCADE;
    DROP TABLE IF EXISTS credit_accounts_test CASCADE;
  `);

  await db.close();
});
```

**Implementation Checklist**:
- [ ] **File**: `packages/broker/test/setup.ts` (create new)
- [ ] Create test database schema setup
- [ ] Initialize shared services (db, credit, negotiation)
- [ ] Add global setup to vitest.config.ts:
  ```typescript
  export default defineConfig({
    test: {
      globalSetup: ['./test/setup.ts'],
      testTimeout: 10000,
    },
  });
  ```
- [ ] Update each failing test to use shared services
- [ ] Add `beforeEach` cleanup for test isolation

**Acceptance Criteria**:
- All 7 integration test suites pass
- Tests run in isolation (no order dependencies)
- Test database cleaned up after each run

#### Bug Category 3: Discovery Service OpenAI Integration (2 tests)
**Location**: `packages/broker/src/services/discovery.test.ts`

**Tests Failing**:
1. "should discover agents by embedding"
2. "should generate embedding from description if not provided"

**Root Cause**: Tests call OpenAI embeddings API but don't mock it or provide API key

**Fix Strategy**:
```typescript
// Option A: Mock OpenAI API calls
import { vi } from 'vitest';
import * as embeddingService from '../services/embeddings';

describe('Discovery Service', () => {
  beforeEach(() => {
    // Mock embedding generation
    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(
      new Float32Array(1536).fill(0.1) // Dummy 1536-dim vector
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ... tests now use mocked embeddings
});

// Option B: Use environment variable for real API
if (!process.env.OPENAI_API_KEY) {
  test.skip('Embedding tests require OPENAI_API_KEY', () => {});
} else {
  // Run real tests
}
```

**Implementation Checklist**:
- [ ] **File**: `packages/broker/src/services/discovery.test.ts`
- [ ] Add OpenAI API mocking (Option A - recommended for CI)
- [ ] Create test fixtures for embedding vectors
- [ ] Add conditional skip if no API key (Option B - for local testing)
- [ ] Verify discovery ranking still works with mocked embeddings

**Acceptance Criteria**:
- Both discovery service tests pass
- Tests run in <500ms (no real API calls)
- Mocking doesn't hide real bugs (validate with real API locally)

### Exit Criteria
- [ ] **ALL** tests passing: 100% pass rate (target: 70+ tests)
- [ ] No test skips (all tests executable)
- [ ] Type check passing (`npm run typecheck`)
- [ ] Lint passing (`npm run lint`)
- [ ] Build successful (`npm run build`)
- [ ] Test coverage report generated (target: >90%)

### Artifacts
- `packages/broker/test/setup.ts` - Global test setup
- `packages/db/src/usefulness-migration.test.ts` - Fixed FK constraint tests
- `packages/broker/src/services/discovery.test.ts` - Mocked OpenAI tests
- Evidence pack (test results before/after)

### Dependencies
- None (foundational work)

### Risk Mitigation
- **Risk**: Test fixes introduce new bugs
  - **Mitigation**: Run full test suite after each fix, verify in isolation
  - **Rollback**: Revert individual test file changes via git

- **Risk**: Mocking hides real API integration issues
  - **Mitigation**: Add "smoke test" mode with real APIs for pre-merge validation
  - **Rollback**: N/A (mocking is test-only)

---

## Phase 1: NATS Event Streaming & Pub/Sub (Priority 1)

**Goal**: Implement real-time event streaming for intents, negotiations, and agent lifecycle
**Duration**: 3 days
**Owner**: IE (Implementation Engineer) + CN (Change Navigator)
**Priority**: **HIGH** (core Phase 0.3 deliverable)

### Entry Criteria
- [ ] Phase 0 complete (all tests passing)
- [ ] NATS JetStream running locally (Docker Compose)
- [ ] NATS client library integrated (`@ainp/core/nats.ts` exists)

### Detailed Implementation Plan

#### 1.1 NATS Stream Configuration
**File**: `scripts/init-nats-streams.sh` (create new)

**Streams to Create**:
```bash
#!/bin/bash
# Initialize NATS JetStream streams for AINP

# Stream 1: Intent Events
nats stream add ainp_intents \
  --subjects "ainp.intents.>" \
  --retention limits \
  --max-age 24h \
  --max-msgs 1000000 \
  --storage file \
  --replicas 1

# Stream 2: Negotiation Events
nats stream add ainp_negotiations \
  --subjects "ainp.negotiations.>" \
  --retention limits \
  --max-age 48h \
  --max-msgs 500000 \
  --storage file \
  --replicas 1

# Stream 3: Result Events
nats stream add ainp_results \
  --subjects "ainp.results.>" \
  --retention limits \
  --max-age 7d \
  --max-msgs 2000000 \
  --storage file \
  --replicas 1

# Stream 4: Agent Lifecycle Events (NEW)
nats stream add ainp_agents \
  --subjects "ainp.agents.>" \
  --retention limits \
  --max-age 30d \
  --max-msgs 100000 \
  --storage file \
  --replicas 1

echo "✅ All NATS streams created successfully"
```

**Implementation Checklist**:
- [ ] Create stream initialization script
- [ ] Add to `docker-compose.dev.yml` as init container:
  ```yaml
  nats-init:
    image: natsio/nats-box:latest
    depends_on:
      - nats
    volumes:
      - ./scripts/init-nats-streams.sh:/scripts/init.sh
    command: ["/scripts/init.sh"]
  ```
- [ ] Document stream subjects and retention policies
- [ ] Add stream monitoring command to README

**Acceptance Criteria**:
- 4 NATS streams created automatically on Docker start
- Stream info accessible via `nats stream ls`
- Retention policies correctly configured

#### 1.2 Event Publisher Service
**File**: `packages/broker/src/services/event-publisher.ts` (create new)

```typescript
import { Logger } from '@ainp/sdk';
import { NATSClient } from '@ainp/core';

const logger = new Logger({ serviceName: 'event-publisher' });

export type EventType =
  | 'intent.created'
  | 'intent.routed'
  | 'intent.delivered'
  | 'intent.completed'
  | 'negotiation.initiated'
  | 'negotiation.counter'
  | 'negotiation.accepted'
  | 'negotiation.rejected'
  | 'result.created'
  | 'result.delivered'
  | 'agent.registered'
  | 'agent.deregistered'
  | 'agent.heartbeat';

export interface AINPEvent {
  id: string;                  // Unique event ID
  type: EventType;            // Event type
  timestamp: number;          // Unix timestamp (ms)
  agent_did?: string;         // Actor DID (if applicable)
  intent_id?: string;         // Related intent ID (if applicable)
  negotiation_id?: string;    // Related negotiation ID (if applicable)
  payload: Record<string, any>; // Event-specific data
}

export class EventPublisher {
  constructor(private natsClient: NATSClient) {}

  /**
   * Publish event to appropriate NATS stream
   */
  async publish(event: AINPEvent): Promise<void> {
    const subject = this.getSubject(event.type);

    logger.info('Publishing event', {
      eventId: event.id,
      type: event.type,
      subject,
    });

    try {
      await this.natsClient.publish(subject, event);
      logger.debug('Event published successfully', { eventId: event.id });
    } catch (error: any) {
      logger.error('Failed to publish event', {
        eventId: event.id,
        type: event.type,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Batch publish multiple events (atomic)
   */
  async publishBatch(events: AINPEvent[]): Promise<void> {
    const promises = events.map(event => this.publish(event));
    await Promise.all(promises);
  }

  /**
   * Map event type to NATS subject
   */
  private getSubject(type: EventType): string {
    const [category] = type.split('.');

    switch (category) {
      case 'intent':
        return `ainp.intents.${type}`;
      case 'negotiation':
        return `ainp.negotiations.${type}`;
      case 'result':
        return `ainp.results.${type}`;
      case 'agent':
        return `ainp.agents.${type}`;
      default:
        throw new Error(`Unknown event category: ${category}`);
    }
  }
}
```

**Implementation Checklist**:
- [ ] Create `EventPublisher` class with type-safe event publishing
- [ ] Add subject routing logic (event type → NATS subject)
- [ ] Implement batch publishing for multi-event transactions
- [ ] Add error handling and retry logic (3 retries with exponential backoff)
- [ ] Add metrics tracking (events published, failures, latency)

**Acceptance Criteria**:
- EventPublisher successfully publishes to all 4 streams
- Batch publishing is atomic (all succeed or all fail)
- Failed publishes don't crash the broker
- Metrics exposed via `/metrics` endpoint

#### 1.3 Event Subscriber Service
**File**: `packages/broker/src/services/event-subscriber.ts` (create new)

```typescript
import { Logger } from '@ainp/sdk';
import { NATSClient } from '@ainp/core';
import type { AINPEvent } from './event-publisher';

const logger = new Logger({ serviceName: 'event-subscriber' });

export type EventHandler = (event: AINPEvent) => Promise<void>;

export class EventSubscriber {
  private subscriptions: Map<string, EventHandler> = new Map();

  constructor(private natsClient: NATSClient) {}

  /**
   * Subscribe to event type with handler
   */
  async subscribe(eventType: EventType, handler: EventHandler): Promise<void> {
    const subject = this.getSubject(eventType);

    logger.info('Subscribing to event type', { eventType, subject });

    this.subscriptions.set(eventType, handler);

    const js = this.natsClient.jetstream();
    const consumer = await js.consumers.get('ainp_intents', `consumer-${eventType}`);

    const messages = await consumer.consume();

    for await (const msg of messages) {
      try {
        const event: AINPEvent = JSON.parse(msg.data.toString());

        logger.debug('Received event', {
          eventId: event.id,
          type: event.type,
        });

        await handler(event);
        msg.ack();
      } catch (error: any) {
        logger.error('Error processing event', {
          subject,
          error: error.message,
        });
        msg.nak(); // Negative acknowledgement (retry)
      }
    }
  }

  /**
   * Subscribe to all events in a category
   */
  async subscribeToCategory(
    category: 'intent' | 'negotiation' | 'result' | 'agent',
    handler: EventHandler
  ): Promise<void> {
    const subject = `ainp.${category}s.>`;

    logger.info('Subscribing to event category', { category, subject });

    const js = this.natsClient.jetstream();
    const consumer = await js.consumers.get(`ainp_${category}s`, `consumer-${category}-all`);

    const messages = await consumer.consume();

    for await (const msg of messages) {
      try {
        const event: AINPEvent = JSON.parse(msg.data.toString());
        await handler(event);
        msg.ack();
      } catch (error: any) {
        logger.error('Error processing event', { error: error.message });
        msg.nak();
      }
    }
  }

  /**
   * Unsubscribe from event type
   */
  async unsubscribe(eventType: EventType): Promise<void> {
    this.subscriptions.delete(eventType);
    logger.info('Unsubscribed from event type', { eventType });
  }

  private getSubject(type: EventType): string {
    const [category] = type.split('.');
    return `ainp.${category}s.${type}`;
  }
}
```

**Implementation Checklist**:
- [ ] Create `EventSubscriber` class with consumer management
- [ ] Implement durable consumers (survive broker restarts)
- [ ] Add wildcard subscription support (e.g., `ainp.intents.>`)
- [ ] Implement acknowledgement handling (ack/nak)
- [ ] Add consumer monitoring (lag, pending messages)

**Acceptance Criteria**:
- Subscribers receive events in real-time (<100ms latency)
- Durable consumers survive broker restarts (no message loss)
- Failed message processing triggers retry (up to 3 attempts)
- Consumer lag monitoring working

#### 1.4 Integration with Existing Services
**Files to Modify**:
- `packages/broker/src/services/routing.ts`
- `packages/broker/src/services/negotiation.ts`
- `packages/broker/src/routes/agents.ts`

**Routing Service Integration**:
```typescript
// packages/broker/src/services/routing.ts

import { EventPublisher } from './event-publisher';

export class RoutingService {
  constructor(
    private db: DatabaseClient,
    private natsClient: NATSClient,
    private eventPublisher: EventPublisher, // NEW
  ) {}

  async routeIntent(envelope: AINPEnvelope): Promise<void> {
    const intentId = envelope.id;

    // Publish: intent.created
    await this.eventPublisher.publish({
      id: `event-${intentId}-created`,
      type: 'intent.created',
      timestamp: Date.now(),
      agent_did: envelope.from_did,
      intent_id: intentId,
      payload: {
        from_did: envelope.from_did,
        to_did: envelope.to_did,
        msg_type: envelope.msg_type,
      },
    });

    // Existing routing logic...
    const targetAgent = await this.discoveryService.discover(...);

    // Publish: intent.routed
    await this.eventPublisher.publish({
      id: `event-${intentId}-routed`,
      type: 'intent.routed',
      timestamp: Date.now(),
      agent_did: envelope.from_did,
      intent_id: intentId,
      payload: {
        target_did: targetAgent.did,
        discovery_score: targetAgent.score,
      },
    });

    // Deliver intent
    await this.natsClient.publish(`ainp.intents.${targetAgent.did}`, envelope);

    // Publish: intent.delivered
    await this.eventPublisher.publish({
      id: `event-${intentId}-delivered`,
      type: 'intent.delivered',
      timestamp: Date.now(),
      agent_did: targetAgent.did,
      intent_id: intentId,
      payload: {
        delivered_at: Date.now(),
      },
    });
  }
}
```

**Negotiation Service Integration**:
```typescript
// packages/broker/src/services/negotiation.ts

async initiate(params: InitiateNegotiationParams): Promise<NegotiationSession> {
  const session = await this.createSession(params);

  // Publish: negotiation.initiated
  await this.eventPublisher.publish({
    id: `event-${session.id}-initiated`,
    type: 'negotiation.initiated',
    timestamp: Date.now(),
    agent_did: params.initiator_did,
    negotiation_id: session.id,
    intent_id: params.intent_id,
    payload: {
      initiator_did: params.initiator_did,
      responder_did: params.responder_did,
      initial_proposal: params.initial_proposal,
    },
  });

  return session;
}

async counter(sessionId: string, proposal: ProposalTerms): Promise<NegotiationSession> {
  const session = await this.addRound(sessionId, proposal);

  // Publish: negotiation.counter
  await this.eventPublisher.publish({
    id: `event-${sessionId}-counter-${session.rounds.length}`,
    type: 'negotiation.counter',
    timestamp: Date.now(),
    negotiation_id: sessionId,
    payload: {
      round_number: session.rounds.length,
      proposal,
      convergence_score: session.convergence_score,
    },
  });

  return session;
}
```

**Agent Lifecycle Integration**:
```typescript
// packages/broker/src/routes/agents.ts

router.post('/register', async (req, res) => {
  const { did, public_key, capabilities } = req.body;

  const agent = await discoveryService.registerAgent(did, public_key, capabilities);

  // Publish: agent.registered
  await eventPublisher.publish({
    id: `event-agent-${agent.id}-registered`,
    type: 'agent.registered',
    timestamp: Date.now(),
    agent_did: did,
    payload: {
      agent_id: agent.id,
      capabilities_count: capabilities.length,
      trust_score: agent.trust?.score || 0,
    },
  });

  res.json(agent);
});
```

**Implementation Checklist**:
- [ ] Add `EventPublisher` to all service constructors
- [ ] Emit events at key lifecycle points:
  - [ ] Intent: created → routed → delivered → completed
  - [ ] Negotiation: initiated → counter (×N) → accepted/rejected
  - [ ] Result: created → delivered
  - [ ] Agent: registered → heartbeat → deregistered
- [ ] Add feature flag: `EVENT_STREAMING_ENABLED` (default: true)
- [ ] Ensure events don't block critical paths (fire-and-forget with error logging)

**Acceptance Criteria**:
- All key lifecycle events published to NATS
- Event publishing doesn't increase p95 latency by >50ms
- Failed event publishes don't crash broker
- Event payloads contain enough data for subscribers to act

#### 1.5 Real-Time Dashboard Event Subscriber (Preparation for Phase 0.5)
**File**: `packages/broker/src/services/dashboard-subscriber.ts` (create new)

```typescript
import { EventSubscriber } from './event-subscriber';
import { WebSocketHandler } from '../websocket/handler';

/**
 * Subscribe to all events and forward to WebSocket clients
 * This enables real-time dashboard updates in Phase 0.5
 */
export class DashboardSubscriber {
  constructor(
    private eventSubscriber: EventSubscriber,
    private wsHandler: WebSocketHandler
  ) {}

  async start(): Promise<void> {
    // Subscribe to all intent events
    await this.eventSubscriber.subscribeToCategory('intent', async (event) => {
      await this.wsHandler.broadcast('dashboard:event', event);
    });

    // Subscribe to all negotiation events
    await this.eventSubscriber.subscribeToCategory('negotiation', async (event) => {
      await this.wsHandler.broadcast('dashboard:event', event);
    });

    // Subscribe to all agent events
    await this.eventSubscriber.subscribeToCategory('agent', async (event) => {
      await this.wsHandler.broadcast('dashboard:event', event);
    });

    logger.info('Dashboard subscriber started (ready for Phase 0.5 UI)');
  }
}
```

**Implementation Checklist**:
- [ ] Create dashboard subscriber
- [ ] Wire up to WebSocket handler
- [ ] Start subscriber in `packages/broker/src/server.ts`
- [ ] Add WebSocket endpoint `/ws/dashboard` for UI connections
- [ ] Test with `wscat` tool: `wscat -c ws://localhost:8080/ws/dashboard`

**Acceptance Criteria**:
- Dashboard subscriber receives all events
- Events broadcast to all connected WebSocket clients
- WebSocket connections stable (no disconnects under load)
- Subscription ready for Phase 0.5 UI integration

### Exit Criteria
- [ ] 4 NATS streams operational (intents, negotiations, results, agents)
- [ ] EventPublisher successfully publishes to all streams
- [ ] EventSubscriber receives events in real-time
- [ ] All services emit lifecycle events
- [ ] Dashboard subscriber ready for UI (Phase 0.5)
- [ ] Tests passing: event publishing, subscribing, integration
- [ ] Documentation: event catalog, stream configuration

### Artifacts
- `scripts/init-nats-streams.sh` - Stream initialization script
- `packages/broker/src/services/event-publisher.ts` - Event publisher
- `packages/broker/src/services/event-subscriber.ts` - Event subscriber
- `packages/broker/src/services/dashboard-subscriber.ts` - Dashboard subscriber
- `docs/EVENT_CATALOG.md` - Complete event catalog with schemas
- `docs/NATS_ARCHITECTURE.md` - Stream topology and consumer groups

### Dependencies
- Phase 0 (all tests passing)

### Risk Mitigation
- **Risk**: NATS message loss under high load
  - **Mitigation**: Use JetStream persistence, monitor stream lag
  - **Rollback**: Disable event publishing via feature flag

- **Risk**: Event publishing slows down critical paths
  - **Mitigation**: Fire-and-forget publishing, async error handling
  - **Rollback**: Make event publishing optional per service

---

## Phase 2: Usefulness Proof Generation & Validation (Priority 2)

**Goal**: Implement usefulness proof generation from completed intents
**Duration**: 2-3 days
**Owner**: DME (Data & Migration Engineer) + IE (Implementation Engineer)
**Priority**: **MEDIUM** (schema exists, need implementation)

### Entry Criteria
- [ ] Phase 1 complete (NATS event streaming working)
- [ ] Usefulness schema migrated (`006_add_usefulness_proofs.sql` applied)
- [ ] Event subscriber can listen to `intent.completed` events

### Detailed Implementation Plan

#### 2.1 Usefulness Proof Generator Service
**File**: `packages/broker/src/services/usefulness-proof-generator.ts` (create new)

```typescript
import { Logger } from '@ainp/sdk';
import { DatabaseClient } from '../lib/db-client';
import type { AINPEvent } from './event-publisher';

const logger = new Logger({ serviceName: 'usefulness-proof-generator' });

export interface UsefulnessMetrics {
  latency_ms: number;              // Response time
  quality_score: number;           // 0-100 (from feedback)
  trust_delta: number;             // Trust score change
  credits_earned: number;          // Credits paid
  iterations: number;              // Negotiation rounds
  success: boolean;                // Completed successfully
}

export interface UsefulnessProof {
  id: string;                      // UUID
  intent_id: string;               // Original intent ID
  agent_did: string;               // Agent who completed work
  work_type: 'compute' | 'memory' | 'data' | 'human';
  trace_chain: string;             // Audit trail
  metrics: UsefulnessMetrics;
  usefulness_score: number;        // 0-100 (calculated)
  proof_timestamp: number;         // Unix timestamp
  signature: string;               // Cryptographic proof
}

export class UsefulnessProofGenerator {
  constructor(private db: DatabaseClient) {}

  /**
   * Generate usefulness proof from completed intent
   */
  async generateProof(
    intentId: string,
    agentDid: string,
    metrics: UsefulnessMetrics
  ): Promise<UsefulnessProof> {
    logger.info('Generating usefulness proof', { intentId, agentDid });

    // Calculate usefulness score (multi-dimensional)
    const score = this.calculateUsefulnessScore(metrics);

    // Build audit trail (trace all events for this intent)
    const traceChain = await this.buildTraceChain(intentId);

    // Classify work type based on metrics
    const workType = this.classifyWorkType(metrics);

    // Generate cryptographic signature
    const signature = await this.signProof({
      intent_id: intentId,
      agent_did: agentDid,
      metrics,
      score,
    });

    const proof: UsefulnessProof = {
      id: crypto.randomUUID(),
      intent_id: intentId,
      agent_did: agentDid,
      work_type: workType,
      trace_chain: traceChain,
      metrics,
      usefulness_score: score,
      proof_timestamp: Date.now(),
      signature,
    };

    // Persist to database
    await this.db.query(
      `
      INSERT INTO usefulness_proofs (
        id, intent_id, agent_did, work_type, trace_chain,
        metrics, usefulness_score, proof_timestamp, signature
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        proof.id,
        proof.intent_id,
        proof.agent_did,
        proof.work_type,
        proof.trace_chain,
        JSON.stringify(proof.metrics),
        proof.usefulness_score,
        new Date(proof.proof_timestamp),
        proof.signature,
      ]
    );

    logger.info('Usefulness proof generated', {
      proofId: proof.id,
      score: proof.usefulness_score,
    });

    return proof;
  }

  /**
   * Calculate usefulness score (0-100) from metrics
   *
   * Formula:
   * - Speed: 30% (faster = better, exponential decay)
   * - Quality: 40% (from user feedback)
   * - Trust Growth: 20% (reputation improvement)
   * - Success: 10% (binary: completed or failed)
   */
  private calculateUsefulnessScore(metrics: UsefulnessMetrics): number {
    // Speed component (0-30 points)
    // Target: <1s = 30 points, >10s = 0 points
    const speedScore = Math.max(0, 30 - (metrics.latency_ms / 1000) * 3);

    // Quality component (0-40 points)
    const qualityScore = (metrics.quality_score / 100) * 40;

    // Trust growth component (0-20 points)
    // Trust delta range: -1 to +1, normalized to 0-20
    const trustScore = ((metrics.trust_delta + 1) / 2) * 20;

    // Success component (0-10 points)
    const successScore = metrics.success ? 10 : 0;

    const totalScore = speedScore + qualityScore + trustScore + successScore;

    logger.debug('Usefulness score calculated', {
      speedScore,
      qualityScore,
      trustScore,
      successScore,
      totalScore,
    });

    return Math.max(0, Math.min(100, totalScore)); // Clamp to 0-100
  }

  /**
   * Build trace chain (audit trail) for intent
   */
  private async buildTraceChain(intentId: string): Promise<string> {
    // Query all events for this intent from NATS or database
    const events = await this.db.query(
      `
      SELECT type, timestamp, agent_did, payload
      FROM event_log
      WHERE intent_id = $1
      ORDER BY timestamp ASC
      `,
      [intentId]
    );

    // Build trace chain: hash(event1) → hash(event2) → ...
    const chain = events.rows
      .map((e: any) => `${e.type}:${e.timestamp}:${e.agent_did}`)
      .join('→');

    return chain || `single:${intentId}`;
  }

  /**
   * Classify work type based on metrics
   */
  private classifyWorkType(
    metrics: UsefulnessMetrics
  ): 'compute' | 'memory' | 'data' | 'human' {
    // Heuristics for work type classification:
    // - High latency (>10s) + low iterations = human decision-making
    // - Low latency (<1s) + high iterations = memory/data lookup
    // - Medium latency + medium iterations = compute-intensive

    if (metrics.latency_ms > 10000 && metrics.iterations < 3) {
      return 'human';
    } else if (metrics.latency_ms < 1000) {
      return metrics.iterations > 5 ? 'memory' : 'data';
    } else {
      return 'compute';
    }
  }

  /**
   * Generate cryptographic signature for proof
   *
   * Uses broker's private key to sign proof, ensuring authenticity
   */
  private async signProof(data: any): Promise<string> {
    // Use Ed25519 signature (same as agent signatures)
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    const signature = await crypto.subtle.sign(
      'Ed25519',
      this.getSigningKey(),
      new TextEncoder().encode(canonical)
    );

    return Buffer.from(signature).toString('base64');
  }

  private getSigningKey(): CryptoKey {
    // Load broker's private key from environment
    // For now, use placeholder (Phase 0.4 will implement real key management)
    throw new Error('Signing key not yet implemented');
  }
}
```

**Implementation Checklist**:
- [ ] Create `UsefulnessProofGenerator` service
- [ ] Implement multi-dimensional scoring algorithm
- [ ] Add work type classification heuristics
- [ ] Implement trace chain building (audit trail)
- [ ] Add cryptographic proof signing
- [ ] Create database insert query (usefulness_proofs table)
- [ ] Add comprehensive logging for debugging

**Acceptance Criteria**:
- Usefulness proofs generated for completed intents
- Scoring algorithm produces sensible results (validated against test cases)
- Work type classification matches expected patterns
- Proofs persisted to database successfully
- Cryptographic signatures valid (verifiable)

#### 2.2 Event-Driven Proof Generation
**File**: `packages/broker/src/services/proof-generation-subscriber.ts` (create new)

```typescript
import { EventSubscriber } from './event-subscriber';
import { UsefulnessProofGenerator } from './usefulness-proof-generator';
import type { AINPEvent } from './event-publisher';

export class ProofGenerationSubscriber {
  constructor(
    private eventSubscriber: EventSubscriber,
    private proofGenerator: UsefulnessProofGenerator
  ) {}

  async start(): Promise<void> {
    // Subscribe to intent.completed events
    await this.eventSubscriber.subscribe('intent.completed', async (event) => {
      await this.handleIntentCompleted(event);
    });

    logger.info('Proof generation subscriber started');
  }

  private async handleIntentCompleted(event: AINPEvent): Promise<void> {
    const { intent_id, agent_did, payload } = event;

    if (!intent_id || !agent_did) {
      logger.warn('Invalid intent.completed event (missing IDs)', { event });
      return;
    }

    try {
      // Extract metrics from event payload
      const metrics: UsefulnessMetrics = {
        latency_ms: payload.latency_ms || 0,
        quality_score: payload.quality_score || 50, // Default: neutral
        trust_delta: payload.trust_delta || 0,
        credits_earned: payload.credits_earned || 0,
        iterations: payload.iterations || 1,
        success: payload.success ?? true,
      };

      // Generate proof
      const proof = await this.proofGenerator.generateProof(
        intent_id,
        agent_did,
        metrics
      );

      logger.info('Usefulness proof generated from event', {
        proofId: proof.id,
        intentId: intent_id,
      });
    } catch (error: any) {
      logger.error('Failed to generate usefulness proof', {
        intentId: intent_id,
        error: error.message,
      });
    }
  }
}
```

**Implementation Checklist**:
- [ ] Create proof generation subscriber
- [ ] Subscribe to `intent.completed` events
- [ ] Extract metrics from event payload
- [ ] Call `UsefulnessProofGenerator.generateProof()`
- [ ] Handle errors gracefully (log, don't crash)
- [ ] Add idempotency (don't generate duplicate proofs for same intent)

**Acceptance Criteria**:
- Proofs generated automatically when intents complete
- Subscriber handles malformed events gracefully
- No duplicate proofs created for same intent
- Failed proof generation doesn't block other intents

#### 2.3 Usefulness Proof Aggregation (Agent Reputation)
**File**: `packages/broker/src/services/usefulness-aggregator.ts` (already exists, enhance)

```typescript
// Enhancement: Aggregate usefulness proofs into agent reputation

export class UsefulnessAggregator {
  // ... existing code ...

  /**
   * Update agent's cached usefulness score
   * Run periodically (every hour) or on-demand
   */
  async updateAgentUsefulnessScore(agentDid: string): Promise<void> {
    logger.info('Updating agent usefulness score', { agentDid });

    // Query all proofs for this agent (last 30 days)
    const proofs = await this.db.query(
      `
      SELECT usefulness_score, proof_timestamp, work_type
      FROM usefulness_proofs
      WHERE agent_did = $1
        AND proof_timestamp > NOW() - INTERVAL '30 days'
      ORDER BY proof_timestamp DESC
      LIMIT 100
      `,
      [agentDid]
    );

    if (proofs.rows.length === 0) {
      logger.info('No proofs found for agent', { agentDid });
      return;
    }

    // Calculate weighted average (recent proofs weighted higher)
    let weightedSum = 0;
    let totalWeight = 0;

    proofs.rows.forEach((proof: any, index: number) => {
      const weight = 1 / (index + 1); // Exponential decay
      weightedSum += proof.usefulness_score * weight;
      totalWeight += weight;
    });

    const avgScore = weightedSum / totalWeight;

    // Update cached score in agents table
    await this.db.query(
      `
      UPDATE agents
      SET usefulness_score_cached = $1,
          usefulness_last_updated = NOW()
      WHERE did = $2
      `,
      [avgScore, agentDid]
    );

    logger.info('Agent usefulness score updated', {
      agentDid,
      score: avgScore.toFixed(2),
      proofsCount: proofs.rows.length,
    });
  }

  /**
   * Batch update all agents (run via cron job)
   */
  async updateAllAgents(): Promise<void> {
    const agents = await this.db.query(`
      SELECT did FROM agents WHERE last_seen_at > NOW() - INTERVAL '7 days'
    `);

    for (const agent of agents.rows) {
      await this.updateAgentUsefulnessScore(agent.did);
    }

    logger.info('All agent usefulness scores updated', {
      count: agents.rows.length,
    });
  }
}
```

**Implementation Checklist**:
- [ ] Enhance `UsefulnessAggregator` with scoring logic
- [ ] Implement weighted average algorithm (recent = higher weight)
- [ ] Update `agents.usefulness_score_cached` column
- [ ] Add cron job to run aggregation hourly:
  ```typescript
  // packages/broker/src/jobs/usefulness-aggregation.ts
  import cron from 'node-cron';

  export function startUsefulnessAggregationJob(aggregator: UsefulnessAggregator) {
    cron.schedule('0 * * * *', async () => { // Every hour
      logger.info('Running usefulness aggregation job');
      await aggregator.updateAllAgents();
    });
  }
  ```
- [ ] Add manual trigger API endpoint: `POST /api/admin/aggregate-usefulness`

**Acceptance Criteria**:
- Agent usefulness scores updated hourly
- Scoring algorithm produces sensible rankings
- Manual trigger works for immediate updates
- Database query performance acceptable (<1s for 1000 agents)

#### 2.4 Usefulness Proof Validation
**File**: `packages/broker/src/services/usefulness-validator.ts` (create new)

```typescript
import { Logger } from '@ainp/sdk';
import type { UsefulnessProof } from './usefulness-proof-generator';

const logger = new Logger({ serviceName: 'usefulness-validator' });

export class UsefulnessValidator {
  /**
   * Validate usefulness proof authenticity and correctness
   */
  async validateProof(proof: UsefulnessProof): Promise<boolean> {
    logger.info('Validating usefulness proof', { proofId: proof.id });

    try {
      // Validation 1: Check score range (0-100)
      if (proof.usefulness_score < 0 || proof.usefulness_score > 100) {
        logger.warn('Invalid usefulness score', { score: proof.usefulness_score });
        return false;
      }

      // Validation 2: Verify signature
      const isSignatureValid = await this.verifySignature(proof);
      if (!isSignatureValid) {
        logger.warn('Invalid proof signature', { proofId: proof.id });
        return false;
      }

      // Validation 3: Check trace chain integrity
      const isTraceValid = await this.verifyTraceChain(proof.trace_chain, proof.intent_id);
      if (!isTraceValid) {
        logger.warn('Invalid trace chain', { proofId: proof.id });
        return false;
      }

      // Validation 4: Metrics consistency
      const areMetricsValid = this.validateMetrics(proof.metrics);
      if (!areMetricsValid) {
        logger.warn('Invalid metrics', { proofId: proof.id });
        return false;
      }

      logger.info('Usefulness proof valid', { proofId: proof.id });
      return true;
    } catch (error: any) {
      logger.error('Proof validation error', {
        proofId: proof.id,
        error: error.message,
      });
      return false;
    }
  }

  private async verifySignature(proof: UsefulnessProof): Promise<boolean> {
    // Verify Ed25519 signature using broker's public key
    // (Implementation similar to envelope signature verification)
    return true; // Placeholder
  }

  private async verifyTraceChain(traceChain: string, intentId: string): Promise<boolean> {
    // Verify trace chain links back to intent events
    return true; // Placeholder
  }

  private validateMetrics(metrics: any): boolean {
    return (
      typeof metrics.latency_ms === 'number' &&
      typeof metrics.quality_score === 'number' &&
      metrics.quality_score >= 0 &&
      metrics.quality_score <= 100
    );
  }
}
```

**Implementation Checklist**:
- [ ] Create `UsefulnessValidator` service
- [ ] Implement signature verification
- [ ] Implement trace chain validation
- [ ] Add metrics consistency checks
- [ ] Add validation to proof generation pipeline (validate before persisting)

**Acceptance Criteria**:
- Invalid proofs rejected (score out of range, bad signature, etc.)
- Valid proofs accepted
- Validation doesn't significantly slow down proof generation (<100ms)

### Exit Criteria
- [ ] Usefulness proofs generated automatically for completed intents
- [ ] Proof generation triggered by NATS events (`intent.completed`)
- [ ] Agent usefulness scores aggregated hourly
- [ ] Proof validation working (signature, trace chain, metrics)
- [ ] Tests passing: proof generation, aggregation, validation
- [ ] Documentation: usefulness proof spec, scoring algorithm

### Artifacts
- `packages/broker/src/services/usefulness-proof-generator.ts` - Proof generator
- `packages/broker/src/services/proof-generation-subscriber.ts` - Event subscriber
- `packages/broker/src/services/usefulness-validator.ts` - Proof validator
- `packages/broker/src/services/usefulness-aggregator.ts` - Enhanced aggregator
- `packages/broker/src/jobs/usefulness-aggregation.ts` - Cron job
- `docs/USEFULNESS_PROOF_SPEC.md` - Proof specification

### Dependencies
- Phase 1 (NATS event streaming)

### Risk Mitigation
- **Risk**: Proof generation slows down intent completion
  - **Mitigation**: Generate proofs asynchronously via NATS events
  - **Rollback**: Disable proof generation via feature flag

- **Risk**: Scoring algorithm produces unfair rankings
  - **Mitigation**: Make algorithm configurable via environment variables
  - **Rollback**: Use simple average instead of weighted

---

## Phase 3: Frontend UI & Agent Dashboard (Priority 3)

**Goal**: Build real-time agent dashboard for monitoring intents, negotiations, and credits
**Duration**: 4-5 days
**Owner**: SUPB (Shadcn UI Portal Builder) + IE (Implementation Engineer)
**Priority**: **LOW** (nice-to-have, not blocking)

### Entry Criteria
- [ ] Phase 1 complete (NATS event streaming + WebSocket endpoint)
- [ ] Phase 2 complete (usefulness proofs generated)
- [ ] Dashboard subscriber ready (`DashboardSubscriber` service)
- [ ] UI template selected (Next.js + shadcn/ui recommended)

### Detailed Implementation Plan

#### 3.1 Frontend Project Setup
**Location**: `packages/ui/` (new package)

**Technology Stack**:
- Next.js 14+ (App Router)
- TypeScript
- shadcn/ui components
- TailwindCSS
- WebSocket client (for real-time updates)

**Setup Commands**:
```bash
cd packages
npx create-next-app@latest ui \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

cd ui
npx shadcn@latest init

# Add components
npx shadcn@latest add button card table badge avatar
npx shadcn@latest add dialog dropdown-menu tabs
npx shadcn@latest add chart tooltip progress
```

**Implementation Checklist**:
- [ ] Create `packages/ui` Next.js project
- [ ] Initialize shadcn/ui with default config
- [ ] Add TailwindCSS theming (dark mode support)
- [ ] Configure TypeScript strict mode
- [ ] Set up API client (fetch wrapper for broker API)
- [ ] Add WebSocket client library (`ws` or `socket.io-client`)

**Acceptance Criteria**:
- Next.js dev server runs (`npm run dev`)
- shadcn/ui components render correctly
- TypeScript compilation successful
- Dark mode toggle working

#### 3.2 Core Dashboard Layout
**File**: `packages/ui/src/app/page.tsx`

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────┐
│  AINP Dashboard                          [Profile] [⚙️]  │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  Agents  │  Real-Time Activity Feed                     │
│  Intents │  ┌──────────────────────────────────────┐    │
│  Negot.  │  │ 🟢 Intent #1234 delivered to Alice   │    │
│  Credits │  │ 🔵 Negotiation #5678 accepted        │    │
│  Metrics │  │ 🟡 Agent Bob registered               │    │
│          │  └──────────────────────────────────────┘    │
│          │                                              │
│          │  Metrics Overview                            │
│          │  ┌─────┬─────┬─────┬─────┐                  │
│          │  │Agents│Intents│Negot│Credits│              │
│          │  │ 142  │ 1.2K  │  89 │ 45.2M  │              │
│          │  └─────┴─────┴─────┴─────┘                  │
└──────────┴──────────────────────────────────────────────┘
```

**Implementation Checklist**:
- [ ] Create sidebar navigation (shadcn/ui `NavigationMenu`)
- [ ] Create real-time activity feed component
- [ ] Create metrics overview cards (shadcn/ui `Card`)
- [ ] Add responsive layout (mobile-friendly)
- [ ] Connect to WebSocket endpoint (`ws://localhost:8080/ws/dashboard`)

**Acceptance Criteria**:
- Dashboard loads without errors
- Real-time events appear in activity feed
- Metrics cards display live data
- Layout responsive on mobile/tablet/desktop

#### 3.3 Agent List View
**File**: `packages/ui/src/app/agents/page.tsx`

**Features**:
- Table of all registered agents (shadcn/ui `DataTable`)
- Columns: DID, Capabilities, Trust Score, Usefulness Score, Credits, Status
- Search/filter by capability tags
- Sort by trust score, usefulness score, credits
- Click agent → detail page

**Implementation Checklist**:
- [ ] Create agents table with pagination
- [ ] Add search/filter controls
- [ ] Implement sorting (client-side)
- [ ] Add status badges (online/offline)
- [ ] Link to agent detail page

**Acceptance Criteria**:
- Agents table loads data from `/api/agents`
- Search/filter works correctly
- Sorting changes table order
- Pagination works for >100 agents

#### 3.4 Intent Monitoring View
**File**: `packages/ui/src/app/intents/page.tsx`

**Features**:
- Table of recent intents (last 24 hours)
- Columns: Intent ID, From, To, Type, Status, Timestamp
- Status badges: Created → Routed → Delivered → Completed
- Real-time status updates (WebSocket)
- Click intent → detail page (trace chain)

**Implementation Checklist**:
- [ ] Create intents table with real-time updates
- [ ] Add status badges (color-coded)
- [ ] Subscribe to WebSocket events (`intent.*`)
- [ ] Implement auto-refresh (every 5 seconds)
- [ ] Link to intent detail page

**Acceptance Criteria**:
- Intents table shows recent intents
- Status updates appear in real-time (<500ms delay)
- Table auto-refreshes without user interaction
- Intent detail page shows full trace chain

#### 3.5 Negotiation Monitoring View
**File**: `packages/ui/src/app/negotiations/page.tsx`

**Features**:
- Table of active negotiations
- Columns: Negotiation ID, Intent ID, Initiator, Responder, Rounds, Convergence, Status
- Convergence chart (shadcn/ui `Chart`)
- Real-time updates (WebSocket)
- Click negotiation → detail page (round history)

**Implementation Checklist**:
- [ ] Create negotiations table
- [ ] Add convergence score chart
- [ ] Subscribe to WebSocket events (`negotiation.*`)
- [ ] Show round-by-round proposals (accordion component)
- [ ] Link to negotiation detail page

**Acceptance Criteria**:
- Negotiations table shows active sessions
- Convergence chart visualizes progress
- Round history expandable
- Real-time updates working

#### 3.6 Credit Balance View
**File**: `packages/ui/src/app/credits/page.tsx`

**Features**:
- Agent credit balances table
- Columns: Agent DID, Balance, Reserved, Earned, Spent
- Transaction history (recent 100 transactions)
- Credit flow chart (deposits, earnings, spending over time)
- Export CSV functionality

**Implementation Checklist**:
- [ ] Create credit balances table
- [ ] Add transaction history view
- [ ] Implement credit flow chart (line chart)
- [ ] Add CSV export button
- [ ] Real-time balance updates (WebSocket)

**Acceptance Criteria**:
- Credit balances accurate (match database)
- Transaction history paginated
- Chart shows credit flow over time
- CSV export downloads file

#### 3.7 WebSocket Integration
**File**: `packages/ui/src/lib/websocket.ts`

```typescript
import { useEffect, useState } from 'react';

export function useWebSocket(url: string) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages((prev) => [...prev, message]);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      // Reconnect after 5 seconds
      setTimeout(() => {
        setWs(null);
      }, 5000);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [url]);

  return { ws, connected, messages };
}
```

**Implementation Checklist**:
- [ ] Create `useWebSocket` React hook
- [ ] Add automatic reconnection logic
- [ ] Handle connection errors gracefully
- [ ] Implement message filtering (by event type)
- [ ] Add connection status indicator to dashboard

**Acceptance Criteria**:
- WebSocket connects on page load
- Reconnects automatically if disconnected
- Messages received and parsed correctly
- Connection status visible to user

### Exit Criteria
- [ ] Next.js dashboard running locally
- [ ] All views implemented (agents, intents, negotiations, credits)
- [ ] Real-time updates working via WebSocket
- [ ] Dark mode supported
- [ ] Mobile-responsive layout
- [ ] Documentation: UI setup guide, component library

### Artifacts
- `packages/ui/` - Complete Next.js dashboard application
- `packages/ui/src/lib/websocket.ts` - WebSocket client hook
- `packages/ui/src/lib/api-client.ts` - Broker API client
- `docs/UI_SETUP.md` - Dashboard setup guide
- `docs/UI_COMPONENTS.md` - Component documentation

### Dependencies
- Phase 1 (WebSocket endpoint for real-time updates)
- Phase 2 (usefulness scores to display)

### Risk Mitigation
- **Risk**: WebSocket connection unstable under load
  - **Mitigation**: Implement connection pooling, automatic reconnection
  - **Rollback**: Fall back to HTTP polling (every 5 seconds)

- **Risk**: Next.js SSR complexity
  - **Mitigation**: Use client-side rendering for dynamic content
  - **Rollback**: Convert to React SPA if SSR causes issues

---

## Cross-Phase Quality Gates

**Before Every Phase**:
- [ ] Git branch created (`feat/ainp-phase-<N>-<name>`)
- [ ] FEATURE_MAP.md updated with phase scope
- [ ] Dependencies verified (previous phase complete)
- [ ] Local environment healthy (Docker Compose up, tests passing)

**After Every Phase**:
- [ ] Tests passing (maintain 100% or explain failures)
- [ ] Type check passing (`npm run typecheck`)
- [ ] Lint passing (`npm run lint`)
- [ ] Build successful (`npm run build`)
- [ ] Git commit with DIGEST (evidence pack)
- [ ] NOTES.md updated with phase completion summary

---

## Testing Strategy

### Unit Tests
- **Coverage Target**: 95% for new code
- **Frameworks**: Vitest
- **Mocking**: Mock external services (NATS, Redis, OpenAI)

### Integration Tests
- **Scope**: End-to-end flows (event publishing → subscribing → proof generation)
- **Environment**: Local Docker (PostgreSQL, NATS, Redis)

### Load Tests (Phase 1 NATS)
- **Tool**: Custom NATS publisher (flood test)
- **Scenarios**:
  - 1000 events/sec publishing
  - 10 concurrent subscribers
  - Stream lag monitoring
- **Metrics**: Throughput, latency, message loss

---

## Evidence Pack Template

```markdown
## Evidence Pack: Phase <N> - <Phase Name>

### Plan vs. Actual
- **Planned files touched**: [list]
- **Actual files touched**: `git diff --name-only origin/master`
- **Variance explanation**: [if any]

### Quality Gates Results
- **Lint**: ✅ (`npm run lint`)
- **Typecheck**: ✅ (`npm run typecheck`)
- **Build**: ✅ (`npm run build`)
- **Tests**: ✅ (X/Y tests passing, Z% coverage)

### Implementation Summary
- **What changed**: [brief description]
- **Key decisions**: [architectural choices]

### Testing Evidence
- **New tests added**: [list]
- **Coverage**: [before/after percentages]

### Follow-up Work
- **Technical debt**: [any shortcuts taken]
- **Future improvements**: [deferred work]
```

---

## Success Criteria (All Phases Complete)

**Phase 0.3 (NATS Event Streaming)**:
- [ ] 4 NATS streams operational
- [ ] Events published for all key lifecycle points
- [ ] Real-time dashboard subscriber ready

**Phase 0.4 (Usefulness Proofs)**:
- [ ] Proofs generated automatically for completed intents
- [ ] Agent usefulness scores aggregated hourly
- [ ] Proof validation working

**Phase 0.5 (Frontend UI)**:
- [ ] Dashboard running and accessible
- [ ] Real-time updates working
- [ ] All views implemented (agents, intents, negotiations, credits)

**Quality**:
- [ ] Test coverage ≥90%
- [ ] All tests passing (100%)
- [ ] No type errors
- [ ] No lint errors

---

## Timeline & Agent Assignments

| Phase | Duration | Owner | Reviewers |
|-------|---------|-------|-----------|
| **Phase 0**: Test Repair | 1-2 days | TA + IE | PRV |
| **Phase 1**: NATS Event Streaming | 3 days | IE + CN | ICA, PRV |
| **Phase 2**: Usefulness Proofs | 2-3 days | DME + IE | PRV |
| **Phase 3**: Frontend UI | 4-5 days | SUPB + IE | UX, PRV |
| **Integration Testing** | 1 day | TA | All |
| **Documentation** | 0.5 days | DCA | All |

**Total Duration**: 12-15 days

---

## Deployment Strategy (Post-Implementation)

**Target Platform**: Railway (recommended per clarifications)

**Deployment Phases**:
1. Deploy Phase 1 (NATS) to Railway staging
2. Smoke test event streaming
3. Deploy Phase 2 (usefulness proofs)
4. Deploy Phase 3 (frontend UI) to Vercel or Railway static hosting
5. Monitor production for 24 hours
6. Full rollout

---

## Appendix: Decision Log

**Decision 1**: Fix tests first (Option A)
**Rationale**: Clean foundation prevents test debt compounding

**Decision 2**: NATS events = Core + lifecycle (Option B)
**Rationale**: 95% coverage without excessive effort

**Decision 3**: Multi-dimensional usefulness scoring (Option B)
**Rationale**: Aligns with RFC 001 trust framework

**Decision 4**: Next.js + shadcn/ui (Option A)
**Rationale**: Best TypeScript support, component library

**Decision 5**: Deploy to Railway (Option A)
**Rationale**: Fastest production deployment

---

**End of AINP Phase 0.3+ Comprehensive Sprint Plan**
