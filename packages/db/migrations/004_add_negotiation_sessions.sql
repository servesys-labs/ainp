-- Phase 4.1: Multi-Round Negotiation Protocol
-- Tracks negotiation state, rounds, and convergence for agent work coordination
-- PostgreSQL 16+ compatible

-- =============================================================================
-- NEGOTIATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Intent context
  intent_id UUID NOT NULL,

  -- Participants (DIDs reference agents.did)
  initiator_did TEXT NOT NULL,
  responder_did TEXT NOT NULL,

  -- State machine (Phase 4.1 spec: initiated → proposed → counter_proposed → accepted|rejected|expired)
  state TEXT NOT NULL CHECK (state IN (
    'initiated',      -- Initial proposal sent
    'proposed',       -- Counter-proposal from responder
    'counter_proposed', -- Further negotiation rounds
    'accepted',       -- Final agreement reached
    'rejected',       -- Negotiation failed
    'expired'         -- Timeout exceeded
  )),

  -- Negotiation history and progress
  rounds JSONB NOT NULL DEFAULT '[]', -- Array of negotiation rounds with proposals
  convergence_score NUMERIC(3,2) DEFAULT 0.0 CHECK (convergence_score >= 0.0 AND convergence_score <= 1.0),

  -- Proposal tracking
  current_proposal JSONB,  -- Latest proposal under consideration
  final_proposal JSONB,    -- Accepted proposal (set when state = 'accepted')

  -- Economic terms (default incentive split from Phase 3 spec)
  incentive_split JSONB DEFAULT '{"agent": 0.70, "broker": 0.10, "validator": 0.10, "pool": 0.10}',

  -- Constraints
  max_rounds INTEGER DEFAULT 10 CHECK (max_rounds > 0 AND max_rounds <= 20),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure participants exist (enforced at application layer since DIDs are TEXT)
  CONSTRAINT negotiation_participants_different CHECK (initiator_did != responder_did)
);

-- =============================================================================
-- INDEXES (Performance Critical)
-- =============================================================================

-- Intent lookups (find all negotiations for an intent)
CREATE INDEX IF NOT EXISTS idx_negotiations_intent
  ON negotiations(intent_id);

-- Agent history (find all negotiations initiated by an agent)
CREATE INDEX IF NOT EXISTS idx_negotiations_initiator
  ON negotiations(initiator_did, created_at DESC);

-- Agent history (find all negotiations where agent is responder)
CREATE INDEX IF NOT EXISTS idx_negotiations_responder
  ON negotiations(responder_did, created_at DESC);

-- State filtering (find all active/pending negotiations)
CREATE INDEX IF NOT EXISTS idx_negotiations_state
  ON negotiations(state, created_at DESC);

-- Expiration cleanup (partial index for efficiency)
-- Only indexes non-terminal states to minimize index size
CREATE INDEX IF NOT EXISTS idx_negotiations_expires
  ON negotiations(expires_at)
  WHERE state NOT IN ('accepted', 'rejected', 'expired');

-- Composite index for convergence analysis (find high-convergence negotiations)
CREATE INDEX IF NOT EXISTS idx_negotiations_convergence
  ON negotiations(convergence_score DESC, state)
  WHERE state NOT IN ('accepted', 'rejected', 'expired');

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamp on row modification
CREATE OR REPLACE FUNCTION update_negotiations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_negotiations_update ON negotiations;
CREATE TRIGGER trg_negotiations_update
BEFORE UPDATE ON negotiations
FOR EACH ROW EXECUTE FUNCTION update_negotiations_timestamp();

-- =============================================================================
-- EXPIRATION UTILITY FUNCTION
-- =============================================================================

-- Mark expired negotiations (can be called by cron or manually)
-- Returns count of expired negotiations
CREATE OR REPLACE FUNCTION expire_stale_negotiations()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE negotiations
  SET state = 'expired',
      updated_at = NOW()
  WHERE expires_at < NOW()
    AND state NOT IN ('accepted', 'rejected', 'expired');

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS (Schema Documentation)
-- =============================================================================

COMMENT ON TABLE negotiations IS 'Phase 4.1: Multi-round negotiation sessions between agents before accepting work';
COMMENT ON COLUMN negotiations.id IS 'Unique negotiation session identifier (UUID)';
COMMENT ON COLUMN negotiations.intent_id IS 'Related intent request (from NATS message)';
COMMENT ON COLUMN negotiations.initiator_did IS 'Agent DID who initiated the negotiation (requester)';
COMMENT ON COLUMN negotiations.responder_did IS 'Agent DID who is responding to the negotiation (provider)';
COMMENT ON COLUMN negotiations.state IS 'Current negotiation state: initiated, proposed, counter_proposed, accepted, rejected, expired';
COMMENT ON COLUMN negotiations.rounds IS 'Array of negotiation rounds with proposals (JSONB format: [{round: 1, proposal: {...}, timestamp: "..."}])';
COMMENT ON COLUMN negotiations.convergence_score IS 'Convergence metric (0-1): measures how close proposals are to agreement';
COMMENT ON COLUMN negotiations.current_proposal IS 'Latest proposal under consideration (JSONB)';
COMMENT ON COLUMN negotiations.final_proposal IS 'Accepted proposal when state = accepted (JSONB)';
COMMENT ON COLUMN negotiations.incentive_split IS 'Economic terms (default: 70% agent, 10% broker, 10% validator, 10% pool)';
COMMENT ON COLUMN negotiations.max_rounds IS 'Maximum negotiation rounds allowed (default: 10, range: 1-20)';
COMMENT ON COLUMN negotiations.created_at IS 'Negotiation start timestamp';
COMMENT ON COLUMN negotiations.expires_at IS 'Negotiation expiration timestamp (hard deadline)';
COMMENT ON COLUMN negotiations.updated_at IS 'Last modification timestamp (auto-updated via trigger)';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify table exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'negotiations') THEN
    RAISE EXCEPTION 'Migration failed: negotiations table not created';
  END IF;
  RAISE NOTICE '✅ negotiations table created successfully';
END $$;

-- Verify all indexes exist
DO $$
DECLARE
  expected_indexes TEXT[] := ARRAY[
    'idx_negotiations_intent',
    'idx_negotiations_initiator',
    'idx_negotiations_responder',
    'idx_negotiations_state',
    'idx_negotiations_expires',
    'idx_negotiations_convergence'
  ];
  idx TEXT;
BEGIN
  FOREACH idx IN ARRAY expected_indexes
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = idx) THEN
      RAISE EXCEPTION 'Migration failed: index % not created', idx;
    END IF;
  END LOOP;
  RAISE NOTICE '✅ All 6 indexes created successfully';
END $$;

-- Verify trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_negotiations_update'
    AND tgrelid = 'negotiations'::regclass
  ) THEN
    RAISE EXCEPTION 'Migration failed: trigger trg_negotiations_update not created';
  END IF;
  RAISE NOTICE '✅ Trigger trg_negotiations_update created successfully';
END $$;

-- Verify expiration function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'expire_stale_negotiations'
  ) THEN
    RAISE EXCEPTION 'Migration failed: function expire_stale_negotiations not created';
  END IF;
  RAISE NOTICE '✅ Function expire_stale_negotiations created successfully';
  RAISE NOTICE '✅ Migration 004_add_negotiation_sessions.sql completed successfully';
END $$;
