-- Verification Queries for Schema-Code Alignment
-- Run these after applying migration 001

-- ============================================================================
-- 1. Verify agents table structure
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'agents'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid, NOT NULL, uuid_generate_v4())
-- did (text, NOT NULL)
-- public_key (text, NOT NULL)
-- created_at (timestamp with time zone, YES, now())
-- last_seen_at (timestamp with time zone, YES, now())
-- ttl (integer, YES, NULL)
-- expires_at (timestamp with time zone, YES, NULL)

-- ============================================================================
-- 2. Verify capabilities table structure
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'capabilities'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid, NOT NULL, uuid_generate_v4())
-- agent_id (uuid, NOT NULL)
-- description (text, NOT NULL)
-- embedding (vector, YES)
-- tags (ARRAY, NOT NULL, '{}')
-- version (text, NOT NULL)
-- evidence_vc (text, YES)
-- created_at (timestamp with time zone, YES, now())
-- updated_at (timestamp with time zone, YES, now())

-- ============================================================================
-- 3. Verify trust_scores table structure
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trust_scores'
ORDER BY ordinal_position;

-- Expected columns:
-- agent_id (uuid, NOT NULL, PRIMARY KEY)
-- score (numeric(5,4), YES)
-- reliability (numeric(5,4), YES)
-- honesty (numeric(5,4), YES)
-- competence (numeric(5,4), YES)
-- timeliness (numeric(5,4), YES)
-- decay_rate (numeric(5,4), YES, 0.977)
-- last_updated (timestamp with time zone, YES, now())

-- ============================================================================
-- 4. Verify foreign key constraints
-- ============================================================================
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('capabilities', 'trust_scores')
ORDER BY tc.table_name, kcu.ordinal_position;

-- Expected foreign keys:
-- capabilities.agent_id -> agents.id (CASCADE)
-- trust_scores.agent_id -> agents.id (CASCADE)

-- ============================================================================
-- 5. Verify indexes
-- ============================================================================
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('agents', 'capabilities', 'trust_scores')
ORDER BY tablename, indexname;

-- Expected indexes for agents:
-- agents_pkey (PRIMARY KEY on id)
-- agents_did_key (UNIQUE on did)
-- idx_agents_did (INDEX on did)
-- idx_agents_last_seen (INDEX on last_seen_at DESC)
-- idx_agents_expires_at (INDEX on expires_at) -- NEW

-- Expected indexes for capabilities:
-- capabilities_pkey (PRIMARY KEY on id)
-- unique_agent_capability (UNIQUE on agent_id, description)
-- idx_capabilities_agent (INDEX on agent_id)
-- idx_capabilities_tags (GIN INDEX on tags)
-- idx_capabilities_version (INDEX on version)
-- idx_capabilities_embedding (HNSW INDEX on embedding)

-- Expected indexes for trust_scores:
-- trust_scores_pkey (PRIMARY KEY on agent_id)
-- idx_trust_scores_score (INDEX on score DESC)
-- idx_trust_scores_last_updated (INDEX on last_updated DESC)

-- ============================================================================
-- 6. Test registration flow (DML verification)
-- ============================================================================

-- Insert test agent
INSERT INTO agents (did, public_key, ttl, expires_at)
VALUES (
  'did:key:test-verification',
  'test-public-key',
  3600000,
  NOW() + INTERVAL '1 hour'
)
ON CONFLICT (did) DO UPDATE SET
  ttl = EXCLUDED.ttl,
  expires_at = EXCLUDED.expires_at,
  last_seen_at = NOW()
RETURNING id, did, ttl, expires_at;

-- Insert test capability
WITH agent_info AS (
  SELECT id FROM agents WHERE did = 'did:key:test-verification'
)
INSERT INTO capabilities (agent_id, description, tags, version)
SELECT
  id,
  'Test capability for verification',
  ARRAY['test', 'verification'],
  '1.0.0'
FROM agent_info
RETURNING id, agent_id, description, tags, version;

-- Insert test trust score
WITH agent_info AS (
  SELECT id FROM agents WHERE did = 'did:key:test-verification'
)
INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness)
SELECT
  id,
  0.85,
  0.9,
  0.85,
  0.8,
  0.85
FROM agent_info
ON CONFLICT (agent_id) DO UPDATE SET
  score = EXCLUDED.score,
  reliability = EXCLUDED.reliability,
  honesty = EXCLUDED.honesty,
  competence = EXCLUDED.competence,
  timeliness = EXCLUDED.timeliness,
  last_updated = NOW()
RETURNING agent_id, score, reliability, honesty, competence, timeliness;

-- ============================================================================
-- 7. Test JOIN query (matches db-client.ts getAgent method)
-- ============================================================================
SELECT
  a.id,
  a.did,
  a.public_key,
  a.ttl,
  a.expires_at,
  ts.score,
  ts.reliability,
  ts.honesty,
  ts.competence,
  ts.timeliness,
  ts.decay_rate,
  ts.last_updated,
  json_agg(
    json_build_object(
      'description', c.description,
      'embedding', c.embedding::text,
      'tags', c.tags,
      'version', c.version,
      'evidence', c.evidence_vc
    )
  ) FILTER (WHERE c.id IS NOT NULL) AS capabilities
FROM agents a
LEFT JOIN capabilities c ON a.id = c.agent_id
LEFT JOIN trust_scores ts ON a.id = ts.agent_id
WHERE a.did = 'did:key:test-verification'
  AND (a.expires_at IS NULL OR a.expires_at > NOW())
GROUP BY a.id, a.did, a.public_key, a.ttl, a.expires_at, ts.score, ts.reliability, ts.honesty, ts.competence, ts.timeliness, ts.decay_rate, ts.last_updated;

-- ============================================================================
-- 8. Test CASCADE delete (cleanup)
-- ============================================================================

-- This should delete agent + capabilities + trust_scores
DELETE FROM agents WHERE did = 'did:key:test-verification';

-- Verify all related records deleted
SELECT COUNT(*) AS remaining_capabilities
FROM capabilities
WHERE agent_id NOT IN (SELECT id FROM agents);

SELECT COUNT(*) AS remaining_trust_scores
FROM trust_scores
WHERE agent_id NOT IN (SELECT id FROM agents);

-- Both should return 0

-- ============================================================================
-- 9. Verify schema version
-- ============================================================================
SELECT version, applied_at, description
FROM schema_version
ORDER BY version DESC;

-- Expected versions:
-- 0.1.1 | [timestamp] | Add agent TTL and expiration tracking
-- 0.1.0 | [timestamp] | Initial AINP Phase 0.1 schema

-- ============================================================================
-- 10. Performance check: EXPLAIN ANALYZE for vector search
-- ============================================================================

-- This shows the query plan for embedding similarity search
EXPLAIN ANALYZE
SELECT DISTINCT ON (a.id)
  a.id,
  a.did,
  (c.embedding <=> '[0,0,0,0,0,0,0,0,0,0]'::vector) AS distance
FROM agents a
JOIN capabilities c ON a.id = c.agent_id
WHERE (a.expires_at IS NULL OR a.expires_at > NOW())
  AND (c.embedding <=> '[0,0,0,0,0,0,0,0,0,0]'::vector) <= 0.3
ORDER BY a.id, distance ASC
LIMIT 10;

-- Should use idx_capabilities_embedding (HNSW index)
-- Look for "Index Scan using idx_capabilities_embedding" in plan
