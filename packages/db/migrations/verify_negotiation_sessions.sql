-- Verification Script: Phase 4.1 Negotiation Sessions Migration
-- Tests all schema components for correctness
-- Run with: psql $DATABASE_URL -f verify_negotiation_sessions.sql

\set QUIET on
\pset pager off
\pset format unaligned

BEGIN;

-- =============================================================================
-- TEST 1: Table Existence
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'negotiations'
  )
  THEN '✅ PASS: negotiations table exists'
  ELSE '❌ FAIL: negotiations table not found'
  END AS test_1_table_exists;

-- =============================================================================
-- TEST 2: Column Existence
-- =============================================================================

SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'negotiations'
      AND column_name IN (
        'id', 'intent_id', 'initiator_did', 'responder_did',
        'state', 'rounds', 'convergence_score', 'current_proposal',
        'final_proposal', 'incentive_split', 'max_rounds',
        'created_at', 'expires_at', 'updated_at'
      )
  ) = 14
  THEN '✅ PASS: All 14 columns exist'
  ELSE '❌ FAIL: Missing columns (expected 14)'
  END AS test_2_columns_exist;

-- =============================================================================
-- TEST 3: Primary Key Constraint
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'p'
      AND conrelid = 'negotiations'::regclass
      AND conname = 'negotiations_pkey'
  )
  THEN '✅ PASS: Primary key constraint exists'
  ELSE '❌ FAIL: Primary key constraint not found'
  END AS test_3_primary_key;

-- =============================================================================
-- TEST 4: CHECK Constraints
-- =============================================================================

SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid = 'negotiations'::regclass
      AND conname IN (
        'negotiations_state_check',
        'negotiations_convergence_score_check',
        'negotiations_max_rounds_check',
        'negotiation_participants_different'
      )
  ) = 4
  THEN '✅ PASS: All 4 CHECK constraints exist'
  ELSE '❌ FAIL: Missing CHECK constraints (expected 4)'
  END AS test_4_check_constraints;

-- =============================================================================
-- TEST 5: Indexes Existence
-- =============================================================================

SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'negotiations'
      AND indexname IN (
        'idx_negotiations_intent',
        'idx_negotiations_initiator',
        'idx_negotiations_responder',
        'idx_negotiations_state',
        'idx_negotiations_expires',
        'idx_negotiations_convergence'
      )
  ) = 6
  THEN '✅ PASS: All 6 indexes exist'
  ELSE '❌ FAIL: Missing indexes (expected 6)'
  END AS test_5_indexes_exist;

-- =============================================================================
-- TEST 6: Partial Index (expires_at)
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'negotiations'
      AND indexname = 'idx_negotiations_expires'
      AND indexdef LIKE '%WHERE%NOT IN%accepted%rejected%expired%'
  )
  THEN '✅ PASS: Partial index on expires_at has correct WHERE clause'
  ELSE '❌ FAIL: Partial index WHERE clause incorrect or missing'
  END AS test_6_partial_index;

-- =============================================================================
-- TEST 7: Trigger Existence
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_negotiations_update'
      AND tgrelid = 'negotiations'::regclass
  )
  THEN '✅ PASS: Trigger trg_negotiations_update exists'
  ELSE '❌ FAIL: Trigger not found'
  END AS test_7_trigger_exists;

-- =============================================================================
-- TEST 8: Trigger Function Existence
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_negotiations_timestamp'
  )
  THEN '✅ PASS: Function update_negotiations_timestamp() exists'
  ELSE '❌ FAIL: Trigger function not found'
  END AS test_8_trigger_function;

-- =============================================================================
-- TEST 9: Expiration Function Existence
-- =============================================================================

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'expire_stale_negotiations'
  )
  THEN '✅ PASS: Function expire_stale_negotiations() exists'
  ELSE '❌ FAIL: Expiration function not found'
  END AS test_9_expiration_function;

-- =============================================================================
-- TEST 10: JSONB Column Defaults
-- =============================================================================

SELECT
  CASE WHEN (
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'negotiations'
      AND column_name = 'rounds'
  ) = '''[]''::jsonb'
  THEN '✅ PASS: rounds column has correct default (empty array)'
  ELSE '❌ FAIL: rounds column default incorrect'
  END AS test_10_jsonb_defaults;

-- =============================================================================
-- TEST 11: Data Insertion (Idempotent Test)
-- =============================================================================

-- Insert test negotiation
INSERT INTO negotiations (
  intent_id,
  initiator_did,
  responder_did,
  state,
  expires_at,
  current_proposal,
  rounds
) VALUES (
  gen_random_uuid(),
  'did:key:test_initiator',
  'did:key:test_responder',
  'initiated',
  NOW() + INTERVAL '1 hour',
  '{"terms": "test", "amount": 100}',
  '[{"round": 1, "proposal": {"terms": "test"}, "timestamp": "2025-10-07T12:00:00Z"}]'
)
ON CONFLICT DO NOTHING;

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM negotiations
    WHERE state = 'initiated'
      AND initiator_did = 'did:key:test_initiator'
  )
  THEN '✅ PASS: Test data insertion successful'
  ELSE '❌ FAIL: Could not insert test data'
  END AS test_11_data_insertion;

-- =============================================================================
-- TEST 12: Trigger Functionality
-- =============================================================================

-- Update test negotiation and check if updated_at changes
UPDATE negotiations
SET state = 'proposed'
WHERE initiator_did = 'did:key:test_initiator';

SELECT
  CASE WHEN (
    SELECT updated_at > created_at
    FROM negotiations
    WHERE initiator_did = 'did:key:test_initiator'
  )
  THEN '✅ PASS: Trigger updated updated_at timestamp'
  ELSE '❌ FAIL: Trigger did not update timestamp'
  END AS test_12_trigger_functionality;

-- =============================================================================
-- TEST 13: Expiration Function Behavior
-- =============================================================================

-- Create expired negotiation for testing
INSERT INTO negotiations (
  intent_id,
  initiator_did,
  responder_did,
  state,
  expires_at
) VALUES (
  gen_random_uuid(),
  'did:key:expired_test',
  'did:key:responder_expired',
  'initiated',
  NOW() - INTERVAL '1 hour' -- Already expired
)
ON CONFLICT DO NOTHING;

-- Run expiration function
SELECT expire_stale_negotiations() AS expired_count;

SELECT
  CASE WHEN (
    SELECT state = 'expired'
    FROM negotiations
    WHERE initiator_did = 'did:key:expired_test'
  )
  THEN '✅ PASS: Expiration function marks stale negotiations'
  ELSE '❌ FAIL: Expiration function did not work'
  END AS test_13_expiration_function;

-- =============================================================================
-- TEST 14: CHECK Constraint Enforcement
-- =============================================================================

-- Test invalid state (should fail)
DO $$
BEGIN
  INSERT INTO negotiations (
    intent_id,
    initiator_did,
    responder_did,
    state,
    expires_at
  ) VALUES (
    gen_random_uuid(),
    'did:key:check_test',
    'did:key:check_responder',
    'invalid_state', -- Invalid state
    NOW() + INTERVAL '1 hour'
  );
  RAISE EXCEPTION 'Test failed: CHECK constraint did not reject invalid state';
EXCEPTION
  WHEN check_violation THEN
    NULL; -- Expected behavior
END $$;

SELECT '✅ PASS: CHECK constraint prevents invalid states' AS test_14_check_constraint;

-- =============================================================================
-- Cleanup Test Data
-- =============================================================================

DELETE FROM negotiations
WHERE initiator_did IN ('did:key:test_initiator', 'did:key:expired_test', 'did:key:check_test');

ROLLBACK; -- Rollback test transaction to keep database clean

-- =============================================================================
-- Summary
-- =============================================================================

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo 'Verification Complete: Phase 4.1 Negotiation Sessions'
\echo '════════════════════════════════════════════════════════════'
\echo 'Expected: 14 tests passing (all ✅)'
\echo 'If any ❌ appears above, investigate migration logs'
\echo '════════════════════════════════════════════════════════════'
