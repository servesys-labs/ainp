-- Migration 013: Add threads table for conversation management
-- Groups messages by conversation_id for threaded views
-- Part of unified messaging foundation (RFC TBD)

-- Threads table: conversation metadata and aggregates
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,                      -- conversation_id from messages
  subject TEXT,                             -- Thread subject (from first message or latest)
  participants JSONB NOT NULL DEFAULT '[]', -- Array of participant DIDs with roles

  -- Aggregates
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,             -- Timestamp of most recent message
  first_message_at TIMESTAMPTZ,            -- Timestamp of first message

  -- Thread metadata
  labels TEXT[] DEFAULT '{}',              -- Thread-level labels (different from message labels)
  archived BOOLEAN DEFAULT FALSE,
  muted BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_threads_last_message_at ON threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_first_message_at ON threads(first_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC);

-- GIN indexes for participants and labels
CREATE INDEX IF NOT EXISTS idx_threads_participants_gin ON threads USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_threads_labels_gin ON threads USING GIN (labels);

-- Composite index for active threads (non-archived, sorted by last message)
CREATE INDEX IF NOT EXISTS idx_threads_active ON threads(last_message_at DESC) WHERE archived = FALSE;

-- Function to automatically update thread metadata when messages are inserted
CREATE OR REPLACE FUNCTION update_thread_on_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if message has a conversation_id
  IF NEW.conversation_id IS NOT NULL THEN
    INSERT INTO threads (id, subject, participants, message_count, last_message_at, first_message_at)
    VALUES (
      NEW.conversation_id,
      NEW.subject,
      jsonb_build_array(
        jsonb_build_object('did', NEW.from_did, 'role', 'sender')
      ) ||
      (SELECT jsonb_agg(jsonb_build_object('did', did, 'role', 'recipient'))
       FROM unnest(NEW.to_dids) AS did),
      1,
      NEW.created_at,
      NEW.created_at
    )
    ON CONFLICT (id) DO UPDATE SET
      message_count = threads.message_count + 1,
      last_message_at = GREATEST(threads.last_message_at, NEW.created_at),
      updated_at = NOW(),
      -- Merge participants (add new ones)
      participants = threads.participants ||
        (SELECT jsonb_agg(DISTINCT participant)
         FROM (
           SELECT participant FROM jsonb_array_elements(threads.participants) AS participant
           UNION
           SELECT jsonb_build_object('did', NEW.from_did, 'role', 'sender')
           UNION
           SELECT jsonb_build_object('did', did, 'role', 'recipient')
           FROM unnest(NEW.to_dids) AS did
         ) AS all_participants);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update threads on message insert
DROP TRIGGER IF EXISTS trigger_update_thread_on_message ON messages;
CREATE TRIGGER trigger_update_thread_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_on_message_insert();

-- Function to update unread count when messages are marked as read
CREATE OR REPLACE FUNCTION update_thread_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if read_at changed from NULL to non-NULL
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL AND NEW.conversation_id IS NOT NULL THEN
    UPDATE threads
    SET unread_count = GREATEST(0, unread_count - 1),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update unread count on message read
DROP TRIGGER IF EXISTS trigger_update_thread_unread ON messages;
CREATE TRIGGER trigger_update_thread_unread
  AFTER UPDATE OF read_at ON messages
  FOR EACH ROW
  WHEN (OLD.read_at IS DISTINCT FROM NEW.read_at)
  EXECUTE FUNCTION update_thread_unread_count();

-- Comments for documentation
COMMENT ON TABLE threads IS 'Conversation/thread metadata with message aggregates';
COMMENT ON COLUMN threads.id IS 'Conversation ID (matches messages.conversation_id)';
COMMENT ON COLUMN threads.participants IS 'Array of participant DIDs with roles (sender, recipient)';
COMMENT ON COLUMN threads.message_count IS 'Total number of messages in thread';
COMMENT ON COLUMN threads.unread_count IS 'Number of unread messages in thread';
COMMENT ON COLUMN threads.last_message_at IS 'Timestamp of most recent message';
