#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER=${DB_CONTAINER:-ainp-postgres}
DB_URL=${DB_URL:-postgresql://ainp:ainp@localhost:5432/ainp}

echo "Applying PoU migrations (017–024) to $DB_URL via container $DB_CONTAINER"

files=(
  packages/db/migrations/017_add_task_receipts.sql
  packages/db/migrations/018_add_task_attestations.sql
  packages/db/migrations/019_add_agent_reputation.sql
  packages/db/migrations/020_update_task_receipts_status.sql
  packages/db/migrations/021_add_agent_stakes.sql
  packages/db/migrations/022_update_task_receipts_committee_seed.sql
  packages/db/migrations/023_unique_task_attestations.sql
  packages/db/migrations/024_add_task_receipts_updated_at.sql
)

for f in "${files[@]}"; do
  echo "→ $f"
  docker exec -i "$DB_CONTAINER" psql -U ainp -d ainp < "$f"
done

echo "✅ PoU migrations applied"

