-- Migration 021: Agent stakes (prototype)

CREATE TABLE IF NOT EXISTS agent_stakes (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  amount_locked BIGINT NOT NULL DEFAULT 0,
  slashed_total BIGINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_stakes_updated ON agent_stakes(updated_at DESC);

COMMENT ON TABLE agent_stakes IS 'Prototype stake table for slashing and access to high-value queues';

