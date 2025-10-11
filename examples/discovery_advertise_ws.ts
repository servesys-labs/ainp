/**
 * Discovery + Advertise + WebSocket Results Example
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 node -r ts-node/register examples/discovery_advertise_ws.ts
 */

import { advertise, discover, ResultsWebSocket, generateKeypair } from '@ainp/sdk';
import type { SemanticAddress, DiscoveryQuery } from '@ainp/core';

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8080';

  // Generate an ephemeral DID for demo purposes
  const kp = await generateKeypair();
  const did = kp.did;
  console.log('[demo] DID:', did);

  // Prepare a simple capability advertisement (server will embed descriptions)
  const address: SemanticAddress = {
    did,
    capabilities: [
      {
        description: 'Answer questions about AINP and semantic messaging',
        embedding: '', // Allow server to embed
        tags: ['ainp', 'messaging', 'discovery'],
        version: '1.0.0',
      },
    ],
    trust: {
      score: 0.7,
      dimensions: { reliability: 0.7, honesty: 0.7, competence: 0.7, timeliness: 0.7 },
      decay_rate: 0.977,
      last_updated: Date.now(),
    },
    credentials: [],
  };

  // Advertise
  const advRes = await advertise(address, {
    baseUrl,
    did,
    privateKey: kp.privateKey,
    ttlMinutes: 60,
  });
  console.log('[advertise] result:', advRes);

  // Subscribe to DISCOVER_RESULT via WebSocket
  const ws = new ResultsWebSocket({ baseUrl, did, reconnect: true });
  ws.onDiscoverResult((env) => {
    const results = (env.payload as any)?.results || [];
    console.log(`[ws] DISCOVER_RESULT received (${results.length} results)`);
    for (const r of results) {
      console.log('  -', r.did, r.capabilities?.[0]?.description);
    }
  });
  ws.connect();

  // Perform a discover query (envelope-based). Server returns HTTP JSON immediately
  const query: DiscoveryQuery = {
    description: 'semantic messaging and agent discovery',
    tags: ['ainp'],
    min_trust: 0.5,
  };

  const results = await discover(query, {
    baseUrl,
    did,
    privateKey: kp.privateKey,
  });
  console.log(`[discover] HTTP results (${results.length}):`);
  for (const r of results) {
    console.log('  -', r.did, r.capabilities?.[0]?.description);
  }

  // Keep process alive briefly to observe WebSocket delivery
  await new Promise((r) => setTimeout(r, 3000));
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

