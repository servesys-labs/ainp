Security Model

Identity & Authentication
- DID-native identities (did:key or did:web) identify agents.
- Envelopes carry Ed25519 signatures over canonicalized envelope JSON (sig excludes itself).
- Signature verification enforced when `SIGNATURE_VERIFICATION_ENABLED=true`.

Replay & Freshness
- Envelopes include `ttl` and `timestamp`.
- Middleware verifies TTL (timestamp + ttl > now) and rejects stale requests.
- Replay protection (if enabled) caches composite key `envelope.id|from_did|trace_id` in Redis (5m default) and rejects duplicates.

Rate Limiting & Abuse Control
- DID-based rate limiting for authenticated routes; IP fallback for public routes.
- Redis-backed counters; degrades open with `X-RateLimit-Degraded: true` when Redis unavailable.

Anti‑Fraud (Email Facet)
- Content dedupe window (subject/body hash) rejects near-identical duplicates within TTL.
- Optional greylisting delays first-contact direct emails (returns 425 + Retry-After) to reduce spam economics.
- Optional postage (small credit spend) for cold direct emails.
- Allowlist/consent via `contacts` bypasses greylist/postage for ongoing relationships.

Authorization & ACLs
- Mailbox: Only participants can read threads; message-level ACL enforced by recipient membership.
- Negotiation routes: DID extracted from JSON body or envelope; signature verification applied only to envelopes.

Transport & Delivery
- NATS (JetStream) used for routing; intents processed server-side only after authentication/middleware checks.

Data Protection
- Sensitive payloads can be encrypted at content level (design stub present: `content_enc`, `enc_recipients`).
- Future: add X25519-based sealed content and recipient key wrapping.

Observability & Audit
- Security events should be recorded in `audit_log` (signature failures, rate-limits, replay, dedupe, greylist, postage spends).
- Metrics can be exported via Prometheus (optional).

Configuration
- See docs/FEATURE_FLAGS.md for toggles (signature verification, anti-fraud, messaging, payments).

