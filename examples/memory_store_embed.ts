/**
 * MemoryStore + Embeddings (dev) example
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 node -r ts-node/register examples/memory_store_embed.ts
 */

import { MemoryStore } from '@ainp/core';

async function devEmbed(baseUrl: string, text: string): Promise<number[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/dev/embed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`embed failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const base64 = json.embedding as string;
  const bytes = Buffer.from(base64, 'base64');
  // Convert back to Float32
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  return Array.from(f32);
}

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  const store = new MemoryStore();
  const agentDid = 'did:key:zMemoryDemoAgent';

  // Seed memories
  const texts = [
    'Schedule meetings and manage calendars for teams',
    'Summarize email threads and highlight action items',
    'Route intents to agents based on semantic similarity',
  ];

  for (const t of texts) {
    const emb = await devEmbed(baseUrl, t);
    const id = await store.putMemory({ agentDid, content: t, embedding: emb, tags: ['demo'] });
    console.log('[putMemory] id=', id);
  }

  // Query similar
  const query = 'Find an agent that can summarize emails';
  const qEmb = await devEmbed(baseUrl, query);

  // Optional threshold from env (e.g., MIN_SIM=0.55)
  const minEnv = process.env.MIN_SIM;
  const minSim = typeof minEnv === 'string' && minEnv.length > 0 ? Number(minEnv) : undefined;

  const results = await store.searchMemories({ agentDid, queryEmbedding: qEmb, minSimilarity: minSim, limit: 5 });
  console.log(`[search] query="${query}" top=${results.length} minSim=${minSim ?? 'none'}`);
  console.log('  similarity  content');
  for (const r of results) {
    const s = (r.similarity ?? 0).toFixed(3).padStart(10);
    const c = (r.content || '').slice(0, 72).replace(/\n/g, ' ');
    console.log(`  ${s}  ${c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
