-- Add usefulness score cache to agents table for fast discovery ranking
-- This is a 30-day rolling average of usefulness scores

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS usefulness_score_cached NUMERIC(5, 2) DEFAULT 0 CHECK (usefulness_score_cached >= 0 AND usefulness_score_cached <= 100);

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS usefulness_last_updated TIMESTAMPTZ DEFAULT NOW();

-- Index for discovery ranking by usefulness
-- Note: Trust scores are in separate trust_scores table (normalized schema)
CREATE INDEX IF NOT EXISTS idx_agents_usefulness ON agents(usefulness_score_cached DESC);

COMMENT ON COLUMN agents.usefulness_score_cached IS 'Web4 POU-lite: 30-day rolling average of usefulness scores';
COMMENT ON COLUMN agents.usefulness_last_updated IS 'Last time usefulness cache was updated';
