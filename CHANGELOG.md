# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0-alpha] - 2025-10-08
### Added
- Unified messaging foundation: MessageIntent base, Email facet, mailbox storage (messages/threads/contacts) and /api/mail routes.
- Anti‑fraud controls: replay protection, content dedupe, optional greylist/postage, consent/allowlist bypass.
- Payments scaffold: PaymentService, 402 challenges, payment requests/receipts tables, Coinbase driver scaffold, /api/payments routes.
- Docs: API Reference, Security & Threat Model, Messaging Pipeline, Payments Flow, Migrations guide, Feature Flags updates.

### Changed
- README updated to reflect unified messaging (alpha) and payments.

### Notes
- This is an alpha release; APIs and schemas may change.

