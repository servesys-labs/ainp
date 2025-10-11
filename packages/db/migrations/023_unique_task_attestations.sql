-- Migration 023: Ensure unique attestation per (task_id, by_did, type)

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_attestations_unique
  ON task_attestations(task_id, by_did, type);

