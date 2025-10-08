/**
 * Example: Create a payment request (402 challenge flow)
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 DID=<your_did> node -r ts-node/register examples/payments_402.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DID = process.env.DID;

if (!DID) {
  console.error('Set DID env var to your agent DID');
  process.exit(1);
}

async function main() {
  const amount_atomic = BigInt(process.env.AMOUNT_ATOMIC || '10000');
  const method = (process.env.METHOD || 'coinbase') as 'coinbase' | 'lightning' | 'usdc' | 'credits';

  const r = await fetch(`${BASE_URL}/api/payments/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ainp-did': DID as string,
    },
    body: JSON.stringify({ amount_atomic: amount_atomic.toString(), method, currency: 'credits', description: 'Top-up' }),
  });

  console.log('Status:', r.status);
  console.log('Headers:', Object.fromEntries(r.headers.entries()));
  const body = await r.json().catch(() => ({}));
  console.log('Body:', body);
  console.log('\nIf a payment_url is provided, open it to complete payment, then retry your payable request.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

