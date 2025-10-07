-- AINP Phase 0.1 Database Schema
-- PostgreSQL 16+
-- Created: 2025-10-06

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- AGENTS REGISTRY
-- =============================================================================

-- Agents table: Store agent identities and cryptographic keys
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  did TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,  -- Ed25519 public key (base64)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT did_format_check CHECK (did ~ '^did:(key|web):')
);

COMMENT ON TABLE agents IS 'Registry of all AINP agents with DIDs and public keys';
COMMENT ON COLUMN agents.did IS 'W3C Decentralized Identifier (did:key or did:web)';
COMMENT ON COLUMN agents.public_key IS 'Ed25519 public key for signature verification (base64-encoded)';
COMMENT ON COLUMN agents.last_seen_at IS 'Last time agent sent a message (for activity tracking)';

-- =============================================================================
-- CAPABILITIES
-- =============================================================================

-- Capabilities table: Store agent capabilities for discovery with embeddings
CREATE TABLE capabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  embedding vector(1536),  -- pgvector type (OpenAI text-embedding-3-small)
  tags TEXT[] NOT NULL DEFAULT '{}',
  version TEXT NOT NULL,
  evidence_vc TEXT,  -- Verifiable Credential URI
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT version_format_check CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT unique_agent_capability UNIQUE (agent_id, description)
);

COMMENT ON TABLE capabilities IS 'Agent capabilities for semantic discovery with pgvector embeddings';
COMMENT ON COLUMN capabilities.description IS 'Natural language description of capability (e.g., "Schedule meetings with calendar integration")';
COMMENT ON COLUMN capabilities.embedding IS 'Embedding vector (1536-dim) for semantic similarity search using pgvector';
COMMENT ON COLUMN capabilities.tags IS 'Array of tags for filtering (e.g., ["scheduling", "calendar"])';
COMMENT ON COLUMN capabilities.version IS 'Semantic version of capability (e.g., "1.0.0")';
COMMENT ON COLUMN capabilities.evidence_vc IS 'URI to Verifiable Credential proving capability';

-- =============================================================================
-- INTENT ROUTING CACHE
-- =============================================================================

-- Intent routing cache: Cache routing decisions for performance
CREATE TABLE intent_routing_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_text TEXT NOT NULL,
  query_embedding vector(1536),  -- pgvector type
  matched_agents UUID[],  -- Array of agent IDs
  similarity_scores NUMERIC[],  -- Corresponding similarity scores
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

COMMENT ON TABLE intent_routing_cache IS 'Cache for intent routing decisions (5-minute TTL)';
COMMENT ON COLUMN intent_routing_cache.query_text IS 'Original query text for debugging';
COMMENT ON COLUMN intent_routing_cache.query_embedding IS 'Query embedding for similarity matching';
COMMENT ON COLUMN intent_routing_cache.matched_agents IS 'Array of matched agent IDs';
COMMENT ON COLUMN intent_routing_cache.similarity_scores IS 'Array of similarity scores (parallel to matched_agents)';

-- =============================================================================
-- TRUST SCORES
-- =============================================================================

-- Trust scores table: Multi-dimensional reputation tracking
CREATE TABLE trust_scores (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  score NUMERIC(5,4) CHECK (score >= 0 AND score <= 1),
  reliability NUMERIC(5,4) CHECK (reliability >= 0 AND reliability <= 1),
  honesty NUMERIC(5,4) CHECK (honesty >= 0 AND honesty <= 1),
  competence NUMERIC(5,4) CHECK (competence >= 0 and competence <= 1),
  timeliness NUMERIC(5,4) CHECK (timeliness >= 0 AND timeliness <= 1),
  decay_rate NUMERIC(5,4) DEFAULT 0.977 CHECK (decay_rate > 0 AND decay_rate <= 1),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE trust_scores IS 'Multi-dimensional trust scores for agent reputation';
COMMENT ON COLUMN trust_scores.score IS 'Aggregate trust score (0-1) = weighted sum of dimensions';
COMMENT ON COLUMN trust_scores.reliability IS 'Uptime and success rate dimension (0-1)';
COMMENT ON COLUMN trust_scores.honesty IS 'Peer review and reputation dimension (0-1)';
COMMENT ON COLUMN trust_scores.competence IS 'Task completion quality dimension (0-1)';
COMMENT ON COLUMN trust_scores.timeliness IS 'Response speed dimension (0-1)';
COMMENT ON COLUMN trust_scores.decay_rate IS 'Exponential decay factor (default 0.977 = 30-day half-life)';

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

-- Audit log: Security events and system activity
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB,
  ip_address INET,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Security audit log for tracking events and anomalies';
COMMENT ON COLUMN audit_log.event_type IS 'Event type: auth_failure, rate_limit, malformed_message, sig_verification_failed, etc.';
COMMENT ON COLUMN audit_log.details IS 'Structured event details (JSON)';
COMMENT ON COLUMN audit_log.ip_address IS 'Source IP address (if applicable)';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Agents indexes
CREATE INDEX idx_agents_did ON agents(did);
CREATE INDEX idx_agents_last_seen ON agents(last_seen_at DESC);

-- Capabilities indexes
CREATE INDEX idx_capabilities_agent ON capabilities(agent_id);
CREATE INDEX idx_capabilities_tags ON capabilities USING GIN(tags);
CREATE INDEX idx_capabilities_version ON capabilities(version);
-- HNSW index for fast approximate nearest neighbor search (cosine distance)
CREATE INDEX idx_capabilities_embedding ON capabilities
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Intent routing cache indexes
CREATE INDEX idx_routing_cache_expires ON intent_routing_cache(expires_at);
CREATE INDEX idx_routing_cache_embedding ON intent_routing_cache
  USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Trust scores indexes
CREATE INDEX idx_trust_scores_score ON trust_scores(score DESC);
CREATE INDEX idx_trust_scores_last_updated ON trust_scores(last_updated DESC);

-- Audit log indexes
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_agent ON audit_log(agent_id);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_details ON audit_log USING GIN(details);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update updated_at timestamp on capabilities changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capabilities_updated_at
  BEFORE UPDATE ON capabilities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update agent last_seen_at on any activity
CREATE OR REPLACE FUNCTION update_agent_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agents SET last_seen_at = NOW() WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_update_last_seen
  AFTER INSERT ON audit_log
  FOR EACH ROW
  WHEN (NEW.agent_id IS NOT NULL)
  EXECUTE FUNCTION update_agent_last_seen();

-- =============================================================================
-- DEFAULT DATA (Development Only)
-- =============================================================================

-- Insert default admin agent for testing
INSERT INTO agents (did, public_key) VALUES
  ('did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH', 'base64-encoded-public-key-placeholder')
ON CONFLICT (did) DO NOTHING;

-- Insert default trust score for admin agent
INSERT INTO trust_scores (agent_id, score, reliability, honesty, competence, timeliness)
SELECT id, 0.85, 0.9, 0.85, 0.8, 0.85
FROM agents WHERE did = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
ON CONFLICT (agent_id) DO NOTHING;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- View: Agent summary with trust scores
CREATE OR REPLACE VIEW agent_summary AS
SELECT
  a.id,
  a.did,
  a.created_at,
  a.last_seen_at,
  COALESCE(t.score, 0.5) AS trust_score,
  COUNT(c.id) AS capability_count,
  ARRAY_AGG(DISTINCT c.tags) FILTER (WHERE c.tags IS NOT NULL) AS all_tags
FROM agents a
LEFT JOIN trust_scores t ON a.id = t.agent_id
LEFT JOIN capabilities c ON a.id = c.agent_id
GROUP BY a.id, a.did, a.created_at, a.last_seen_at, t.score;

COMMENT ON VIEW agent_summary IS 'Summary view of agents with trust scores and capability counts';

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: Calculate trust score from dimensions
CREATE OR REPLACE FUNCTION calculate_trust_score(
  p_reliability NUMERIC,
  p_honesty NUMERIC,
  p_competence NUMERIC,
  p_timeliness NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    p_reliability * 0.35 +
    p_honesty * 0.35 +
    p_competence * 0.20 +
    p_timeliness * 0.10
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_trust_score IS 'Calculate aggregate trust score from dimensions (per AINP spec)';

-- Function: Apply trust decay
CREATE OR REPLACE FUNCTION apply_trust_decay(
  p_score NUMERIC,
  p_decay_rate NUMERIC,
  p_days_since_update NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  RETURN p_score * POWER(p_decay_rate, p_days_since_update);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION apply_trust_decay IS 'Apply exponential decay to trust score based on time elapsed';

-- Function: Cleanup expired routing cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_routing_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM intent_routing_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_routing_cache IS 'Delete expired intent routing cache entries (run periodically)';

-- =============================================================================
-- GRANTS (Production: adjust as needed)
-- =============================================================================

-- Grant permissions to ainp user (assuming default setup)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ainp;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ainp;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ainp;

-- =============================================================================
-- SCHEMA VERSION
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);

INSERT INTO schema_version (version, description) VALUES
  ('0.1.0', 'Initial AINP Phase 0.1 schema')
ON CONFLICT (version) DO NOTHING;

COMMENT ON TABLE schema_version IS 'Schema migration tracking';
