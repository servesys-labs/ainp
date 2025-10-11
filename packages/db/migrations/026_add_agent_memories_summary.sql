-- Migration 026: Add summary column to agent_memories

ALTER TABLE agent_memories
  ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN agent_memories.summary IS 'Optional distilled summary of content used for embedding/search';

