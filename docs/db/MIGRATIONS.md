Database Migrations (Messaging + Payments)

New Tables
- 012_add_messages.sql — Unified message storage (email/chat/notifications)
- 013_add_threads.sql — Thread aggregates and triggers
- 014_add_contacts.sql — Consent/allowlist and triggers
- 015_add_payment_requests.sql — Payment challenges (402)
- 016_add_payment_receipts.sql — Provider confirmations

Applying Migrations (Dev)
Option A: psql inside container
```
docker exec ainp-postgres psql -U ainp -d ainp -c "\\i /sql/012_add_messages.sql"
docker exec ainp-postgres psql -U ainp -d ainp -c "\\i /sql/013_add_threads.sql"
docker exec ainp-postgres psql -U ainp -d ainp -c "\\i /sql/014_add_contacts.sql"
docker exec ainp-postgres psql -U ainp -d ainp -c "\\i /sql/015_add_payment_requests.sql"
docker exec ainp-postgres psql -U ainp -d ainp -c "\\i /sql/016_add_payment_receipts.sql"
```

Option B: Manual psql
```
psql -h localhost -U ainp -d ainp -f packages/db/migrations/012_add_messages.sql
psql -h localhost -U ainp -d ainp -f packages/db/migrations/013_add_threads.sql
psql -h localhost -U ainp -d ainp -f packages/db/migrations/014_add_contacts.sql
psql -h localhost -U ainp -d ainp -f packages/db/migrations/015_add_payment_requests.sql
psql -h localhost -U ainp -d ainp -f packages/db/migrations/016_add_payment_receipts.sql
```

Verification
- Check tables exist and triggers are installed:
```
psql -h localhost -U ainp -d ainp -c "\\dt messages threads contacts payment_requests payment_receipts"
psql -h localhost -U ainp -d ainp -c "SELECT count(*) FROM threads;"
```

Rollback (dev only)
- Drop tables in reverse order if needed; beware of cascades (receipts depend on requests).

