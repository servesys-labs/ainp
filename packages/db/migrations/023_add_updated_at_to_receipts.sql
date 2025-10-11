-- Migration 023: Add updated_at column to task_receipts
-- Required by PoU Finalizer job for tracking finalization timestamp

ALTER TABLE task_receipts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN task_receipts.updated_at IS 'Timestamp of last update (used by PoU Finalizer)';

-- Backfill existing rows with created_at value
UPDATE task_receipts
  SET updated_at = created_at
  WHERE updated_at IS NULL;
