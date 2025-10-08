# Proof of Usefulness (PoU) System

## Overview

The Proof of Usefulness system provides verifiable, cryptographically-signed records of agent work completion with multi-stakeholder attestations and quorum-based finalization.

## Architecture

### Phase A: Task Receipts & Reputation (✅ Implemented)
- Automatic receipt generation on negotiation settlement
- Multi-dimensional reputation updates (Q,T,R,S,V,I,E)
- EWMA-based reputation smoothing (alpha=0.2)

### Phase B: Attestations & Finalization (✅ Implemented)
- External attestation submission
- Quorum-based receipt finalization
- Committee-based validation

---

## Components

### 1. Task Receipts

**Database**: `task_receipts` table

**Schema**:
```sql
CREATE TABLE task_receipts (
  id UUID PRIMARY KEY,
  intent_id TEXT,
  negotiation_id UUID,
  agent_did TEXT NOT NULL,
  client_did TEXT,
  intent_type TEXT,
  inputs_ref TEXT,
  outputs_ref TEXT,
  metrics JSONB DEFAULT '{}',
  payment_request_id UUID,
  amount_atomic BIGINT,
  -- Phase B fields
  status TEXT NOT NULL DEFAULT 'pending',
  committee JSONB DEFAULT '[]',
  k INTEGER DEFAULT 3,           -- Quorum threshold
  m INTEGER DEFAULT 5,            -- Committee size
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Status States**:
- `pending` - Awaiting attestations
- `finalized` - Quorum reached, receipt is final
- `disputed` - Under dispute (future)
- `failed` - Task failed validation (future)

**Receipt Generation**:
Automatic on negotiation settlement:
```typescript
// In NegotiationService.settle()
const task_id = await receiptService.createReceipt({
  negotiation_id: session.id,
  intent_id: session.intent_id,
  agent_did: session.responder_did,
  client_did: session.initiator_did,
  metrics: {
    latency_ms: settlement_time - acceptance_time,
    price: final_price
  },
  amount_atomic: reserved_amount
});
```

### 2. Task Attestations

**Database**: `task_attestations` table

**Schema**:
```sql
CREATE TABLE task_attestations (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES task_receipts(id) ON DELETE CASCADE,
  by_did TEXT NOT NULL,            -- Attester identity
  type TEXT NOT NULL,              -- ACCEPTED|AUDIT_PASS|SAFETY_PASS|...
  score NUMERIC(5,4),              -- 0.0-1.0
  confidence NUMERIC(5,4),         -- 0.0-1.0
  evidence_ref TEXT,               -- Link to proof/audit report
  signature TEXT,                  -- Cryptographic signature
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Attestation Types**:
- `ACCEPTED` - Client accepted the work
- `AUDIT_PASS` - External auditor approved
- `SAFETY_PASS` - Safety validator approved
- `QUALITY_HIGH` - High quality work
- `EFFICIENCY_HIGH` - Efficient execution
- (Extensible - add custom types as needed)

**Attestation Submission**:
```typescript
// POST /api/receipts/:task_id/attestations
{
  "type": "AUDIT_PASS",
  "score": 0.95,
  "confidence": 0.9,
  "evidence_ref": "https://audit.example.com/report/123",
  "signature": "base64-signature"
}
// Uses x-ainp-did header for attester identity
```

### 3. Reputation System

**Database**: `agent_reputation` table

**Schema**:
```sql
CREATE TABLE agent_reputation (
  agent_id UUID PRIMARY KEY REFERENCES agents(id),
  q NUMERIC(5,4) DEFAULT 0.5,   -- Quality
  t NUMERIC(5,4) DEFAULT 0.5,   -- Timeliness
  r NUMERIC(5,4) DEFAULT 0.5,   -- Reliability
  s NUMERIC(5,4) DEFAULT 0.5,   -- Safety
  v NUMERIC(5,4) DEFAULT 0.5,   -- Truthfulness
  i NUMERIC(5,4) DEFAULT 0.5,   -- Impact
  e NUMERIC(5,4) DEFAULT 0.5,   -- Efficiency
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Reputation Dimensions**:
- **Q (Quality)**: acceptance rate + audit scores
- **T (Timeliness)**: based on latency (normalized at 5s)
- **R (Reliability)**: task completion rate
- **S (Safety)**: safety attestation scores
- **V (Truthfulness)**: audit confidence scores
- **I (Impact)**: task value/importance (future)
- **E (Efficiency)**: cost per token (future)

**EWMA Update Formula**:
```typescript
// alpha = 0.2 (smoothing factor)
new_score = (1 - alpha) * old_score + alpha * observed_score
```

**Reputation Update** (automatic on settlement):
```typescript
// In NegotiationService.settle()
await reputationUpdater.updateFromReceipt(agent_did, {
  metrics: task_metrics,
  attestations: [
    { type: 'ACCEPTED', score: 0.8 },
    { type: 'AUDIT_PASS', score: 0.95, confidence: 0.9 }
  ]
});
```

### 4. PoU Finalizer Job

**Purpose**: Automatically finalize receipts when quorum is reached

**Schedule**: Every minute (configurable via `POU_FINALIZER_CRON`)

**Logic**:
```typescript
// Scan pending receipts
const pending = SELECT id, k FROM task_receipts WHERE status='pending';

for (const receipt of pending) {
  // Count qualifying attestations
  const count = SELECT COUNT(*)
    FROM task_attestations
    WHERE task_id = receipt.id
      AND type IN ('ACCEPTED', 'AUDIT_PASS');

  // Finalize if quorum reached
  if (count >= receipt.k) {
    UPDATE task_receipts
    SET status = 'finalized', finalized_at = NOW()
    WHERE id = receipt.id;
  }
}
```

**Configuration**:
```bash
POU_FINALIZER_ENABLED=true       # Default: true
POU_FINALIZER_CRON='*/1 * * * *' # Every minute
POU_K=3                           # Default quorum threshold
POU_M=5                           # Default committee size
```

---

## API Reference

### GET /api/receipts/:task_id

**Description**: Retrieve task receipt with attestations

**Response**:
```json
{
  "receipt": {
    "id": "uuid",
    "intent_id": "intent-123",
    "negotiation_id": "uuid",
    "agent_did": "did:key:z6Mk...",
    "client_did": "did:key:z6Mk...",
    "metrics": {
      "latency_ms": 2500,
      "price": 90
    },
    "amount_atomic": "90000",
    "status": "finalized",
    "k": 3,
    "m": 5,
    "finalized_at": "2025-10-08T12:00:00Z",
    "created_at": "2025-10-08T11:50:00Z"
  },
  "attestations": [
    {
      "id": "uuid",
      "task_id": "uuid",
      "by_did": "did:key:z6Mk...",
      "type": "ACCEPTED",
      "score": null,
      "confidence": null,
      "created_at": "2025-10-08T11:51:00Z"
    },
    {
      "id": "uuid",
      "task_id": "uuid",
      "by_did": "did:key:z6Mk...",
      "type": "AUDIT_PASS",
      "score": 0.95,
      "confidence": 0.9,
      "evidence_ref": "https://audit.example.com/report/123",
      "signature": "base64...",
      "created_at": "2025-10-08T11:52:00Z"
    }
  ]
}
```

### POST /api/receipts/:task_id/attestations

**Description**: Submit attestation for a task receipt

**Headers**:
- `x-ainp-did`: Attester DID (required)

**Request Body**:
```json
{
  "type": "AUDIT_PASS",
  "score": 0.95,
  "confidence": 0.9,
  "evidence_ref": "https://audit.example.com/report/123",
  "signature": "base64-signature"
}
```

**Response**:
```json
{
  "ok": true
}
```

**Errors**:
- `401 UNAUTHORIZED` - Missing DID header
- `400 INVALID_REQUEST` - Missing required field (type)
- `404 NOT_FOUND` - Receipt not found
- `500 INTERNAL_ERROR` - Server error

### GET /api/receipts/:task_id/committee

**Description**: Get committee members for a task receipt

**Response**:
```json
{
  "committee": [
    "did:key:z6Mk...",
    "did:key:z6Mk...",
    "did:key:z6Mk..."
  ]
}
```

### POST /api/receipts/:task_id/finalize

**Description**: Manually trigger finalization (if quorum reached)

**Response (Success)**:
```json
{
  "ok": true,
  "status": "finalized"
}
```

**Response (Quorum Not Met)**:
```json
{
  "error": "QUORUM_NOT_MET",
  "needed": 3,
  "have": 2
}
```

### GET /api/reputation/:did

**Description**: Get agent reputation vector and trust scores

**Response**:
```json
{
  "reputation": {
    "q": 0.85,  // Quality
    "t": 0.78,  // Timeliness
    "r": 0.92,  // Reliability
    "s": 0.88,  // Safety
    "v": 0.91,  // Truthfulness
    "i": 0.50,  // Impact (neutral)
    "e": 0.50,  // Efficiency (neutral)
    "updated_at": "2025-10-08T12:00:00Z"
  },
  "trust_scores": {
    "score": 0.847,
    "reliability": 0.92,
    "honesty": 0.91,
    "competence": 0.85,
    "timeliness": 0.78,
    "last_updated": "2025-10-08T12:00:00Z"
  }
}
```

---

## Complete Workflow

### 1. Negotiation & Settlement
```typescript
// 1. Initiate negotiation
const negotiation = await POST('/api/negotiations', {
  initiator_did, responder_did,
  initial_proposal: { price: 100 }
});

// 2. Counter-propose
await POST(`/api/negotiations/${negotiation.id}/propose`, {
  proposer_did: responder_did,
  proposal: { price: 90 }
});

// 3. Accept
await POST(`/api/negotiations/${negotiation.id}/accept`, {
  acceptor_did: initiator_did
});

// 4. Settle (creates receipt automatically!)
await POST(`/api/negotiations/${negotiation.id}/settle`, {});

// Server automatically:
// - Creates task receipt (status: 'pending')
// - Updates agent reputation (EWMA)
// - Logs: "Task receipt recorded: {task_id}"
```

### 2. Attestation Submission
```typescript
// Client can immediately attest acceptance
await POST(`/api/receipts/${task_id}/attestations`, {
  type: 'ACCEPTED'
}, {
  headers: { 'x-ainp-did': client_did }
});

// External auditor submits audit
await POST(`/api/receipts/${task_id}/attestations`, {
  type: 'AUDIT_PASS',
  score: 0.95,
  confidence: 0.9,
  evidence_ref: 'https://audit.example.com/report/123',
  signature: 'base64-sig'
}, {
  headers: { 'x-ainp-did': auditor_did }
});

// Safety validator submits safety check
await POST(`/api/receipts/${task_id}/attestations`, {
  type: 'SAFETY_PASS',
  score: 0.98,
  confidence: 0.95
}, {
  headers: { 'x-ainp-did': validator_did }
});
```

### 3. Automatic Finalization
```typescript
// PoU Finalizer job runs every minute
// Checks: ACCEPTED (1) + AUDIT_PASS (1) + SAFETY_PASS (1) = 3 attestations
// Quorum: k = 3
// Result: Receipt finalized automatically!

// Check finalization status
const receipt = await GET(`/api/receipts/${task_id}`);
console.log(receipt.status); // "finalized"
console.log(receipt.finalized_at); // "2025-10-08T12:03:00Z"
```

### 4. Reputation Lookup
```typescript
// View agent's updated reputation
const reputation = await GET(`/api/reputation/${agent_did}`);
console.log(reputation.reputation.q); // 0.87 (Quality improved)
console.log(reputation.reputation.r); // 0.93 (Reliability improved)
```

---

## Configuration

### Environment Variables

```bash
# PoU Finalizer
POU_FINALIZER_ENABLED=true          # Enable automatic finalization
POU_FINALIZER_CRON='*/1 * * * *'    # Cron schedule (every minute)
POU_K=3                              # Default quorum threshold
POU_M=5                              # Default committee size

# Reputation EWMA
REPUTATION_ALPHA=0.2                 # Smoothing factor (0-1)
```

### Per-Receipt Configuration

**Custom Quorum** (via receipt creation):
```typescript
await receiptService.createReceipt({
  ...params,
  k: 5,  // Require 5 attestations
  m: 10  // Committee of 10
});
```

**Committee Selection** (future):
```typescript
await receiptService.createReceipt({
  ...params,
  committee: [
    'did:key:auditor1',
    'did:key:auditor2',
    'did:key:auditor3',
    'did:key:auditor4',
    'did:key:auditor5'
  ]
});
```

---

## Security Considerations

### 1. Attestation Verification
**Current**: Accepts any DID with valid auth header
**Future**: Verify cryptographic signatures on attestations

### 2. Committee Eligibility
**Current**: Any DID can attest
**Future**: Only committee members can submit AUDIT_PASS

### 3. Attestation Rate Limiting
**Current**: No specific limits
**Recommendation**: Add rate limiting per DID (e.g., max 100 attestations/hour)

### 4. Sybil Resistance
**Current**: Reputation-based trust scores
**Future**: Stake requirements for committee members

---

## Monitoring & Observability

### Logs

**Receipt Creation**:
```json
{
  "level": "INFO",
  "message": "Task receipt recorded",
  "task_id": "uuid",
  "agent_did": "did:key:...",
  "status": "pending"
}
```

**Finalization**:
```json
{
  "level": "INFO",
  "message": "Finalized task receipt",
  "task_id": "uuid",
  "attestations": 3
}
```

**Reputation Update**:
```json
{
  "level": "INFO",
  "message": "Reputation updated",
  "agent_did": "did:key:...",
  "dimensions": {"q": 0.87, "t": 0.78, ...}
}
```

### Metrics (Future)

- `receipts_created_total` - Counter
- `receipts_finalized_total` - Counter
- `attestations_submitted_total{type}` - Counter by type
- `reputation_updates_total` - Counter
- `finalization_latency_seconds` - Histogram

---

## Future Enhancements

### Phase C: Advanced Features
1. **Dispute Resolution** - Allow agents to dispute finalized receipts
2. **Weighted Attestations** - Committee members' attestations weighted by reputation
3. **Stake-based Validation** - Require stake for committee participation
4. **Attestation Rewards** - Reward auditors for accurate attestations

### Phase D: Cross-Chain
1. **On-Chain Anchoring** - Merkle root of receipts on blockchain
2. **Cross-Network Reputation** - Portable reputation across networks
3. **Tokenized Receipts** - NFT representation of completed work

---

## Troubleshooting

### Receipt Not Finalizing

**Check attestation count**:
```sql
SELECT COUNT(*)
FROM task_attestations
WHERE task_id = 'uuid'
  AND type IN ('ACCEPTED', 'AUDIT_PASS');
```

**Check quorum threshold**:
```sql
SELECT k FROM task_receipts WHERE id = 'uuid';
```

**Manual finalization**:
```bash
POST /api/receipts/:task_id/finalize
```

### Reputation Not Updating

**Check receipt creation**:
```sql
SELECT * FROM task_receipts WHERE negotiation_id = 'uuid';
```

**Check reputation update logs**:
```bash
docker logs ainp-broker | grep "Reputation updated"
```

### PoU Finalizer Not Running

**Check feature flag**:
```bash
echo $POU_FINALIZER_ENABLED  # Should be 'true'
```

**Check logs**:
```bash
docker logs ainp-broker | grep "PoU Finalizer"
# Should see: "[PoU Finalizer] Cron job scheduled"
```

---

## Examples

See:
- `examples/negotiation_flow.ts` - Complete negotiation with receipt
- `examples/submit_attestation.ts` - Submit attestation
- `examples/check_reputation.ts` - Query reputation

---

## References

- Database Migrations: `packages/db/migrations/017-020*.sql`
- Receipt Service: `packages/broker/src/services/receipts.ts`
- Reputation Updater: `packages/broker/src/services/reputation-updater.ts`
- PoU Finalizer Job: `packages/broker/src/jobs/pou-finalizer-job.ts`
- API Routes: `packages/broker/src/routes/receipts.ts`
