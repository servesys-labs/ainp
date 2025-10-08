/**
 * Example: Negotiation happy path
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 DID=<your_did> PEER=<peer_did> node -r ts-node/register examples/negotiation_flow.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DID = process.env.DID;
const PEER = process.env.PEER;

if (!DID || !PEER) {
  console.error('Set DID and PEER env vars');
  process.exit(1);
}

async function json(r: Response) { try { return await r.json(); } catch { return {}; } }

async function main() {
  // 1) Initiate negotiation
  const initRes = await fetch(`${BASE_URL}/api/negotiations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ainp-did': DID as string },
    body: JSON.stringify({
      intent_id: crypto.randomUUID(),
      initiator_did: DID,
      responder_did: PEER,
      initial_proposal: { price: 100, delivery_time: 5000, quality_sla: 0.95 },
      max_rounds: 5,
      ttl_minutes: 10,
    }),
  });
  const init = await json(initRes);
  console.log('Initiate:', initRes.status, init.id);

  // 2) Responder proposes (simulate from same client by passing proposer_did)
  const propRes = await fetch(`${BASE_URL}/api/negotiations/${init.id}/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ainp-did': DID as string },
    body: JSON.stringify({ proposer_did: PEER, proposal: { price: 90, delivery_time: 4500, quality_sla: 0.97 } }),
  });
  const prop = await json(propRes);
  console.log('Propose:', propRes.status, prop.state);

  // 3) Initiator accepts
  const accRes = await fetch(`${BASE_URL}/api/negotiations/${init.id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ainp-did': DID as string },
    body: JSON.stringify({ acceptor_did: DID }),
  });
  const acc = await json(accRes);
  console.log('Accept:', accRes.status, acc.state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

