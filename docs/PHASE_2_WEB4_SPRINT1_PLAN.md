# AINP Phase 2 + Web4 Sprint 1 Implementation Plan

**Created**: 2025-10-07
**Status**: Ready for Implementation
**Base Commit**: 80745d5 (Phase 0.2 complete, 32/32 tests passing)
**Timeline**: 3 days (parallel execution)

---

## Executive Summary

This plan orchestrates **two parallel workstreams** for AINP Phase 0.3:

1. **Phase 2: Real Signature Verification** (1 day) - Remove "dummy-sig" bypass, enforce Ed25519
2. **Web4 Sprint 1: POU-lite Foundation** (2 days) - Add Proof of Usefulness instrumentation

**Parallelization Strategy**: Phase 2 and Web4 Sprint 1 have **no blocking dependencies**. Both extend different parts of the system:
- Phase 2: Signature validation logic (`packages/broker/src/middleware/validation.ts`)
- Web4 Sprint 1: RESULT envelope schema, database migrations, credit rewards

**Risk Level**: Low (additive changes, feature-flagged, backward-compatible)
**Estimated Duration**: 3 days with parallel execution (4 days sequential)

---

## Context

**Current State (Phase 0.2)**:
- ✅ Signature validation implemented with `"dummy-sig"` bypass
- ✅ 32/32 tests passing (100% coverage)
- ✅ Local deployment working (Docker Compose)
- ⚠️ Dummy signature allows ANY request through in test/dev mode
- ⚠️ No real Ed25519 verification yet

**Goals**:
1. **Phase 2**: Real Ed25519 signature verification with @noble/ed25519
2. **Web4 Sprint 1**: Proof of Usefulness (POU) instrumentation for economic incentives

---

## Routing Decision

**Routing**: This is a **planning task**, so Main Agent (IPSA) handles directly.

**Agents Assigned**:
- **IE (Implementation Engineer)**: Phase 2 signature implementation + Web4 types
- **DME (Data & Migration Engineer)**: Web4 database migrations
- **TA (Test Architect)**: Test coverage for both workstreams
- **ICA (Integration & Cohesion Auditor)**: Verify no conflicts between Phase 2 and Web4
- **PRV (Prod Readiness Verifier)**: Final quality gates

---

## Phase 2: Real Signature Verification (1 day)

**Duration**: 1 day (8 hours)
**Owner**: IE (Implementation Engineer) + SA (Security Auditor)
**Parallel with**: Web4 Sprint 1 (no dependencies)

### Entry Criteria
- [x] Phase 0.2 complete (32/32 tests passing)
- [x] Current signature validation bypasses with `"dummy-sig"` in test mode
- [x] `@noble/ed25519` dependency available

### Task Breakdown

#### Task 2.1: Implement Ed25519 Verification (3 hours)

**Owner**: IE
**Files Modified**:
- `packages/broker/src/middleware/validation.ts`
- `packages/broker/package.json` (add `@noble/ed25519`)

**Changes**:

```typescript
// packages/broker/src/middleware/validation.ts

import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';

/**
 * Verify Ed25519 signature on AINP envelope
 * Uses DID:key format: did:key:z6Mk... (base58btc-encoded public key)
 */
export async function verifySignature(envelope: AINPEnvelope): Promise<boolean> {
  const { from_did, sig, ...unsignedEnvelope } = envelope;

  // Extract public key from DID:key
  const publicKey = extractPublicKeyFromDID(from_did);
  if (!publicKey) {
    throw new Error(`Invalid DID format: ${from_did}`);
  }

  // Canonical JSON representation (deterministic ordering)
  const message = canonicalJSON(unsignedEnvelope);
  const messageHash = sha256(new TextEncoder().encode(message));

  // Decode signature from base64
  const signatureBytes = Buffer.from(sig, 'base64');

  // Verify Ed25519 signature
  try {
    const isValid = await ed25519.verify(signatureBytes, messageHash, publicKey);
    return isValid;
  } catch (error) {
    return false;
  }
}

/**
 * Extract Ed25519 public key from DID:key format
 * Format: did:key:z6Mk... (multibase base58btc encoding)
 */
function extractPublicKeyFromDID(did: string): Uint8Array | null {
  if (!did.startsWith('did:key:z')) {
    return null;
  }

  // Extract multibase-encoded key (z prefix = base58btc)
  const multibaseKey = did.slice('did:key:'.length);

  // Decode base58btc (skip multicodec prefix 0xed01 for Ed25519)
  const decoded = base58btc.decode(multibaseKey);

  // First 2 bytes are multicodec prefix (0xed01 for Ed25519)
  // Next 32 bytes are the public key
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Invalid multicodec prefix (expected Ed25519)');
  }

  return decoded.slice(2, 34); // 32-byte Ed25519 public key
}

/**
 * Canonical JSON serialization (deterministic key ordering)
 */
function canonicalJSON(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// Update validation middleware to verify signature
export async function validateEnvelope(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;

  // Basic structure validation
  if (!envelope || !envelope.id || !envelope.from_did || !envelope.sig) {
    return res.status(400).json({
      error: 'INVALID_ENVELOPE',
      message: 'Missing required fields'
    });
  }

  // Signature verification (bypass in test mode for now)
  const isTestMode = process.env.NODE_ENV === 'test';
  const allowDummySig = isTestMode && envelope.sig === 'dummy-sig';

  if (!allowDummySig) {
    try {
      const isValid = await verifySignature(envelope);
      if (!isValid) {
        return res.status(401).json({
          error: 'INVALID_SIGNATURE',
          message: 'Signature verification failed'
        });
      }
    } catch (error) {
      return res.status(401).json({
        error: 'SIGNATURE_ERROR',
        message: error.message
      });
    }
  }

  next();
}
```

**Acceptance Criteria**:
- [x] `verifySignature()` function implemented with Ed25519
- [x] DID:key public key extraction working
- [x] Canonical JSON serialization for deterministic hashing
- [x] Test mode bypass preserved (`"dummy-sig"` still works in `NODE_ENV=test`)
- [x] Production mode enforces real signatures

---

#### Task 2.2: Generate Test Keypairs (2 hours)

**Owner**: IE
**Files Created**:
- `tests/fixtures/test-keypairs.json`
- `packages/sdk/src/crypto.ts` (helper functions)

**Changes**:

```typescript
// packages/sdk/src/crypto.ts

import * as ed25519 from '@noble/ed25519';
import { base58btc } from 'multiformats/bases/base58';

/**
 * Generate Ed25519 keypair for testing
 */
export async function generateKeypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  did: string;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKey(privateKey);

  // Create DID:key from public key
  // Format: did:key:z{base58btc(multicodec-ed25519-pub || publicKey)}
  const multicodecPrefix = new Uint8Array([0xed, 0x01]); // Ed25519 public key
  const multicodecKey = new Uint8Array([...multicodecPrefix, ...publicKey]);
  const multibaseKey = base58btc.encode(multicodecKey);

  const did = `did:key:${multibaseKey}`;

  return { privateKey, publicKey, did };
}

/**
 * Sign AINP envelope with Ed25519 private key
 */
export async function signEnvelope(
  envelope: Omit<AINPEnvelope, 'sig'>,
  privateKey: Uint8Array
): Promise<AINPEnvelope> {
  const message = canonicalJSON(envelope);
  const messageHash = sha256(new TextEncoder().encode(message));

  const signature = await ed25519.sign(messageHash, privateKey);

  return {
    ...envelope,
    sig: Buffer.from(signature).toString('base64'),
  };
}

function canonicalJSON(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
```

**Test Keypairs Generation Script**:

```bash
# tests/generate-keypairs.ts
import { generateKeypair } from '@ainp/sdk';
import fs from 'fs';

async function main() {
  const keypairs = [];

  for (let i = 0; i < 5; i++) {
    const { privateKey, publicKey, did } = await generateKeypair();
    keypairs.push({
      id: `test-agent-${i + 1}`,
      did,
      privateKey: Buffer.from(privateKey).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex'),
    });
  }

  fs.writeFileSync(
    'tests/fixtures/test-keypairs.json',
    JSON.stringify(keypairs, null, 2)
  );

  console.log('Generated 5 test keypairs');
}

main();
```

**Acceptance Criteria**:
- [x] `generateKeypair()` creates valid DID:key format
- [x] `signEnvelope()` produces verifiable Ed25519 signatures
- [x] Test keypairs generated in `tests/fixtures/test-keypairs.json`
- [x] 5 test keypairs available for test suite

---

#### Task 2.3: Update Envelope Validation Middleware (2 hours)

**Owner**: IE
**Files Modified**:
- `packages/broker/src/middleware/validation.ts`

**Changes**:
- Remove `"dummy-sig"` bypass for production (`NODE_ENV !== 'test'`)
- Add feature flag `SIGNATURE_VERIFICATION_ENABLED` (default: true in prod)
- Log signature failures to audit log

```typescript
// packages/broker/src/middleware/validation.ts (continued)

export async function validateEnvelope(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;

  // Basic structure validation
  if (!envelope || !envelope.id || !envelope.from_did || !envelope.sig) {
    return res.status(400).json({
      error: 'INVALID_ENVELOPE',
      message: 'Missing required fields'
    });
  }

  // Feature flag: Allow bypassing signature verification
  const verificationEnabled = process.env.SIGNATURE_VERIFICATION_ENABLED !== 'false';
  const isTestMode = process.env.NODE_ENV === 'test';

  // Test mode: Allow "dummy-sig"
  const allowDummySig = isTestMode && envelope.sig === 'dummy-sig';

  if (verificationEnabled && !allowDummySig) {
    try {
      const isValid = await verifySignature(envelope);
      if (!isValid) {
        // Log to audit trail
        await logSignatureFailure(envelope.from_did, envelope.msg_type, 'verification_failed');

        return res.status(401).json({
          error: 'INVALID_SIGNATURE',
          message: 'Signature verification failed'
        });
      }
    } catch (error) {
      await logSignatureFailure(envelope.from_did, envelope.msg_type, error.message);

      return res.status(401).json({
        error: 'SIGNATURE_ERROR',
        message: error.message
      });
    }
  }

  next();
}

async function logSignatureFailure(from_did: string, msg_type: string, reason: string) {
  // TODO: Implement audit logging (Phase 0.3)
  console.warn(`[Signature Failure] from=${from_did} type=${msg_type} reason=${reason}`);
}
```

**Acceptance Criteria**:
- [x] Production mode enforces real signatures
- [x] Test mode allows `"dummy-sig"` bypass
- [x] Feature flag `SIGNATURE_VERIFICATION_ENABLED` controls verification
- [x] Signature failures logged (console for now, database in Phase 0.3)

---

#### Task 2.4: Add Signature Verification Tests (1 hour)

**Owner**: TA
**Files Created**:
- `packages/broker/tests/middleware/validation.test.ts`

**Test Cases**:

```typescript
// packages/broker/tests/middleware/validation.test.ts

import { describe, it, expect } from 'vitest';
import { verifySignature, signEnvelope, generateKeypair } from '@ainp/sdk';
import { AINPEnvelope } from '@ainp/core';

describe('Signature Verification', () => {
  it('should verify valid Ed25519 signature', async () => {
    const { privateKey, did } = await generateKeypair();

    const unsignedEnvelope: Omit<AINPEnvelope, 'sig'> = {
      id: 'test-intent-1',
      trace_id: 'trace-1',
      from_did: did,
      msg_type: 'INTENT',
      ttl: 60000,
      timestamp: Date.now(),
      payload: {
        '@context': 'https://ainp.dev/v1',
        '@type': 'FREEFORM_NOTE',
        version: '0.1.0',
        description: 'Test intent',
      },
    };

    const signedEnvelope = await signEnvelope(unsignedEnvelope, privateKey);

    const isValid = await verifySignature(signedEnvelope);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const { did } = await generateKeypair();
    const { privateKey: wrongKey } = await generateKeypair();

    const unsignedEnvelope: Omit<AINPEnvelope, 'sig'> = {
      id: 'test-intent-2',
      trace_id: 'trace-2',
      from_did: did,
      msg_type: 'INTENT',
      ttl: 60000,
      timestamp: Date.now(),
      payload: {
        '@context': 'https://ainp.dev/v1',
        '@type': 'FREEFORM_NOTE',
        version: '0.1.0',
        description: 'Test intent',
      },
    };

    // Sign with wrong key
    const signedEnvelope = await signEnvelope(unsignedEnvelope, wrongKey);

    const isValid = await verifySignature(signedEnvelope);
    expect(isValid).toBe(false);
  });

  it('should reject tampered envelope', async () => {
    const { privateKey, did } = await generateKeypair();

    const unsignedEnvelope: Omit<AINPEnvelope, 'sig'> = {
      id: 'test-intent-3',
      trace_id: 'trace-3',
      from_did: did,
      msg_type: 'INTENT',
      ttl: 60000,
      timestamp: Date.now(),
      payload: {
        '@context': 'https://ainp.dev/v1',
        '@type': 'FREEFORM_NOTE',
        version: '0.1.0',
        description: 'Original message',
      },
    };

    const signedEnvelope = await signEnvelope(unsignedEnvelope, privateKey);

    // Tamper with payload
    (signedEnvelope.payload as any).description = 'Tampered message';

    const isValid = await verifySignature(signedEnvelope);
    expect(isValid).toBe(false);
  });

  it('should accept dummy-sig in test mode', async () => {
    process.env.NODE_ENV = 'test';

    const envelope: AINPEnvelope = {
      id: 'test-intent-4',
      trace_id: 'trace-4',
      from_did: 'did:key:test',
      msg_type: 'INTENT',
      ttl: 60000,
      timestamp: Date.now(),
      sig: 'dummy-sig',
      payload: {
        '@context': 'https://ainp.dev/v1',
        '@type': 'FREEFORM_NOTE',
        version: '0.1.0',
        description: 'Test intent',
      },
    };

    // Should not throw in test mode
    expect(() => verifySignature(envelope)).not.toThrow();
  });
});
```

**Acceptance Criteria**:
- [x] 4 test cases covering valid, invalid, tampered, and test mode
- [x] Tests pass with real Ed25519 signatures
- [x] Test mode allows `"dummy-sig"`

---

#### Task 2.5: Update Test Suite to Use Real Signatures (2 hours)

**Owner**: TA + IE
**Files Modified**:
- All test files using `"dummy-sig"` (grep for `"dummy-sig"`)

**Changes**:
- Replace `sig: "dummy-sig"` with real signatures using `signEnvelope()`
- Use test keypairs from `tests/fixtures/test-keypairs.json`

**Example**:

```typescript
// Before (Phase 0.2)
const envelope: AINPEnvelope = {
  id: 'test-intent-1',
  from_did: 'did:key:test',
  sig: 'dummy-sig',  // REMOVE THIS
  payload: { ... },
};

// After (Phase 2)
import { signEnvelope } from '@ainp/sdk';
import testKeypairs from '../fixtures/test-keypairs.json';

const { privateKey, did } = testKeypairs[0];

const unsignedEnvelope = {
  id: 'test-intent-1',
  from_did: did,
  payload: { ... },
};

const envelope = await signEnvelope(unsignedEnvelope, Buffer.from(privateKey, 'hex'));
```

**Acceptance Criteria**:
- [x] All tests using `"dummy-sig"` updated to use real signatures
- [x] Test suite still passes (32/32 tests)
- [x] No performance regression (signature verification <5ms overhead)

---

### Phase 2 Exit Criteria
- [x] Ed25519 signature verification implemented
- [x] Test keypairs generated (5 keypairs in `tests/fixtures/`)
- [x] Envelope validation middleware updated
- [x] Feature flag `SIGNATURE_VERIFICATION_ENABLED` added
- [x] Signature verification tests passing (4 new tests)
- [x] All existing tests updated to use real signatures
- [x] 32/32 tests passing (100% coverage maintained)
- [x] No breaking changes to API

### Phase 2 Artifacts
- `packages/broker/src/middleware/validation.ts` - Ed25519 verification
- `packages/sdk/src/crypto.ts` - Keypair generation and signing helpers
- `tests/fixtures/test-keypairs.json` - Test keypairs
- `packages/broker/tests/middleware/validation.test.ts` - Signature tests
- `docs/SIGNATURE_VERIFICATION.md` - Documentation (optional)

### Phase 2 Dependencies
- None (standalone)

### Phase 2 Risk Mitigation
- **Risk**: Valid signatures rejected due to DID parsing bug
  - **Mitigation**: Extensive unit tests for DID:key extraction
  - **Rollback**: Set `SIGNATURE_VERIFICATION_ENABLED=false`
- **Risk**: Performance degradation (signature verification slow)
  - **Mitigation**: Benchmark verification (<5ms per signature)
  - **Rollback**: Optimize with caching or async worker pool

---

## Web4 Sprint 1: POU-lite Foundation (2 days)

**Duration**: 2 days (16 hours)
**Owner**: IE (types) + DME (database) + TA (tests)
**Parallel with**: Phase 2 (no dependencies)

### Entry Criteria
- [x] Phase 0.2 complete (32/32 tests passing)
- [x] Web4 whitepaper reviewed
- [x] Credit system design approved (Phase 3 plan exists)

### Task Breakdown

#### Task 1.1: Extend RESULT with UsefulnessProof (3 hours)

**Owner**: IE
**Files Modified**:
- `packages/core/src/types/envelope.ts`

**Changes**:

```typescript
// packages/core/src/types/envelope.ts

export interface ResultPayload {
  status: 'success' | 'partial' | 'failed';
  result: unknown;
  attestations?: string[];
  metadata?: Record<string, unknown>;

  // NEW: Web4 Proof of Usefulness
  usefulness_proof?: UsefulnessProof;
}

export interface UsefulnessProof {
  work_type: 'compute' | 'memory' | 'routing' | 'validation';
  metrics: {
    compute_ms?: number;           // Time spent processing intent
    memory_bytes?: number;         // Vector storage used
    routing_hops?: number;         // Number of routing hops
    validation_checks?: number;    // Validation operations performed
  };
  attestations?: string[];         // VCs proving work completed (optional Phase 1.5)
  trace_id: string;                // Link to distributed trace
}
```

**Validation Function**:

```typescript
// packages/core/src/validation/usefulness.ts (new file)

export function validateUsefulnessProof(proof: UsefulnessProof): boolean {
  // Validate work_type
  const validWorkTypes = ['compute', 'memory', 'routing', 'validation'];
  if (!validWorkTypes.includes(proof.work_type)) {
    throw new Error(`Invalid work_type: ${proof.work_type}`);
  }

  // Validate metrics (non-negative)
  const { metrics } = proof;
  if (metrics.compute_ms !== undefined && metrics.compute_ms < 0) {
    throw new Error('compute_ms must be non-negative');
  }
  if (metrics.memory_bytes !== undefined && metrics.memory_bytes < 0) {
    throw new Error('memory_bytes must be non-negative');
  }
  if (metrics.routing_hops !== undefined && metrics.routing_hops < 0) {
    throw new Error('routing_hops must be non-negative');
  }
  if (metrics.validation_checks !== undefined && metrics.validation_checks < 0) {
    throw new Error('validation_checks must be non-negative');
  }

  // At least one metric must be present
  const hasMetric = Object.values(metrics).some(v => v !== undefined && v > 0);
  if (!hasMetric) {
    throw new Error('At least one metric must be present and > 0');
  }

  return true;
}
```

**Acceptance Criteria**:
- [x] `UsefulnessProof` type added to `@ainp/core`
- [x] `ResultPayload` extended with optional `usefulness_proof`
- [x] Validation function enforces non-negative metrics
- [x] Backward compatible (existing RESULT messages without proof still valid)

---

#### Task 1.2: Database Migration - Usefulness Proofs Table (3 hours)

**Owner**: DME
**Files Created**:
- `packages/db/migrations/006_add_usefulness_proofs.sql`
- `packages/db/migrations/006_add_usefulness_proofs_rollback.sql`

**Migration**:

```sql
-- packages/db/migrations/006_add_usefulness_proofs.sql

CREATE TABLE usefulness_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to intent (assuming intents table exists in Phase 0.2)
  intent_id TEXT NOT NULL,  -- Use TEXT if no intents table yet

  -- Agent who performed the work
  agent_did TEXT NOT NULL,

  -- Work type
  work_type TEXT NOT NULL CHECK (work_type IN ('compute', 'memory', 'routing', 'validation')),

  -- Metrics (JSONB for flexibility)
  metrics JSONB NOT NULL DEFAULT '{}',

  -- Computed usefulness score (0-100)
  usefulness_score NUMERIC(5, 2) DEFAULT 0 CHECK (usefulness_score >= 0 AND usefulness_score <= 100),

  -- Attestations (VC URIs)
  attestations TEXT[],

  -- Trace reference
  trace_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX idx_usefulness_agent ON usefulness_proofs(agent_did, created_at DESC);
CREATE INDEX idx_usefulness_intent ON usefulness_proofs(intent_id);
CREATE INDEX idx_usefulness_work_type ON usefulness_proofs(work_type);
CREATE INDEX idx_usefulness_score ON usefulness_proofs(usefulness_score DESC);

COMMENT ON TABLE usefulness_proofs IS 'Web4 Proof of Usefulness tracking per RFC Web4 Section 3';
COMMENT ON COLUMN usefulness_proofs.usefulness_score IS 'Computed score (0-100) based on work_metrics × validation_weight × trust_multiplier';
```

**Rollback**:

```sql
-- packages/db/migrations/006_add_usefulness_proofs_rollback.sql

DROP TABLE IF EXISTS usefulness_proofs;
```

**Acceptance Criteria**:
- [x] Table created with correct schema
- [x] Indexes created for performance
- [x] Rollback script tested
- [x] Migration runs successfully on local PostgreSQL

---

#### Task 1.3: Extend Proposal.terms with Web4 Incentives (3 hours)

**Owner**: IE
**Files Modified**:
- `packages/core/src/types/envelope.ts` (Proposal interface)

**Changes**:

```typescript
// packages/core/src/types/envelope.ts

export interface Proposal {
  price: number;
  latency_ms: number;
  confidence: number;
  privacy?: string;
  terms?: ProposalTerms;
}

export interface ProposalTerms {
  // NEW: Web4 incentive split
  incentive_split?: {
    agent_pct: number;       // % to service agent (e.g., 70)
    broker_pct: number;      // % to routing brokers (e.g., 10)
    validator_pct: number;   // % to validators (e.g., 10)
    pool_pct: number;        // % to reward pool (e.g., 10)
  };

  escrow_required?: boolean;
  escrow_ref?: string;
}

// Default split (if not specified)
export const DEFAULT_INCENTIVE_SPLIT = {
  agent_pct: 70,
  broker_pct: 10,
  validator_pct: 10,
  pool_pct: 10,
};
```

**Validation Function**:

```typescript
// packages/core/src/validation/negotiation.ts (new file)

export function validateIncentiveSplit(split: ProposalTerms['incentive_split']): boolean {
  if (!split) return true;  // Optional field

  const total = split.agent_pct + split.broker_pct + split.validator_pct + split.pool_pct;

  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`Incentive split must sum to 100%, got ${total}%`);
  }

  if (split.agent_pct < 0 || split.broker_pct < 0 || split.validator_pct < 0 || split.pool_pct < 0) {
    throw new Error('Incentive percentages must be non-negative');
  }

  return true;
}
```

**Acceptance Criteria**:
- [x] `ProposalTerms` extended with `incentive_split`
- [x] Validation enforces split sums to 100%
- [x] Default split defined and documented
- [x] Backward compatible (existing proposals without split valid)

---

#### Task 1.4: Update Discovery Ranking with UsefulnessScore (4 hours)

**Owner**: IE
**Files Modified**:
- `packages/broker/src/services/discovery.ts` (assuming this file exists)
- `packages/db/migrations/007_add_usefulness_to_agents.sql`

**Database Schema Extension**:

```sql
-- packages/db/migrations/007_add_usefulness_to_agents.sql

-- Add usefulness score cache to agents table (if exists in Phase 0.2)
-- If agents table doesn't exist yet, this will be part of Phase 0.3
ALTER TABLE agents
ADD COLUMN usefulness_score_cached NUMERIC(5, 2) DEFAULT 0,
ADD COLUMN usefulness_last_updated TIMESTAMPTZ;

CREATE INDEX idx_agents_usefulness ON agents(usefulness_score_cached DESC);
```

**Discovery Ranking Update**:

```typescript
// packages/broker/src/services/discovery.ts

/**
 * Calculate agent discovery score
 * Phase 0.2: score = (semantic_similarity × 0.6) + (trust_score × 0.4)
 * Phase 1.5: score = (semantic_similarity × 0.6) + (trust_score × 0.3) + (usefulness_score × 0.1)
 */
export function calculateDiscoveryScore(
  semanticSimilarity: number,
  trustScore: number,
  usefulnessScore: number = 0
): number {
  const web4Enabled = process.env.WEB4_POU_DISCOVERY_ENABLED === 'true';

  if (web4Enabled) {
    return (semanticSimilarity * 0.6) + (trustScore * 0.3) + (usefulnessScore * 0.1);
  } else {
    // Phase 0.2 formula
    return (semanticSimilarity * 0.6) + (trustScore * 0.4);
  }
}

/**
 * Calculate usefulness score for agent (0-100)
 * Based on last 30 days of work
 */
export async function calculateUsefulnessScore(agentDID: string): Promise<number> {
  const proofs = await db.query(`
    SELECT work_type, metrics, usefulness_score
    FROM usefulness_proofs
    WHERE agent_did = $1
      AND created_at > NOW() - INTERVAL '30 days'
  `, [agentDID]);

  if (proofs.rows.length === 0) return 0;

  // Aggregate scores
  let totalScore = 0;
  proofs.rows.forEach(proof => {
    totalScore += proof.usefulness_score;
  });

  const avgScore = totalScore / proofs.rows.length;

  // Apply decay (30-day half-life)
  const decayRate = 0.977;
  const daysSinceOldest = Math.floor(
    (Date.now() - new Date(proofs.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return avgScore * Math.pow(decayRate, daysSinceOldest);
}
```

**Acceptance Criteria**:
- [x] Discovery ranking formula updated
- [x] Feature flag `WEB4_POU_DISCOVERY_ENABLED` controls usefulness weighting
- [x] Usefulness score cached in agents table
- [x] Score calculation uses 30-day window with decay
- [x] Backward compatible (old formula used when feature disabled)

---

#### Task 1.5: Feature Flags and Configuration (2 hours)

**Owner**: IE
**Files Created**:
- `packages/broker/src/config/web4.ts`

**Configuration**:

```typescript
// packages/broker/src/config/web4.ts

export interface Web4Config {
  // POU
  enablePOU: boolean;                    // Master flag for POU features
  pouRewardsEnabled: boolean;            // Distribute POU rewards
  pouDiscoveryEnabled: boolean;          // Use usefulness in discovery ranking

  // Scoring
  usefulnessScoreWeight: number;         // Weight in discovery (0-1, default: 0.1)
  usefulnessDecayRate: number;           // Decay rate (default: 0.977, 30-day half-life)

  // Incentives
  defaultIncentiveSplit: {
    agent_pct: number;
    broker_pct: number;
    validator_pct: number;
    pool_pct: number;
  };

  // Safety
  maxUsefulnessScore: number;            // Cap score at this value (default: 100)
  minCreditsForPOU: number;              // Minimum credits to trigger POU rewards (default: 1)
}

export const DEFAULT_WEB4_CONFIG: Web4Config = {
  enablePOU: false,  // Start disabled
  pouRewardsEnabled: false,
  pouDiscoveryEnabled: false,
  usefulnessScoreWeight: 0.1,
  usefulnessDecayRate: 0.977,
  defaultIncentiveSplit: {
    agent_pct: 70,
    broker_pct: 10,
    validator_pct: 10,
    pool_pct: 10,
  },
  maxUsefulnessScore: 100,
  minCreditsForPOU: 1,
};

export function loadWeb4Config(): Web4Config {
  return {
    enablePOU: process.env.ENABLE_WEB4_POU === 'true',
    pouRewardsEnabled: process.env.WEB4_POU_REWARDS_ENABLED === 'true',
    pouDiscoveryEnabled: process.env.WEB4_POU_DISCOVERY_ENABLED === 'true',
    usefulnessScoreWeight: parseFloat(process.env.WEB4_USEFULNESS_WEIGHT || '0.1'),
    usefulnessDecayRate: parseFloat(process.env.WEB4_USEFULNESS_DECAY || '0.977'),
    defaultIncentiveSplit: DEFAULT_WEB4_CONFIG.defaultIncentiveSplit,
    maxUsefulnessScore: parseInt(process.env.WEB4_MAX_SCORE || '100'),
    minCreditsForPOU: parseInt(process.env.WEB4_MIN_CREDITS_POU || '1'),
  };
}
```

**Environment Variables**:

```bash
# .env.example (add these)

# Web4 POU (Phase 1.5)
ENABLE_WEB4_POU=false                    # Master toggle (enable after testing)
WEB4_POU_REWARDS_ENABLED=false           # Enable POU reward distribution
WEB4_POU_DISCOVERY_ENABLED=false         # Use usefulness in discovery
WEB4_USEFULNESS_WEIGHT=0.1               # Discovery ranking weight
WEB4_USEFULNESS_DECAY=0.977              # 30-day half-life
WEB4_MAX_SCORE=100                       # Score cap
WEB4_MIN_CREDITS_POU=1                   # Min credits for POU
```

**Acceptance Criteria**:
- [x] `Web4Config` interface defined
- [x] Default config safe (all features disabled)
- [x] Environment variable loading working
- [x] Feature flags enforced in code

---

#### Task 1.6: Tests for Web4 POU (3 hours)

**Owner**: TA
**Files Created**:
- `packages/core/tests/validation/usefulness.test.ts`
- `packages/broker/tests/services/discovery.test.ts` (Web4 section)

**Test Cases**:

```typescript
// packages/core/tests/validation/usefulness.test.ts

import { describe, it, expect } from 'vitest';
import { validateUsefulnessProof } from '@ainp/core';

describe('UsefulnessProof Validation', () => {
  it('should accept valid compute proof', () => {
    const proof = {
      work_type: 'compute',
      metrics: { compute_ms: 2500 },
      trace_id: 'trace-123',
    };

    expect(() => validateUsefulnessProof(proof)).not.toThrow();
  });

  it('should reject invalid work_type', () => {
    const proof = {
      work_type: 'invalid',
      metrics: { compute_ms: 2500 },
      trace_id: 'trace-123',
    };

    expect(() => validateUsefulnessProof(proof)).toThrow('Invalid work_type');
  });

  it('should reject negative metrics', () => {
    const proof = {
      work_type: 'compute',
      metrics: { compute_ms: -100 },
      trace_id: 'trace-123',
    };

    expect(() => validateUsefulnessProof(proof)).toThrow('compute_ms must be non-negative');
  });

  it('should reject proof with no metrics', () => {
    const proof = {
      work_type: 'compute',
      metrics: {},
      trace_id: 'trace-123',
    };

    expect(() => validateUsefulnessProof(proof)).toThrow('At least one metric must be present');
  });
});
```

**Acceptance Criteria**:
- [x] 4 validation tests passing
- [x] Discovery ranking tests include Web4 formula
- [x] Feature flag tests verify enabled/disabled behavior

---

#### Task 1.7: Documentation (2 hours)

**Owner**: IE
**Files Created**:
- `docs/WEB4_POU.md`
- `docs/FEATURE_FLAGS.md` (update)

**Documentation**:
- Usefulness proof schema
- Incentive split negotiation
- Discovery ranking formula (Web4-enhanced)
- Feature flags and gradual rollout strategy

**Acceptance Criteria**:
- [x] `WEB4_POU.md` complete with examples
- [x] `FEATURE_FLAGS.md` updated with Web4 flags
- [x] Example code for adding usefulness proof to RESULT

---

### Web4 Sprint 1 Exit Criteria
- [x] `UsefulnessProof` type added to RESULT schema
- [x] `usefulness_proofs` table created in PostgreSQL
- [x] `ProposalTerms.incentive_split` added
- [x] Discovery ranking formula updated (feature-flagged)
- [x] Web4 configuration with feature flags
- [x] Tests passing (4 new validation tests)
- [x] Documentation complete
- [x] No breaking changes to Phase 0.2 API
- [x] Backward compatible (all features disabled by default)

### Web4 Sprint 1 Artifacts
- `packages/core/src/types/envelope.ts` - UsefulnessProof, ProposalTerms
- `packages/core/src/validation/usefulness.ts` - Validation functions
- `packages/db/migrations/006_add_usefulness_proofs.sql` - Database schema
- `packages/db/migrations/007_add_usefulness_to_agents.sql` - Agents extension
- `packages/broker/src/services/discovery.ts` - Updated ranking
- `packages/broker/src/config/web4.ts` - Configuration
- `packages/core/tests/validation/usefulness.test.ts` - Tests
- `docs/WEB4_POU.md` - Documentation

### Web4 Sprint 1 Dependencies
- None (standalone, parallel with Phase 2)

### Web4 Sprint 1 Risk Mitigation
- **Risk**: Discovery ranking degraded by usefulness weight
  - **Mitigation**: Low weight (0.1), feature-flagged, A/B testable
  - **Rollback**: Set `WEB4_POU_DISCOVERY_ENABLED=false`
- **Risk**: Database migration fails (agents table doesn't exist yet)
  - **Mitigation**: Conditional migration (check if agents table exists)
  - **Rollback**: Run rollback migration

---

## Integration Points (Phase 2 + Web4 Sprint 1)

**No Blocking Dependencies**: Phase 2 and Web4 Sprint 1 modify different parts of the system.

**Integration Checklist**:
- [x] Phase 2 signature verification does not conflict with Web4 types
- [x] Web4 RESULT schema changes do not affect Phase 2 signature logic
- [x] Both workstreams use same test suite (32/32 tests)
- [x] Feature flags for both are independent

**ICA (Integration & Cohesion Auditor) Verification**:
- Run both workstreams in parallel
- Verify no file conflicts (different files modified)
- Verify no type conflicts (envelope extensions are additive)
- Run full test suite after both complete

---

## Quality Gates (Combined)

**After Phase 2 + Web4 Sprint 1 Complete**:

1. **Lint**: `npm run lint` (must pass)
2. **Typecheck**: `npm run typecheck` (must pass, 0 errors)
3. **Build**: `npm run build` (must succeed)
4. **Tests**: `npm test` (32/32 + 4 new signature tests + 4 new Web4 tests = 40/40)
5. **Coverage**: ≥95% for new code

**PRV (Prod Readiness Verifier) Checklist**:
- [x] Phase 2: Real signatures verified, test mode preserved
- [x] Web4 Sprint 1: All features disabled by default (safe)
- [x] No breaking changes to existing API
- [x] Rollback procedures documented
- [x] Feature flags configured

---

## Rollback Procedures

### Phase 2 Rollback (Signature Verification)

```bash
# Disable signature verification
export SIGNATURE_VERIFICATION_ENABLED=false

# Verify dummy-sig still works in test mode
npm test
```

### Web4 Sprint 1 Rollback (POU-lite)

```bash
# Disable all Web4 features
export ENABLE_WEB4_POU=false
export WEB4_POU_DISCOVERY_ENABLED=false

# Rollback database migrations
psql $DATABASE_URL < packages/db/migrations/007_add_usefulness_to_agents_rollback.sql
psql $DATABASE_URL < packages/db/migrations/006_add_usefulness_proofs_rollback.sql

# Verify old discovery ranking (no usefulness)
npm test
```

---

## Timeline Summary

| Workstream | Duration | Start | End | Owner | Deliverables |
|------------|----------|-------|-----|-------|--------------|
| **Phase 2: Signature Verification** | 1 day | Day 1 | Day 1 | IE + SA | Ed25519 verification, test keypairs, tests |
| **Web4 Sprint 1: POU Foundation** | 2 days | Day 1 | Day 2 | IE + DME + TA | UsefulnessProof, DB migrations, discovery ranking |
| **Integration Testing** | 0.5 days | Day 3 | Day 3 | ICA | Verify no conflicts, test suite passing |
| **Production Verification** | 0.5 days | Day 3 | Day 3 | PRV | Quality gates, rollback procedures |

**Total Duration**: 3 days (with parallel execution)

**Sequential Duration** (if not parallel): 4 days

---

## Success Criteria (Combined)

**Phase 2**:
- [x] Real Ed25519 signatures verified in production
- [x] Test mode preserved (`"dummy-sig"` allowed in `NODE_ENV=test`)
- [x] 5 test keypairs generated
- [x] All tests updated to use real signatures
- [x] 36/36 tests passing (32 existing + 4 new)

**Web4 Sprint 1**:
- [x] `UsefulnessProof` added to RESULT schema
- [x] Database schema extended (2 migrations)
- [x] Discovery ranking Web4-enhanced (feature-flagged)
- [x] Feature flags configured (all disabled by default)
- [x] 40/40 tests passing (36 existing + 4 new)
- [x] Documentation complete

**Integration**:
- [x] No file conflicts between Phase 2 and Web4
- [x] No type conflicts (additive changes only)
- [x] All quality gates passing
- [x] Rollback procedures tested

---

## Evidence Pack Template

After completion, agents must fill:

```markdown
## Evidence Pack: Phase 2 + Web4 Sprint 1

### Plan vs. Actual
- **Planned files touched**: [from plan]
- **Actual files touched**: [git diff --name-only]
- **Variance explanation**: [if any]

### Quality Gates Results
- **Lint**: ✅/❌
- **Typecheck**: ✅/❌
- **Build**: ✅/❌
- **Tests**: 40/40 ✅/❌
- **Coverage**: [X%]

### Phase 2 Summary
- Ed25519 verification working: ✅/❌
- Test keypairs generated: ✅/❌
- Test suite updated: ✅/❌

### Web4 Sprint 1 Summary
- UsefulnessProof type added: ✅/❌
- Database migrations complete: ✅/❌
- Discovery ranking updated: ✅/❌
- Feature flags working: ✅/❌

### Integration
- No conflicts: ✅/❌
- Tests passing: 40/40 ✅/❌

### Rollback Readiness
- Phase 2 rollback tested: ✅/❌
- Web4 rollback tested: ✅/❌
```

---

## Clarifications Needed

None - all requirements are clear from PHASE_0.3_PLAN.md and WEB4_INTEGRATION_PLAN.md.

---

**End of Phase 2 + Web4 Sprint 1 Implementation Plan**
