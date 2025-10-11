# PoU E2E Tests (Phase B)

This guide walks through end‑to‑end Proof of Usefulness (PoU) tests with negotiation → receipt → committee attestations → finalization.

## Prerequisites
- Docker + docker-compose
- Local stack up: `docker-compose -f docker-compose.dev.yml up -d`
- Broker running with `.env` (ensure `NEGOTIATION_ENABLED=true`)

## Apply Migrations
Ensure migrations 017–024 are applied (024 adds `updated_at` used by finalizer):

```
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/017_add_task_receipts.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/018_add_task_attestations.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/019_add_agent_reputation.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/020_update_task_receipts_status.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/021_add_agent_stakes.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/022_update_task_receipts_committee_seed.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/023_unique_task_attestations.sql
docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/migrations/024_add_task_receipts_updated_at.sql
```

## Run E2E Test

Pick one of the scripts from repo root:

- `test-pou-e2e.sh` ( negotiation → receipt → committee → attest → auto finalize )
- `test-pou-final.sh` ( final emphasis on finalizer )
- `test-pou-direct.sh` ( direct DB → attest → finalize )

Example:

```
export BASE_URL=http://localhost:8080
bash ./test-pou-e2e.sh
```

Expected:
- Negotiation transitions through initiated → proposed/counter_proposed → accepted
- Receipt created with committee of size m (default 5)
- Attestations submitted; once quorum k (default 3) is met, finalizer marks receipt finalized

## Troubleshooting
- If auto‑finalization lags, use manual finalize:
  `curl -X POST "$BASE_URL/api/receipts/<task_id>/finalize"`
- Validate DB state:
  `SELECT id,status,finalized_at,updated_at FROM task_receipts ORDER BY created_at DESC LIMIT 5;`
- Ensure finalizer is enabled (`POU_FINALIZER_ENABLED`), cron set (`POU_FINALIZER_CRON`).

