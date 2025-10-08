Payments Flow (402 Challenges)

Goal
- Allow endpoints to request payment (top-up or per-use) via HTTP 402; client pays using chosen rail, then retries.

Actors
- Client/Agent; PaymentService (broker); Provider (Coinbase/Lightning/USDC); CreditService.

Sequence
1) Client calls payable endpoint.
2) Middleware checks balance; if insufficient:
   - PaymentService.createRequest(owner_did, amount, method)
   - Respond 402 with headers:
     - WWW-Authenticate: AINP-Pay realm="ainp", request_id="…", method="…"
     - Link: <payment_url>; rel="payment"
   - Body: PaymentChallenge ({ request_id, amount_atomic, method, payment_url, expires_at })
3) Client pays via link/QR; provider triggers webhook → PaymentService.processWebhook → markPaid → CreditService.deposit.
4) Client retries original request with same idempotency key; server spends credits and fulfills.

Tables
- payment_requests (015)
- payment_receipts (016)

Extensibility
- Providers implement PaymentProvider { createPayment, verifyWebhook }.
- Add Lightning (L402), USDC (EVM/Solana) with deep links (LNURL, EIP‑681, Solana Pay) for phone wallets.

Flags
- PAYMENTS_ENABLED gates /api/payments routes and related middleware.

