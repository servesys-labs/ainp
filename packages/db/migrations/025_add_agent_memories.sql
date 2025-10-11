-- Migration 025: Long-term agent memories (optional)

CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_did TEXT NOT NULL,
  conversation_id TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_did, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_conversation ON agent_memories(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_updated ON agent_memories(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding ON agent_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE agent_memories IS 'Long-term semantic memories per agent with optional embeddings for recall';

