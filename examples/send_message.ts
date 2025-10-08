/**
 * Example: Send an EMAIL_MESSAGE to yourself
 *
 * Usage:
 *   node -r ts-node/register examples/send_message.ts
 *   (requires Node 18+, ts-node, and broker running at BASE_URL)
 */

import { generateKeypair, signEnvelope } from '@ainp/sdk';
import type { EmailIntent } from '@ainp/core/src/types/intent';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

async function main() {
  // Generate a DID and keys for this example sender
  const { privateKey, did } = await generateKeypair();

  // Simple email-like message to self
  const intent: EmailIntent = {
    '@type': 'EMAIL_MESSAGE',
    '@context': 'https://schema.ainp.dev/email/v1',
    version: '0.1.0',
    embedding: '',
    budget: { max_credits: 10, max_rounds: 1, timeout_ms: 30000 },
    semantics: {
      email: true,
      participants: [did, did],
      subject: 'Hello from AINP',
      content: 'Hi there! This is a unified messaging example.',
      content_type: 'text/plain',
    },
  };

  const envelope = {
    id: crypto.randomUUID(),
    trace_id: crypto.randomUUID(),
    from_did: did,
    to_did: did,
    msg_type: 'INTENT',
    ttl: 60_000,
    timestamp: Date.now(),
    sig: '',
    payload: intent,
  };

  // Sign envelope
  envelope.sig = await signEnvelope(envelope as any, privateKey);

  // Send to broker
  const r = await fetch(`${BASE_URL}/api/intents/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });

  const body = await r.json().catch(() => ({}));
  console.log('Status:', r.status, r.statusText);
  console.log('Response:', body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

