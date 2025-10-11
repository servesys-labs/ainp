import { createRedisClient, RedisClient } from '@ainp/core';

export interface MemoryEntry {
  role: 'user' | 'agent' | 'system' | string;
  content: string;
  timestamp?: number;
  meta?: Record<string, unknown>;
}

export interface MemoryManagerOptions {
  did: string;                 // Agent DID (namespaces keys)
  redisUrl?: string;           // Optional Redis URL; if omitted, uses in-memory fallback
  maxPerConversation?: number; // Default 50
}

/**
 * Minimal short-term memory manager. Stores recent turns per conversation.
 * - If redisUrl provided: persists JSON arrays in Redis keys: memory:<did>:<conv>
 * - Else: uses an in-process Map (lost on restart)
 */
export class MemoryManager {
  private did: string;
  private redis?: RedisClient;
  private mem = new Map<string, MemoryEntry[]>();
  private maxPerConversation: number;

  constructor(opts: MemoryManagerOptions) {
    this.did = opts.did;
    this.maxPerConversation = opts.maxPerConversation ?? 50;
    if (opts.redisUrl) {
      this.redis = createRedisClient({ url: opts.redisUrl });
    }
  }

  async connect(): Promise<void> {
    if (this.redis) {
      await this.redis.connect();
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.close();
    }
  }

  /** Append a memory entry to a conversation (kept to max entries) */
  async remember(conversationId: string, entry: MemoryEntry): Promise<void> {
    const key = this.key(conversationId);
    entry.timestamp = entry.timestamp ?? Date.now();

    if (!this.redis) {
      const arr = this.mem.get(key) || [];
      arr.push(entry);
      while (arr.length > this.maxPerConversation) arr.shift();
      this.mem.set(key, arr);
      return;
    }

    // Redis path: store JSON array
    const current = await this.redis.get(key);
    const arr: MemoryEntry[] = current ? JSON.parse(current) : [];
    arr.push(entry);
    while (arr.length > this.maxPerConversation) arr.shift();
    await this.redis.set(key, JSON.stringify(arr));
  }

  /** Retrieve last N entries (default: maxPerConversation) */
  async recall(conversationId: string, limit?: number): Promise<MemoryEntry[]> {
    const key = this.key(conversationId);
    const n = limit ?? this.maxPerConversation;

    if (!this.redis) {
      const arr = this.mem.get(key) || [];
      return arr.slice(-n);
    }

    const current = await this.redis.get(key);
    const arr: MemoryEntry[] = current ? JSON.parse(current) : [];
    return arr.slice(-n);
  }

  /** Delete conversation memory */
  async forget(conversationId: string): Promise<void> {
    const key = this.key(conversationId);
    if (!this.redis) {
      this.mem.delete(key);
      return;
    }
    await this.redis.delete(key);
  }

  private key(conv: string): string {
    return `memory:${this.did}:${conv}`;
  }
}

