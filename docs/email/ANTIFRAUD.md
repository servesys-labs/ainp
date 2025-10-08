Anti‑Fraud Controls for Email (AINP)

Goals
- Reduce spam and replay, add economic friction for cold outreach, and provide audit trail.

Controls
- Replay Protection
  - Redis-backed key on envelope.id|from_did|trace_id (5m TTL)
  - Flag: REPLAY_PROTECTION_ENABLED=true
- Content Dedupe
  - SHA-256 hash of from|to|subject|body, TTL window (default 24h)
  - Flags: EMAIL_CONTENT_DEDUPE_ENABLED, EMAIL_DEDUPE_TTL_SECONDS
- Greylisting (optional)
  - First contact delayed (default 5m) per from→to pair
  - Flags: EMAIL_GREYLIST_ENABLED, EMAIL_GREYLIST_DELAY_SECONDS
- Postage (optional)
  - Small credit debit for first-contact direct email (to_did required)
  - Flags: EMAIL_POSTAGE_ENABLED, EMAIL_POSTAGE_AMOUNT_ATOMIC

Implementation
- Services
  - AntiFraudService (Redis): replay, dedupe, greylist
  - CreditService.spend(amount): debit credits with transaction record
- Middleware (in /api/intents)
  - replayProtectionMiddleware
  - emailGuardMiddleware (dedupe → greylist → postage)

Recommended Defaults (local dev)
- REPLAY_PROTECTION_ENABLED=true
- EMAIL_CONTENT_DEDUPE_ENABLED=true
- EMAIL_DEDUPE_TTL_SECONDS=3600
- EMAIL_GREYLIST_ENABLED=false
- EMAIL_POSTAGE_ENABLED=false

Future Enhancements
- Receiver allowlist/consent store (contacts table)
- Per-sender velocity limits per route (proofs/intents)
- Attachment scanning and size caps
- Domain-linked DID (did:web) alignment with DKIM/DMARC for SMTP bridge

