# Negotiation Data Model (Phase 4.1)

## Overview

The negotiation data model supports multi-round negotiation protocol where agents negotiate terms before accepting work. This enables dynamic price discovery, SLA negotiation, and economic coordination.

## State Machine

```
initiated → proposed → counter_proposed → {accepted | rejected | expired}
```

**States:**
- `initiated`: Initial proposal sent by initiator
- `proposed`: First counter-proposal from responder
- `counter_proposed`: Further negotiation rounds (2+)
- `accepted`: Final agreement reached, work can begin
- `rejected`: Negotiation failed, no agreement
- `expired`: Timeout exceeded before agreement

## Schema Details

### negotiations Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique session identifier |
| intent_id | UUID | NOT NULL | Related intent request |
| initiator_did | TEXT | NOT NULL | Requester agent DID |
| responder_did | TEXT | NOT NULL | Provider agent DID |
| state | TEXT | NOT NULL, CHECK (valid states) | Current negotiation state |
| rounds | JSONB | NOT NULL, DEFAULT '[]' | Array of negotiation rounds |
| convergence_score | NUMERIC(3,2) | CHECK (0.0-1.0) | Proximity to agreement |
| current_proposal | JSONB | - | Latest proposal |
| final_proposal | JSONB | - | Accepted proposal |
| incentive_split | JSONB | DEFAULT (70/10/10/10) | Economic terms |
| max_rounds | INTEGER | DEFAULT 10, CHECK (1-20) | Round limit |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Start timestamp |
| expires_at | TIMESTAMPTZ | NOT NULL | Hard deadline |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update (auto) |

### Indexes

1. **idx_negotiations_intent** - Find negotiations for an intent
2. **idx_negotiations_initiator** - Agent's initiated negotiations
3. **idx_negotiations_responder** - Agent's responded negotiations
4. **idx_negotiations_state** - Filter by state (active/pending)
5. **idx_negotiations_expires** - Expiration cleanup (partial index)
6. **idx_negotiations_convergence** - High-convergence analysis

## Data Flow

### 1. Negotiation Initiation

```sql
INSERT INTO negotiations (
  intent_id,
  initiator_did,
  responder_did,
  state,
  expires_at,
  current_proposal,
  rounds
) VALUES (
  'uuid-here',
  'did:key:initiator',
  'did:key:responder',
  'initiated',
  NOW() + INTERVAL '1 hour',
  '{"max_credits": 100, "timeout_ms": 30000}',
  '[{"round": 1, "proposal": {"max_credits": 100}, "timestamp": "2025-10-07T12:00:00Z"}]'
);
```

### 2. Counter-Proposal

```sql
UPDATE negotiations
SET
  state = 'proposed',
  current_proposal = '{"max_credits": 80, "timeout_ms": 30000}',
  rounds = rounds || '[{"round": 2, "proposal": {"max_credits": 80}, "timestamp": "2025-10-07T12:01:00Z"}]'::jsonb,
  convergence_score = 0.5
WHERE id = 'negotiation-uuid';
```

### 3. Accept Negotiation

```sql
UPDATE negotiations
SET
  state = 'accepted',
  final_proposal = current_proposal,
  convergence_score = 1.0
WHERE id = 'negotiation-uuid';
```

### 4. Expire Stale Negotiations

```sql
-- Manual expiration
SELECT expire_stale_negotiations();

-- Or with cron job:
-- 0 * * * * psql $DATABASE_URL -c "SELECT expire_stale_negotiations();"
```

## Query Patterns

### Find Active Negotiations for Agent

```sql
-- As initiator
SELECT * FROM negotiations
WHERE initiator_did = 'did:key:agent'
  AND state NOT IN ('accepted', 'rejected', 'expired')
ORDER BY created_at DESC;

-- As responder
SELECT * FROM negotiations
WHERE responder_did = 'did:key:agent'
  AND state NOT IN ('accepted', 'rejected', 'expired')
ORDER BY created_at DESC;
```

### Find High-Convergence Negotiations

```sql
SELECT
  id,
  initiator_did,
  responder_did,
  convergence_score,
  ARRAY_LENGTH(rounds::jsonb, 1) as round_count
FROM negotiations
WHERE state = 'counter_proposed'
  AND convergence_score > 0.8
ORDER BY convergence_score DESC
LIMIT 10;
```

### Negotiation Success Rate by Agent

```sql
SELECT
  initiator_did,
  COUNT(*) FILTER (WHERE state = 'accepted') as accepted,
  COUNT(*) FILTER (WHERE state = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE state = 'expired') as expired,
  ROUND(
    COUNT(*) FILTER (WHERE state = 'accepted')::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as success_rate_pct
FROM negotiations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY initiator_did
ORDER BY success_rate_pct DESC;
```

### Average Negotiation Rounds

```sql
SELECT
  AVG(jsonb_array_length(rounds)) as avg_rounds,
  state
FROM negotiations
WHERE state IN ('accepted', 'rejected')
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY state;
```

## JSONB Schema Examples

### rounds Array

```json
[
  {
    "round": 1,
    "proposal": {
      "max_credits": 100,
      "timeout_ms": 30000,
      "sla": {"response_time_ms": 1000}
    },
    "timestamp": "2025-10-07T12:00:00Z",
    "from": "did:key:initiator"
  },
  {
    "round": 2,
    "proposal": {
      "max_credits": 80,
      "timeout_ms": 30000,
      "sla": {"response_time_ms": 1500}
    },
    "timestamp": "2025-10-07T12:01:00Z",
    "from": "did:key:responder"
  }
]
```

### incentive_split Object

```json
{
  "agent": 0.70,      // 70% to executing agent
  "broker": 0.10,     // 10% to discovery broker
  "validator": 0.10,  // 10% to POU validator
  "pool": 0.10        // 10% to protocol pool
}
```

### current_proposal / final_proposal

```json
{
  "max_credits": 80,
  "timeout_ms": 30000,
  "sla": {
    "response_time_ms": 1500,
    "availability_pct": 99.9
  },
  "penalties": {
    "late_response": 0.1,  // 10% penalty
    "timeout": 0.2         // 20% penalty
  }
}
```

## Performance Considerations

### Index Usage

- **Intent lookups**: O(log N) via idx_negotiations_intent
- **Agent history**: O(log N) via idx_negotiations_initiator/responder
- **State filtering**: O(log N) via idx_negotiations_state
- **Expiration cleanup**: O(log M) via partial index (only non-terminal states)

### Query Optimization

1. **Always filter by state** when looking for active negotiations
2. **Use partial indexes** for expiration queries (smaller index size)
3. **JSONB GIN indexes** can be added later if needed for proposal queries
4. **Composite indexes** available for convergence analysis

### Write Performance

- Auto-updating timestamp trigger adds ~0.1ms overhead
- JSONB append operation (rounds array) is efficient for < 20 rounds
- Partial indexes reduce write overhead for terminal states

## Maintenance

### Expiration Cleanup

Run periodically (recommended: hourly):

```bash
psql $DATABASE_URL -c "SELECT expire_stale_negotiations();"
```

Or setup cron job:

```bash
# Add to crontab
0 * * * * psql $DATABASE_URL -c "SELECT expire_stale_negotiations();"
```

### Archive Old Negotiations

Recommended after 90 days:

```sql
-- Archive to separate table (if needed)
CREATE TABLE negotiations_archive AS
SELECT * FROM negotiations
WHERE created_at < NOW() - INTERVAL '90 days'
  AND state IN ('accepted', 'rejected', 'expired');

-- Delete archived records
DELETE FROM negotiations
WHERE created_at < NOW() - INTERVAL '90 days'
  AND state IN ('accepted', 'rejected', 'expired');
```

## Monitoring Queries

### Current Negotiation Stats

```sql
SELECT
  state,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds
FROM negotiations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY state;
```

### Expiration Rate

```sql
SELECT
  COUNT(*) FILTER (WHERE state = 'expired') as expired,
  COUNT(*) FILTER (WHERE state IN ('accepted', 'rejected')) as completed,
  ROUND(
    COUNT(*) FILTER (WHERE state = 'expired')::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as expiration_rate_pct
FROM negotiations
WHERE created_at > NOW() - INTERVAL '7 days';
```

## Migration Commands

### Apply Migration

```bash
psql $DATABASE_URL -f packages/db/migrations/004_add_negotiation_sessions.sql
```

### Verify Migration

```bash
psql $DATABASE_URL -f packages/db/migrations/verify_negotiation_sessions.sql
```

### Rollback Migration

```bash
psql $DATABASE_URL -f packages/db/migrations/011_rollback_negotiation_sessions.sql
```

## Related Documentation

- [Migration README](./README.md)
- [Schema Documentation](../schema.sql)
- [Phase 4.1 Spec](../../../docs/PHASE_0.3_PLAN.md) (if exists)
