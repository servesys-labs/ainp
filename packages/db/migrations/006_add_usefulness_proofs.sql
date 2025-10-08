-- Web4 POU-lite: Usefulness Proofs Table
-- Stores proof of useful work for economic incentives

CREATE TABLE IF NOT EXISTS usefulness_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL,
  agent_did TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK (work_type IN ('compute', 'memory', 'routing', 'validation', 'learning')),

  -- Work metrics (JSONB for flexibility)
  metrics JSONB NOT NULL DEFAULT '{}',

  -- Verifiable credentials (optional attestations)
  attestations TEXT[],

  -- Traceability
  trace_id TEXT NOT NULL,

  -- Calculated usefulness score (0-100)
  usefulness_score NUMERIC(5, 2) DEFAULT 0 CHECK (usefulness_score >= 0 AND usefulness_score <= 100),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for common queries
  CONSTRAINT fk_agent FOREIGN KEY (agent_did) REFERENCES agents(did) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_usefulness_agent ON usefulness_proofs(agent_did, created_at DESC);
CREATE INDEX idx_usefulness_intent ON usefulness_proofs(intent_id);
CREATE INDEX idx_usefulness_work_type ON usefulness_proofs(work_type);
CREATE INDEX idx_usefulness_score ON usefulness_proofs(usefulness_score DESC);
CREATE INDEX idx_usefulness_trace ON usefulness_proofs(trace_id);

-- Composite index for agent leaderboard queries
CREATE INDEX idx_usefulness_agent_score ON usefulness_proofs(agent_did, usefulness_score DESC, created_at DESC);

-- GIN index for JSONB metrics queries
CREATE INDEX idx_usefulness_metrics ON usefulness_proofs USING GIN (metrics);

COMMENT ON TABLE usefulness_proofs IS 'Web4 POU-lite: Proof of useful work for economic incentives';
COMMENT ON COLUMN usefulness_proofs.metrics IS 'JSONB: {compute_ms?, memory_bytes?, routing_hops?, validation_checks?, learning_samples?}';
COMMENT ON COLUMN usefulness_proofs.attestations IS 'Verifiable credentials proving work completion';
COMMENT ON COLUMN usefulness_proofs.usefulness_score IS 'Calculated score (0-100) using work type weights';
