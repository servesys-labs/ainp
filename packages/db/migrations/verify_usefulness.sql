-- Comprehensive verification script for usefulness migrations (006 & 007)
-- Run with: psql $DATABASE_URL -f verify_usefulness.sql

\echo '=== Migration 006 & 007 Verification ==='
\echo ''

-- Test 1: Table existence
\echo 'Test 1: usefulness_proofs table exists'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'usefulness_proofs'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 2: Column count and types
\echo 'Test 2: usefulness_proofs has correct columns'
SELECT
  CASE WHEN COUNT(*) = 9 THEN '✅ PASS' ELSE '❌ FAIL: Expected 9 columns, got ' || COUNT(*) END as result
FROM information_schema.columns
WHERE table_name = 'usefulness_proofs';

-- Test 3: Indexes
\echo 'Test 3: usefulness_proofs has required indexes'
SELECT
  CASE WHEN COUNT(*) >= 7 THEN '✅ PASS' ELSE '❌ FAIL: Expected 7+ indexes, got ' || COUNT(*) END as result
FROM pg_indexes
WHERE tablename = 'usefulness_proofs';

-- Test 4: Foreign key constraint
\echo 'Test 4: usefulness_proofs has FK to agents'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'usefulness_proofs'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'fk_agent'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 5: work_type CHECK constraint
\echo 'Test 5: work_type CHECK constraint exists'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%work_type%'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 6: usefulness_score CHECK constraint
\echo 'Test 6: usefulness_score CHECK constraint exists'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%usefulness_score%'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 7: agents table usefulness columns
\echo 'Test 7: agents has usefulness_score_cached column'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'usefulness_score_cached'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

\echo 'Test 8: agents has usefulness_last_updated column'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'usefulness_last_updated'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 9: agents usefulness index
\echo 'Test 9: agents has idx_agents_usefulness index'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'agents' AND indexname = 'idx_agents_usefulness'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

-- Test 10: GIN index on JSONB metrics
\echo 'Test 10: usefulness_proofs has GIN index on metrics'
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'usefulness_proofs'
      AND indexname = 'idx_usefulness_metrics'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END as result;

\echo ''
\echo '=== Verification Complete ==='
