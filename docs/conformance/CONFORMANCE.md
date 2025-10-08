Conformance Test Kit (Alpha)

Goal
- Provide a quick, scriptable way for agent developers to verify interoperability with AINP.

Prereqs
- Broker running locally (Docker) and migrations applied (012–016).
- Node 18 with ts-node (or compile examples to JS).

Scenarios
1) Health
   - GET /health → 200 and all connections ok (or 503 with failed connections in dev).
2) Messaging (self)
   - Run examples/send_message.ts → 200 { routed }
   - Run examples/read_inbox.ts (set DID) → message present in inbox.
3) Anti‑fraud (email dedupe)
   - Send same EMAIL_MESSAGE twice within TTL → second returns 409.
4) Negotiation basic
   - Run examples/negotiation_flow.ts (set DID and PEER) → accepted state.
5) Payments (402 challenge)
   - Run examples/payments_402.ts (PAYMENTS_ENABLED=true) → 201 challenge, headers present.

Running
```
# Send and store message
node -r ts-node/register examples/send_message.ts

# Read inbox (set DID)
DID="did:key:z..." node -r ts-node/register examples/read_inbox.ts

# Negotiation flow (set both DIDs)
DID="did:key:z..." PEER="did:key:zpeer..." node -r ts-node/register examples/negotiation_flow.ts

# Payments challenge (requires PAYMENTS_ENABLED)
DID="did:key:z..." node -r ts-node/register examples/payments_402.ts
```

Automation (optional)
- Wrap the above in a small CI script for your agent; fail if any step does not meet expected status codes.

