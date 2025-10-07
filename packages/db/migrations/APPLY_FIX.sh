#!/bin/bash
# Quick script to apply schema-code alignment fix
# Run from repository root: bash packages/db/migrations/APPLY_FIX.sh

set -e  # Exit on error

echo "================================================"
echo "AINP Schema-Code Alignment Fix"
echo "================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo ""
  echo "Set it with:"
  echo "  export DATABASE_URL='postgresql://user:pass@host:port/dbname'"
  exit 1
fi

echo "✅ DATABASE_URL configured"
echo ""

# Step 1: Apply schema migration
echo "Step 1: Applying schema migration (001_add_agent_registration_fields.sql)..."
psql "$DATABASE_URL" -f packages/db/migrations/001_add_agent_registration_fields.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration applied successfully"
else
  echo "❌ Migration failed - aborting"
  exit 1
fi
echo ""

# Step 2: Backup old db-client
echo "Step 2: Backing up old db-client.ts..."
if [ -f "packages/broker/src/lib/db-client.ts" ]; then
  cp packages/broker/src/lib/db-client.ts packages/broker/src/lib/db-client.old.ts
  echo "✅ Backup created at packages/broker/src/lib/db-client.old.ts"
else
  echo "⚠️  No existing db-client.ts found (this is OK if fresh install)"
fi
echo ""

# Step 3: Replace with fixed version
echo "Step 3: Replacing db-client.ts with fixed version..."
if [ -f "packages/broker/src/lib/db-client-fixed.ts" ]; then
  mv packages/broker/src/lib/db-client-fixed.ts packages/broker/src/lib/db-client.ts
  echo "✅ db-client.ts replaced with fixed version"
else
  echo "❌ ERROR: db-client-fixed.ts not found"
  exit 1
fi
echo ""

# Step 4: Verify schema
echo "Step 4: Verifying schema..."
psql "$DATABASE_URL" -f packages/db/migrations/verify_schema.sql > /tmp/ainp-schema-verification.txt 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Schema verification complete (see /tmp/ainp-schema-verification.txt)"
else
  echo "⚠️  Schema verification had warnings (check /tmp/ainp-schema-verification.txt)"
fi
echo ""

# Step 5: Run TypeScript typecheck
echo "Step 5: Running TypeScript typecheck..."
cd packages/broker
npm run typecheck > /tmp/ainp-typecheck.txt 2>&1

if [ $? -eq 0 ]; then
  echo "✅ TypeScript typecheck passed"
else
  echo "❌ TypeScript errors found (see /tmp/ainp-typecheck.txt)"
  cat /tmp/ainp-typecheck.txt
  exit 1
fi
cd ../..
echo ""

# Step 6: Run integration tests (optional)
echo "Step 6: Running integration tests (optional)..."
read -p "Run integration tests now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd packages/broker
  npm test -- test/db-client.integration.test.ts
  if [ $? -eq 0 ]; then
    echo "✅ Integration tests passed"
  else
    echo "❌ Integration tests failed"
    exit 1
  fi
  cd ../..
else
  echo "⏭️  Skipping tests (run manually with: cd packages/broker && npm test)"
fi
echo ""

# Summary
echo "================================================"
echo "✅ Schema-Code Alignment Fix Applied Successfully"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Review schema verification: cat /tmp/ainp-schema-verification.txt"
echo "  2. Test agent registration via API"
echo "  3. Monitor broker logs for SQL errors"
echo ""
echo "Rollback (if needed):"
echo "  Code: mv packages/broker/src/lib/db-client.old.ts packages/broker/src/lib/db-client.ts"
echo "  Schema: psql $DATABASE_URL -c 'DROP INDEX idx_agents_expires_at; ALTER TABLE agents DROP COLUMN ttl, DROP COLUMN expires_at;'"
echo ""
