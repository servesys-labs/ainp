-- Rollback Web4 POU-lite schema changes
-- Use only if rolling back to Phase 0.2

DROP INDEX IF EXISTS idx_agents_usefulness;

ALTER TABLE agents
DROP COLUMN IF EXISTS usefulness_last_updated;

ALTER TABLE agents
DROP COLUMN IF EXISTS usefulness_score_cached;

DROP INDEX IF EXISTS idx_usefulness_metrics;
DROP INDEX IF EXISTS idx_usefulness_agent_score;
DROP INDEX IF EXISTS idx_usefulness_trace;
DROP INDEX IF EXISTS idx_usefulness_score;
DROP INDEX IF EXISTS idx_usefulness_work_type;
DROP INDEX IF EXISTS idx_usefulness_intent;
DROP INDEX IF EXISTS idx_usefulness_agent;

DROP TABLE IF EXISTS usefulness_proofs;
