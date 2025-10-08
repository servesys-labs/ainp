Messaging Pipeline

Sequence (POST /api/intents/send)
1) validateEnvelope
   - Canonicalize envelope; verify structure; (production) verify Ed25519 signature.
2) authMiddleware
   - Extract DID (from envelope or JSON in other routes); set `x-ainp-did` for downstream.
3) replayProtectionMiddleware
   - Reject duplicates by caching `envelope.id|from_did|trace_id` (TTL default 5m).
4) emailGuardMiddleware (Email facet only)
   - Content hash dedupe window (reject 409)
   - Optional greylist on first-contact (return 425 + Retry-After)
   - Optional postage spend for cold direct mail
   - Allowlist/consent bypass via ContactService
5) rateLimitMiddleware
   - DID-based limits; IP fallback for public routes; degraded header when Redis down.
6) routingService.routeIntent
   - Direct: publish to NATS subject for recipient; store message in mailbox; record contact interaction.
   - Discovery: find agents; publish to top N; store & contact-record per recipient.
7) MailboxService.store
   - Persist to `messages`; thread aggregates via trigger update `threads`.
8) WebSocket notification
   - Broker pushes `NOTIFICATION { type: 'new_message', message_id, conversation_id, ... }` to connected recipients.

Data Flow
- Envelope → Guards → Route → (store message) → NATS delivery → Client/Agent consumes.

Tables
- messages (012)
- threads (013) [auto-updated via triggers]
- contacts (014) [auto-updated via triggers and by RoutingService]

Flags
- MESSAGING_ENABLED gates /api/mail* routes (access)
- Anti‑fraud flags control email facet behavior
