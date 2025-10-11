/**
 * Admin routes (guarded by ADMIN_TOKEN)
 */

import { Router } from 'express';
import { SlashingService } from '../services/slashing.js';
import { DatabaseClient } from '../lib/db-client.js';
import { EmbeddingService } from '../services/embeddings.js';
import { MemoryStore } from '@ainp/core';

function requireAdmin(req: any, res: any, next: any) {
  const token = process.env.ADMIN_TOKEN || '';
  const auth = (req.headers['authorization'] as string) || '';
  if (!token || !auth.startsWith('Bearer ') || auth.slice(7) !== token) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  next();
}

function decodeEmbeddingBase64ToArray(base64: string): number[] {
  const bytes = Buffer.from(base64, 'base64');
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  return Array.from(f32);
}

export function createAdminRoutes(
  slashing: SlashingService,
  db: DatabaseClient,
  embedding: EmbeddingService
): Router {
  const router = Router();
  const memoryStore = new MemoryStore({ connectionString: process.env.DATABASE_URL });

  // Slash stake (prototype)
  router.post('/slash', requireAdmin, async (req, res) => {
    try {
      const { agent_did, amount_atomic, reason } = req.body || {};
      if (!agent_did || !amount_atomic) return res.status(400).json({ error: 'INVALID_REQUEST' });
      await slashing.slash(agent_did, BigInt(amount_atomic), reason);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // List recent memories for an agent (debug)
  router.get('/memories', requireAdmin, async (req, res) => {
    try {
      const agentDid = (req.query.agent_did as string) || '';
      if (!agentDid) return res.status(400).json({ error: 'INVALID_REQUEST', message: 'agent_did required' });
      const limit = Math.min(parseInt((req.query.limit as string) || '50'), 200);
      const conversationId = (req.query.conversation_id as string) || undefined;
      const since = (req.query.since as string) || undefined; // ISO timestamp

      let rows;
      if (conversationId) {
        rows = await memoryStore.getMemoriesByConversation({ agentDid, conversationId, limit, before: undefined });
      } else {
        const q = `SELECT id, agent_did, conversation_id, LEFT(content, 200) AS preview, summary, tags, created_at
                   FROM agent_memories
                   WHERE agent_did = $1 ${since ? 'AND created_at >= $2' : ''}
                   ORDER BY created_at DESC
                   LIMIT ${limit}`;
        const params: any[] = [agentDid];
        if (since) params.push(new Date(since));
        const r = await db.query(q, params);
        rows = r.rows;
      }

      res.json({ agent_did: agentDid, count: rows.length, memories: rows });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Semantic search memories (dev/admin)
  router.post('/memories/search', requireAdmin, async (req, res) => {
    try {
      const { agent_did, query, min_similarity = 0.7, limit = 10 } = req.body || {};
      if (!agent_did || !query) return res.status(400).json({ error: 'INVALID_REQUEST', message: 'agent_did and query required' });

      const base64 = await embedding.embed(query);
      const vector = decodeEmbeddingBase64ToArray(base64);
      const results = await memoryStore.searchMemories({ agentDid: agent_did, queryEmbedding: vector, minSimilarity: min_similarity, limit });
      res.json({ agent_did, results });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
