/**
 * MemoryDistillerService
 *
 * Periodically distills recent mailbox messages into long-term semantic memories
 * stored in Postgres (agent_memories) with embeddings.
 */

import { DatabaseClient } from '../lib/db-client';
import { EmbeddingService } from './embeddings';
import { RedisClient } from '../lib/redis-client';
import { MemoryStore } from '@ainp/core';
import { SummarizationService } from './summarization';

function decodeEmbeddingBase64ToArray(base64: string): number[] {
  const bytes = Buffer.from(base64, 'base64');
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  return Array.from(f32);
}

export class MemoryDistillerService {
  private memoryStore: MemoryStore;

  constructor(
    private db: DatabaseClient,
    private embedding: EmbeddingService,
    private redis: RedisClient,
    private summarizer?: SummarizationService
  ) {
    this.memoryStore = new MemoryStore({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Process messages received within the last `windowMinutes` minutes.
   * Best-effort dedupe via Redis to avoid reprocessing the same message ID.
   */
  async processWindow(windowMinutes: number = 10, limit: number = 200): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const res = await this.db.query(
      `SELECT id, conversation_id, from_did, to_dids, subject, body_text, received_at
       FROM messages
       WHERE received_at >= $1
       ORDER BY received_at DESC
       LIMIT $2`,
      [since, limit]
    );

    let stored = 0;
    for (const row of res.rows) {
      const msgId: string = row.id;
      // Redis dedupe key per message ID
      const dedupeKey = `distilled:msg:${msgId}`;
      const already = await this.redis.getCachedDiscoveryResult<string>(dedupeKey);
      if (already) continue;

      const toDids: string[] = Array.isArray(row.to_dids) ? row.to_dids : [];
      const conversationId: string | null = row.conversation_id || null;
      const subject: string = row.subject || '';
      const content: string = row.body_text || '';
      const text = subject ? `${subject}\n\n${content}` : content;

      // Optional summarization step
      let summary: string | undefined = undefined;
      if (process.env.MEMORY_DISTILLER_SUMMARIZE === 'true' && this.summarizer) {
        try {
          summary = await this.summarizer.summarize(text);
        } catch (_e) {
          summary = undefined; // fall back to raw text
        }
      }

      // Generate embedding (use summary if available)
      const baseText = summary && summary.length > 0 ? summary : text;
      const base64 = await this.embedding.embed(baseText);
      const vector = decodeEmbeddingBase64ToArray(base64);

      // Store memory for each recipient (their mailbox → their memory)
      for (const agentDid of toDids) {
        try {
          await this.memoryStore.putMemory({
            agentDid,
            content: text.slice(0, 10000),
            summary,
            conversationId: conversationId || undefined,
            embedding: vector,
            tags: ['mailbox', 'distilled'],
          });
          stored++;
        } catch (e) {
          // continue
        }
      }

      // Mark as processed for 7 days
      await this.redis.cacheDiscoveryResult(dedupeKey, '1', 7 * 24 * 3600);
    }

    return stored;
  }
}
