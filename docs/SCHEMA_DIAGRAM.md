# AINP Database Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENTS                                │
├──────────────────┬──────────────────────────────────────────┤
│ id (PK)          │ UUID                                      │
│ did (UNIQUE)     │ TEXT  (e.g., "did:key:z6Mk...")          │
│ public_key       │ TEXT  (Ed25519 base64)                   │
│ created_at       │ TIMESTAMPTZ                              │
│ last_seen_at     │ TIMESTAMPTZ                              │
│ ttl              │ INTEGER  (milliseconds) [NEW]            │
│ expires_at       │ TIMESTAMPTZ [NEW]                        │
└──────────────────┴──────────────────────────────────────────┘
         │                    │
         │                    │
         │ 1                  │ 1
         │                    │
         ├────────────────────┼───────────────────────┐
         │                    │                       │
         │ *                  │ 1                     │ 1
         │                    │                       │
         ▼                    ▼                       ▼
┌────────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│   CAPABILITIES     │  │  TRUST_SCORES    │  │   AUDIT_LOG         │
├──────────┬─────────┤  ├──────────────────┤  ├──────────┬──────────┤
│ id (PK)  │ UUID    │  │ agent_id (PK,FK) │  │ id (PK)  │ UUID     │
│ agent_id │ UUID FK │  │ score            │  │ agent_id │ UUID FK  │
│          │ CASCADE │  │ reliability      │  │          │ SET NULL │
│ description TEXT   │  │ honesty          │  │ event_type TEXT    │
│ embedding  VECTOR  │  │ competence       │  │ details    JSONB   │
│ tags       TEXT[]  │  │ timeliness       │  │ ip_address INET    │
│ version    TEXT    │  │ decay_rate       │  │ timestamp  TSTAMP  │
│ evidence_vc TEXT   │  │ last_updated     │  └──────────┴──────────┘
│ created_at TSTAMP  │  └──────────────────┘
│ updated_at TSTAMP  │
└──────────┴─────────┘
         │
         │ *
         ▼
┌────────────────────────────────────────────┐
│     INTENT_ROUTING_CACHE                   │
├──────────────────┬─────────────────────────┤
│ id (PK)          │ UUID                    │
│ query_text       │ TEXT                    │
│ query_embedding  │ VECTOR(1536)            │
│ matched_agents   │ UUID[]                  │
│ similarity_scores│ NUMERIC[]               │
│ created_at       │ TIMESTAMPTZ             │
│ expires_at       │ TIMESTAMPTZ (5 min TTL) │
└──────────────────┴─────────────────────────┘
```

## Table Relationships

### 1. AGENTS → CAPABILITIES (One-to-Many)
- **Foreign Key**: `capabilities.agent_id → agents.id`
- **Delete Rule**: `ON DELETE CASCADE`
- **Purpose**: Store multiple semantic capabilities per agent
- **Unique Constraint**: `(agent_id, description)` - prevent duplicate capabilities

### 2. AGENTS → TRUST_SCORES (One-to-One)
- **Foreign Key**: `trust_scores.agent_id → agents.id`
- **Delete Rule**: `ON DELETE CASCADE`
- **Purpose**: Multi-dimensional reputation tracking
- **Key Change**: Now uses `agent_id` (UUID) instead of `did` (TEXT)

### 3. AGENTS → AUDIT_LOG (One-to-Many)
- **Foreign Key**: `audit_log.agent_id → agents.id`
- **Delete Rule**: `ON DELETE SET NULL`
- **Purpose**: Security event logging (preserve logs even if agent deleted)

### 4. INTENT_ROUTING_CACHE (Standalone)
- **No Foreign Keys**: Independent cache table
- **Purpose**: Cache semantic routing decisions (5-minute TTL)
- **Cleanup**: Auto-expire via `expires_at` timestamp

## Key Indexes

### Agents
- `agents_pkey` (PRIMARY KEY on `id`)
- `agents_did_key` (UNIQUE on `did`)
- `idx_agents_did` (B-tree on `did`)
- `idx_agents_last_seen` (B-tree on `last_seen_at DESC`)
- `idx_agents_expires_at` (B-tree on `expires_at`) **[NEW]**

### Capabilities
- `capabilities_pkey` (PRIMARY KEY on `id`)
- `unique_agent_capability` (UNIQUE on `agent_id, description`)
- `idx_capabilities_agent` (B-tree on `agent_id`)
- `idx_capabilities_tags` (GIN on `tags`)
- `idx_capabilities_version` (B-tree on `version`)
- `idx_capabilities_embedding` (HNSW on `embedding` with `vector_cosine_ops`)

### Trust Scores
- `trust_scores_pkey` (PRIMARY KEY on `agent_id`)
- `idx_trust_scores_score` (B-tree on `score DESC`)
- `idx_trust_scores_last_updated` (B-tree on `last_updated DESC`)

### Audit Log
- `idx_audit_log_timestamp` (B-tree on `timestamp DESC`)
- `idx_audit_log_agent` (B-tree on `agent_id`)
- `idx_audit_log_event_type` (B-tree on `event_type`)
- `idx_audit_log_details` (GIN on `details`)

## Data Flow: Agent Registration

```
1. API Request
   ↓
2. DiscoveryService.registerAgent()
   ↓
3. EmbeddingService.embed() (if needed)
   ↓
4. DatabaseClient.registerAgent()
   ↓
5. BEGIN TRANSACTION
   ├─→ INSERT/UPDATE agents (did, public_key, ttl, expires_at)
   │   ↓ RETURNING id
   ├─→ DELETE FROM capabilities WHERE agent_id = ?
   ├─→ INSERT INTO capabilities (agent_id, description, embedding, tags, version)
   │   (for each capability)
   └─→ INSERT/UPDATE trust_scores (agent_id, score, dimensions...)
   ↓
6. COMMIT TRANSACTION
   ↓
7. Return success
```

## Data Flow: Agent Discovery (Semantic Search)

```
1. API Request (query description)
   ↓
2. DiscoveryService.discover()
   ├─→ Check Redis cache
   │   (if hit, return cached results)
   └─→ EmbeddingService.embed(query)
       ↓
3. DatabaseClient.searchAgentsByEmbedding()
   ↓
4. SQL Query:
   ├─→ JOIN capabilities ON agent_id
   ├─→ Vector similarity search (HNSW index)
   ├─→ Filter by expires_at > NOW()
   ├─→ LEFT JOIN trust_scores
   └─→ json_agg() to reconstruct SemanticAddress
   ↓
5. Filter results (min_trust, tags)
   ↓
6. Cache in Redis (5-minute TTL)
   ↓
7. Return ranked results
```

## Schema Version History

| Version | Date       | Description                              |
|---------|------------|------------------------------------------|
| 0.1.0   | 2025-10-06 | Initial AINP Phase 0.1 schema            |
| 0.1.1   | 2025-10-07 | Add agent TTL and expiration tracking    |

## Migration Path: v0.1.0 → v0.1.1

### Changes
1. **Add columns**: `agents.ttl`, `agents.expires_at`
2. **Add index**: `idx_agents_expires_at`
3. **No data migration**: New columns nullable, existing data unaffected

### Compatibility
- ✅ **Backward compatible**: Old code can ignore new columns
- ✅ **Forward compatible**: New code handles NULL values gracefully
- ✅ **Zero downtime**: ALTER TABLE with nullable columns is non-blocking

## Type Mappings: PostgreSQL ↔ TypeScript

| PostgreSQL Type       | TypeScript Type        | Notes                          |
|-----------------------|------------------------|--------------------------------|
| `UUID`                | `string`               | UUID v4 format                 |
| `TEXT`                | `string`               |                                |
| `TIMESTAMPTZ`         | `Date` or `number`     | Epoch milliseconds             |
| `INTEGER`             | `number`               | Milliseconds for TTL           |
| `NUMERIC(5,4)`        | `number`               | Trust scores (0-1)             |
| `VECTOR(1536)`        | `string`               | Base64-encoded Float32Array    |
| `TEXT[]`              | `string[]`             | Tags array                     |
| `JSONB`               | `object`               | Audit log details              |
| `UUID[]`              | `string[]`             | Matched agents                 |
| `NUMERIC[]`           | `number[]`             | Similarity scores              |

## Key Constraints

### Primary Keys
- All tables use UUID primary keys for global uniqueness
- Generated via `uuid_generate_v4()` function

### Unique Constraints
- `agents.did` - One agent per DID
- `capabilities(agent_id, description)` - Prevent duplicate capabilities

### Check Constraints
- `agents.did` - Must match `^did:(key|web):` pattern
- `capabilities.version` - Must match semver pattern `^\d+\.\d+\.\d+$`
- `trust_scores.*` - All dimensions must be in range [0, 1]

### Foreign Keys
- All foreign keys cascade on DELETE (except `audit_log` which uses SET NULL)
- Ensures referential integrity and automatic cleanup

## Views

### agent_summary
Combines agent data with trust scores and capability counts:

```sql
SELECT
  a.id,
  a.did,
  a.created_at,
  a.last_seen_at,
  COALESCE(t.score, 0.5) AS trust_score,
  COUNT(c.id) AS capability_count,
  ARRAY_AGG(DISTINCT c.tags) AS all_tags
FROM agents a
LEFT JOIN trust_scores t ON a.id = t.agent_id
LEFT JOIN capabilities c ON a.id = c.agent_id
GROUP BY a.id, a.did, a.created_at, a.last_seen_at, t.score;
```

## Triggers

### 1. capabilities_updated_at
- **When**: BEFORE UPDATE on `capabilities`
- **Action**: Sets `updated_at = NOW()`

### 2. audit_log_update_last_seen
- **When**: AFTER INSERT on `audit_log`
- **Action**: Updates `agents.last_seen_at = NOW()`
- **Condition**: Only when `agent_id IS NOT NULL`

## Functions

### calculate_trust_score()
Calculates aggregate trust score from dimensions:
```sql
reliability * 0.35 + honesty * 0.35 + competence * 0.20 + timeliness * 0.10
```

### apply_trust_decay()
Applies exponential decay to trust score:
```sql
score * POWER(decay_rate, days_since_update)
```

### cleanup_expired_routing_cache()
Deletes expired cache entries:
```sql
DELETE FROM intent_routing_cache WHERE expires_at < NOW()
```

## Performance Notes

### Vector Search
- **Index Type**: HNSW (Hierarchical Navigable Small World)
- **Parameters**: `m=16, ef_construction=64`
- **Distance Metric**: Cosine distance (`<=>`)
- **Performance**: Sub-100ms for 1M+ vectors

### Cleanup Operations
- **Expired Agents**: `WHERE expires_at <= NOW()` uses index scan
- **Routing Cache**: Auto-expire via `expires_at` (no manual cleanup needed)
- **Run Frequency**: Recommended every 5 minutes via cron

### Query Optimization
- Use `EXPLAIN ANALYZE` to verify index usage
- Monitor `pg_stat_statements` for slow queries
- Consider partitioning `audit_log` if >10M rows
