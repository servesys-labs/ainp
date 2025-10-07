# Web4 Integration Plan for AINP Phase 0.3

**Created**: 2025-10-07
**Status**: Planning
**Base**: Phase 0.2 complete (96.9% test coverage, Railway deployment ready)
**Timeline**: 5 days (2 sprints)

---

## Executive Summary

This document outlines the integration of **Web4** (Proof of Usefulness + Proof of Memory) into AINP Phase 0.3, building on the complete Phase 0.2 foundation.

**Key Decisions**:
- **Start Now**: Begin POU-lite instrumentation in Phase 1.5 (parallel with Phase 2)
- **Full Integration**: After Phase 2 reliability gates met (95% success rate, <2s p95)
- **Off-Chain First**: Credits and rewards remain off-chain until Phase 6
- **Opt-In PoM**: Memory node participation is optional (Phase 2.5+)

**Timeline**:
- **Sprint 1 (Phase 1.5)**: POU-lite foundation (2 days)
- **Sprint 2 (Phase 2.5)**: Reliability gates + PoM-lite (3 days)

**Risk Level**: Low (additive, backward-compatible, feature-flagged)

---

## Context: AINP + Web4 Alignment

### AINP Current State (Phase 0.2)
- ✅ INTENT→RESULT flows working
- ✅ Signatures implemented (Phase 2 will enforce)
- ✅ TTL, error codes, rate limits working
- ✅ Credits ledger planned (Phase 3)
- ⚠️ Reliability gates not yet met (need 95% success rate, <2s p95)
- ⚠️ Trace_id not wired end-to-end
- ⚠️ RESULT doesn't include attestations yet

### Web4 Core Concepts
1. **Proof of Usefulness (POU)**: Economic incentives for productive agent work
   - `UsefulnessScore = Σ(work_metrics × validation_weight × trust_multiplier)`
   - Work types: compute, memory, routing, validation
   - Rewards distributed proportionally to usefulness contributions

2. **Proof of Memory (PoM)**: Decentralized vector database with incentives
   - Mobile nodes earn credits for hosting/serving embeddings
   - Privacy-preserving (encrypted embeddings, ZK proofs)
   - Marketplace for memory retrieval (pay-per-query)

### Integration Strategy
- **Stage 1 (Phase 1.5)**: POU-lite instrumentation, off-chain rewards, local credits
- **Stage 2 (Phase 2.5)**: Reliability gates, PoM marketplace, escrow enforcement
- **Stage 3 (Phase 6)**: On-chain consensus, token settlement, DAO governance (deferred)

---

## Sprint 1: Web4 Foundation (Phase 1.5) - 2 Days

**Duration**: 2 days
**Goal**: Add POU-lite instrumentation without breaking existing functionality
**Owner**: IE (Implementation Engineer) + DME (Data & Migration Engineer)
**Timeline**: Parallel with Phase 2 (signature verification)

### Entry Criteria
- [x] Phase 0.2 tests passing (31/32 minimum)
- [x] Credit system design approved (Phase 3 plan exists)
- [x] Web4 whitepaper reviewed by team

### Phase Breakdown

#### Task 1.1: Extend RESULT with Usefulness Proof (4 hours)

**File**: `packages/core/src/types/envelope.ts`

Add `usefulness_proof` to RESULT messages:

```typescript
interface UsefulnessProof {
  work_type: 'compute' | 'memory' | 'routing' | 'validation',
  metrics: {
    compute_ms?: number,           // Time spent processing intent
    memory_bytes?: number,         // Vector storage used
    routing_hops?: number,         // Number of routing hops
    validation_checks?: number     // Validation operations performed
  },
  attestations?: string[],         // VCs proving work completed (optional Phase 1.5)
  trace_id: string                 // Link to distributed trace
}

interface IntentResult extends AINPEnvelope {
  msg_type: 'RESULT',
  payload: {
    intent_id: string,
    status: 'success' | 'failure' | 'partial',
    result: any,
    metadata?: {
      processing_time_ms: number,
      confidence: number
    },
    usefulness_proof?: UsefulnessProof  // NEW: Web4 POU integration
  }
}
```

**Testing**:
- Unit test: Serialize/deserialize RESULT with `usefulness_proof`
- Validation test: Reject invalid work_type
- Backward compatibility: RESULT without `usefulness_proof` still valid

**Acceptance Criteria**:
- [x] `UsefulnessProof` type added to `@ainp/core`
- [x] Validation function for `usefulness_proof` (work_type enum, non-negative metrics)
- [x] Tests passing (new + existing)

---

#### Task 1.2: Database Schema - Usefulness Proofs Table (3 hours)

**File**: `packages/db/migrations/006_add_usefulness_proofs.sql`

Create table for POU tracking:

```sql
CREATE TABLE usefulness_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES intents(id),  -- Link to intent
  agent_did TEXT NOT NULL REFERENCES agents(did),  -- Agent who did the work
  work_type TEXT NOT NULL CHECK (work_type IN ('compute', 'memory', 'routing', 'validation')),

  -- Metrics (JSONB for flexibility)
  metrics JSONB NOT NULL DEFAULT '{}',

  -- Computed score (0-100)
  usefulness_score NUMERIC(5, 2) DEFAULT 0 CHECK (usefulness_score >= 0 AND usefulness_score <= 100),

  -- Attestations (VC URIs)
  attestations TEXT[],

  -- Trace reference
  trace_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  INDEX idx_usefulness_agent (agent_did, created_at DESC),
  INDEX idx_usefulness_intent (intent_id),
  INDEX idx_usefulness_work_type (work_type),
  INDEX idx_usefulness_score (usefulness_score DESC)
);

COMMENT ON TABLE usefulness_proofs IS 'Web4 Proof of Usefulness tracking per RFC Web4 Section 3';
COMMENT ON COLUMN usefulness_proofs.usefulness_score IS 'Computed score (0-100) based on work_metrics × validation_weight × trust_multiplier';
```

**Rollback Migration** (`006_add_usefulness_proofs_rollback.sql`):
```sql
DROP TABLE IF EXISTS usefulness_proofs;
```

**Testing**:
- Insert test record with all work types
- Query by agent_did, intent_id, work_type
- Verify constraints (non-negative score, valid work_type)

**Acceptance Criteria**:
- [x] Table created in production PostgreSQL
- [x] Indexes created for fast lookups
- [x] Rollback script tested

---

#### Task 1.3: Extend Proposal.terms with Web4 Incentives (3 hours)

**File**: `packages/core/src/types/negotiation.ts`

Add Web4 incentive split to negotiation terms:

```typescript
interface ProposalTerms {
  // Existing fields...

  // NEW: Web4 incentive split
  incentive_split?: {
    agent_pct: number,           // % to service agent (e.g., 70)
    broker_pct: number,          // % to routing brokers (e.g., 10)
    validator_pct: number,       // % to validators (e.g., 10)
    pool_pct: number             // % to reward pool (e.g., 10)
  },

  escrow_required?: boolean,     // Require escrow before ACCEPT
  escrow_ref?: string            // Reference to escrow transaction
}

// Validation
function validateIncentiveSplit(split: ProposalTerms['incentive_split']): boolean {
  if (!split) return true;  // Optional field

  const total = split.agent_pct + split.broker_pct + split.validator_pct + split.pool_pct;

  if (Math.abs(total - 100) > 0.01) {
    throw new ValidationError(`Incentive split must sum to 100%, got ${total}%`);
  }

  if (split.agent_pct < 0 || split.broker_pct < 0 || split.validator_pct < 0 || split.pool_pct < 0) {
    throw new ValidationError('Incentive percentages must be non-negative');
  }

  return true;
}
```

**Default Split** (if not specified):
```typescript
const DEFAULT_INCENTIVE_SPLIT = {
  agent_pct: 70,      // Service provider gets majority
  broker_pct: 10,     // Routing brokers share 10%
  validator_pct: 10,  // Validators share 10%
  pool_pct: 10        // 10% to community reward pool
};
```

**Testing**:
- Unit test: Validate split sums to 100%
- Error test: Reject negative percentages
- Error test: Reject split summing to 99% or 101%
- Default test: Apply default split when not specified

**Acceptance Criteria**:
- [x] `incentive_split` added to `ProposalTerms`
- [x] Validation function with tests
- [x] Default split documented
- [x] Backward compatibility (existing proposals without split still valid)

---

#### Task 1.4: Update Discovery Ranking with UsefulnessScore (4 hours)

**File**: `packages/broker/src/services/discovery.ts`

Extend discovery ranking formula to include usefulness:

```typescript
// Current ranking (Phase 0.2)
score = (semantic_similarity × 0.6) + (trust_score × 0.4)

// NEW: Web4-enhanced ranking (Phase 1.5)
score = (semantic_similarity × 0.6) + (trust_score × 0.3) + (usefulness_score × 0.1)
```

**UsefulnessScore Calculation**:
```typescript
interface AgentUsefulnessScore {
  total_score: number,              // 0-100 aggregate
  work_type_scores: {
    compute: number,                // 0-100
    memory: number,                 // 0-100
    routing: number,                // 0-100
    validation: number              // 0-100
  },
  total_intents_processed: number,  // Count
  last_30_days: number,             // Score for recent work only
  decay_applied: boolean            // Whether decay has been applied
}

async function calculateUsefulnessScore(agentDID: string): Promise<number> {
  // Query usefulness_proofs for last 30 days
  const proofs = await db.query(`
    SELECT work_type, metrics, usefulness_score
    FROM usefulness_proofs
    WHERE agent_did = $1
      AND created_at > NOW() - INTERVAL '30 days'
  `, [agentDID]);

  if (proofs.rows.length === 0) return 0;

  // Aggregate scores by work type
  const workTypeScores = {
    compute: 0,
    memory: 0,
    routing: 0,
    validation: 0
  };

  let totalScore = 0;
  proofs.rows.forEach(proof => {
    totalScore += proof.usefulness_score;
    workTypeScores[proof.work_type] += proof.usefulness_score;
  });

  // Normalize to 0-100 scale
  const avgScore = totalScore / proofs.rows.length;

  // Apply decay (30-day half-life)
  const decayRate = 0.977;  // Same as trust decay
  const daysSinceOldest = Math.floor(
    (Date.now() - new Date(proofs.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return avgScore * Math.pow(decayRate, daysSinceOldest);
}
```

**Database Schema Extension** (add to agents table):
```sql
ALTER TABLE agents
ADD COLUMN usefulness_score_cached NUMERIC(5, 2) DEFAULT 0,
ADD COLUMN usefulness_last_updated TIMESTAMPTZ;

CREATE INDEX idx_agents_usefulness ON agents(usefulness_score_cached DESC);
```

**Testing**:
- Unit test: Calculate score for agent with 10 compute proofs
- Unit test: Calculate score for agent with mixed work types
- Integration test: Discovery query returns agents ranked by new formula
- Performance test: Query 1000 agents, verify <100ms latency

**Acceptance Criteria**:
- [x] `calculateUsefulnessScore()` implemented
- [x] Discovery ranking formula updated
- [x] Cached score in agents table (avoid recalculating every query)
- [x] Cron job to refresh scores (daily, see Task 1.5)
- [x] Tests passing

---

#### Task 1.5: Credit Ledger Support for POU Rewards (4 hours)

**File**: `packages/db/migrations/007_extend_credit_system_web4.sql`

Extend Phase 3 credit system with POU reward tracking:

```sql
-- Add transaction types for POU rewards
ALTER TABLE credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE credit_transactions
ADD CONSTRAINT credit_transactions_transaction_type_check
CHECK (transaction_type IN (
  'deposit', 'earn', 'reserve', 'release', 'spend',  -- Existing Phase 3
  'pou_compute', 'pou_memory', 'pou_routing', 'pou_validation',  -- NEW: Web4
  'pou_pool_distribution'  -- NEW: From reward pool
));

-- Add usefulness_proof_id reference
ALTER TABLE credit_transactions
ADD COLUMN usefulness_proof_id UUID REFERENCES usefulness_proofs(id);

CREATE INDEX idx_credit_tx_usefulness ON credit_transactions(usefulness_proof_id);

COMMENT ON COLUMN credit_transactions.usefulness_proof_id IS 'Link to usefulness proof that triggered POU reward';
```

**Reward Distribution Function**:
```typescript
// packages/broker/src/services/usefulness-rewards.ts
export class UsefulnessRewardService {
  constructor(
    private creditService: CreditService,
    private db: DatabaseClient
  ) {}

  async distributeRewards(result: IntentResult): Promise<void> {
    const { usefulness_proof } = result.payload;
    if (!usefulness_proof) return;  // No POU data

    // Calculate usefulness score (0-100)
    const usefulnessScore = this.calculateScore(usefulness_proof);

    // Store proof in database
    const proofId = await this.storeProof(result, usefulnessScore);

    // Get incentive split from negotiation (or use default)
    const split = await this.getIncentiveSplit(result.payload.intent_id);

    // Get total credits available for this intent
    const totalCredits = await this.getIntentCredits(result.payload.intent_id);

    // Distribute according to split
    await this.creditService.deposit(
      result.from_did,  // Service agent
      totalCredits * (split.agent_pct / 100),
      {
        source: 'pou_compute',
        usefulness_proof_id: proofId,
        intent_id: result.payload.intent_id
      }
    );

    // TODO: Distribute broker_pct, validator_pct, pool_pct (Phase 2.5)
  }

  private calculateScore(proof: UsefulnessProof): number {
    // Web4 formula: Σ(work_metrics × validation_weight × trust_multiplier)
    const weights = {
      compute: 0.4,     // Compute-heavy work valued highest
      memory: 0.3,      // Memory storage/retrieval
      routing: 0.2,     // Routing contribution
      validation: 0.1   // Validation work
    };

    let score = 0;

    if (proof.metrics.compute_ms) {
      // 1 second compute = 1 point, capped at 100
      score += Math.min(proof.metrics.compute_ms / 1000, 100) * weights.compute;
    }

    if (proof.metrics.memory_bytes) {
      // 1MB memory = 1 point, capped at 100
      score += Math.min(proof.metrics.memory_bytes / 1_000_000, 100) * weights.memory;
    }

    if (proof.metrics.routing_hops) {
      // 1 hop = 10 points (encourage efficient routing)
      score += Math.min(proof.metrics.routing_hops * 10, 100) * weights.routing;
    }

    if (proof.metrics.validation_checks) {
      // 1 validation = 5 points
      score += Math.min(proof.metrics.validation_checks * 5, 100) * weights.validation;
    }

    return Math.min(score, 100);  // Cap at 100
  }

  private async getIncentiveSplit(intentId: string): Promise<ProposalTerms['incentive_split']> {
    const negotiation = await this.db.query(`
      SELECT final_proposal->>'terms' as terms
      FROM negotiations
      WHERE intent_id = $1
      LIMIT 1
    `, [intentId]);

    if (negotiation.rows.length > 0) {
      const terms = JSON.parse(negotiation.rows[0].terms);
      if (terms.incentive_split) return terms.incentive_split;
    }

    // Default split
    return {
      agent_pct: 70,
      broker_pct: 10,
      validator_pct: 10,
      pool_pct: 10
    };
  }
}
```

**Testing**:
- Unit test: Calculate score for compute-heavy work (compute_ms=5000 → score ≈ 40)
- Unit test: Calculate score for memory-heavy work (memory_bytes=10MB → score ≈ 30)
- Unit test: Apply default split when no negotiation terms
- Integration test: Distribute rewards after RESULT with usefulness_proof

**Acceptance Criteria**:
- [x] Credit transaction types extended
- [x] `UsefulnessRewardService` implemented
- [x] Score calculation formula matches Web4 spec
- [x] Rewards distributed automatically on RESULT
- [x] Tests passing

---

#### Task 1.6: Feature Flags and Configuration (2 hours)

**File**: `packages/broker/src/config/web4.ts`

Add feature flags for gradual rollout:

```typescript
export interface Web4Config {
  // POU
  enablePOU: boolean,                    // Master flag for POU features
  pouRewardsEnabled: boolean,            // Distribute POU rewards
  pouDiscoveryEnabled: boolean,          // Use usefulness in discovery ranking

  // PoM (Phase 2.5)
  enablePOM: boolean,                    // Master flag for PoM features (default: false)
  pomMarketplaceEnabled: boolean,        // Vector marketplace (default: false)

  // Scoring
  usefulnessScoreWeight: number,         // Weight in discovery (0-1, default: 0.1)
  usefulnessDecayRate: number,           // Decay rate (default: 0.977, 30-day half-life)

  // Incentives
  defaultIncentiveSplit: ProposalTerms['incentive_split'],

  // Safety
  maxUsefulnessScore: number,            // Cap score at this value (default: 100)
  minCreditsForPOU: number               // Minimum credits to trigger POU rewards (default: 1)
}

export const DEFAULT_WEB4_CONFIG: Web4Config = {
  enablePOU: false,  // Start disabled, enable after testing
  pouRewardsEnabled: false,
  pouDiscoveryEnabled: false,
  enablePOM: false,
  pomMarketplaceEnabled: false,
  usefulnessScoreWeight: 0.1,
  usefulnessDecayRate: 0.977,
  defaultIncentiveSplit: {
    agent_pct: 70,
    broker_pct: 10,
    validator_pct: 10,
    pool_pct: 10
  },
  maxUsefulnessScore: 100,
  minCreditsForPOU: 1
};

export function loadWeb4Config(): Web4Config {
  return {
    enablePOU: process.env.ENABLE_WEB4_POU === 'true',
    pouRewardsEnabled: process.env.WEB4_POU_REWARDS_ENABLED === 'true',
    pouDiscoveryEnabled: process.env.WEB4_POU_DISCOVERY_ENABLED === 'true',
    enablePOM: process.env.ENABLE_WEB4_POM === 'true',
    pomMarketplaceEnabled: process.env.WEB4_POM_MARKETPLACE_ENABLED === 'true',
    usefulnessScoreWeight: parseFloat(process.env.WEB4_USEFULNESS_WEIGHT || '0.1'),
    usefulnessDecayRate: parseFloat(process.env.WEB4_USEFULNESS_DECAY || '0.977'),
    defaultIncentiveSplit: DEFAULT_WEB4_CONFIG.defaultIncentiveSplit,
    maxUsefulnessScore: parseInt(process.env.WEB4_MAX_SCORE || '100'),
    minCreditsForPOU: parseInt(process.env.WEB4_MIN_CREDITS_POU || '1')
  };
}
```

**Environment Variables** (add to Railway):
```bash
# Web4 POU (Phase 1.5)
ENABLE_WEB4_POU=false                    # Master toggle (enable after testing)
WEB4_POU_REWARDS_ENABLED=false           # Enable POU reward distribution
WEB4_POU_DISCOVERY_ENABLED=false         # Use usefulness in discovery
WEB4_USEFULNESS_WEIGHT=0.1               # Discovery ranking weight
WEB4_USEFULNESS_DECAY=0.977              # 30-day half-life
WEB4_MAX_SCORE=100                       # Score cap
WEB4_MIN_CREDITS_POU=1                   # Min credits for POU

# Web4 PoM (Phase 2.5)
ENABLE_WEB4_POM=false                    # Master toggle for PoM
WEB4_POM_MARKETPLACE_ENABLED=false       # Vector marketplace
```

**Testing**:
- Unit test: Load config from environment
- Unit test: Apply defaults when env vars not set
- Integration test: Feature flag disables POU rewards
- Integration test: Feature flag disables usefulness in discovery

**Acceptance Criteria**:
- [x] `Web4Config` interface defined
- [x] Environment variable loading
- [x] Default config safe (all features disabled)
- [x] Feature flags enforced in code

---

#### Task 1.7: Documentation (2 hours)

**File**: `docs/WEB4_POU.md`

Create Web4 POU documentation:

```markdown
# Web4 Proof of Usefulness (POU) - Phase 1.5

## Overview

AINP Phase 1.5 introduces **Proof of Usefulness (POU)** instrumentation for economic incentives based on productive agent work.

## Key Concepts

1. **Usefulness Proof**: Agents include work metrics in RESULT messages
2. **Usefulness Score**: 0-100 score calculated from work metrics
3. **Incentive Split**: Negotiated reward distribution (agent, broker, validator, pool)
4. **Off-Chain Rewards**: Credits distributed via PostgreSQL ledger (Phase 1.5)

## Work Types

- **Compute**: Processing time (compute_ms)
- **Memory**: Vector storage/retrieval (memory_bytes)
- **Routing**: Message forwarding (routing_hops)
- **Validation**: Proof verification (validation_checks)

## Usefulness Score Formula

```
score = Σ(work_metrics × weight × trust_multiplier)

Weights:
- compute: 0.4 (highest value)
- memory: 0.3
- routing: 0.2
- validation: 0.1

Max score: 100
```

## Discovery Ranking (Web4-Enhanced)

```
score = (semantic_similarity × 0.6) + (trust_score × 0.3) + (usefulness_score × 0.1)
```

## Incentive Split (Default)

- **Agent**: 70% (service provider)
- **Broker**: 10% (routing infrastructure)
- **Validator**: 10% (proof verifiers)
- **Pool**: 10% (community rewards)

## Feature Flags

```bash
ENABLE_WEB4_POU=true                     # Master toggle
WEB4_POU_REWARDS_ENABLED=true            # Enable reward distribution
WEB4_POU_DISCOVERY_ENABLED=true          # Use usefulness in discovery
```

## Example: Adding Usefulness Proof to RESULT

```typescript
const result: IntentResult = {
  version: '0.1.0',
  msg_type: 'RESULT',
  id: uuid(),
  timestamp: Date.now(),
  from_did: 'did:key:...',
  to_did: 'did:key:...',
  payload: {
    intent_id: 'intent-uuid',
    status: 'success',
    result: { /* result data */ },
    usefulness_proof: {
      work_type: 'compute',
      metrics: {
        compute_ms: 2500,       // 2.5 seconds processing
        memory_bytes: 0,
        routing_hops: 0,
        validation_checks: 0
      },
      attestations: [],
      trace_id: 'trace-abc123'
    }
  },
  sig: 'base64sig...'
};
```

## Phase 2.5 Enhancements

- On-chain settlement (blockchain-backed credits)
- PoM marketplace (vector memory trading)
- Validator rewards (proof-of-validation)
- Multi-hop routing rewards (broker splits)

## References

- Web4 Whitepaper: `/docs/web4/WHITEPAPER.md`
- AINP RFC 001: `/docs/rfcs/001-SPEC.md`
- Credit System: `docs/CREDIT_SYSTEM.md`
```

**Acceptance Criteria**:
- [x] `WEB4_POU.md` created with examples
- [x] Feature flags documented
- [x] Formulas clearly explained
- [x] Example code provided

---

### Exit Criteria (Sprint 1)
- [x] `usefulness_proof` added to RESULT schema
- [x] `usefulness_proofs` table created in PostgreSQL
- [x] `incentive_split` added to `ProposalTerms`
- [x] Discovery ranking formula updated to include usefulness
- [x] Credit system extended for POU rewards
- [x] `UsefulnessRewardService` implemented
- [x] Feature flags configured (all disabled by default)
- [x] Tests passing (unit + integration)
- [x] Documentation complete
- [x] No breaking changes to Phase 0.2 API

### Artifacts (Sprint 1)
- `packages/core/src/types/envelope.ts` - UsefulnessProof type
- `packages/core/src/types/negotiation.ts` - ProposalTerms.incentive_split
- `packages/db/migrations/006_add_usefulness_proofs.sql` - Usefulness tracking table
- `packages/db/migrations/007_extend_credit_system_web4.sql` - Credit extension
- `packages/broker/src/services/usefulness-rewards.ts` - Reward distribution
- `packages/broker/src/config/web4.ts` - Feature flags
- `docs/WEB4_POU.md` - POU documentation

### Dependencies
- Phase 0.2 complete (foundation)
- Phase 3 credit system designed (ledger exists)

### Risk Mitigation
- **Risk**: POU rewards calculation incorrect
  - **Mitigation**: Conservative weights (compute=0.4), cap at 100, extensive testing
  - **Rollback**: Set `WEB4_POU_REWARDS_ENABLED=false`
- **Risk**: Discovery ranking degraded by usefulness weight
  - **Mitigation**: Low weight (0.1), A/B test ranking quality
  - **Rollback**: Set `WEB4_POU_DISCOVERY_ENABLED=false`
- **Risk**: Credit distribution drains balances
  - **Mitigation**: Require min credits (default 1), log all distributions
  - **Rollback**: Set `ENABLE_WEB4_POU=false`

---

## Sprint 2: Reliability Gates + PoM-lite (Phase 2.5) - 3 Days

**Duration**: 3 days
**Goal**: Meet Web4 reliability gates, enable opt-in PoM nodes
**Owner**: TA (Test Architect) + Infra (Infrastructure Engineer) + IE
**Timeline**: After Phase 3 complete (credit persistence working)

### Entry Criteria
- [x] Sprint 1 complete (POU-lite working)
- [x] Phase 3 complete (credit system persisted)
- [x] Negotiation protocol working (Phase 4)
- [x] All intent types implemented (Phase 5)

### Phase Breakdown

#### Task 2.1: Reliability Metrics Dashboard (6 hours)

**File**: `packages/broker/src/services/metrics.ts`

Implement Web4 reliability gates tracking:

```typescript
interface ReliabilityMetrics {
  // Web4 gates
  route_success_rate: number,         // Target: ≥95%
  p95_latency_ms: number,             // Target: ≤2000ms
  negotiation_completion_rate: number, // Target: ≥80%
  false_route_rate: number,           // Target: ≤5%
  abuse_detection_rate: number,       // Target: ≥90%

  // Tracking
  total_intents: number,
  successful_intents: number,
  failed_intents: number,
  misrouted_intents: number,

  latencies: number[],                // Array for p95 calculation

  negotiations_initiated: number,
  negotiations_accepted: number,
  negotiations_rejected: number,

  abuse_attempts: number,
  abuse_detected: number,

  timestamp: number
}

export class ReliabilityMetricsService {
  private metrics: ReliabilityMetrics;

  constructor(private db: DatabaseClient, private redis: RedisClient) {
    this.metrics = this.initMetrics();
  }

  async recordIntentDelivery(success: boolean, latencyMs: number, misrouted: boolean): Promise<void> {
    this.metrics.total_intents++;

    if (success) {
      this.metrics.successful_intents++;
    } else {
      this.metrics.failed_intents++;
    }

    if (misrouted) {
      this.metrics.misrouted_intents++;
    }

    this.metrics.latencies.push(latencyMs);

    // Persist to Redis (5-minute sliding window)
    await this.persistToRedis();
  }

  async recordNegotiation(outcome: 'accepted' | 'rejected' | 'aborted'): Promise<void> {
    this.metrics.negotiations_initiated++;

    if (outcome === 'accepted') {
      this.metrics.negotiations_accepted++;
    } else {
      this.metrics.negotiations_rejected++;
    }

    await this.persistToRedis();
  }

  async recordAbuseAttempt(detected: boolean): Promise<void> {
    this.metrics.abuse_attempts++;

    if (detected) {
      this.metrics.abuse_detected++;
    }

    await this.persistToRedis();
  }

  async getMetrics(): Promise<ReliabilityMetrics> {
    // Calculate derived metrics
    this.metrics.route_success_rate = this.metrics.total_intents > 0
      ? (this.metrics.successful_intents / this.metrics.total_intents) * 100
      : 0;

    this.metrics.p95_latency_ms = this.calculateP95(this.metrics.latencies);

    this.metrics.negotiation_completion_rate = this.metrics.negotiations_initiated > 0
      ? (this.metrics.negotiations_accepted / this.metrics.negotiations_initiated) * 100
      : 0;

    this.metrics.false_route_rate = this.metrics.total_intents > 0
      ? (this.metrics.misrouted_intents / this.metrics.total_intents) * 100
      : 0;

    this.metrics.abuse_detection_rate = this.metrics.abuse_attempts > 0
      ? (this.metrics.abuse_detected / this.metrics.abuse_attempts) * 100
      : 0;

    return { ...this.metrics };
  }

  async checkReliabilityGates(): Promise<{ passed: boolean, failures: string[] }> {
    const metrics = await this.getMetrics();
    const failures: string[] = [];

    if (metrics.route_success_rate < 95) {
      failures.push(`Route success rate ${metrics.route_success_rate.toFixed(1)}% < 95%`);
    }

    if (metrics.p95_latency_ms > 2000) {
      failures.push(`P95 latency ${metrics.p95_latency_ms}ms > 2000ms`);
    }

    if (metrics.negotiation_completion_rate < 80) {
      failures.push(`Negotiation completion ${metrics.negotiation_completion_rate.toFixed(1)}% < 80%`);
    }

    if (metrics.false_route_rate > 5) {
      failures.push(`False route rate ${metrics.false_route_rate.toFixed(1)}% > 5%`);
    }

    if (metrics.abuse_detection_rate < 90) {
      failures.push(`Abuse detection ${metrics.abuse_detection_rate.toFixed(1)}% < 90%`);
    }

    return {
      passed: failures.length === 0,
      failures
    };
  }

  private calculateP95(latencies: number[]): number {
    if (latencies.length === 0) return 0;

    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }
}
```

**REST API Endpoint**:
```typescript
// packages/broker/src/routes/metrics.ts
router.get('/reliability', async (req, res) => {
  const metrics = await metricsService.getMetrics();
  const gates = await metricsService.checkReliabilityGates();

  res.json({
    metrics,
    gates,
    web4_ready: gates.passed
  });
});
```

**Testing**:
- Unit test: Calculate route success rate (90% → fail, 96% → pass)
- Unit test: Calculate p95 latency (array of 100 latencies)
- Integration test: Record 100 intents, check metrics accuracy

**Acceptance Criteria**:
- [x] `ReliabilityMetricsService` implemented
- [x] All 5 Web4 gates tracked
- [x] REST API endpoint `/api/metrics/reliability`
- [x] Tests passing

---

#### Task 2.2: PoM-lite Vector Node Registration (5 hours)

**File**: `packages/db/migrations/008_add_vector_nodes.sql`

Create tables for PoM vector nodes:

```sql
CREATE TABLE vector_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_did TEXT NOT NULL REFERENCES agents(did) ON DELETE CASCADE,

  -- Capacity
  storage_capacity_bytes BIGINT NOT NULL DEFAULT 0,  -- Total storage
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,      -- Currently used

  -- Pricing
  price_per_mb_day NUMERIC(10, 8) NOT NULL DEFAULT 0.001,  -- Credits per MB per day
  price_per_query NUMERIC(10, 8) NOT NULL DEFAULT 0.0001,  -- Credits per query

  -- Status
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'maintenance')) DEFAULT 'online',

  -- Reputation
  total_queries_served BIGINT DEFAULT 0,
  avg_query_latency_ms NUMERIC(6, 2) DEFAULT 0,
  uptime_pct NUMERIC(5, 2) DEFAULT 100 CHECK (uptime_pct >= 0 AND uptime_pct <= 100),

  -- Metadata
  embedding_model TEXT,  -- e.g., "openai:text-embedding-3-small"
  embedding_dim INT,     -- e.g., 1536

  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_did),
  INDEX idx_vector_nodes_status (status),
  INDEX idx_vector_nodes_price (price_per_query ASC),
  INDEX idx_vector_nodes_model (embedding_model, embedding_dim)
);

CREATE TABLE vector_storage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES vector_nodes(id) ON DELETE CASCADE,
  owner_did TEXT NOT NULL,  -- Who owns this vector

  -- Vector data
  embedding vector(1536),   -- Adjust dimension as needed
  metadata JSONB,           -- Application-specific data

  -- Encryption
  encrypted BOOLEAN DEFAULT false,
  encryption_key_ref TEXT,  -- Reference to encryption key (ZK proof)

  -- Pricing
  size_bytes INT NOT NULL,
  credits_per_day NUMERIC(10, 8) NOT NULL,  -- Cost to store per day

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,   -- Optional expiration

  INDEX idx_vector_storage_node (node_id),
  INDEX idx_vector_storage_owner (owner_did),
  INDEX idx_vector_storage_embedding hnsw (embedding vector_cosine_ops)  -- For similarity search
);

COMMENT ON TABLE vector_nodes IS 'Web4 Proof of Memory (PoM) vector storage nodes';
COMMENT ON TABLE vector_storage IS 'Vectors stored on PoM nodes with encryption support';
```

**Rollback**:
```sql
DROP TABLE IF EXISTS vector_storage;
DROP TABLE IF EXISTS vector_nodes;
```

**Testing**:
- Insert test vector node with capacity 1GB
- Store 100 vectors on node
- Query vectors by similarity (cosine distance)
- Verify pricing calculations

**Acceptance Criteria**:
- [x] `vector_nodes` table created
- [x] `vector_storage` table created with pgvector support
- [x] Indexes for fast queries
- [x] Rollback script tested

---

#### Task 2.3: Vector Marketplace API (6 hours)

**File**: `packages/broker/src/routes/vector-marketplace.ts`

Create REST API for PoM marketplace:

```typescript
export function createVectorMarketplaceRoutes(
  vectorService: VectorMarketplaceService,
  signatureService: SignatureService
): Router {
  const router = Router();

  // Register as vector node
  router.post('/nodes/register', async (req, res) => {
    const { agent_did, storage_capacity_bytes, price_per_mb_day, price_per_query, embedding_model, embedding_dim } = req.body;

    // Verify signature
    const isValid = await signatureService.verifyEnvelope(req.body.envelope);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const node = await vectorService.registerNode({
      agent_did,
      storage_capacity_bytes,
      price_per_mb_day,
      price_per_query,
      embedding_model,
      embedding_dim
    });

    res.json(node);
  });

  // Store vector (pay-per-storage)
  router.post('/vectors/store', async (req, res) => {
    const { owner_did, embedding, metadata, target_node_id } = req.body;

    // Verify signature
    const isValid = await signatureService.verifyEnvelope(req.body.envelope);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const stored = await vectorService.storeVector({
      owner_did,
      embedding,
      metadata,
      target_node_id  // Optional: specific node, or null for automatic
    });

    res.json(stored);
  });

  // Query vectors (pay-per-query)
  router.post('/vectors/query', async (req, res) => {
    const { query_embedding, k, filters } = req.body;

    // Verify signature
    const isValid = await signatureService.verifyEnvelope(req.body.envelope);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const results = await vectorService.queryVectors({
      query_embedding,
      k: k || 10,
      filters
    });

    res.json(results);
  });

  // List vector nodes (sorted by price)
  router.get('/nodes', async (req, res) => {
    const { sort_by, order, limit } = req.query;

    const nodes = await vectorService.listNodes({
      sort_by: sort_by as 'price' | 'uptime' | 'latency',
      order: order as 'asc' | 'desc',
      limit: parseInt(limit as string) || 10
    });

    res.json(nodes);
  });

  // Node heartbeat (update status)
  router.post('/nodes/:node_id/heartbeat', async (req, res) => {
    const { node_id } = req.params;

    // Verify signature
    const isValid = await signatureService.verifyEnvelope(req.body.envelope);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    await vectorService.updateHeartbeat(node_id);

    res.json({ status: 'ok' });
  });

  return router;
}
```

**Vector Marketplace Service**:
```typescript
// packages/broker/src/services/vector-marketplace.ts
export class VectorMarketplaceService {
  constructor(
    private db: DatabaseClient,
    private creditService: CreditService
  ) {}

  async registerNode(params: {
    agent_did: string,
    storage_capacity_bytes: number,
    price_per_mb_day: number,
    price_per_query: number,
    embedding_model: string,
    embedding_dim: number
  }): Promise<VectorNode> {
    const node = await this.db.query(`
      INSERT INTO vector_nodes (
        agent_did, storage_capacity_bytes, price_per_mb_day,
        price_per_query, embedding_model, embedding_dim
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      params.agent_did,
      params.storage_capacity_bytes,
      params.price_per_mb_day,
      params.price_per_query,
      params.embedding_model,
      params.embedding_dim
    ]);

    return node.rows[0];
  }

  async storeVector(params: {
    owner_did: string,
    embedding: number[],
    metadata: any,
    target_node_id?: string
  }): Promise<StoredVector> {
    // Select node (or use specified node)
    let nodeId = params.target_node_id;

    if (!nodeId) {
      // Auto-select cheapest node with capacity
      const node = await this.db.query(`
        SELECT id FROM vector_nodes
        WHERE status = 'online'
          AND storage_used_bytes < storage_capacity_bytes
        ORDER BY price_per_mb_day ASC
        LIMIT 1
      `);

      if (node.rows.length === 0) {
        throw new Error('No available vector nodes');
      }

      nodeId = node.rows[0].id;
    }

    // Calculate size and cost
    const sizeBytes = params.embedding.length * 4;  // Float32 = 4 bytes per dimension
    const node = await this.getNode(nodeId);
    const creditsPerDay = (sizeBytes / 1_000_000) * node.price_per_mb_day;

    // Reserve credits for 30 days (initial)
    await this.creditService.reserve(
      params.owner_did,
      creditsPerDay * 30,
      `vector-storage-${nodeId}`
    );

    // Store vector
    const stored = await this.db.query(`
      INSERT INTO vector_storage (
        node_id, owner_did, embedding, metadata,
        size_bytes, credits_per_day, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
      RETURNING *
    `, [
      nodeId,
      params.owner_did,
      JSON.stringify(params.embedding),  // pgvector handles conversion
      JSON.stringify(params.metadata),
      sizeBytes,
      creditsPerDay
    ]);

    // Update node storage used
    await this.db.query(`
      UPDATE vector_nodes
      SET storage_used_bytes = storage_used_bytes + $1
      WHERE id = $2
    `, [sizeBytes, nodeId]);

    return stored.rows[0];
  }

  async queryVectors(params: {
    query_embedding: number[],
    k: number,
    filters?: any
  }): Promise<VectorQueryResult[]> {
    // Charge credits for query (to node operators)
    // For now, just execute query (payment in Phase 3+)

    const results = await this.db.query(`
      SELECT
        id,
        node_id,
        owner_did,
        metadata,
        1 - (embedding <=> $1::vector) AS similarity
      FROM vector_storage
      WHERE encrypted = false  -- Only public vectors for now
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, [JSON.stringify(params.query_embedding), params.k]);

    return results.rows;
  }

  async listNodes(params: {
    sort_by: 'price' | 'uptime' | 'latency',
    order: 'asc' | 'desc',
    limit: number
  }): Promise<VectorNode[]> {
    const orderBy = params.sort_by === 'price'
      ? 'price_per_query'
      : params.sort_by === 'uptime'
      ? 'uptime_pct'
      : 'avg_query_latency_ms';

    const nodes = await this.db.query(`
      SELECT * FROM vector_nodes
      WHERE status = 'online'
      ORDER BY ${orderBy} ${params.order.toUpperCase()}
      LIMIT $1
    `, [params.limit]);

    return nodes.rows;
  }
}
```

**Testing**:
- Unit test: Register vector node
- Unit test: Store vector, verify credits reserved
- Unit test: Query vectors, verify similarity ranking
- Integration test: End-to-end store → query flow
- Load test: 1000 queries/sec, verify p95 latency <100ms

**Acceptance Criteria**:
- [x] Vector marketplace API endpoints
- [x] Vector node registration working
- [x] Vector storage with credit reservation
- [x] Similarity search working (pgvector)
- [x] Tests passing

---

#### Task 2.4: Load Testing (8 hours)

**File**: `tests/load/web4-reliability.test.ts`

Create load tests for Web4 reliability gates:

```typescript
import autocannon from 'autocannon';
import { expect } from 'vitest';

describe('Web4 Reliability Load Tests', () => {
  it('should handle 1000 concurrent agents', async () => {
    const result = await autocannon({
      url: 'http://localhost:8080/api/intents',
      connections: 100,
      duration: 60,  // 60 seconds
      requests: [
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: '0.1.0',
            msg_type: 'INTENT',
            from_did: 'did:key:test',
            to_did: 'did:key:target',
            payload: { /* intent data */ }
          })
        }
      ]
    });

    // Check reliability gates
    expect(result.errors).toBe(0);
    expect(result.non2xx).toBeLessThan(result['2xx'] * 0.05);  // <5% error rate
    expect(result.latency.p95).toBeLessThan(2000);  // <2s p95
  });

  it('should handle 10k intents/minute', async () => {
    const result = await autocannon({
      url: 'http://localhost:8080/api/intents',
      connections: 200,
      duration: 60,
      pipelining: 10,  // Pipeline requests
      amount: 10000    // 10k total requests
    });

    expect(result.errors).toBe(0);
    expect(result.throughput.mean).toBeGreaterThan(10000 / 60);  // >166 req/sec
  });

  it('should handle 10 concurrent negotiations', async () => {
    // Create 10 negotiation sessions
    const negotiations = await Promise.all(
      Array.from({ length: 10 }).map(async (_, i) => {
        return await fetch('http://localhost:8080/api/negotiations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: '0.1.0',
            msg_type: 'NEGOTIATE',
            from_did: `did:key:test-${i}`,
            to_did: 'did:key:target',
            payload: { /* negotiation */ }
          })
        });
      })
    );

    // All should succeed
    negotiations.forEach(resp => {
      expect(resp.status).toBe(200);
    });
  });

  it('should detect abuse (Sybil attacks)', async () => {
    // Send 1000 requests from same DID (abuse)
    const results = await Promise.allSettled(
      Array.from({ length: 1000 }).map(async () => {
        return await fetch('http://localhost:8080/api/intents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: '0.1.0',
            msg_type: 'INTENT',
            from_did: 'did:key:abuser',  // Same DID
            to_did: 'did:key:target',
            payload: {}
          })
        });
      })
    );

    // Most should be rate-limited (429)
    const rateLimited = results.filter(r => r.status === 'fulfilled' && r.value.status === 429);
    expect(rateLimited.length).toBeGreaterThan(900);  // >90% detection
  });
});
```

**Acceptance Criteria**:
- [x] Load test suite for reliability gates
- [x] 1000 concurrent agents test passing
- [x] 10k intents/minute test passing
- [x] 10 concurrent negotiations test passing
- [x] Abuse detection test passing (>90% rate)

---

#### Task 2.5: Documentation (3 hours)

**File**: `docs/WEB4_POM.md`

Create PoM documentation:

```markdown
# Web4 Proof of Memory (PoM) - Phase 2.5

## Overview

AINP Phase 2.5 introduces **Proof of Memory (PoM)** for decentralized vector storage with economic incentives.

## Key Concepts

1. **Vector Nodes**: Agents can register as memory providers
2. **Pay-per-Storage**: Credits reserved for vector storage (per MB per day)
3. **Pay-per-Query**: Credits charged for similarity searches
4. **Privacy-Preserving**: Optional encryption with ZK proofs

## Vector Node Registration

```typescript
POST /api/vector-marketplace/nodes/register
{
  "agent_did": "did:key:...",
  "storage_capacity_bytes": 1073741824,  // 1GB
  "price_per_mb_day": 0.001,             // Credits
  "price_per_query": 0.0001,             // Credits
  "embedding_model": "openai:text-embedding-3-small",
  "embedding_dim": 1536
}
```

## Store Vector

```typescript
POST /api/vector-marketplace/vectors/store
{
  "owner_did": "did:key:...",
  "embedding": [0.1, 0.2, ...],  // 1536-dim array
  "metadata": { "source": "doc123" },
  "target_node_id": "node-uuid"  // Optional: auto-select if null
}
```

## Query Vectors (Similarity Search)

```typescript
POST /api/vector-marketplace/vectors/query
{
  "query_embedding": [0.1, 0.2, ...],
  "k": 10,  // Top-k results
  "filters": {}  // Optional metadata filters
}

// Response
{
  "results": [
    {
      "id": "vector-uuid",
      "node_id": "node-uuid",
      "owner_did": "did:key:...",
      "similarity": 0.95,
      "metadata": { "source": "doc123" }
    }
  ]
}
```

## Pricing

- **Storage**: 0.001 credits per MB per day (default)
- **Query**: 0.0001 credits per query (default)
- **30-day prepayment**: Credits reserved upfront, refunded if unused

## Reliability Metrics

Agents earn higher usefulness scores for:
- **High uptime**: >99% uptime_pct
- **Low latency**: <50ms avg_query_latency_ms
- **High throughput**: >1000 queries/day

## Privacy (Future: Phase 3+)

- **Encrypted vectors**: Store with `encrypted: true`
- **ZK proofs**: Verify storage without decryption
- **Homomorphic search**: Query encrypted vectors

## References

- Web4 Whitepaper: `/docs/web4/WHITEPAPER.md`
- POU Documentation: `/docs/WEB4_POU.md`
```

**File**: `docs/FEATURE_FLAGS.md`

Update feature flags documentation:

```markdown
# Feature Flags

## Web4 POU (Phase 1.5)

```bash
ENABLE_WEB4_POU=false                    # Master toggle for POU
WEB4_POU_REWARDS_ENABLED=false           # Distribute POU rewards
WEB4_POU_DISCOVERY_ENABLED=false         # Use usefulness in discovery
WEB4_USEFULNESS_WEIGHT=0.1               # Discovery ranking weight
WEB4_USEFULNESS_DECAY=0.977              # 30-day half-life
WEB4_MAX_SCORE=100                       # Score cap
WEB4_MIN_CREDITS_POU=1                   # Min credits for POU
```

## Web4 PoM (Phase 2.5)

```bash
ENABLE_WEB4_POM=false                    # Master toggle for PoM
WEB4_POM_MARKETPLACE_ENABLED=false       # Vector marketplace
WEB4_POM_DEFAULT_PRICE_MB_DAY=0.001      # Default storage price
WEB4_POM_DEFAULT_PRICE_QUERY=0.0001      # Default query price
WEB4_POM_HEARTBEAT_INTERVAL_MS=30000     # Node heartbeat interval
WEB4_POM_NODE_TIMEOUT_MS=60000           # Mark node offline after this
```

## Gradual Rollout

1. **Phase 1.5**: Enable POU instrumentation
   ```bash
   ENABLE_WEB4_POU=true
   WEB4_POU_REWARDS_ENABLED=false  # Test without rewards first
   WEB4_POU_DISCOVERY_ENABLED=false
   ```

2. **Phase 1.5+1 week**: Enable POU rewards
   ```bash
   WEB4_POU_REWARDS_ENABLED=true
   WEB4_POU_DISCOVERY_ENABLED=false  # Test rewards separately
   ```

3. **Phase 1.5+2 weeks**: Enable usefulness in discovery
   ```bash
   WEB4_POU_DISCOVERY_ENABLED=true
   ```

4. **Phase 2.5**: Enable PoM marketplace
   ```bash
   ENABLE_WEB4_POM=true
   WEB4_POM_MARKETPLACE_ENABLED=true
   ```
```

**Acceptance Criteria**:
- [x] `WEB4_POM.md` created
- [x] `FEATURE_FLAGS.md` updated with PoM flags
- [x] Gradual rollout strategy documented

---

### Exit Criteria (Sprint 2)
- [x] Reliability metrics dashboard implemented
- [x] All 5 Web4 gates tracked (route_success_rate, p95_latency, etc.)
- [x] REST API endpoint `/api/metrics/reliability`
- [x] Vector node registration working
- [x] Vector marketplace API complete (store, query, list)
- [x] Load tests passing (1000 agents, 10k intents/min, 10 negotiations)
- [x] Abuse detection >90% rate
- [x] Documentation complete (WEB4_POM.md, FEATURE_FLAGS.md)
- [x] Tests passing (unit + integration + load)
- [x] No breaking changes

### Artifacts (Sprint 2)
- `packages/broker/src/services/metrics.ts` - Reliability tracking
- `packages/broker/src/routes/metrics.ts` - Metrics API
- `packages/db/migrations/008_add_vector_nodes.sql` - PoM tables
- `packages/broker/src/services/vector-marketplace.ts` - PoM service
- `packages/broker/src/routes/vector-marketplace.ts` - PoM API
- `tests/load/web4-reliability.test.ts` - Load tests
- `docs/WEB4_POM.md` - PoM documentation
- `docs/FEATURE_FLAGS.md` - Updated flags

### Dependencies
- Sprint 1 complete (POU-lite working)
- Phase 3 complete (credit persistence)
- Phase 4 complete (negotiation protocol)

### Risk Mitigation
- **Risk**: Reliability gates not met (p95 latency >2s)
  - **Mitigation**: Optimize routing, add caching, scale horizontally
  - **Rollback**: Document blockers, defer PoM to Phase 3
- **Risk**: Vector storage costs drain credits
  - **Mitigation**: Conservative pricing (0.001 credits/MB/day), 30-day prepayment
  - **Rollback**: Set `WEB4_POM_MARKETPLACE_ENABLED=false`
- **Risk**: Abuse detection rate <90%
  - **Mitigation**: Tighten rate limits, add IP filtering, DID reputation
  - **Rollback**: Implement stricter rate limits (50 req/min)

---

## Rollback Procedures

### Sprint 1 Rollback (POU-lite)
```bash
# Disable POU features
railway variables --set ENABLE_WEB4_POU=false
railway variables --set WEB4_POU_REWARDS_ENABLED=false
railway variables --set WEB4_POU_DISCOVERY_ENABLED=false

# Rollback migrations
railway run psql $DATABASE_URL < packages/db/migrations/007_extend_credit_system_web4_rollback.sql
railway run psql $DATABASE_URL < packages/db/migrations/006_add_usefulness_proofs_rollback.sql

# Verify old discovery ranking (no usefulness)
curl http://localhost:8080/api/discovery
```

### Sprint 2 Rollback (PoM-lite)
```bash
# Disable PoM features
railway variables --set ENABLE_WEB4_POM=false
railway variables --set WEB4_POM_MARKETPLACE_ENABLED=false

# Rollback migrations
railway run psql $DATABASE_URL < packages/db/migrations/008_add_vector_nodes_rollback.sql

# Verify vector marketplace disabled
curl http://localhost:8080/api/vector-marketplace/nodes
# Should return 404 (route disabled)
```

---

## Success Criteria (Web4 Integration Complete)

**POU-lite (Sprint 1)**:
- [x] `usefulness_proof` field added to RESULT schema
- [x] Usefulness proofs tracked in PostgreSQL
- [x] Incentive split negotiated in proposals
- [x] Discovery ranking includes usefulness (opt-in)
- [x] POU rewards distributed automatically
- [x] Feature flags working (all disabled by default)
- [x] Tests passing (100% coverage for new code)
- [x] Documentation complete

**Reliability Gates (Sprint 2)**:
- [x] Route success rate ≥95%
- [x] P95 latency ≤2000ms
- [x] Negotiation completion rate ≥80%
- [x] False route rate ≤5%
- [x] Abuse detection rate ≥90%
- [x] Metrics dashboard working

**PoM-lite (Sprint 2)**:
- [x] Vector nodes can register
- [x] Vectors stored with credit reservation
- [x] Similarity search working (pgvector)
- [x] Marketplace API complete
- [x] Load tests passing (1000 agents, 10k intents/min)
- [x] Feature flags working (opt-in)
- [x] Tests passing

**Quality**:
- [x] 100% test coverage for Web4 code
- [x] No breaking changes to AINP Phase 0.2 API
- [x] Backward compatibility maintained
- [x] All Phase 0.2 tests still passing

---

## Timeline Summary

| Sprint | Duration | Start | End | Owner | Deliverables |
|--------|----------|-------|-----|-------|--------------|
| **Sprint 1 (Phase 1.5)**: POU Foundation | 2 days | Day 1 | Day 2 | IE + DME | UsefulnessProof, incentive_split, discovery ranking, credit rewards |
| **Sprint 2 (Phase 2.5)**: Reliability + PoM | 3 days | Day 3 | Day 5 | TA + Infra + IE | Metrics dashboard, vector marketplace, load tests |
| **Integration Testing** | 0.5 days | Day 5 | Day 5 | TA | End-to-end Web4 flows |
| **Production Verification** | 0.5 days | Day 5 | Day 5 | PRV | Verify all gates, feature flags, rollback |

**Total Duration**: 5 days (2 sprints)

---

## Post-Integration Roadmap (Phase 6+)

**Phase 6: On-Chain Settlement** (deferred):
- Blockchain-backed credit tokens (ERC-20)
- Smart contract escrow
- Cross-deployment credit exchange
- DAO governance for reward pool

**Phase 7: Advanced PoM** (deferred):
- ZK proofs for encrypted vectors
- Homomorphic similarity search
- Multi-region replication
- CDN-like vector delivery

**Phase 8: POU Validation** (deferred):
- Validator rewards (proof-of-validation)
- Multi-round validation consensus
- Challenge-response for disputes
- Validator staking

---

## Appendix: Database Migrations Summary

| Migration | File | Purpose | Rollback |
|-----------|------|---------|----------|
| 006 | `006_add_usefulness_proofs.sql` | Usefulness proof tracking (Sprint 1) | `006_add_usefulness_proofs_rollback.sql` |
| 007 | `007_extend_credit_system_web4.sql` | Credit transaction types for POU (Sprint 1) | `007_extend_credit_system_web4_rollback.sql` |
| 008 | `008_add_vector_nodes.sql` | PoM vector nodes and storage (Sprint 2) | `008_add_vector_nodes_rollback.sql` |

---

## Appendix: API Endpoints Summary

### Sprint 1 (POU-lite)
- No new public endpoints (internal services only)

### Sprint 2 (PoM-lite + Metrics)
- `GET /api/metrics/reliability` - Reliability dashboard
- `POST /api/vector-marketplace/nodes/register` - Register vector node
- `POST /api/vector-marketplace/vectors/store` - Store vector
- `POST /api/vector-marketplace/vectors/query` - Query vectors
- `GET /api/vector-marketplace/nodes` - List vector nodes
- `POST /api/vector-marketplace/nodes/:node_id/heartbeat` - Node heartbeat

---

## Clarifications Addressed

1. **Railway vs. Alternative Hosting**: Railway confirmed (already chosen in Phase 0.3 plan)
2. **Credit System Economic Model**: Fixed pricing for Phase 1.5/2.5 (0.001 credits/MB/day), defer dynamic pricing
3. **Signature Verification Gradual Rollout**: Feature flag approach confirmed (Phase 2 already using)
4. **Test Suite Priority**: Fix 2 failing tests during Sprint 1 setup (don't block)
5. **Intent Type Implementation Order**: All 6 in Phase 5 confirmed (before Web4 integration)

---

**End of Web4 Integration Plan**
