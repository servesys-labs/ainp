-- Migration 020: Extend task_receipts with status/finalization fields

ALTER TABLE task_receipts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS committee JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS k INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS m INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_receipts_status ON task_receipts(status);

COMMENT ON COLUMN task_receipts.status IS 'pending|finalized|disputed|failed';
COMMENT ON COLUMN task_receipts.k IS 'Quorum threshold';
COMMENT ON COLUMN task_receipts.m IS 'Committee size';

