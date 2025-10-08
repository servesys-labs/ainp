-- Rollback Migration: Phase 4.1 Multi-Round Negotiation Protocol
-- Safely removes negotiation sessions schema
-- Safe to run multiple times (idempotent with IF EXISTS)

-- =============================================================================
-- DROP TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS trg_negotiations_update ON negotiations;
RAISE NOTICE '✅ Dropped trigger: trg_negotiations_update';

-- =============================================================================
-- DROP FUNCTIONS
-- =============================================================================

DROP FUNCTION IF EXISTS update_negotiations_timestamp();
RAISE NOTICE '✅ Dropped function: update_negotiations_timestamp()';

DROP FUNCTION IF EXISTS expire_stale_negotiations();
RAISE NOTICE '✅ Dropped function: expire_stale_negotiations()';

-- =============================================================================
-- DROP TABLE (CASCADE)
-- =============================================================================

-- CASCADE ensures dependent objects are removed
-- Safe because negotiations has no foreign key dependencies from other tables
DROP TABLE IF EXISTS negotiations CASCADE;
RAISE NOTICE '✅ Dropped table: negotiations (with CASCADE)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify table is gone
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'negotiations') THEN
    RAISE EXCEPTION 'Rollback failed: negotiations table still exists';
  END IF;
  RAISE NOTICE '✅ Verified: negotiations table removed';
END $$;

-- Verify trigger is gone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_negotiations_update'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: trigger trg_negotiations_update still exists';
  END IF;
  RAISE NOTICE '✅ Verified: trigger removed';
END $$;

-- Verify functions are gone
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_negotiations_timestamp') THEN
    RAISE EXCEPTION 'Rollback failed: function update_negotiations_timestamp still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'expire_stale_negotiations') THEN
    RAISE EXCEPTION 'Rollback failed: function expire_stale_negotiations still exists';
  END IF;
  RAISE NOTICE '✅ Verified: functions removed';
END $$;

RAISE NOTICE '✅ Rollback migration 011_rollback_negotiation_sessions.sql completed successfully';
RAISE NOTICE 'ℹ️  To reapply: run 004_add_negotiation_sessions.sql';
