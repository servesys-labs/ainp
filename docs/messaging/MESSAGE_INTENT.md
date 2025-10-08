MessageIntent (Unified Messaging)

Summary
- Canonical intent for agent‑to‑agent messages (email, chat, notifications) sharing one pipeline: auth, anti‑fraud, storage, threading, delivery.
- EmailIntent is a schema view over MessageIntent (adds `email` facets and optional headers).

TypeScript (source of truth)
- See: packages/core/src/types/intent.ts:15 and packages/core/src/types/intent.ts:51

Key Fields
- `@type`: 'MESSAGE' | 'EMAIL_MESSAGE' | 'CHAT_MESSAGE' | 'NOTIFICATION'
- `@context`: schema URI (e.g., https://schema.ainp.dev/message/v1)
- `semantics` (MessageSemantics):
  - `conversation_id?`: thread/conversation id (UUID or stable hash)
  - `participants`: string[] (DIDs)
  - `subject?`: optional subject/title
  - `content`: message body (text/markdown/html)
  - `content_type?`: MIME (default: text/plain)
  - `content_hash?`: sha256:… for audit/dedupe
  - `attachments?`: [{ filename, mime_type, size_bytes, content_hash, url? }]
  - `labels?`: string[] (inbox, sent, archive…)
  - `reply_to?`: envelope id of parent message
  - (future) `content_enc?`, `enc_recipients?` for encryption metadata

Email Facet
- EmailIntent extends MessageIntent
- Adds `email: true`, `from?`, `to?`, `cc?`, `bcc?`, `headers?` (bridge compatibility)
- See: docs/email/EMAIL_INTENT.md

Pipeline
- /api/intents → validateEnvelope → auth → replayProtection → emailGuard (applies to email facet) → rateLimit → routing → mailbox store

Storage & APIs
- Messages: packages/db/migrations/012_add_messages.sql
- Threads: packages/db/migrations/013_add_threads.sql
- Contacts: packages/db/migrations/014_add_contacts.sql
- Mail APIs: GET /api/mail/inbox, GET /api/mail/threads/:conversation_id, POST /api/mail/read, POST /api/mail/label

Feature Flag
- `MESSAGING_ENABLED` gates /api/mail routes (default: true in dev/preview)

