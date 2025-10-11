-- Migration 022: Add selection_seed to task_receipts

ALTER TABLE task_receipts
  ADD COLUMN IF NOT EXISTS selection_seed TEXT;

COMMENT ON COLUMN task_receipts.selection_seed IS 'Deterministic seed used for committee selection';

