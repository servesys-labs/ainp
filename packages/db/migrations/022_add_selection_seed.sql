-- Migration 022: Add selection_seed to task_receipts for deterministic committee selection

ALTER TABLE task_receipts
  ADD COLUMN IF NOT EXISTS selection_seed UUID;

COMMENT ON COLUMN task_receipts.selection_seed IS 'Random seed used for committee selection (for reproducibility)';
