-- Migration 012: Add messages table for unified agent-to-agent messaging
-- Supports email, chat, notifications via MessageIntent base schema
-- Part of unified messaging foundation (RFC TBD)

-- Messages table: stores all agent-to-agent messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id TEXT NOT NULL,                -- Original AINP envelope ID
  conversation_id TEXT,                      -- Thread/conversation identifier

  -- Participants (from envelope routing)
  from_did TEXT NOT NULL,                   -- Sender DID
  to_dids TEXT[] NOT NULL DEFAULT '{}',     -- Primary recipients (from envelope.to_did or discovery)
  cc_dids TEXT[],                           -- Carbon copy recipients (optional)
  bcc_dids TEXT[],                          -- Blind carbon copy (optional)

  -- Message content
  subject TEXT,                             -- Optional subject/title
  body_text TEXT NOT NULL,                  -- Message body (canonical text/markdown)
  body_mime TEXT DEFAULT 'text/plain',      -- MIME type of body (text/plain, text/markdown, text/html)
  body_hash TEXT,                           -- sha256:... of body for dedupe/audit

  -- Metadata
  headers JSONB DEFAULT '{}',               -- Email headers, DKIM results, etc.
  attachments JSONB DEFAULT '[]',           -- Array of {filename, mime_type, size_bytes, content_hash, url}
  labels TEXT[] DEFAULT '{}',               -- User-defined labels (inbox, sent, archive, important)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- When message was created by sender
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When message was stored in mailbox
  read_at TIMESTAMPTZ,                             -- When recipient marked as read

  -- Intent metadata (for future analytics)
  intent_type TEXT DEFAULT 'MESSAGE',       -- MESSAGE, EMAIL_MESSAGE, CHAT_MESSAGE, NOTIFICATION
  intent_context TEXT,                      -- @context from intent (schema version)

  -- Encryption metadata (future)
  content_enc TEXT DEFAULT 'plain',         -- Encryption method (plain, x25519-sealed)
  enc_recipients JSONB                      -- Encrypted keys per recipient DID
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_did ON messages(from_did);
CREATE INDEX IF NOT EXISTS idx_messages_envelope_id ON messages(envelope_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id) WHERE conversation_id IS NOT NULL;

-- GIN indexes for array/JSONB queries
CREATE INDEX IF NOT EXISTS idx_messages_to_dids_gin ON messages USING GIN (to_dids);
CREATE INDEX IF NOT EXISTS idx_messages_labels_gin ON messages USING GIN (labels);

-- Composite index for mailbox queries (owner's inbox sorted by time)
CREATE INDEX IF NOT EXISTS idx_messages_inbox ON messages(from_did, created_at DESC) WHERE read_at IS NULL;

-- Full-text search index (optional, enable if needed for search features)
-- CREATE INDEX IF NOT EXISTS idx_messages_fts ON messages USING GIN (to_tsvector('english', COALESCE(subject, '') || ' ' || body_text));

-- Dedupe constraint: prevent duplicate envelope_id storage
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_envelope_unique ON messages(envelope_id);

-- Body hash index for content deduplication (used by anti-fraud)
CREATE INDEX IF NOT EXISTS idx_messages_body_hash ON messages(body_hash) WHERE body_hash IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE messages IS 'Unified agent-to-agent messaging storage (email, chat, notifications)';
COMMENT ON COLUMN messages.envelope_id IS 'Original AINP envelope ID for correlation with routing logs';
COMMENT ON COLUMN messages.conversation_id IS 'Thread/conversation identifier (UUID or stable hash)';
COMMENT ON COLUMN messages.body_hash IS 'SHA256 hash of body for content deduplication and audit';
COMMENT ON COLUMN messages.to_dids IS 'Primary recipient DIDs (from envelope.to_did or discovery results)';
COMMENT ON COLUMN messages.labels IS 'User-defined labels for organization (inbox, sent, archive, important)';
COMMENT ON COLUMN messages.content_enc IS 'Encryption method: plain (default) or x25519-sealed (future)';
