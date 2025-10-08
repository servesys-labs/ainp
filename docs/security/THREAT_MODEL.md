Threat Model (Alpha)

Assets
- Agent identities (DIDs, keys)
- Message content and metadata
- Credit balances and payment requests
- Contact graph (consent/allowlist)

Actors
- Legitimate agents/users
- Malicious senders (spam/scam)
- Network attacker (MITM, replay)
- Resource abuser (rate limit evader)

Threats & Mitigations
1) Spoofed identity / message tampering
   - Mitigation: Ed25519 signatures over canonical envelopes; signature verification gate.
2) Replay attacks
   - Mitigation: TTL freshness check; Redis-backed replay cache; audit logging.
3) Spam / mass unsolicited messaging
   - Mitigation: Rate limits (DID-based), content dedupe, greylist on first contact, optional postage.
4) Payment fraud (fake confirmations)
   - Mitigation: Provider webhook signature verification; idempotent `markPaid`; ledger credit only on verified events; audit receipts.
5) Denial of service (Redis down, rate‑limit bypass)
   - Mitigation: Graceful degradation with warnings; observe degraded header; tune infra.
6) Unauthorized mailbox access
   - Mitigation: Recipient ACL checks per message/thread; DID-authenticated routes.
7) Privacy leakage (metadata)
   - Mitigation: Avoid storing PII beyond what’s necessary; optional content encryption; redact logs.

Residual Risks
- Public metadata in bridges (SMTP); mitigate via normalization and selective import.
- Correlation attacks via timing/volume; mitigate with per-tenant throttles.
- Ledger anchoring (future) must avoid leaking PII in proofs.

Monitoring & Response
- Log signature failures, replay hits, dedupe hits, greylist deferrals, postage spends.
- Track 401/402/409/425/429 rates.
- Provide admin endpoints/dashboards for anomaly detection.

