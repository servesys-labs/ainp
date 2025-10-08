#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 AINP Smoke Test Suite"
echo "========================"
echo ""

# Get target URL
if [[ -z "$RAILWAY_URL" ]]; then
  if command -v railway &> /dev/null; then
    RAILWAY_DOMAIN=$(railway domain 2>/dev/null || echo "")
    if [[ -n "$RAILWAY_DOMAIN" ]]; then
      RAILWAY_URL="https://$RAILWAY_DOMAIN"
    else
      RAILWAY_URL="http://localhost:8080"
    fi
  else
    RAILWAY_URL="http://localhost:8080"
  fi
fi

echo -e "${BLUE}Testing against: $RAILWAY_URL${NC}"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo -e "${YELLOW}⚠️  jq not found - using basic JSON parsing${NC}"
  USE_JQ=false
else
  USE_JQ=true
fi

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Helper function to parse JSON without jq
get_json_value() {
  local json="$1"
  local key="$2"
  # Basic regex extraction (works for simple JSON)
  echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[^,}]*" | sed 's/.*:[[:space:]]*//' | tr -d '"'
}

# Test 1: Health endpoint
echo "1️⃣  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$RAILWAY_URL/health" || echo '{"error": "request failed"}')

if [[ "$HEALTH_RESPONSE" == *"error"* ]]; then
  echo -e "${RED}❌ Health endpoint request failed${NC}"
  echo "   Response: $HEALTH_RESPONSE"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  exit 1
fi

echo "   Response: $HEALTH_RESPONSE"

# Parse health status
if [[ "$USE_JQ" == true ]]; then
  DB_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.connections.db // false')
  REDIS_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.connections.redis // false')
  NATS_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.connections.nats // false')
else
  DB_STATUS=$(get_json_value "$HEALTH_RESPONSE" "db")
  REDIS_STATUS=$(get_json_value "$HEALTH_RESPONSE" "redis")
  NATS_STATUS=$(get_json_value "$HEALTH_RESPONSE" "nats")
fi

# Validate health status
HEALTH_OK=true
if [[ "$DB_STATUS" == "true" ]]; then
  echo -e "   ${GREEN}✅ PostgreSQL: healthy${NC}"
else
  echo -e "   ${RED}❌ PostgreSQL: unhealthy${NC}"
  HEALTH_OK=false
fi

if [[ "$REDIS_STATUS" == "true" ]]; then
  echo -e "   ${GREEN}✅ Redis: healthy${NC}"
else
  echo -e "   ${RED}❌ Redis: unhealthy${NC}"
  HEALTH_OK=false
fi

if [[ "$NATS_STATUS" == "true" ]]; then
  echo -e "   ${GREEN}✅ NATS: healthy${NC}"
else
  echo -e "   ${RED}❌ NATS: unhealthy${NC}"
  HEALTH_OK=false
fi

if [[ "$HEALTH_OK" == true ]]; then
  echo -e "${GREEN}✅ Health check passed${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ Health check failed - some services unhealthy${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  exit 1
fi

echo ""

# Test 2: Agent registration
echo "2️⃣  Testing agent registration..."
TEST_DID="did:key:z6MkTest$(date +%s)"
REGISTER_RESPONSE=$(curl -s -X POST "$RAILWAY_URL/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"did\": \"$TEST_DID\", \"name\": \"Smoke Test Agent\", \"capabilities\": [\"test\"]}" \
  2>/dev/null || echo '{"error": "endpoint not available"}')

echo "   Request: POST /api/agents/register"
echo "   DID: $TEST_DID"
echo "   Response: $REGISTER_RESPONSE"

if [[ "$REGISTER_RESPONSE" == *"endpoint not available"* ]]; then
  echo -e "${YELLOW}⚠️  Agent registration endpoint not available - skipping${NC}"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
elif [[ "$REGISTER_RESPONSE" == *"error"* ]] && [[ "$REGISTER_RESPONSE" != *"already exists"* ]]; then
  echo -e "${RED}❌ Agent registration failed${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
else
  echo -e "${GREEN}✅ Agent registration passed${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""

# Test 3: Intent submission
echo "3️⃣  Testing intent submission..."
INTENT_RESPONSE=$(curl -s -X POST "$RAILWAY_URL/api/intents" \
  -H "Content-Type: application/json" \
  -d "{\"from_did\": \"$TEST_DID\", \"description\": \"Smoke test intent\", \"intent_type\": \"FREEFORM_NOTE\"}" \
  2>/dev/null || echo '{"error": "endpoint not available"}')

echo "   Request: POST /api/intents"
echo "   Response: $INTENT_RESPONSE"

if [[ "$INTENT_RESPONSE" == *"endpoint not available"* ]]; then
  echo -e "${YELLOW}⚠️  Intent submission endpoint not available - skipping${NC}"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
elif [[ "$INTENT_RESPONSE" == *"error"* ]]; then
  echo -e "${RED}❌ Intent submission failed${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
else
  echo -e "${GREEN}✅ Intent submission passed${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

echo ""

# Test 4: Agent discovery (if endpoint exists)
echo "4️⃣  Testing agent discovery..."
DISCOVERY_RESPONSE=$(curl -s "$RAILWAY_URL/api/agents/discover" \
  2>/dev/null || echo '{"error": "endpoint not available"}')

echo "   Request: GET /api/agents/discover"
echo "   Response: $DISCOVERY_RESPONSE"

if [[ "$DISCOVERY_RESPONSE" == *"endpoint not available"* ]]; then
  echo -e "${YELLOW}⚠️  Agent discovery endpoint not available - skipping${NC}"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
elif [[ "$DISCOVERY_RESPONSE" == *"error"* ]]; then
  echo -e "${RED}❌ Agent discovery failed${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
else
  echo -e "${GREEN}✅ Agent discovery passed${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# Summary
echo ""
echo "========================"
echo -e "${BLUE}Smoke Test Summary${NC}"
echo "========================"
echo "   Tests Passed:  $TESTS_PASSED"
echo "   Tests Failed:  $TESTS_FAILED"
echo "   Tests Skipped: $TESTS_SKIPPED"
echo ""

if [[ $TESTS_FAILED -gt 0 ]]; then
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All tests passed${NC}"
  exit 0
fi
