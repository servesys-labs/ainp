Payments (402 + Pluggable Rails)

Overview
- Off‑chain credits remain the canonical balance.
- Payment rails top‑up the balance or settle specific flows (e.g., postage, premium endpoints).
- Endpoints may return HTTP 402 Payment Required with a challenge; the client pays via the chosen rail and retries.

Feature Flags
- `PAYMENTS_ENABLED` (default: false)
- `COINBASE_COMMERCE_ENABLED` (default: false)
- `LIGHTNING_ENABLED` (default: false)
- `USDC_ONCHAIN_ENABLED` (default: false)
- See: packages/broker/src/lib/feature-flags.ts

Database
- payment_requests: packages/db/migrations/015_add_payment_requests.sql
- payment_receipts: packages/db/migrations/016_add_payment_receipts.sql

Service
- PaymentService: packages/broker/src/services/payment.ts
  - `createRequest({ owner_did, amount_atomic, method, ... })` → PaymentChallenge (returns headers for 402 + Link to pay)
  - `markPaid(request_id, provider, tx_ref, amount_atomic, raw?)` → idempotent; credits internal ledger
  - `processWebhook(method, signature, payload)` → verify via provider; mark paid
  - Providers implement `PaymentProvider`

Providers (scaffold)
- CoinbaseCommerceDriver: packages/broker/src/services/payments/coinbase-commerce.ts
  - `createPayment()` returns `payment_url` (replace stub with real API)
  - `verifyWebhook()` parses payload; add signature verification
- LightningDriver (L402): packages/broker/src/services/payments/lightning.ts
  - `createPayment()` returns `lightning:<invoice>` deep link + invoice metadata
  - `verifyWebhook()` parse/verify paid event from your node/service
  - Add LNURL/WebLN flows in clients for mobile UX

API
- POST `/api/payments/requests` → create payment request (requires auth `x-ainp-did`)
- GET `/api/payments/requests/:id` → request status
- POST `/api/payments/webhooks/coinbase` → webhook (scaffold)

402 Challenges
- Endpoints can use `paymentRequiredMiddleware` to return 402 when balance is insufficient.
- Response includes:
  - `WWW-Authenticate: AINP-Pay realm="ainp", request_id="…", method="coinbase"`
  - `Link: <payment_url>; rel="payment"`
  - JSON body with `request_id`, `amount_atomic`, `method`, `payment_url`, `expires_at`

Env
- .env.example includes flags and provider settings (API key, webhook secret)
- `ATOMIC_PER_UNIT` (default 1000) controls unit conversion for providers

Notes
- Keep credits as the fast-path; use payments to top‑up.
- Add Lightning/EIP‑681/Solana Pay deep links for a mobile‑friendly flow.
