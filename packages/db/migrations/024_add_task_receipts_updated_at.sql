-- Migration 024: Add updated_at to task_receipts for finalization tracking

ALTER TABLE task_receipts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_task_receipts_updated_at ON task_receipts(updated_at DESC);

COMMENT ON COLUMN task_receipts.updated_at IS 'Timestamp of last update (used by PoU Finalizer and admin queries)';

