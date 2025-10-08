-- Migration 019: Agent reputation vector (Q,T,R,S,V,I,E)

CREATE TABLE IF NOT EXISTS agent_reputation (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  q NUMERIC(5,4) DEFAULT 0.5,
  t NUMERIC(5,4) DEFAULT 0.5,
  r NUMERIC(5,4) DEFAULT 0.5,
  s NUMERIC(5,4) DEFAULT 0.5,
  v NUMERIC(5,4) DEFAULT 0.5,
  i NUMERIC(5,4) DEFAULT 0.5,
  e NUMERIC(5,4) DEFAULT 0.5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_reputation_updated ON agent_reputation(updated_at DESC);

COMMENT ON TABLE agent_reputation IS 'Multi-dimensional reputation vector per agent {Q,T,R,S,V,I,E}';

