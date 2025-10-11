# Agent Memory Integration (Alpha)

This repo provides transport, discovery, and mailbox storage. For agent “memory”, use the SDK’s optional MemoryManager to keep short‑term turns per conversation, with Redis persistence if available.

## Options
- Short‑term memory: `MemoryManager` (SDK) stores recent turns per conversation.
- Mailbox context: Read prior MessageIntents via `/api/mail` (threads/inbox) to rebuild context across restarts.
- Long‑term memory: For semantic recall, store distilled facts/embeddings in Postgres (pgvector) using `@ainp/core` VectorClient (future docs).

## Quick Start (Short‑Term Memory)

1) Create a MemoryManager and attach it in your agent handler:

```ts
import { AINPAgent, MemoryManager } from '@ainp/sdk';

const did = '<your did>'; const privateKey = Buffer.from('<pkcs8-der>','base64');
const memory = new MemoryManager({ did, redisUrl: 'redis://localhost:6379', maxPerConversation: 50 });
await memory.connect();

const agent = new AINPAgent({ did, privateKey, discoveryUrl: 'ws://localhost:8080/?did=' + encodeURIComponent(did) });

agent.onIntent('*', async (env, intent: any) => {
  const conv = intent?.semantics?.conversation_id || env.trace_id;
  const text = intent?.semantics?.content || '';
  await memory.remember(conv, { role: 'user', content: text, timestamp: env.timestamp });
  const recent = await memory.recall(conv, 6);
  const reply = summarize(recent);
  await memory.remember(conv, { role: 'agent', content: reply });
  return { reply };
});
```

2) Example runnable: `examples/agent_memory.ts`

## Next (Long‑Term Memory)
- Long‑term store: `agent_memories` table is provided (migration 025). Use `@ainp/core` MemoryStore to write/read memories.
- Embeddings in dev: use broker dev route to embed text (development only):

```
POST /api/dev/embed { text: string } -> { embedding: base64 }
```

- Example that embeds and searches:
  - `examples/memory_store_embed.ts`

- Use mailbox threads (`/api/mail/threads/:conversation_id`) as source text for distillation.
