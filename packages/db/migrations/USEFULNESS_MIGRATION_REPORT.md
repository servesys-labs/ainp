# Usefulness Migration Report (Web4 Task 1.2)

**Date:** 2025-10-07
**Migrations:** 006, 007, 008 (rollback)
**Status:** ✅ COMPLETE

## Summary

Successfully implemented database schema for Web4 POU-lite (Proof of Usefulness) system. The migration adds:

1. **usefulness_proofs table**: Stores proof of useful work for economic incentives
2. **Agent usefulness cache**: Adds `usefulness_score_cached` to agents table for fast discovery ranking
3. **Rollback script**: Safe rollback path to Phase 0.2 schema

## Migration Files

### 006_add_usefulness_proofs.sql
- **Status:** ✅ Applied
- **Duration:** < 1 second
- **Changes:**
  - Created `usefulness_proofs` table with 9 columns
  - Added 7 indexes (including GIN index for JSONB metrics)
  - Added CHECK constraints for `work_type` and `usefulness_score`
  - Added FK constraint to `agents(did)` with CASCADE delete

**Schema:**
```sql
CREATE TABLE usefulness_proofs (
  id UUID PRIMARY KEY,
  intent_id UUID NOT NULL,
  agent_did TEXT NOT NULL,
  work_type TEXT CHECK (work_type IN ('compute', 'memory', 'routing', 'validation', 'learning')),
  metrics JSONB NOT NULL DEFAULT '{}',
  attestations TEXT[],
  trace_id TEXT NOT NULL,
  usefulness_score NUMERIC(5, 2) CHECK (usefulness_score >= 0 AND usefulness_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_agent FOREIGN KEY (agent_did) REFERENCES agents(did) ON DELETE CASCADE
);
```

**Indexes:**
- `idx_usefulness_agent` (agent_did, created_at DESC) - Agent history queries
- `idx_usefulness_intent` (intent_id) - Intent lookups
- `idx_usefulness_work_type` (work_type) - Work type filtering
- `idx_usefulness_score` (usefulness_score DESC) - Score-based ranking
- `idx_usefulness_trace` (trace_id) - Traceability
- `idx_usefulness_agent_score` (agent_did, usefulness_score DESC, created_at DESC) - Leaderboard
- `idx_usefulness_metrics` GIN (metrics) - JSONB queries

### 007_add_usefulness_to_agents.sql
- **Status:** ✅ Applied (modified from spec)
- **Duration:** < 1 second
- **Changes:**
  - Added `usefulness_score_cached NUMERIC(5,2)` to agents table
  - Added `usefulness_last_updated TIMESTAMPTZ` to agents table
  - Created `idx_agents_usefulness` index on usefulness_score_cached

**Note:** Original spec included `trust_score DESC` in composite index, but trust scores are in separate `trust_scores` table (normalized schema). Index simplified to single column for usefulness ranking.

### 008_rollback_usefulness.sql
- **Status:** ✅ Tested and verified
- **Duration:** < 1 second
- **Rollback Strategy:**
  - Drops all indexes first
  - Drops columns from agents table
  - Drops usefulness_proofs table last
  - Uses `IF EXISTS` for idempotency

**Rollback Test:** Successfully dropped all schema additions and restored cleanly.

## Verification Results

All 10 verification tests passed:

```
✅ Test 1: usefulness_proofs table exists
✅ Test 2: usefulness_proofs has correct columns (9)
✅ Test 3: usefulness_proofs has required indexes (7+)
✅ Test 4: usefulness_proofs has FK to agents
✅ Test 5: work_type CHECK constraint exists
✅ Test 6: usefulness_score CHECK constraint exists
✅ Test 7: agents has usefulness_score_cached column
✅ Test 8: agents has usefulness_last_updated column
✅ Test 9: agents has idx_agents_usefulness index
✅ Test 10: usefulness_proofs has GIN index on metrics
```

## Database Impact Analysis

### Volume Estimates
- **Initial state:** 0 rows (new table)
- **Expected growth:** ~1000 proofs/day per active agent
- **30-day retention:** ~30K proofs per agent (if tracking all work)
- **Index overhead:** ~2-3x table size for 7 indexes + GIN

### Performance Considerations
- **Write performance:** Minimal impact (single INSERT per proof)
- **Read performance:** Optimized with targeted indexes
- **JSONB queries:** GIN index enables fast metrics filtering
- **Cascade deletes:** Automatic cleanup when agents are removed
- **Cache strategy:** `usefulness_score_cached` reduces joins for discovery API

### Storage Requirements
- **Row size estimate:** ~200-500 bytes per proof (depends on metrics JSONB size)
- **30K proofs:** ~6-15 MB per agent
- **100 agents:** ~600 MB - 1.5 GB for 30 days
- **Indexes:** Add 2-3x (1.8 - 4.5 GB total)

## Query Patterns Supported

### 1. Agent Leaderboard
```sql
SELECT agent_did, AVG(usefulness_score) as avg_score, COUNT(*) as proof_count
FROM usefulness_proofs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY agent_did
ORDER BY avg_score DESC
LIMIT 10;
```
Uses: `idx_usefulness_agent_score`

### 2. Work Type Analysis
```sql
SELECT work_type, AVG(usefulness_score) as avg_score, COUNT(*) as count
FROM usefulness_proofs
WHERE agent_did = 'did:key:...'
GROUP BY work_type;
```
Uses: `idx_usefulness_work_type`, `idx_usefulness_agent`

### 3. Discovery Ranking (Fast Path)
```sql
SELECT a.did, a.usefulness_score_cached
FROM agents a
WHERE a.usefulness_score_cached > 70
ORDER BY a.usefulness_score_cached DESC
LIMIT 20;
```
Uses: `idx_agents_usefulness`

### 4. JSONB Metrics Query
```sql
SELECT agent_did, metrics->>'compute_ms' as compute_time
FROM usefulness_proofs
WHERE metrics ? 'compute_ms'
  AND (metrics->>'compute_ms')::int > 1000;
```
Uses: `idx_usefulness_metrics` (GIN)

### 5. Intent Proof Lookup
```sql
SELECT * FROM usefulness_proofs
WHERE intent_id = '...'
ORDER BY created_at DESC;
```
Uses: `idx_usefulness_intent`

## Rollback Procedure

If issues arise:

```bash
# 1. Backup current data (if needed)
pg_dump -t usefulness_proofs $DATABASE_URL > usefulness_backup.sql

# 2. Apply rollback
psql $DATABASE_URL -f packages/db/migrations/008_rollback_usefulness.sql

# 3. Verify rollback
psql $DATABASE_URL -c "\d usefulness_proofs"
# Expected: "Did not find any relation named 'usefulness_proofs'"

# 4. Restart services
```

## Acceptance Criteria

| Criteria | Status | Evidence |
|----------|--------|----------|
| Migration 006 creates usefulness_proofs table | ✅ | verify_usefulness.sql Test 1 |
| Proper constraints (CHECK, FK) | ✅ | verify_usefulness.sql Tests 4-6 |
| 7 indexes created | ✅ | verify_usefulness.sql Test 3 |
| Migration 007 adds agent columns | ✅ | verify_usefulness.sql Tests 7-9 |
| Migration 008 rollback works | ✅ | Tested manually |
| JSONB metrics flexible storage | ✅ | GIN index created, tested queries |
| Foreign key referential integrity | ✅ | FK constraint with CASCADE |
| Documentation updated | ✅ | migrations/README.md |

## Next Steps

1. **Phase 0.3 Task 1.3**: Implement usefulness calculation service
   - Read from usefulness_proofs table
   - Calculate 30-day rolling average
   - Update agents.usefulness_score_cached

2. **Phase 0.3 Task 1.4**: Update discovery API to use usefulness ranking
   - Sort by `usefulness_score_cached DESC`
   - Combine with trust_scores for composite ranking

3. **Data Retention Policy**: Implement cleanup job
   - Archive proofs older than 90 days
   - Keep aggregated statistics

## Lessons Learned

1. **Schema Normalization**: Trust scores in separate table required index adjustment
2. **Idempotency**: All migrations use `IF NOT EXISTS`/`IF EXISTS` for safe re-runs
3. **JSONB Flexibility**: GIN indexes enable fast metrics queries without schema migrations
4. **Cascade Deletes**: Automatic cleanup simplifies agent lifecycle management

## Files Changed

- `packages/db/migrations/006_add_usefulness_proofs.sql` (new)
- `packages/db/migrations/007_add_usefulness_to_agents.sql` (new, modified)
- `packages/db/migrations/008_rollback_usefulness.sql` (new)
- `packages/db/migrations/README.md` (updated)
- `packages/db/migrations/verify_usefulness.sql` (new)
- `packages/db/src/usefulness-migration.test.ts` (new)

## Related Issues

- Phase 0.3 Planning: Web4 POU-lite implementation
- FEATURE_MAP.md: Usefulness proof system activated
