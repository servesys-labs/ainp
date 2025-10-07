# AINP Phase 0.3 Implementation Plan

**Created**: 2025-10-07
**Status**: Planning
**Base Commit**: 80745d5 (Phase 0.2 deployment complete)

## Executive Summary

Phase 0.3 focuses on **production deployment** and **protocol completion**, building on the Phase 0.2 foundation (96.9% test coverage, semantic routing, local Docker deployment). This phase delivers:

1. **Production Deployment** - Railway cloud platform with zero-downtime migration
2. **Real Signature Verification** - Remove test mode bypass, full Ed25519 validation
3. **Multi-Round Negotiation** - Implement RFC 001 negotiation protocol
4. **Complete Intent Routing** - All 6 core intent types from RFC 001
5. **Trust Vector Updates** - Automated reputation tracking
6. **Credit System Persistence** - PostgreSQL-backed off-chain ledger

**Timeline**: 8-10 days across 5 phases
**Risk Level**: Medium (production migration, backward compatibility)

---

## Phase 0.2 Foundation (Completed ✅)

**Delivered**:
- ✅ Broker implementation with WebSocket + HTTP REST API
- ✅ PostgreSQL + pgvector semantic discovery
- ✅ NATS JetStream message bus
- ✅ Redis caching and rate limiting
- ✅ SQL injection prevention
- ✅ Agent registration and capability discovery
- ✅ 31/32 tests passing (2 test assertion bugs, not production issues)
- ✅ Git initialized with comprehensive .gitignore

**Known Issues**:
- ⚠️ Signature verification bypassed in test/dev mode (`NODE_ENV === 'test'`)
- ⚠️ Credit system in-memory only (no persistence)
- ⚠️ Negotiation protocol incomplete (no multi-round state machine)
- ⚠️ Only FREEFORM_NOTE intent type implemented
- ⚠️ Trust vector updates manual (no automation)

---

## Phase Breakdown

### Phase 1: Production Infrastructure Setup (2 days)
**Goal**: Deploy broker to Railway with production-ready configuration
**Owner**: Infra Agent (Infrastructure & DevOps Engineer)

#### Entry Criteria
- [ ] Phase 0.2 tests passing (31/32 minimum)
- [ ] Railway account configured
- [ ] Production environment variables defined

#### Detailed Checklist

**1.1 Railway Project Setup**
- [ ] Create Railway project `ainp-broker`
- [ ] Add services:
  - [ ] PostgreSQL 16 with pgvector extension
  - [ ] Redis 7.x
  - [ ] NATS JetStream 2.10+
  - [ ] Broker application (Node.js 18+)
- [ ] Configure private networking between services
- [ ] Set up Railway CLI for local deployments

**1.2 Environment Configuration**
- [ ] Generate production secrets (DATABASE_URL, REDIS_URL, NATS_URL, OPENAI_API_KEY)
- [ ] Configure Railway environment variables:
  ```bash
  NODE_ENV=production
  PORT=8080
  DATABASE_URL=<railway-postgres>
  REDIS_URL=<railway-redis>
  NATS_URL=<railway-nats>
  OPENAI_API_KEY=<secret>
  SIGNATURE_VERIFICATION_ENABLED=true  # NEW: Force signature checks
  CREDIT_LEDGER_ENABLED=true           # NEW: Enable persistence
  ```
- [ ] Set up DATABASE_URL with SSL mode: `?sslmode=require`
- [ ] Configure Redis TLS if Railway requires it

**1.3 Database Migration**
- [ ] Run Phase 0.2 schema migration on Railway PostgreSQL:
  ```bash
  railway run psql $DATABASE_URL < packages/db/schema.sql
  ```
- [ ] Verify pgvector extension installed:
  ```sql
  SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
  ```
- [ ] Run Phase 0.2 migrations:
  ```bash
  railway run psql $DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql
  railway run psql $DATABASE_URL < packages/db/migrations/002_add_trust_scores.sql
  ```
- [ ] Create read-only DB user for monitoring

**1.4 NATS JetStream Configuration**
- [ ] Create JetStream streams on Railway NATS:
  - `intents` (subject: `ainp.intents.>`, retention: 24h)
  - `negotiations` (subject: `ainp.negotiations.>`, retention: 48h)
  - `results` (subject: `ainp.results.>`, retention: 7d)
- [ ] Enable stream mirroring for disaster recovery (optional)
- [ ] Configure JetStream resource limits (memory: 512MB, storage: 5GB)

**1.5 Deployment Pipeline**
- [ ] Create `railway.json` deployment config:
  ```json
  {
    "build": {
      "builder": "NIXPACKS",
      "buildCommand": "npm install && npm run build"
    },
    "deploy": {
      "startCommand": "node packages/broker/dist/server.js",
      "healthcheckPath": "/health",
      "healthcheckTimeout": 30,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 3
    }
  }
  ```
- [ ] Set up GitHub Actions for CI/CD (optional):
  ```yaml
  name: Deploy to Railway
  on:
    push:
      branches: [main]
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - name: Deploy
          run: railway up --service broker
  ```

**1.6 Monitoring & Observability**
- [ ] Configure Railway metrics dashboard
- [ ] Set up log aggregation (Railway Logs)
- [ ] Create health check endpoint monitoring
- [ ] Configure alerts:
  - Database connection failures
  - High error rate (>5% of requests)
  - Memory usage >80%
  - Response time >1000ms (p95)

**1.7 Zero-Downtime Deployment Strategy**
- [ ] Deploy broker with feature flag `SIGNATURE_VERIFICATION_ENABLED=false` initially
- [ ] Smoke test: Register test agent, send intent, verify delivery
- [ ] Gradually enable signature verification (next phase)
- [ ] Keep Phase 0.2 local Docker as rollback option

#### Exit Criteria
- [ ] Broker deployed to Railway and health check passing
- [ ] PostgreSQL + pgvector accessible via DATABASE_URL
- [ ] NATS JetStream streams created
- [ ] Redis cache connected
- [ ] Smoke test: Agent registration → Intent delivery works end-to-end
- [ ] Rollback procedure documented

#### Artifacts
- `railway.json` - Railway deployment config
- `docs/RAILWAY_DEPLOYMENT.md` - Production deployment guide
- `docs/ROLLBACK_PROCEDURE.md` - Emergency rollback steps
- `.env.production.example` - Production environment template

#### Dependencies
- None (this is the foundation)

#### Risk Mitigation
- **Risk**: PostgreSQL migration fails on Railway
  - **Mitigation**: Test schema on Railway staging environment first
  - **Rollback**: Keep local Docker running, revert DNS to local
- **Risk**: pgvector extension not available on Railway
  - **Mitigation**: Verify Railway PostgreSQL version supports pgvector (need 16+)
  - **Rollback**: Switch to Neon or Supabase (both have pgvector)
- **Risk**: NATS JetStream resource limits exceeded
  - **Mitigation**: Start with conservative limits, monitor usage
  - **Rollback**: Increase memory/storage limits via Railway dashboard

---

### Phase 2: Real Signature Verification (1 day)
**Goal**: Remove test mode bypass, enforce Ed25519 signatures in production
**Owner**: SA (Security Auditor) + IE (Implementation Engineer)

#### Entry Criteria
- [ ] Phase 1 complete (Railway deployment working)
- [ ] Broker accepting unsigned requests in production (feature flag off)
- [ ] Test suite still passing (31/32)

#### Detailed Checklist

**2.1 Signature Service Enhancement**
- [ ] **File**: `packages/broker/src/services/signature.ts`
- [ ] Remove test/dev mode bypass:
  ```typescript
  // REMOVE THIS:
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return true;
  }

  // REPLACE WITH:
  if (process.env.SIGNATURE_VERIFICATION_ENABLED === 'false') {
    logger.warn('Signature verification DISABLED (feature flag)', {
      from_did: envelope.from_did,
      msg_type: envelope.msg_type,
    });
    return true; // Allow bypass via explicit feature flag
  }
  ```
- [ ] Add signature verification metrics:
  ```typescript
  private metrics = {
    verified: 0,
    failed: 0,
    bypassed: 0,
  };

  getMetrics() {
    return { ...this.metrics };
  }
  ```
- [ ] Log all verification failures to audit log (don't just reject silently)
- [ ] Add DID resolution caching (reduce repeated public key extractions)

**2.2 Test Suite Updates**
- [ ] **File**: `packages/broker/src/services/signature.test.ts` (create if not exists)
- [ ] Add tests for:
  - [ ] Valid Ed25519 signature verification
  - [ ] Invalid signature rejection
  - [ ] Expired TTL rejection
  - [ ] Malformed DID handling
  - [ ] Feature flag bypass behavior
- [ ] Update existing tests to use real signatures:
  ```typescript
  // BEFORE (invalid):
  const envelope = { ..., sig: 'fake-signature' };

  // AFTER (valid):
  import { signEnvelope } from '@ainp/sdk';
  const envelope = await signEnvelope(unsignedEnvelope, privateKey);
  ```
- [ ] Ensure 31/32 tests still pass (or fix the 2 failing assertions)

**2.3 SDK Signature Helpers**
- [ ] **File**: `packages/sdk/src/crypto.ts`
- [ ] Add convenience function for agents:
  ```typescript
  export async function createSignedEnvelope(
    envelope: Omit<AINPEnvelope, 'sig'>,
    privateKey: Uint8Array
  ): Promise<AINPEnvelope> {
    const canonical = canonicalize(envelope);
    const signature = await signMessage(canonical, privateKey);
    return {
      ...envelope,
      sig: Buffer.from(signature).toString('base64'),
    };
  }
  ```
- [ ] Add DID verification helper:
  ```typescript
  export function verifyDIDFormat(did: string): boolean {
    return /^did:(key|web):/.test(did);
  }
  ```

**2.4 Gradual Rollout**
- [ ] Deploy to Railway with `SIGNATURE_VERIFICATION_ENABLED=false`
- [ ] Monitor error rates for 1 hour
- [ ] Enable verification: `railway variables --set SIGNATURE_VERIFICATION_ENABLED=true`
- [ ] Monitor for signature failures (expect 0 if all clients upgraded)
- [ ] If failure rate >5%, rollback flag and investigate

**2.5 Audit Log Integration**
- [ ] **File**: `packages/broker/src/services/signature.ts`
- [ ] Log signature failures to `audit_log` table:
  ```typescript
  await dbClient.query(`
    INSERT INTO audit_log (event_type, agent_id, severity, metadata)
    VALUES ($1, $2, $3, $4)
  `, [
    'signature_verification_failed',
    envelope.from_did,
    'high',
    JSON.stringify({ msg_type: envelope.msg_type, error: error.message })
  ]);
  ```
- [ ] Create daily report of signature failures (cron job or Railway cron)

#### Exit Criteria
- [ ] Signature verification enabled in production (`SIGNATURE_VERIFICATION_ENABLED=true`)
- [ ] Zero signature failures in production (all agents using valid signatures)
- [ ] Test suite passing with real signatures (31/32 or 32/32)
- [ ] Audit log capturing signature failures
- [ ] Feature flag documented in `docs/FEATURE_FLAGS.md`

#### Artifacts
- `packages/broker/src/services/signature.test.ts` - New signature tests
- `docs/FEATURE_FLAGS.md` - Feature flag documentation
- `docs/SIGNATURE_VERIFICATION.md` - Security documentation

#### Dependencies
- Phase 1 (Railway deployment)

#### Risk Mitigation
- **Risk**: Valid agents get rejected due to signature bugs
  - **Mitigation**: Gradual rollout with feature flag, monitor error rates
  - **Rollback**: Set `SIGNATURE_VERIFICATION_ENABLED=false` immediately
- **Risk**: DID resolution fails for valid DIDs
  - **Mitigation**: Cache public keys, add retry logic
  - **Rollback**: Whitelist known agents in emergency mode
- **Risk**: Performance degradation from Ed25519 verification
  - **Mitigation**: Benchmark verification (should be <1ms per signature)
  - **Rollback**: Add signature verification worker pool if needed

---

### Phase 3: Credit System Persistence (2 days)
**Goal**: Implement PostgreSQL-backed credit ledger per RFC 001 Appendix D
**Owner**: DME (Data & Migration Engineer) + IE

#### Entry Criteria
- [ ] Phase 2 complete (signatures enforced)
- [ ] In-memory credit system working (`packages/sdk/src/credits.ts`)
- [ ] Database migration plan approved

#### Detailed Checklist

**3.1 Database Schema Extension**
- [ ] **File**: `packages/db/migrations/003_add_credit_ledger.sql`
- [ ] Create credit accounts table:
  ```sql
  CREATE TABLE credit_accounts (
    agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    reserved BIGINT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    earned BIGINT NOT NULL DEFAULT 0 CHECK (earned >= 0),
    spent BIGINT NOT NULL DEFAULT 0 CHECK (spent >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT available_balance CHECK (balance >= reserved)
  );

  COMMENT ON TABLE credit_accounts IS 'Off-chain credit ledger per RFC 001 Appendix D';
  COMMENT ON COLUMN credit_accounts.balance IS 'Total credits (atomic unit, 1 credit = 1000 units)';
  COMMENT ON COLUMN credit_accounts.reserved IS 'Credits reserved for active intents';
  ```
- [ ] Create credit transactions table:
  ```sql
  CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tx_type TEXT NOT NULL CHECK (tx_type IN ('deposit', 'earn', 'reserve', 'release', 'spend')),
    amount BIGINT NOT NULL,
    intent_id UUID,  -- Reference to intent (if applicable)
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_credit_tx_agent ON credit_transactions(agent_id, created_at DESC);
  CREATE INDEX idx_credit_tx_intent ON credit_transactions(intent_id) WHERE intent_id IS NOT NULL;
  ```
- [ ] Create trigger for balance updates:
  ```sql
  CREATE OR REPLACE FUNCTION update_credit_balance()
  RETURNS TRIGGER AS $$
  BEGIN
    UPDATE credit_accounts
    SET updated_at = NOW()
    WHERE agent_id = NEW.agent_id;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_credit_tx_update
  AFTER INSERT ON credit_transactions
  FOR EACH ROW EXECUTE FUNCTION update_credit_balance();
  ```
- [ ] Add rollback migration:
  ```sql
  -- packages/db/migrations/003_add_credit_ledger_rollback.sql
  DROP TRIGGER IF EXISTS trg_credit_tx_update ON credit_transactions;
  DROP FUNCTION IF EXISTS update_credit_balance();
  DROP TABLE IF EXISTS credit_transactions;
  DROP TABLE IF EXISTS credit_accounts;
  ```

**3.2 Credit Service Implementation**
- [ ] **File**: `packages/broker/src/services/credits.ts` (create new)
- [ ] Implement `CreditService` class:
  ```typescript
  export class CreditService {
    constructor(private db: DatabaseClient) {}

    async getAccount(agentId: string): Promise<CreditAccount> {
      // Query credit_accounts table
    }

    async reserve(agentId: string, amount: number, intentId: string): Promise<void> {
      // Atomic reserve operation with transaction
      await this.db.transaction(async (tx) => {
        // 1. Check available balance
        // 2. Update reserved
        // 3. Insert credit_transactions record
      });
    }

    async release(agentId: string, amount: number, spent: number, intentId: string): Promise<void> {
      // Atomic release operation
    }

    async deposit(agentId: string, amount: number, metadata?: object): Promise<void> {
      // Add credits (payment, reward, etc.)
    }

    async earn(agentId: string, amount: number, intentId: string): Promise<void> {
      // Record credits earned from processing intents
    }

    async getTransactionHistory(
      agentId: string,
      limit: number = 100
    ): Promise<CreditTransaction[]> {
      // Query credit_transactions with pagination
    }
  }
  ```
- [ ] Add SQL injection prevention (parameterized queries only)
- [ ] Add idempotency keys for transactions (prevent double-spend)

**3.3 Routing Integration**
- [ ] **File**: `packages/broker/src/services/routing.ts`
- [ ] Update `routeIntent()` to reserve credits before delivery:
  ```typescript
  async routeIntent(envelope: AINPEnvelope): Promise<void> {
    const intent = envelope.payload as Intent;

    // Reserve credits before routing
    await this.creditService.reserve(
      envelope.from_did,
      intent.max_credits,
      envelope.id
    );

    try {
      // Existing routing logic...
      await this.natsClient.publish(`ainp.intents.${targetDID}`, envelope);

      // Release reserved credits, mark as spent
      await this.creditService.release(
        envelope.from_did,
        intent.max_credits,
        intent.credits_bid, // Actual amount spent
        envelope.id
      );
    } catch (error) {
      // Release reserved credits, no spend
      await this.creditService.release(
        envelope.from_did,
        intent.max_credits,
        0, // Nothing spent
        envelope.id
      );
      throw error;
    }
  }
  ```
- [ ] Update result delivery to credit receiver:
  ```typescript
  async deliverResult(result: IntentResult): Promise<void> {
    // Existing delivery logic...

    // Credit the agent who processed the intent
    await this.creditService.earn(
      result.processor_did,
      result.credits_earned,
      result.intent_id
    );
  }
  ```

**3.4 Agent Registration with Credits**
- [ ] **File**: `packages/broker/src/routes/agents.ts`
- [ ] Update agent registration to create credit account:
  ```typescript
  router.post('/register', async (req, res) => {
    const { did, public_key, capabilities } = req.body;

    // Create agent
    const agent = await discoveryService.registerAgent(did, public_key, capabilities);

    // Create credit account with initial balance
    const initialBalance = parseInt(process.env.INITIAL_CREDITS || '1000000'); // 1000 credits
    await creditService.deposit(agent.id, initialBalance, { source: 'registration' });

    res.json({ agent, credits: { balance: initialBalance } });
  });
  ```
- [ ] Add credit balance to agent response:
  ```typescript
  router.get('/:did', async (req, res) => {
    const agent = await discoveryService.getAgent(req.params.did);
    const credits = await creditService.getAccount(agent.id);

    res.json({ ...agent, credits });
  });
  ```

**3.5 Testing**
- [ ] **File**: `packages/broker/src/services/credits.test.ts` (create new)
- [ ] Add unit tests:
  - [ ] Reserve credits (sufficient balance)
  - [ ] Reserve credits (insufficient balance → error)
  - [ ] Release credits (with spend)
  - [ ] Release credits (no spend)
  - [ ] Deposit credits
  - [ ] Earn credits
  - [ ] Transaction history pagination
  - [ ] Concurrent reserve operations (race condition test)
  - [ ] Idempotency (same intentId twice)
- [ ] Add integration test:
  - [ ] Register agent → send intent → verify credit deduction → verify receiver credit

**3.6 Migration Execution**
- [ ] Run migration on Railway PostgreSQL:
  ```bash
  railway run psql $DATABASE_URL < packages/db/migrations/003_add_credit_ledger.sql
  ```
- [ ] Verify tables created:
  ```sql
  \d credit_accounts
  \d credit_transactions
  ```
- [ ] Initialize credit accounts for existing agents (if any):
  ```sql
  INSERT INTO credit_accounts (agent_id, balance)
  SELECT id, 1000000 FROM agents
  ON CONFLICT (agent_id) DO NOTHING;
  ```

#### Exit Criteria
- [ ] Credit ledger tables created in production PostgreSQL
- [ ] `CreditService` implemented with full CRUD operations
- [ ] Routing service reserves/releases credits atomically
- [ ] Agent registration creates credit account
- [ ] Tests passing (credit operations, concurrency, idempotency)
- [ ] Migration rollback script tested
- [ ] Transaction history API endpoint working

#### Artifacts
- `packages/db/migrations/003_add_credit_ledger.sql` - Credit schema migration
- `packages/db/migrations/003_add_credit_ledger_rollback.sql` - Rollback script
- `packages/broker/src/services/credits.ts` - Credit service implementation
- `packages/broker/src/services/credits.test.ts` - Credit tests
- `docs/CREDIT_SYSTEM.md` - Credit system documentation

#### Dependencies
- Phase 2 (signature verification)

#### Risk Mitigation
- **Risk**: Race condition in credit reservation (double-spend)
  - **Mitigation**: Use PostgreSQL transactions with `SELECT ... FOR UPDATE`
  - **Rollback**: Add distributed lock (Redis) if needed
- **Risk**: Migration fails on production (existing data)
  - **Mitigation**: Test on staging environment first, add `IF NOT EXISTS` clauses
  - **Rollback**: Run rollback script immediately
- **Risk**: Credit balance overflow (BIGINT limit)
  - **Mitigation**: Use atomic units (1 credit = 1000 units), max 9 quintillion units
  - **Rollback**: No rollback needed (safe for years of operation)

---

### Phase 4: Multi-Round Negotiation Protocol (3 days)
**Goal**: Implement RFC 001 negotiation protocol with state machine
**Owner**: IE (Implementation Engineer) + TA (Test Architect)

#### Entry Criteria
- [ ] Phase 3 complete (credit system persisted)
- [ ] Negotiation types defined in `@ainp/core` (Phase 0.2)
- [ ] RFC 001 Section 4 reviewed (negotiation protocol)

#### Detailed Checklist

**4.1 Negotiation State Machine**
- [ ] **File**: `packages/broker/src/services/negotiation.ts` (create new)
- [ ] Define negotiation states:
  ```typescript
  enum NegotiationState {
    INITIATED = 'initiated',       // Proposal sent
    COUNTER = 'counter',           // Counter-proposal received
    CONVERGING = 'converging',     // Within convergence threshold
    ACCEPTED = 'accepted',         // Both parties agreed
    REJECTED = 'rejected',         // Explicitly rejected
    ABORTED = 'aborted',           // Max rounds exceeded
    EXPIRED = 'expired',           // TTL exceeded
  }

  interface NegotiationSession {
    id: string;                    // UUID
    intent_id: string;             // Original intent ID
    initiator_did: string;
    responder_did: string;
    state: NegotiationState;
    rounds: NegotiationRound[];
    convergence_score: number;     // 0-1
    created_at: number;            // Unix timestamp
    expires_at: number;            // Unix timestamp
  }

  interface NegotiationRound {
    round: number;
    from_did: string;
    proposal: Proposal;            // From @ainp/core
    timestamp: number;
  }
  ```
- [ ] Implement `NegotiationService` class:
  ```typescript
  export class NegotiationService {
    constructor(
      private db: DatabaseClient,
      private natsClient: NATSClient,
      private creditService: CreditService
    ) {}

    async initiate(
      intentId: string,
      initiatorDID: string,
      responderDID: string,
      initialProposal: Proposal
    ): Promise<NegotiationSession> {
      // Create session
      // Publish to NATS: ainp.negotiations.<responderDID>
    }

    async counter(
      sessionId: string,
      fromDID: string,
      counterProposal: Proposal
    ): Promise<NegotiationSession> {
      // Validate: fromDID is participant
      // Check convergence
      // Update state (CONVERGING | COUNTER)
      // Publish to NATS
    }

    async accept(sessionId: string, fromDID: string): Promise<NegotiationSession> {
      // Mark as ACCEPTED
      // Reserve credits for final agreement
      // Publish acceptance to NATS
    }

    async reject(sessionId: string, fromDID: string): Promise<NegotiationSession> {
      // Mark as REJECTED
      // Release any reserved credits
    }

    async checkConvergence(session: NegotiationSession): Promise<boolean> {
      // Use convergence logic from packages/sdk/src/negotiation.ts
      // Return true if convergence_score >= 0.9
    }

    async getSession(sessionId: string): Promise<NegotiationSession | null> {
      // Query negotiations table
    }
  }
  ```

**4.2 Database Schema Extension**
- [ ] **File**: `packages/db/migrations/004_add_negotiation_sessions.sql`
- [ ] Create negotiations table:
  ```sql
  CREATE TABLE negotiations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intent_id UUID NOT NULL,
    initiator_did TEXT NOT NULL REFERENCES agents(did),
    responder_did TEXT NOT NULL REFERENCES agents(did),
    state TEXT NOT NULL CHECK (state IN (
      'initiated', 'counter', 'converging', 'accepted', 'rejected', 'aborted', 'expired'
    )),
    rounds JSONB NOT NULL DEFAULT '[]',  -- Array of NegotiationRound
    convergence_score NUMERIC(3,2) DEFAULT 0.0 CHECK (convergence_score >= 0 AND convergence_score <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    final_proposal JSONB,  -- Final agreed proposal
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_negotiations_intent ON negotiations(intent_id);
  CREATE INDEX idx_negotiations_initiator ON negotiations(initiator_did);
  CREATE INDEX idx_negotiations_responder ON negotiations(responder_did);
  CREATE INDEX idx_negotiations_state ON negotiations(state);
  CREATE INDEX idx_negotiations_expires ON negotiations(expires_at) WHERE state NOT IN ('accepted', 'rejected', 'aborted');

  COMMENT ON TABLE negotiations IS 'Multi-round negotiation sessions per RFC 001 Section 4';
  ```
- [ ] Create trigger for expiration:
  ```sql
  CREATE OR REPLACE FUNCTION expire_negotiations()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.state NOT IN ('accepted', 'rejected', 'aborted')
       AND NEW.expires_at < NOW() THEN
      NEW.state = 'expired';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_negotiation_expire
  BEFORE UPDATE ON negotiations
  FOR EACH ROW EXECUTE FUNCTION expire_negotiations();
  ```

**4.3 NATS Integration**
- [ ] **File**: `packages/broker/src/websocket/negotiation-handler.ts` (create new)
- [ ] Subscribe to negotiation stream:
  ```typescript
  export class NegotiationHandler {
    constructor(
      private natsClient: NATSClient,
      private negotiationService: NegotiationService,
      private wsHandler: WebSocketHandler
    ) {}

    async start() {
      const js = this.natsClient.jetstream();
      const consumer = await js.consumers.get('negotiations', 'negotiation-processor');

      const messages = await consumer.consume();
      for await (const msg of messages) {
        const envelope = JSON.parse(msg.data.toString()) as AINPEnvelope;
        await this.processNegotiationMessage(envelope);
        msg.ack();
      }
    }

    private async processNegotiationMessage(envelope: AINPEnvelope) {
      const payload = envelope.payload as NegotiationMessage;

      switch (payload.phase) {
        case 'PROPOSE':
          await this.handleProposal(envelope);
          break;
        case 'COUNTER':
          await this.handleCounter(envelope);
          break;
        case 'ACCEPT':
          await this.handleAccept(envelope);
          break;
        case 'REJECT':
          await this.handleReject(envelope);
          break;
      }
    }

    private async handleProposal(envelope: AINPEnvelope) {
      // Extract proposal from envelope
      // Create or update negotiation session
      // Forward to responder via WebSocket
    }

    // ... other handlers
  }
  ```

**4.4 Intent Routing Enhancement**
- [ ] **File**: `packages/broker/src/services/routing.ts`
- [ ] Add negotiation initiation to `routeIntent()`:
  ```typescript
  async routeIntent(envelope: AINPEnvelope): Promise<void> {
    const intent = envelope.payload as Intent;

    // Existing discovery logic...
    const targetAgent = await this.discoveryService.discover({
      embedding: intent.embedding,
      minTrustScore: 0.5,
      limit: 1,
    });

    // NEW: Initiate negotiation if required
    if (intent.requires_negotiation) {
      const session = await this.negotiationService.initiate(
        envelope.id,
        envelope.from_did,
        targetAgent.did,
        intent.initial_proposal
      );

      // Don't deliver intent yet, wait for negotiation to complete
      return;
    }

    // Existing delivery logic...
  }
  ```
- [ ] Add negotiation completion handler:
  ```typescript
  async onNegotiationAccepted(session: NegotiationSession): Promise<void> {
    // Deliver intent with final agreed proposal
    const intent = await this.getIntent(session.intent_id);
    const finalEnvelope = {
      ...intent.envelope,
      payload: {
        ...intent.envelope.payload,
        agreed_proposal: session.final_proposal,
      },
    };

    await this.natsClient.publish(
      `ainp.intents.${session.responder_did}`,
      finalEnvelope
    );
  }
  ```

**4.5 REST API Endpoints**
- [ ] **File**: `packages/broker/src/routes/negotiations.ts` (create new)
- [ ] Create negotiation routes:
  ```typescript
  export function createNegotiationRoutes(
    negotiationService: NegotiationService,
    signatureService: SignatureService
  ): Router {
    const router = Router();

    // Get negotiation session
    router.get('/:sessionId', async (req, res) => {
      const session = await negotiationService.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(session);
    });

    // Counter proposal
    router.post('/:sessionId/counter', async (req, res) => {
      const { proposal, signature } = req.body;

      // Verify signature
      const isValid = await signatureService.verifyEnvelope(req.body.envelope);
      if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

      const session = await negotiationService.counter(
        req.params.sessionId,
        req.body.envelope.from_did,
        proposal
      );

      res.json(session);
    });

    // Accept proposal
    router.post('/:sessionId/accept', async (req, res) => {
      // Similar to counter, but call negotiationService.accept()
    });

    // Reject proposal
    router.post('/:sessionId/reject', async (req, res) => {
      // Similar to accept, but call negotiationService.reject()
    });

    return router;
  }
  ```

**4.6 Testing**
- [ ] **File**: `packages/broker/src/services/negotiation.test.ts` (create new)
- [ ] Add unit tests:
  - [ ] Initiate negotiation
  - [ ] Counter-proposal (convergence increasing)
  - [ ] Counter-proposal (convergence decreasing)
  - [ ] Accept on convergence >= 0.9
  - [ ] Reject proposal
  - [ ] Abort after max rounds (10 rounds)
  - [ ] Expire after TTL
  - [ ] Concurrent counter-proposals (race condition)
- [ ] Add integration test:
  - [ ] Full negotiation flow: PROPOSE → COUNTER (3 rounds) → ACCEPT → Intent delivery

#### Exit Criteria
- [ ] `NegotiationService` implemented with state machine
- [ ] Database schema supports negotiation sessions
- [ ] NATS negotiation stream processing working
- [ ] REST API endpoints for negotiation operations
- [ ] Convergence detection working (threshold 0.9)
- [ ] Max rounds enforced (10 rounds → ABORT)
- [ ] TTL expiration working
- [ ] Tests passing (unit + integration)
- [ ] Intent delivery only after negotiation acceptance

#### Artifacts
- `packages/db/migrations/004_add_negotiation_sessions.sql` - Negotiation schema
- `packages/broker/src/services/negotiation.ts` - Negotiation service
- `packages/broker/src/websocket/negotiation-handler.ts` - NATS handler
- `packages/broker/src/routes/negotiations.ts` - REST API
- `packages/broker/src/services/negotiation.test.ts` - Tests
- `docs/NEGOTIATION_PROTOCOL.md` - Protocol documentation

#### Dependencies
- Phase 3 (credit system for reservation during negotiation)

#### Risk Mitigation
- **Risk**: Negotiation state desync (database vs NATS)
  - **Mitigation**: Use database as source of truth, NATS for event delivery only
  - **Rollback**: Add state reconciliation job (cron every 5 minutes)
- **Risk**: Infinite negotiation loops (agents keep countering)
  - **Mitigation**: Enforce max rounds (10), TTL (5 minutes default)
  - **Rollback**: Add circuit breaker per agent pair
- **Risk**: Credit reservation leak (negotiation aborted, credits not released)
  - **Mitigation**: Release credits in ABORT/REJECT/EXPIRE handlers
  - **Rollback**: Add cleanup job to find orphaned reservations

---

### Phase 5: Intent Types & Trust Vector Automation (2 days)
**Goal**: Implement all 6 RFC 001 intent types + automate trust vector updates
**Owner**: IE (Implementation Engineer) + TA (Test Architect)

#### Entry Criteria
- [ ] Phase 4 complete (negotiation protocol working)
- [ ] RFC 001 Section 3.2 reviewed (intent types)
- [ ] Trust score calculation logic exists (`packages/broker/src/services/trust.ts`)

#### Detailed Checklist

**5.1 Intent Type Implementations**
- [ ] **File**: `packages/broker/src/services/intents/` (create directory)
- [ ] Create intent handlers for each type:

**5.1.1 REQUEST_MEETING**
- [ ] **File**: `packages/broker/src/services/intents/meeting.ts`
- [ ] Implement handler:
  ```typescript
  export async function handleRequestMeeting(
    intent: RequestMeetingIntent,
    envelope: AINPEnvelope,
    services: BrokerServices
  ): Promise<void> {
    // 1. Validate intent schema
    validateMeetingIntent(intent);

    // 2. Discover agents with "calendar" capability
    const agents = await services.discoveryService.discover({
      tags: ['calendar', 'scheduling'],
      minTrustScore: 0.6,
      limit: 5,
    });

    // 3. Initiate negotiation with top agent
    if (intent.requires_negotiation) {
      await services.negotiationService.initiate(
        envelope.id,
        envelope.from_did,
        agents[0].did,
        intent.initial_proposal
      );
    } else {
      // Direct delivery
      await services.routingService.routeIntent(envelope);
    }
  }

  function validateMeetingIntent(intent: RequestMeetingIntent) {
    if (!intent.time_range) throw new ValidationError('time_range required');
    if (!intent.participants || intent.participants.length === 0) {
      throw new ValidationError('participants required');
    }
  }
  ```

**5.1.2 APPROVAL_REQUEST**
- [ ] **File**: `packages/broker/src/services/intents/approval.ts`
- [ ] Implement handler with approval workflow:
  ```typescript
  export async function handleApprovalRequest(
    intent: ApprovalRequestIntent,
    envelope: AINPEnvelope,
    services: BrokerServices
  ): Promise<void> {
    // 1. Validate approval request
    validateApprovalIntent(intent);

    // 2. Route to specified approvers
    for (const approverDID of intent.approvers) {
      const approvalEnvelope = {
        ...envelope,
        to_did: approverDID,
        payload: {
          ...intent,
          approval_status: 'pending',
          approval_deadline: Date.now() + intent.timeout_ms,
        },
      };

      await services.routingService.routeIntent(approvalEnvelope);
    }

    // 3. Create approval session (multi-party)
    await services.db.query(`
      INSERT INTO approval_sessions (
        intent_id, approvers, required_count, created_at, expires_at
      ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '${intent.timeout_ms} milliseconds')
    `, [envelope.id, intent.approvers, intent.required_approvals || 1]);
  }
  ```

**5.1.3 SUBMIT_INFO**
- [ ] **File**: `packages/broker/src/services/intents/submit-info.ts`
- [ ] Implement data submission handler:
  ```typescript
  export async function handleSubmitInfo(
    intent: SubmitInfoIntent,
    envelope: AINPEnvelope,
    services: BrokerServices
  ): Promise<void> {
    // 1. Validate info schema
    validateSubmitInfoIntent(intent);

    // 2. Store data with expiration
    await services.redis.setex(
      `submit-info:${envelope.id}`,
      intent.retention_seconds || 3600,
      JSON.stringify(intent.data)
    );

    // 3. Route to recipient
    await services.routingService.routeIntent(envelope);
  }
  ```

**5.1.4 INVOICE**
- [ ] **File**: `packages/broker/src/services/intents/invoice.ts`
- [ ] Implement invoice handler with credit deduction:
  ```typescript
  export async function handleInvoice(
    intent: InvoiceIntent,
    envelope: AINPEnvelope,
    services: BrokerServices
  ): Promise<void> {
    // 1. Validate invoice
    validateInvoiceIntent(intent);

    // 2. Reserve credits for payment
    await services.creditService.reserve(
      envelope.from_did,
      intent.amount_credits,
      envelope.id
    );

    // 3. Route invoice to recipient
    await services.routingService.routeIntent(envelope);

    // 4. On acceptance, transfer credits
    // (handled by invoice acceptance webhook)
  }
  ```

**5.1.5 REQUEST_SERVICE**
- [ ] **File**: `packages/broker/src/services/intents/service.ts`
- [ ] Implement service request handler:
  ```typescript
  export async function handleRequestService(
    intent: RequestServiceIntent,
    envelope: AINPEnvelope,
    services: BrokerServices
  ): Promise<void> {
    // 1. Semantic discovery based on service description
    const agents = await services.discoveryService.discover({
      description: intent.service_description,
      embedding: intent.embedding,
      minTrustScore: 0.5,
      tags: intent.required_tags,
      limit: 10,
    });

    // 2. Filter by constraints
    const eligible = agents.filter(agent => {
      // Check constraints (latency, price, etc.)
      return meetsConstraints(agent, intent.constraints);
    });

    // 3. Initiate negotiation or direct delivery
    if (intent.requires_negotiation) {
      await services.negotiationService.initiate(
        envelope.id,
        envelope.from_did,
        eligible[0].did,
        intent.initial_proposal
      );
    } else {
      await services.routingService.routeIntent(envelope);
    }
  }
  ```

**5.1.6 FREEFORM_NOTE** (already implemented in Phase 0.2)
- [ ] **File**: `packages/broker/src/services/intents/freeform.ts`
- [ ] Refactor existing freeform handler to match new pattern
- [ ] Add validation and semantic routing

**5.2 Intent Type Router**
- [ ] **File**: `packages/broker/src/services/intent-router.ts` (create new)
- [ ] Create intent type dispatcher:
  ```typescript
  export class IntentRouter {
    constructor(private services: BrokerServices) {}

    async route(envelope: AINPEnvelope): Promise<void> {
      const intent = envelope.payload as Intent;

      switch (intent.type) {
        case 'REQUEST_MEETING':
          await handleRequestMeeting(intent as RequestMeetingIntent, envelope, this.services);
          break;
        case 'APPROVAL_REQUEST':
          await handleApprovalRequest(intent as ApprovalRequestIntent, envelope, this.services);
          break;
        case 'SUBMIT_INFO':
          await handleSubmitInfo(intent as SubmitInfoIntent, envelope, this.services);
          break;
        case 'INVOICE':
          await handleInvoice(intent as InvoiceIntent, envelope, this.services);
          break;
        case 'REQUEST_SERVICE':
          await handleRequestService(intent as RequestServiceIntent, envelope, this.services);
          break;
        case 'FREEFORM_NOTE':
          await handleFreeformNote(intent as FreeformNoteIntent, envelope, this.services);
          break;
        default:
          throw new ValidationError(`Unknown intent type: ${intent.type}`);
      }
    }
  }
  ```
- [ ] Update `packages/broker/src/routes/intents.ts` to use `IntentRouter`

**5.3 Trust Vector Automation**
- [ ] **File**: `packages/broker/src/services/trust-updater.ts` (create new)
- [ ] Implement automated trust updates:
  ```typescript
  export class TrustUpdater {
    constructor(private trustService: TrustService, private db: DatabaseClient) {}

    /**
     * Update trust scores after intent completion
     */
    async onIntentCompleted(result: IntentResult): Promise<void> {
      const { processor_did, success, latency_ms, quality_score } = result;

      // Calculate dimension updates
      const updates = {
        reliability: success ? 0.1 : -0.2,      // +10% on success, -20% on failure
        timeliness: this.calculateTimelinessUpdate(latency_ms),
        competence: quality_score || 0,          // From result feedback
      };

      await this.trustService.updateTrustScore(processor_did, updates);
    }

    /**
     * Update trust scores after negotiation
     */
    async onNegotiationCompleted(session: NegotiationSession): Promise<void> {
      const { initiator_did, responder_did, state, convergence_score } = session;

      if (state === 'accepted') {
        // Both parties get small honesty boost for successful negotiation
        await this.trustService.updateTrustScore(initiator_did, { honesty: 0.05 });
        await this.trustService.updateTrustScore(responder_did, { honesty: 0.05 });
      } else if (state === 'rejected') {
        // Penalize if rejection was after many rounds (bad faith)
        if (session.rounds.length > 5) {
          await this.trustService.updateTrustScore(responder_did, { honesty: -0.1 });
        }
      }
    }

    /**
     * Decay trust scores (run every 24h)
     */
    async applyDecay(): Promise<void> {
      await this.trustService.applyDecayToAll();
    }

    private calculateTimelinessUpdate(latencyMs: number): number {
      // Exponential decay: <1s = +0.1, >10s = -0.1
      const targetLatency = 1000; // 1 second
      return Math.max(-0.1, Math.min(0.1, (targetLatency - latencyMs) / targetLatency * 0.1));
    }
  }
  ```
- [ ] Integrate trust updates into delivery flow:
  ```typescript
  // packages/broker/src/websocket/delivery.ts
  async onResultDelivered(result: IntentResult): Promise<void> {
    // Existing delivery logic...

    // NEW: Update trust scores
    await this.trustUpdater.onIntentCompleted(result);
  }
  ```

**5.4 Cron Jobs for Trust Decay**
- [ ] **File**: `packages/broker/src/jobs/trust-decay.ts` (create new)
- [ ] Create daily decay job:
  ```typescript
  import cron from 'node-cron';

  export function startTrustDecayJob(trustUpdater: TrustUpdater) {
    // Run every day at 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
      logger.info('Running trust score decay job');
      await trustUpdater.applyDecay();
      logger.info('Trust score decay complete');
    });
  }
  ```
- [ ] Add to `packages/broker/src/server.ts`:
  ```typescript
  import { startTrustDecayJob } from './jobs/trust-decay';

  async function main() {
    // ... existing setup ...

    const trustUpdater = new TrustUpdater(trustService, dbClient);
    startTrustDecayJob(trustUpdater);

    // ... rest of server setup ...
  }
  ```

**5.5 Testing**
- [ ] **File**: `packages/broker/src/services/intents/*.test.ts` (one per intent type)
- [ ] Add unit tests for each intent type:
  - [ ] REQUEST_MEETING: Valid request, invalid time_range, missing participants
  - [ ] APPROVAL_REQUEST: Single approver, multi-approver, timeout
  - [ ] SUBMIT_INFO: Valid data, schema validation, expiration
  - [ ] INVOICE: Valid invoice, insufficient credits, acceptance flow
  - [ ] REQUEST_SERVICE: Semantic discovery, constraint filtering, negotiation
  - [ ] FREEFORM_NOTE: Basic delivery, embedding generation
- [ ] Add trust update tests:
  - [ ] Intent success → reliability +0.1
  - [ ] Intent failure → reliability -0.2
  - [ ] Fast completion → timeliness +0.1
  - [ ] Slow completion → timeliness -0.1
  - [ ] Negotiation acceptance → honesty +0.05
  - [ ] Bad faith rejection → honesty -0.1
  - [ ] Daily decay application

**5.6 Documentation**
- [ ] **File**: `docs/INTENT_TYPES.md`
- [ ] Document all 6 intent types with:
  - Schema examples
  - Validation rules
  - Discovery criteria
  - Negotiation requirements
  - Credit implications
- [ ] **File**: `docs/TRUST_VECTORS.md`
- [ ] Document trust update logic:
  - Dimension definitions
  - Update triggers
  - Decay algorithm
  - Score calculation

#### Exit Criteria
- [ ] All 6 RFC 001 intent types implemented
- [ ] Intent type router dispatching correctly
- [ ] Trust vectors updating automatically after intent completion
- [ ] Trust vectors updating after negotiation completion
- [ ] Daily trust decay job running
- [ ] Tests passing for all intent types (6 test suites)
- [ ] Trust update tests passing
- [ ] Documentation complete

#### Artifacts
- `packages/broker/src/services/intents/*.ts` - Intent type handlers (6 files)
- `packages/broker/src/services/intent-router.ts` - Intent dispatcher
- `packages/broker/src/services/trust-updater.ts` - Trust automation
- `packages/broker/src/jobs/trust-decay.ts` - Decay cron job
- `packages/broker/src/services/intents/*.test.ts` - Intent tests (6 files)
- `docs/INTENT_TYPES.md` - Intent type documentation
- `docs/TRUST_VECTORS.md` - Trust system documentation

#### Dependencies
- Phase 4 (negotiation protocol for REQUEST_SERVICE, REQUEST_MEETING)

#### Risk Mitigation
- **Risk**: Intent type handler bugs affect all intents
  - **Mitigation**: Isolate handlers in separate files, extensive testing
  - **Rollback**: Disable intent type via feature flag, fallback to FREEFORM_NOTE
- **Risk**: Trust score updates too aggressive (oscillation)
  - **Mitigation**: Conservative update magnitudes (±0.1 max), decay smoothing
  - **Rollback**: Adjust update weights via environment variables
- **Risk**: Cron job fails, no decay applied
  - **Mitigation**: Add health check for last decay timestamp
  - **Rollback**: Manual decay trigger API endpoint

---

## Cross-Phase Quality Gates

**Before Every Phase**:
- [ ] Git branch created (`feat/phase-0.3-<phase-name>`)
- [ ] FEATURE_MAP.md updated with phase scope
- [ ] Dependencies verified (previous phase complete)

**After Every Phase**:
- [ ] Tests passing (maintain 31/32 minimum, target 100%)
- [ ] Type check passing (`npm run typecheck`)
- [ ] Lint passing (`npm run lint`)
- [ ] Build successful (`npm run build`)
- [ ] Railway deployment successful (health check passing)
- [ ] Smoke test executed (register agent → send intent → verify delivery)
- [ ] Git commit with evidence pack (see template below)
- [ ] NOTES.md updated with phase completion digest

---

## Testing Strategy

### Unit Tests
- **Coverage Target**: 95% for new code
- **Frameworks**: Vitest + Supertest (HTTP)
- **Mocking**: Mock external services (NATS, Redis, OpenAI)
- **Isolation**: One test file per service/handler

### Integration Tests
- **Scope**: End-to-end flows (agent registration → intent delivery → result)
- **Environment**: Local Docker (Phase 0.2 infrastructure)
- **Data**: Use test fixtures (`test/fixtures/*.json`)

### Load Tests
- **Tool**: Autocannon (HTTP load testing)
- **Scenarios**:
  - 100 agents/sec registration
  - 1000 intents/sec delivery
  - 10 concurrent negotiations
- **Metrics**: p50/p95/p99 latency, error rate, throughput

### Security Tests
- **SQL Injection**: Parameterized query validation
- **Signature Bypass**: Verify test mode disabled in production
- **Rate Limiting**: Verify 100 req/min per DID enforcement
- **Credit Double-Spend**: Concurrent reservation race condition test

---

## Rollback Procedures

### Phase 1 Rollback (Railway Deployment)
```bash
# 1. Revert DNS to local Docker
# 2. Stop Railway broker service
railway service stop broker

# 3. Keep local Docker running
docker-compose -f docker-compose.dev.yml up -d

# 4. Verify local health
curl http://localhost:8080/health
```

### Phase 2 Rollback (Signature Verification)
```bash
# Disable signature verification immediately
railway variables --set SIGNATURE_VERIFICATION_ENABLED=false

# Monitor error rate drop to 0%
# Investigate signature failures in audit_log table
```

### Phase 3 Rollback (Credit System)
```bash
# Run rollback migration
railway run psql $DATABASE_URL < packages/db/migrations/003_add_credit_ledger_rollback.sql

# Revert to in-memory credits (requires code rollback)
git revert <phase-3-commit>
railway up --service broker
```

### Phase 4 Rollback (Negotiation Protocol)
```bash
# Disable negotiation via feature flag
railway variables --set NEGOTIATION_ENABLED=false

# Fallback to direct intent delivery (no negotiation)
# Requires code change in routing.ts
```

### Phase 5 Rollback (Intent Types)
```bash
# Disable specific intent type via feature flag
railway variables --set INTENT_TYPE_REQUEST_MEETING_ENABLED=false

# Fallback to FREEFORM_NOTE for unsupported types
```

### Emergency Full Rollback
```bash
# 1. Revert to Phase 0.2 commit
git checkout 80745d5

# 2. Redeploy to Railway
railway up --service broker

# 3. Run database rollback for all Phase 0.3 migrations
railway run psql $DATABASE_URL < rollback.sql

# 4. Verify local Docker still works
docker-compose -f docker-compose.dev.yml up -d
curl http://localhost:8080/health
```

---

## Evidence Pack Template

After each phase, the responsible agent MUST fill this evidence pack:

```markdown
## Evidence Pack: Phase 0.3 - <Phase Name>

### Plan vs. Actual
- **Planned files touched**: [list from checklist]
- **Actual files touched**: [git diff --name-only]
- **Planned new files**: [list from checklist]
- **Actual new files**: [git diff --diff-filter=A --name-only]
- **Variance explanation**: [if any deviation from plan]

### Quality Gates Results
- **Lint**: ✅/❌ [`npm run lint` output]
- **Typecheck**: ✅/❌ [`npm run typecheck` output]
- **Build**: ✅/❌ [`npm run build` output]
- **Tests**: ✅/❌ [coverage report, X/Y tests passing]
  - New tests added: [list test files]
  - Coverage delta: [+X.X%]

### Implementation Summary
- **What changed**: [brief description]
- **Why**: [rationale for design decisions]
- **Key decisions**: [architectural choices, trade-offs]
- **Impacted modules**: [list with roles]

### Testing Evidence
- **Test names**: [list of new test suites]
- **Coverage**: [before/after percentages]
- **Edge cases covered**: [list critical edge cases]
- **Manual testing performed**: [smoke test results]

### Deployment Evidence
- **Railway deployment**: ✅/❌ [deployment URL, commit hash]
- **Health check**: ✅/❌ [/health endpoint response]
- **Smoke test**: ✅/❌ [agent registration → intent delivery → result]
- **Error rate**: [0% expected for successful deployment]
- **Latency**: [p50/p95 response times]

### Documentation Updates
- **Files updated**: [README, docs/*, CHANGELOG]
- **New docs created**: [with justification]
- **Migration guides**: [if breaking changes]

### Breaking Changes Statement
- **Breaking changes**: Yes/No
- **If yes**: [migration guide, deprecation timeline, affected users]
- **Backward compatibility**: [how maintained or why not possible]

### Follow-up Work
- **Technical debt**: [shortcuts taken with justification]
- **Future improvements**: [nice-to-haves deferred]
- **Known limitations**: [current constraints]

### Rollback Readiness
- **Rollback tested**: ✅/❌
- **Rollback procedure**: [link to ROLLBACK_PROCEDURE.md section]
- **Rollback time estimate**: [< 5 minutes expected]
```

---

## Success Criteria (Phase 0.3 Complete)

**Production Deployment**:
- [x] Broker running on Railway with zero-downtime uptime
- [x] PostgreSQL + pgvector accessible via DATABASE_URL
- [x] NATS JetStream streams operational
- [x] Redis cache connected
- [x] Health checks passing

**Security**:
- [x] Signature verification enforced in production (no test mode bypass)
- [x] Ed25519 signatures validated for all messages
- [x] Audit log capturing signature failures
- [x] SQL injection prevention maintained

**Credit System**:
- [x] Credit ledger persisted in PostgreSQL
- [x] Atomic credit reservation/release working
- [x] Credit transactions auditable
- [x] No double-spend vulnerabilities

**Negotiation Protocol**:
- [x] Multi-round negotiation working (up to 10 rounds)
- [x] Convergence detection (threshold 0.9)
- [x] State machine enforcing PROPOSE → COUNTER → ACCEPT/REJECT/ABORT
- [x] TTL expiration working
- [x] Intent delivery only after negotiation acceptance

**Intent Types**:
- [x] All 6 RFC 001 intent types implemented:
  - [x] REQUEST_MEETING
  - [x] APPROVAL_REQUEST
  - [x] SUBMIT_INFO
  - [x] INVOICE
  - [x] REQUEST_SERVICE
  - [x] FREEFORM_NOTE
- [x] Intent type router dispatching correctly
- [x] Semantic discovery working for each type

**Trust Vectors**:
- [x] Automated trust updates after intent completion
- [x] Automated trust updates after negotiation completion
- [x] Daily decay job running (cron)
- [x] Trust scores visible in agent responses

**Quality**:
- [x] Test coverage ≥95% for new code
- [x] All tests passing (target 100%, minimum 31/32)
- [x] No type errors (`npm run typecheck`)
- [x] No lint errors (`npm run lint`)
- [x] Build successful (`npm run build`)

**Documentation**:
- [x] Railway deployment guide
- [x] Rollback procedures documented
- [x] Feature flags documented
- [x] Intent types documented with examples
- [x] Trust vector logic documented
- [x] API documentation updated (OpenAPI spec)

**Performance**:
- [x] p95 latency <500ms for intent delivery
- [x] Error rate <1% in production
- [x] Handle 100 agents/sec registration
- [x] Handle 1000 intents/sec delivery

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Rollback Plan |
|------|-----------|--------|-----------|---------------|
| Railway deployment fails | Medium | High | Test on staging first, use Railway CLI | Keep local Docker, revert DNS |
| pgvector not available on Railway | Low | High | Verify PostgreSQL 16+ support before migration | Switch to Neon/Supabase |
| Signature verification breaks valid agents | Medium | High | Gradual rollout with feature flag | Set `SIGNATURE_VERIFICATION_ENABLED=false` |
| Credit double-spend vulnerability | Low | Critical | Use PostgreSQL transactions with `SELECT ... FOR UPDATE` | Add distributed lock (Redis) |
| Negotiation infinite loops | Medium | Medium | Enforce max rounds (10), TTL (5 min) | Circuit breaker per agent pair |
| Trust score oscillation | Medium | Low | Conservative update magnitudes (±0.1 max) | Adjust weights via env vars |
| Intent type handler bugs | Low | Medium | Isolate handlers, extensive testing | Disable intent type via feature flag |
| NATS JetStream resource exhaustion | Low | High | Start with conservative limits, monitor | Increase memory/storage limits |
| Database migration fails | Low | High | Test on staging, add `IF NOT EXISTS` | Run rollback migration immediately |

---

## Timeline & Agent Assignments

| Phase | Duration | Start | End | Owner | Reviewers |
|-------|---------|-------|-----|-------|-----------|
| **Phase 1**: Production Infrastructure | 2 days | Day 1 | Day 2 | Infra | SA, PRV |
| **Phase 2**: Signature Verification | 1 day | Day 3 | Day 3 | SA + IE | PRV |
| **Phase 3**: Credit System Persistence | 2 days | Day 4 | Day 5 | DME + IE | ICA, PRV |
| **Phase 4**: Negotiation Protocol | 3 days | Day 6 | Day 8 | IE + TA | ICA, PRV |
| **Phase 5**: Intent Types & Trust | 2 days | Day 9 | Day 10 | IE + TA | PRV, CRA |
| **Integration Testing** | 0.5 days | Day 10 | Day 10 | TA | All |
| **Production Verification** | 0.5 days | Day 10 | Day 10 | PRV + PDV | All |

**Total Duration**: 10 days (8-10 days depending on issues)

---

## Post-Phase 0.3 Roadmap (Phase 0.4+)

**Phase 0.4: Enhanced Discovery** (1 week)
- Capability versioning and compatibility checks
- Multi-region agent discovery (geo-routing)
- Capability evidence verification (Verifiable Credentials)
- Discovery caching optimization (HNSW index tuning)

**Phase 0.5: Advanced Security** (1 week)
- DID:web support (beyond did:key)
- Mutual TLS for agent-broker connections
- End-to-end encryption for sensitive intents
- Audit log analytics and anomaly detection

**Phase 0.6: Observability & Monitoring** (1 week)
- Distributed tracing (OpenTelemetry)
- Custom metrics (Prometheus exporters)
- Grafana dashboards for AINP-specific metrics
- Alerting rules (PagerDuty/Slack integration)

**Phase 1.0: Production Hardening** (2 weeks)
- Multi-broker deployment (load balancing)
- Database replication (read replicas)
- NATS clustering (high availability)
- Disaster recovery procedures
- Load testing at scale (10k agents, 100k intents/day)

---

## Appendix: Environment Variables Reference

### Phase 0.2 (Existing)
```bash
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://user:pass@host:5432/ainp?sslmode=require
REDIS_URL=redis://host:6379
NATS_URL=nats://host:4222
OPENAI_API_KEY=sk-proj-...
```

### Phase 0.3 (New)
```bash
# Signature Verification (Phase 2)
SIGNATURE_VERIFICATION_ENABLED=true  # false to bypass in emergency

# Credit System (Phase 3)
CREDIT_LEDGER_ENABLED=true           # false for in-memory only (dev)
INITIAL_CREDITS=1000000              # Credits for new agents (1000 credits)

# Negotiation Protocol (Phase 4)
NEGOTIATION_ENABLED=true             # false to disable negotiation
NEGOTIATION_MAX_ROUNDS=10            # Max rounds before ABORT
NEGOTIATION_TTL_MS=300000            # 5 minutes default TTL
NEGOTIATION_CONVERGENCE_THRESHOLD=0.9 # Convergence threshold for acceptance

# Intent Types (Phase 5)
INTENT_TYPE_REQUEST_MEETING_ENABLED=true
INTENT_TYPE_APPROVAL_REQUEST_ENABLED=true
INTENT_TYPE_SUBMIT_INFO_ENABLED=true
INTENT_TYPE_INVOICE_ENABLED=true
INTENT_TYPE_REQUEST_SERVICE_ENABLED=true
INTENT_TYPE_FREEFORM_NOTE_ENABLED=true

# Trust Vectors (Phase 5)
TRUST_DECAY_ENABLED=true             # false to disable daily decay
TRUST_DECAY_RATE=0.977               # 30-day half-life
TRUST_UPDATE_RELIABILITY_SUCCESS=0.1 # Reliability boost on success
TRUST_UPDATE_RELIABILITY_FAILURE=-0.2 # Reliability penalty on failure
TRUST_UPDATE_TIMELINESS_MAX=0.1      # Max timeliness update
```

---

## Appendix: Database Migrations Summary

| Migration | File | Purpose | Rollback |
|-----------|------|---------|----------|
| 001 | `001_add_agent_registration_fields.sql` | Agent registration (Phase 0.2) | - |
| 002 | `002_add_trust_scores.sql` | Trust vectors (Phase 0.2) | - |
| 003 | `003_add_credit_ledger.sql` | Credit accounts & transactions (Phase 3) | `003_add_credit_ledger_rollback.sql` |
| 004 | `004_add_negotiation_sessions.sql` | Negotiation state machine (Phase 4) | `004_add_negotiation_sessions_rollback.sql` |
| 005 | `005_add_approval_sessions.sql` | Approval workflow (Phase 5) | `005_add_approval_sessions_rollback.sql` |

---

## Appendix: API Endpoints Summary

### Phase 0.2 (Existing)
- `GET /health` - Health check
- `POST /api/agents/register` - Register agent
- `GET /api/agents/:did` - Get agent by DID
- `POST /api/discovery` - Discover agents by capability
- `POST /api/intents` - Submit intent

### Phase 0.3 (New)
- `GET /api/negotiations/:sessionId` - Get negotiation session (Phase 4)
- `POST /api/negotiations/:sessionId/counter` - Submit counter-proposal (Phase 4)
- `POST /api/negotiations/:sessionId/accept` - Accept proposal (Phase 4)
- `POST /api/negotiations/:sessionId/reject` - Reject proposal (Phase 4)
- `GET /api/credits/:agentId` - Get credit account (Phase 3)
- `GET /api/credits/:agentId/transactions` - Get transaction history (Phase 3)
- `POST /api/credits/:agentId/deposit` - Deposit credits (Phase 3, admin only)

---

## Clarifications Needed

Before proceeding with implementation, please confirm:

1. **Railway vs. Alternative Hosting**
   - **Option A**: Use Railway (recommended, easy setup, auto-scaling)
   - **Option B**: Use Render or Fly.io (alternatives if Railway pricing is concern)
   - **Option C**: Self-host on AWS/GCP (requires more setup, infrastructure expertise)
   - **Recommendation**: **Option A (Railway)** - Fastest deployment, good PostgreSQL + Redis support, NATS as separate service

2. **Credit System Economic Model**
   - **Option A**: Fixed pricing (e.g., 1 credit = $0.001)
   - **Option B**: Dynamic pricing (market-based, agents set prices)
   - **Option C**: Free tier + paid tiers (freemium model)
   - **Recommendation**: **Option A (Fixed)** for Phase 0.3, defer dynamic pricing to Phase 1.0

3. **Signature Verification Gradual Rollout**
   - **Option A**: Feature flag (start disabled, enable after monitoring)
   - **Option B**: Whitelist mode (only verify known agents first)
   - **Option C**: Immediate enforcement (risky, but simpler)
   - **Recommendation**: **Option A (Feature flag)** - Safest, allows rollback

4. **Test Suite Priority**
   - **Option A**: Fix 2 failing test assertions before Phase 1
   - **Option B**: Proceed with 31/32, fix in parallel during Phase 1
   - **Option C**: Defer to Phase 5 (not recommended)
   - **Recommendation**: **Option B** - Don't block deployment, fix during Phase 1 infrastructure setup

5. **Intent Type Implementation Order**
   - **Option A**: All 6 in Phase 5 (as planned)
   - **Option B**: Split across Phase 4 and 5 (3 types each)
   - **Option C**: Incremental (1 type per week after Phase 5)
   - **Recommendation**: **Option A** - Intent handlers are isolated, parallel implementation possible

---

**End of Phase 0.3 Implementation Plan**
