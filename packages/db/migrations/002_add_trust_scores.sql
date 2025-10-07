-- Migration: Add trust score tracking
-- Version: 002
-- Date: 2025-10-06

-- Trust scores table (tracks agent reputation)
CREATE TABLE IF NOT EXISTS trust_scores (
  did TEXT PRIMARY KEY,
  score NUMERIC(3, 2) NOT NULL CHECK (score >= 0 AND score <= 1),
  reliability NUMERIC(3, 2) NOT NULL CHECK (reliability >= 0 AND reliability <= 1),
  honesty NUMERIC(3, 2) NOT NULL CHECK (honesty >= 0 AND honesty <= 1),
  competence NUMERIC(3, 2) NOT NULL CHECK (competence >= 0 AND competence <= 1),
  timeliness NUMERIC(3, 2) NOT NULL CHECK (timeliness >= 0 AND timeliness <= 1),
  decay_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.977,
  last_updated BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for trust score queries
CREATE INDEX IF NOT EXISTS idx_trust_scores_score ON trust_scores(score);
CREATE INDEX IF NOT EXISTS idx_trust_scores_last_updated ON trust_scores(last_updated);
