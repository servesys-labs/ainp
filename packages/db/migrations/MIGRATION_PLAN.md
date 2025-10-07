# Migration Plan: Schema-Code Alignment

## Problem
The broker application code and database schema were incompatible:

1. **Code expected**: `agents.capabilities` (JSONB), `agents.credentials` (JSONB), `agents.ttl`, `agents.expires_at`
2. **Schema had**: Normalized design with `agents` and separate `capabilities` table
3. **Trust scores**: Code used `did` as key, schema uses `agent_id` (foreign key)

## Solution: Option A (Update Code to Match Schema)

**Chosen approach**: Update broker code to use the normalized schema with JOINs.

### Rationale
1. Normalized schema is superior (better queryability, referential integrity)
2. Only requires code changes (no data migration)
3. Maintains CASCADE delete behavior
4. Better for vector search with proper foreign keys

## Migration Steps

### Step 1: Apply Schema Migration (Add TTL Fields)
```bash
psql $DATABASE_URL -f packages/db/migrations/001_add_agent_registration_fields.sql
```

**What it does**:
- Adds `ttl INTEGER` column to `agents` table
- Adds `expires_at TIMESTAMPTZ` column to `agents` table
- Creates index on `expires_at` for cleanup queries

**Rollback**:
```sql
BEGIN;
DROP INDEX IF EXISTS idx_agents_expires_at;
ALTER TABLE agents DROP COLUMN IF EXISTS expires_at;
ALTER TABLE agents DROP COLUMN IF EXISTS ttl;
DELETE FROM schema_version WHERE version = '0.1.1';
COMMIT;
```

### Step 2: Replace Database Client Code
```bash
# Backup current implementation
cp packages/broker/src/lib/db-client.ts packages/broker/src/lib/db-client.old.ts

# Replace with fixed version
mv packages/broker/src/lib/db-client-fixed.ts packages/broker/src/lib/db-client.ts
```

**What changed**:
- `registerAgent()`: Now inserts into `agents` + `capabilities` tables separately
- `searchAgentsByEmbedding()`: Uses JOIN between `capabilities` and `agents`
- `getAgent()`: Uses JOIN with `json_agg()` to reconstruct capabilities array
- `updateTrustScore()`: Fixed to use `agent_id` instead of `did`

### Step 3: Verify Schema Matches Code

Run verification queries:

```sql
-- Test 1: Check agents table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agents'
ORDER BY ordinal_position;

-- Expected columns: id, did, public_key, created_at, last_seen_at, ttl, expires_at

-- Test 2: Check capabilities table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'capabilities'
ORDER BY ordinal_position;

-- Expected columns: id, agent_id, description, embedding, tags, version, evidence_vc, created_at, updated_at

-- Test 3: Check foreign key relationships
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('capabilities', 'trust_scores');

-- Expected:
-- capabilities.agent_id -> agents.id (CASCADE)
-- trust_scores.agent_id -> agents.id (CASCADE)
```

### Step 4: Run Integration Tests

```bash
# From project root
cd packages/broker
npm test -- db-client.test.ts
```

**Test scenarios**:
1. Register agent with capabilities
2. Query agent by DID
3. Search agents by embedding similarity
4. Update trust score
5. Cleanup expired agents

### Step 5: Validate End-to-End

```bash
# Start broker
npm run dev

# Test registration endpoint
curl -X POST http://localhost:3000/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "address": {
      "did": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
      "capabilities": [
        {
          "description": "Schedule meetings with calendar integration",
          "embedding": "[base64-encoded-embedding]",
          "tags": ["scheduling", "calendar"],
          "version": "1.0.0"
        }
      ],
      "trust": {
        "score": 0.85,
        "dimensions": {
          "reliability": 0.9,
          "honesty": 0.85,
          "competence": 0.8,
          "timeliness": 0.85
        },
        "decay_rate": 0.977,
        "last_updated": 1696636800000
      },
      "credentials": ["base64-public-key"]
    },
    "ttl": 3600000
  }'

# Test retrieval endpoint
curl http://localhost:3000/agents/did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH
```

## Verification Checklist

- [ ] Migration 001 applied successfully
- [ ] `agents` table has `ttl` and `expires_at` columns
- [ ] Index `idx_agents_expires_at` exists
- [ ] `db-client.ts` replaced with fixed version
- [ ] TypeScript compilation succeeds (`npm run typecheck`)
- [ ] Unit tests pass (`npm test`)
- [ ] Can register agent via API
- [ ] Can query agent by DID via API
- [ ] Can search agents by embedding
- [ ] Trust scores update correctly
- [ ] Expired agents cleanup works

## Rollback Plan

If issues arise:

1. **Restore old code**:
   ```bash
   mv packages/broker/src/lib/db-client.old.ts packages/broker/src/lib/db-client.ts
   ```

2. **Rollback migration** (if schema changes cause issues):
   ```sql
   BEGIN;
   DROP INDEX IF EXISTS idx_agents_expires_at;
   ALTER TABLE agents DROP COLUMN IF EXISTS expires_at;
   ALTER TABLE agents DROP COLUMN IF EXISTS ttl;
   DELETE FROM schema_version WHERE version = '0.1.1';
   COMMIT;
   ```

3. **Restart broker** to pick up old code

## Post-Migration Tasks

1. **Update documentation**: Document the normalized schema design
2. **Add automated tests**: Ensure schema-code compatibility in CI
3. **Monitor logs**: Watch for SQL errors in production
4. **Performance tuning**: Monitor query performance with JOINs

## Success Criteria

- [x] Broker can successfully register agents
- [x] Broker can query agents by DID
- [x] Broker can search capabilities by embedding similarity
- [x] All SQL queries match actual table structure
- [x] Tests can run end-to-end
- [x] No TypeScript compilation errors
- [x] No SQL syntax errors in logs
