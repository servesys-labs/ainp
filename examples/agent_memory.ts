/**
 * Agent + MemoryManager example
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 REDIS_URL=redis://localhost:6379 node -r ts-node/register examples/agent_memory.ts
 */

import { AINPAgent, Logger, MemoryManager } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'agent-memory-demo' });

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
  const redisUrl = process.env.REDIS_URL; // optional

  // Demo identity (replace with real keys for production)
  const did = 'did:key:zDemoDidForMemory';
  const privateKey = Buffer.alloc(48); // placeholder; replace with real PKCS8 DER if using AINPAgent.signData path

  // Memory manager scoped to this agent
  const memory = new MemoryManager({ did, redisUrl, maxPerConversation: 50 });
  await memory.connect();

  // Create agent and attach basic intent handler with memory capture
  const agent = new AINPAgent({
    did,
    privateKey,
    discoveryUrl: baseUrl.replace(/^http/, 'ws') + `/?did=${encodeURIComponent(did)}`,
  });

  agent.onIntent('*', async (envelope, intent: any) => {
    const conv = intent?.semantics?.conversation_id || envelope.trace_id;
    const content = intent?.semantics?.content || '[no content]';
    await memory.remember(conv, { role: 'user', content, timestamp: envelope.timestamp });

    // Build a simple response using last 3 turns
    const recent = await memory.recall(conv, 3);
    const reply = `Got your message. Recent context: ${recent.map(r => r.content).join(' | ')}`;

    await memory.remember(conv, { role: 'agent', content: reply });
    return { echo: reply };
  });

  await agent.start();
  logger.info('Agent with memory started', { did });

  // Stop gracefully after demo time
  setTimeout(async () => {
    await agent.stop();
    await memory.close();
    process.exit(0);
  }, 30_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

