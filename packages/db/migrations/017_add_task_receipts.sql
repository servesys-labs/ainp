-- Migration 017: Task receipts (PoU)

CREATE TABLE IF NOT EXISTS task_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT,
  negotiation_id UUID,
  agent_did TEXT NOT NULL,
  client_did TEXT,
  intent_type TEXT,
  inputs_ref TEXT,
  outputs_ref TEXT,
  metrics JSONB DEFAULT '{}',
  payment_request_id UUID,
  amount_atomic BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_receipts_agent ON task_receipts(agent_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_receipts_negotiation ON task_receipts(negotiation_id);
CREATE INDEX IF NOT EXISTS idx_task_receipts_intent ON task_receipts(intent_id);

COMMENT ON TABLE task_receipts IS 'Signed, verifiable receipts for completed tasks (PoU baseline)';

