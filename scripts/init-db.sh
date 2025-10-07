#!/bin/bash
set -e

echo "Initializing PostgreSQL with pgvector..."
echo ""

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

until docker exec ainp-postgres pg_isready -U ainp -d ainp > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ PostgreSQL failed to start after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "  PostgreSQL is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✅ PostgreSQL is ready!"
echo ""

# Verify pgvector extension
echo "Verifying pgvector extension..."
PGVECTOR_CHECK=$(docker exec ainp-postgres psql -U ainp -d ainp -tAc "SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector';" 2>/dev/null || echo "0")

if [ "$PGVECTOR_CHECK" -eq "1" ]; then
  echo "✅ pgvector extension is installed"
  docker exec ainp-postgres psql -U ainp -d ainp -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
else
  echo "❌ pgvector extension not found"
  exit 1
fi

echo ""

# Schema is automatically applied via docker-entrypoint-initdb.d
# Check if schema was applied
SCHEMA_VERSION=$(docker exec ainp-postgres psql -U ainp -d ainp -t -c "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1;" 2>/dev/null | xargs || echo "")

if [ -z "$SCHEMA_VERSION" ]; then
  echo "Schema not found. Applying schema manually..."
  docker exec -i ainp-postgres psql -U ainp -d ainp < packages/db/schema.sql
else
  echo "Schema version $SCHEMA_VERSION is already applied"
fi

# Verify tables exist
echo ""
echo "Verifying schema tables..."
TABLES=$(docker exec ainp-postgres psql -U ainp -d ainp -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" | xargs)

if [ "$TABLES" -ge 5 ]; then
  echo "✅ Database initialized successfully with $TABLES tables"
else
  echo "❌ Database initialization may have failed (only $TABLES tables found, expected 5+)"
  exit 1
fi

# Verify vector indexes
echo ""
echo "Verifying vector indexes..."
VECTOR_INDEXES=$(docker exec ainp-postgres psql -U ainp -d ainp -tAc "SELECT COUNT(*) FROM pg_indexes WHERE indexname LIKE '%embedding%';" || echo "0")

if [ "$VECTOR_INDEXES" -ge 2 ]; then
  echo "✅ Vector indexes created ($VECTOR_INDEXES indexes)"
  docker exec ainp-postgres psql -U ainp -d ainp -c "
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%embedding%'
ORDER BY tablename, indexname;
"
else
  echo "❌ Vector indexes not found (expected 2, found $VECTOR_INDEXES)"
fi

# Show database summary
echo ""
echo "Database Summary:"
echo "-------------------------------------------"
docker exec ainp-postgres psql -U ainp -d ainp -c "
SELECT
  'agents' AS table_name,
  COUNT(*) AS row_count
FROM agents
UNION ALL
SELECT
  'capabilities',
  COUNT(*)
FROM capabilities
UNION ALL
SELECT
  'trust_scores',
  COUNT(*)
FROM trust_scores
UNION ALL
SELECT
  'intent_routing_cache',
  COUNT(*)
FROM intent_routing_cache;
"

echo ""
echo "Connection string:"
echo "postgresql://ainp:ainp@localhost:5432/ainp"
echo ""
echo "✅ PostgreSQL with pgvector initialized successfully!"
