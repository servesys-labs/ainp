Email Intent Schema (AINP)

Summary
- Defines a structured intent for agent-to-agent email.
- Works with AINP envelopes and anti-fraud guards (replay, dedupe, postage, greylist).

Type
- @type: EMAIL_MESSAGE
- @context: https://schema.ainp.dev/email/v1

Interface (TypeScript)
- See: packages/core/src/types/intent.ts: EmailIntent, EmailSemantics, EmailAttachment

Semantics
- email: true
- from, to, cc, bcc: human-friendly addresses (optional)
- subject: string
- body: string (text/markdown)
- attachments: list with content-hash (sha256:…) and size/mime
- headers: optional key/value

Anti‑Fraud Integration
- Replay protection (envelope.id + trace_id) — enabled via REPLAY_PROTECTION_ENABLED
- Content dedupe window — EMAIL_CONTENT_DEDUPE_ENABLED, EMAIL_DEDUPE_TTL_SECONDS
- Greylisting (first-contact delay) — EMAIL_GREYLIST_ENABLED, EMAIL_GREYLIST_DELAY_SECONDS
- Postage (economic friction for cold email) — EMAIL_POSTAGE_ENABLED, EMAIL_POSTAGE_AMOUNT_ATOMIC

HTTP Pipeline
- /api/intents: validateEnvelope → authMiddleware → replayProtection → emailGuard → rateLimit → route

Notes
- Postage uses CreditService.spend() to debit sender on direct emails (to_did present).
- For discovery-based fanout, postage is not applied by default.
- Attachments should be stored out-of-band; include content hash + size for verification.

