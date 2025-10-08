-- Migration 018: Task attestations

CREATE TABLE IF NOT EXISTS task_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES task_receipts(id) ON DELETE CASCADE,
  by_did TEXT NOT NULL,
  type TEXT NOT NULL, -- ACCEPTED|AUDIT_PASS|SAFETY_PASS|... (free-form for now)
  score NUMERIC(5,4),
  confidence NUMERIC(5,4),
  evidence_ref TEXT,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attestations_task ON task_attestations(task_id);

COMMENT ON TABLE task_attestations IS 'Attestations attached to task receipts (client/auditor/etc.)';

