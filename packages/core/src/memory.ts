/**
 * Long-term Memory Store (pgvector)
 * Provides basic create/search/query operations over agent_memories.
 */

import { Pool } from 'pg';

export interface MemoryStoreConfig {
  connectionString?: string;
}

export interface PutMemoryParams {
  agentDid: string;
  content: string;
  summary?: string;
  conversationId?: string;
  embedding?: number[]; // 1536-d vector; if omitted, only content is stored
  tags?: string[];
}

export interface MemoryRow {
  id: string;
  agent_did: string;
  conversation_id: string | null;
  content: string;
  tags: string[];
  created_at: string;
  similarity?: number;
}

export class MemoryStore {
  private pool: Pool;

  constructor(cfg: MemoryStoreConfig = {}) {
    const connectionString = cfg.connectionString || process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp';
    this.pool = new Pool({ connectionString });
  }

  async putMemory(params: PutMemoryParams): Promise<string> {
    const { agentDid, content, summary, conversationId, embedding, tags = [] } = params;
    const result = await this.pool.query(
      `INSERT INTO agent_memories (agent_did, conversation_id, content, summary, embedding, tags)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        agentDid,
        conversationId || null,
        content,
        summary || null,
        embedding ? `[${embedding.join(',')}]` : null,
        tags,
      ]
    );
    return result.rows[0].id as string;
  }

  async searchMemories(params: {
    agentDid: string;
    queryEmbedding: number[];
    minSimilarity?: number; // optional; if omitted, no similarity filter
    limit?: number; // default 10
  }): Promise<MemoryRow[]> {
    const { agentDid, queryEmbedding, minSimilarity, limit = 10 } = params;
    if (queryEmbedding.length !== 1536) {
      throw new Error(`Invalid embedding dimension: expected 1536, got ${queryEmbedding.length}`);
    }
    let sql = `SELECT id, agent_did, conversation_id, content, tags, created_at,
                      1 - (embedding <=> $1::vector) AS similarity
               FROM agent_memories
               WHERE agent_did = $2 AND embedding IS NOT NULL`;
    const vals: any[] = [`[${queryEmbedding.join(',')}]`, agentDid];
    if (typeof minSimilarity === 'number') {
      sql += ` AND 1 - (embedding <=> $1::vector) >= $3`;
      vals.push(minSimilarity);
    }
    sql += ` ORDER BY similarity DESC, created_at DESC LIMIT ${limit}`;
    const result = await this.pool.query(sql, vals);
    return result.rows.map((r) => ({
      id: r.id,
      agent_did: r.agent_did,
      conversation_id: r.conversation_id,
      content: r.content,
      tags: r.tags,
      created_at: r.created_at,
      similarity: parseFloat(r.similarity),
    }));
  }

  async getMemoriesByConversation(params: {
    agentDid: string;
    conversationId: string;
    limit?: number; // default 50
    before?: string; // ISO timestamp cursor
  }): Promise<MemoryRow[]> {
    const { agentDid, conversationId, limit = 50, before } = params;
    let sql = `SELECT id, agent_did, conversation_id, content, tags, created_at
               FROM agent_memories
               WHERE agent_did = $1 AND conversation_id = $2`;
    const vals: any[] = [agentDid, conversationId];
    if (before) {
      sql += ` AND created_at < $3`;
      vals.push(new Date(before));
    }
    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
    const result = await this.pool.query(sql, vals);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
