-- Migration 001: Add agent registration fields for TTL and expiration
-- This adds missing columns to support agent registration with TTL

BEGIN;

-- Add TTL and expiration tracking to agents table
ALTER TABLE agents
  ADD COLUMN ttl INTEGER,  -- Time-to-live in milliseconds
  ADD COLUMN expires_at TIMESTAMPTZ;

-- Add index for expiration cleanup queries
CREATE INDEX idx_agents_expires_at ON agents(expires_at)
  WHERE expires_at IS NOT NULL;

-- Update schema version
INSERT INTO schema_version (version, description) VALUES
  ('0.1.1', 'Add agent TTL and expiration tracking')
ON CONFLICT (version) DO NOTHING;

COMMIT;
