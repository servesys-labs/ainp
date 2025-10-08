-- Migration 014: Add contacts table for consent and allowlist management
-- Tracks per-peer relationships for greylist/postage bypass and contact management
-- Part of unified messaging foundation (RFC TBD)

-- Contacts table: peer relationships and consent state
CREATE TABLE IF NOT EXISTS contacts (
  owner_did TEXT NOT NULL,                  -- Agent that owns this contact entry
  peer_did TEXT NOT NULL,                   -- The other agent (contact)

  -- Contact metadata
  alias TEXT,                               -- Human-friendly name/alias for peer
  notes TEXT,                               -- Optional notes about contact

  -- Consent and trust state
  consent_state TEXT NOT NULL DEFAULT 'unknown', -- unknown, consented, blocked, trusted
  allowlist BOOLEAN DEFAULT FALSE,          -- Skip greylist/postage for this peer
  trust_override REAL,                      -- Optional manual trust score override (0.0-1.0)

  -- Communication stats
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,          -- Total messages exchanged (sent + received)
  last_message_at TIMESTAMPTZ,             -- Timestamp of most recent message

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Primary key: one contact entry per owner-peer pair
  PRIMARY KEY (owner_did, peer_did)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_did);
CREATE INDEX IF NOT EXISTS idx_contacts_peer ON contacts(peer_did);
CREATE INDEX IF NOT EXISTS idx_contacts_consent_state ON contacts(consent_state);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts(last_message_at DESC);

-- Composite index for allowlist queries (owner + peer with allowlist=true)
CREATE INDEX IF NOT EXISTS idx_contacts_allowlist ON contacts(owner_did, peer_did) WHERE allowlist = TRUE;

-- Function to automatically update contact on message insert
CREATE OR REPLACE FUNCTION update_contact_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Update sender's contact entry for each recipient
  INSERT INTO contacts (owner_did, peer_did, consent_state, last_seen_at, message_count, last_message_at)
  SELECT NEW.from_did, did, 'unknown', NEW.created_at, 1, NEW.created_at
  FROM unnest(NEW.to_dids) AS did
  ON CONFLICT (owner_did, peer_did) DO UPDATE SET
    message_count = contacts.message_count + 1,
    last_seen_at = GREATEST(contacts.last_seen_at, NEW.created_at),
    last_message_at = GREATEST(contacts.last_message_at, NEW.created_at),
    updated_at = NOW();

  -- Update each recipient's contact entry for sender
  INSERT INTO contacts (owner_did, peer_did, consent_state, last_seen_at, message_count, last_message_at)
  SELECT did, NEW.from_did, 'unknown', NEW.created_at, 1, NEW.created_at
  FROM unnest(NEW.to_dids) AS did
  ON CONFLICT (owner_did, peer_did) DO UPDATE SET
    message_count = contacts.message_count + 1,
    last_seen_at = GREATEST(contacts.last_seen_at, NEW.created_at),
    last_message_at = GREATEST(contacts.last_message_at, NEW.created_at),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update contacts on message insert
DROP TRIGGER IF EXISTS trigger_update_contact_on_message ON messages;
CREATE TRIGGER trigger_update_contact_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_on_message();

-- Function to check if peer is allowlisted (for anti-fraud middleware)
CREATE OR REPLACE FUNCTION is_peer_allowlisted(owner TEXT, peer TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM contacts
    WHERE owner_did = owner
      AND peer_did = peer
      AND (allowlist = TRUE OR consent_state = 'trusted')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update consent state
CREATE OR REPLACE FUNCTION update_consent_state(owner TEXT, peer TEXT, new_state TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO contacts (owner_did, peer_did, consent_state)
  VALUES (owner, peer, new_state)
  ON CONFLICT (owner_did, peer_did) DO UPDATE SET
    consent_state = new_state,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE contacts IS 'Per-agent contact list with consent state and communication stats';
COMMENT ON COLUMN contacts.consent_state IS 'Consent state: unknown, consented, blocked, trusted';
COMMENT ON COLUMN contacts.allowlist IS 'If true, skip greylist and postage for this peer';
COMMENT ON COLUMN contacts.trust_override IS 'Optional manual trust score override (0.0-1.0)';
COMMENT ON COLUMN contacts.message_count IS 'Total messages exchanged between owner and peer';
