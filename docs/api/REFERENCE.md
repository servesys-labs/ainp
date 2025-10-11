API Reference (Alpha)

Auth & Headers
- All authenticated routes rely on envelope signatures (for /api/intents) or DID extracted by auth middleware.
- Headers set by middleware for downstream use: `x-ainp-did: <did>`

Content Type
- JSON unless stated otherwise.

1) Intents
- POST /api/intents/send
 - Body: AINPEnvelope with `payload` as a MessageIntent/EmailIntent (or other intent types)
  - Behavior: validateEnvelope → auth → anti‑fraud (email facet) → rate limit → routing → (store in mailbox on delivery)
  - 200 { status: 'routed', agent_count: N }
  - 400/401/409/425/429 on validation/abuse

Example (direct EMAIL_MESSAGE)
curl -X POST http://localhost:8080/api/intents/send \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "0.1.0",
    "id": "env_123",
    "trace_id": "trace_123",
    "from_did": "did:key:z...",
    "to_did": "did:key:z...",
    "msg_type": "INTENT",
    "ttl": 60000,
    "timestamp": 1733697600000,
    "sig": "base64...",
    "payload": {
      "@type": "EMAIL_MESSAGE",
      "@context": "https://schema.ainp.dev/email/v1",
      "version": "0.1.0",
      "embedding": "",
      "budget": { "max_credits": 10, "max_rounds": 1, "timeout_ms": 30000 },
      "semantics": {
        "email": true,
        "participants": ["did:key:z...","did:key:z..."],
        "subject": "Hello",
        "content": "Hi there",
        "content_type": "text/plain"
      }
    }
  }'

- Notes
  - Discovery routing: You may include a top-level `query` object in the request body, or set `to_query` inside the envelope. The broker supports both.
  - Envelope version: If present, it must be `0.1.0`.

2) Discovery
- POST /api/discovery/search
  - Body: DiscoveryQuery
  - Returns array of SemanticAddress
- POST /api/discovery/envelope
  - Body: AINPEnvelope with `msg_type` equal to one of:
    - `ADVERTISE` with payload `{ address: SemanticAddress, ttl_minutes?: number }`
    - `DISCOVER` with payload `{ query?: DiscoveryQuery }` or use `envelope.to_query`
  - Behavior: validateEnvelope → auth → rate limit → discovery action
  - Returns:
    - For ADVERTISE: `{ status: 'registered', ttl_minutes }`
    - For DISCOVER: `{ results: SemanticAddress[] }`
  - Side effects:
    - For DISCOVER, the broker also publishes a `DISCOVER_RESULT` envelope addressed to the requester’s DID on the results channel (subject: `ainp.results.{requester}`) for WebSocket delivery.

2) Mailbox
- GET /api/mail/inbox?limit=&cursor=&label=&unread=true
  - Requires auth; uses `x-ainp-did`
  - Returns { messages: [...], pagination: { limit, cursor, has_more } }
- GET /api/mail/threads/:conversation_id
- POST /api/mail/read { message_id, read?: boolean }
- POST /api/mail/label { message_id, add?: string[], remove?: string[] }

3) Negotiations
- POST /api/negotiations { intent_id, initiator_did, responder_did, initial_proposal, max_rounds?, ttl_minutes? }
- POST /api/negotiations/:id/propose { proposer_did, proposal }
- POST /api/negotiations/:id/accept { acceptor_did }
- POST /api/negotiations/:id/reject { rejector_did, reason? }
- GET /api/negotiations/:id
- GET /api/negotiations?agent_did=&state=

4) Usefulness
- POST /api/usefulness/proofs
  - Body: ProofSubmissionRequest (work_type, metrics, trace_id, timestamp)
  - Requires auth; validates structure and timestamp freshness
- POST /api/usefulness/aggregate
- GET /api/usefulness/agents/:did

5) Payments (402 challenges)
- POST /api/payments/requests { amount_atomic, method, currency?, description?, expires_in_seconds? }
  - Returns PaymentChallenge (JSON) and sets 402-style headers for client convenience
- GET /api/payments/requests/:id
- POST /api/payments/webhooks/coinbase (scaffold)

402 Flow (example)
- If a payable endpoint is protected, server may respond with 402 and headers:
  - WWW-Authenticate: AINP-Pay realm="ainp", request_id="...", method="coinbase"
  - Link: <payment_url>; rel="payment"
- Client pays via link/QR, then retries original request.

6) Health
- GET /health → { status, connections: { db, redis, nats }, timestamp }
- GET /health/ready → { status: 'ready'|'not_ready', checks: { database, redis, nats } }

Notes
- Rate limiting: DID-based for authenticated endpoints; header `X-RateLimit-Degraded: true` if Redis is down.
- Anti‑fraud responses: 409 (duplicate content), 425 (greylist with Retry‑After), 402 (payment required) when enabled.
