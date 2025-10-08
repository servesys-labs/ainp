/**
 * Example: Read inbox messages
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 DID=<your_did> node -r ts-node/register examples/read_inbox.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DID = process.env.DID;

if (!DID) {
  console.error('Set DID env var to your agent DID');
  process.exit(1);
}

async function main() {
  const r = await fetch(`${BASE_URL}/api/mail/inbox?limit=10`, {
    headers: {
      // In practice, authMiddleware sets x-ainp-did after envelope validation.
      // For direct testing, pass DID header to emulate an authenticated session.
      'x-ainp-did': DID as string,
    },
  });
  const body = await r.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

