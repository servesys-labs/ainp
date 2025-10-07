#!/bin/bash
# Railway Deployment Verification Script
# This script verifies a Railway deployment is healthy and ready for production
# Usage: bash scripts/verify-deployment.sh https://your-app.up.railway.app

set -e  # Exit on error

RAILWAY_URL="${1:-}"

if [ -z "$RAILWAY_URL" ]; then
    echo "❌ Usage: bash scripts/verify-deployment.sh https://your-app.up.railway.app"
    exit 1
fi

echo "🔍 AINP Deployment Verification"
echo "================================"
echo "Target: $RAILWAY_URL"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED_CHECKS=0
PASSED_CHECKS=0

# Helper function for checks
check() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -n "Checking $name... "

    if eval "$command" | grep -q "$expected"; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED_CHECKS++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        ((FAILED_CHECKS++))
        return 1
    fi
}

# 1. Health Check - Basic
echo "1️⃣  Basic Health Check"
if curl -sf "$RAILWAY_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ PASS${NC} - Service is responding"
    ((PASSED_CHECKS++))
else
    echo -e "${RED}❌ FAIL${NC} - Service not responding"
    ((FAILED_CHECKS++))
fi
echo ""

# 2. Readiness Check - All Services
echo "2️⃣  Readiness Check (Database, Redis, NATS)"
READINESS_RESPONSE=$(curl -sf "$RAILWAY_URL/health/ready" || echo "{}")
echo "Response: $READINESS_RESPONSE"

DB_STATUS=$(echo "$READINESS_RESPONSE" | jq -r '.checks.database // "unknown"')
REDIS_STATUS=$(echo "$READINESS_RESPONSE" | jq -r '.checks.redis // "unknown"')
NATS_STATUS=$(echo "$READINESS_RESPONSE" | jq -r '.checks.nats // "unknown"')

if [ "$DB_STATUS" = "ok" ]; then
    echo -e "  Database: ${GREEN}✅ OK${NC}"
    ((PASSED_CHECKS++))
else
    echo -e "  Database: ${RED}❌ FAIL${NC} ($DB_STATUS)"
    ((FAILED_CHECKS++))
fi

if [ "$REDIS_STATUS" = "ok" ]; then
    echo -e "  Redis: ${GREEN}✅ OK${NC}"
    ((PASSED_CHECKS++))
else
    echo -e "  Redis: ${RED}❌ FAIL${NC} ($REDIS_STATUS)"
    ((FAILED_CHECKS++))
fi

if [ "$NATS_STATUS" = "ok" ]; then
    echo -e "  NATS: ${GREEN}✅ OK${NC}"
    ((PASSED_CHECKS++))
else
    echo -e "  NATS: ${RED}❌ FAIL${NC} ($NATS_STATUS)"
    ((FAILED_CHECKS++))
fi
echo ""

# 3. API Endpoints - Discovery
echo "3️⃣  Discovery API Endpoint"
if curl -sf "$RAILWAY_URL/api/discovery?query=test" > /dev/null; then
    echo -e "${GREEN}✅ PASS${NC} - Discovery endpoint accessible"
    ((PASSED_CHECKS++))
else
    echo -e "${RED}❌ FAIL${NC} - Discovery endpoint not accessible"
    ((FAILED_CHECKS++))
fi
echo ""

# 4. Response Time
echo "4️⃣  Response Time Test"
START_TIME=$(date +%s%3N)
curl -sf "$RAILWAY_URL/health" > /dev/null
END_TIME=$(date +%s%3N)
RESPONSE_TIME=$((END_TIME - START_TIME))

if [ $RESPONSE_TIME -lt 500 ]; then
    echo -e "${GREEN}✅ PASS${NC} - Response time: ${RESPONSE_TIME}ms (< 500ms)"
    ((PASSED_CHECKS++))
elif [ $RESPONSE_TIME -lt 1000 ]; then
    echo -e "${YELLOW}⚠️  WARN${NC} - Response time: ${RESPONSE_TIME}ms (acceptable but slow)"
    ((PASSED_CHECKS++))
else
    echo -e "${RED}❌ FAIL${NC} - Response time: ${RESPONSE_TIME}ms (> 1000ms, too slow)"
    ((FAILED_CHECKS++))
fi
echo ""

# 5. HTTPS Check
echo "5️⃣  HTTPS Security"
if echo "$RAILWAY_URL" | grep -q "^https://"; then
    echo -e "${GREEN}✅ PASS${NC} - Using HTTPS"
    ((PASSED_CHECKS++))
else
    echo -e "${RED}❌ FAIL${NC} - Not using HTTPS (insecure)"
    ((FAILED_CHECKS++))
fi
echo ""

# 6. CORS Headers
echo "6️⃣  CORS Configuration"
CORS_HEADER=$(curl -sI "$RAILWAY_URL/health" | grep -i "access-control-allow-origin" || echo "")
if [ -n "$CORS_HEADER" ]; then
    echo -e "${GREEN}✅ PASS${NC} - CORS headers present"
    echo "  $CORS_HEADER"
    ((PASSED_CHECKS++))
else
    echo -e "${YELLOW}⚠️  WARN${NC} - No CORS headers found (may be intentional)"
    ((PASSED_CHECKS++))
fi
echo ""

# 7. Rate Limiting
echo "7️⃣  Rate Limiting Test (10 rapid requests)"
RATE_LIMIT_TRIGGERED=false
for i in {1..10}; do
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$RAILWAY_URL/health")
    if [ "$HTTP_CODE" = "429" ]; then
        RATE_LIMIT_TRIGGERED=true
        break
    fi
done

if [ "$RATE_LIMIT_TRIGGERED" = true ]; then
    echo -e "${GREEN}✅ PASS${NC} - Rate limiting is active"
    ((PASSED_CHECKS++))
else
    echo -e "${YELLOW}⚠️  INFO${NC} - Rate limiting not triggered (10 requests ok)"
    ((PASSED_CHECKS++))
fi
echo ""

# Summary
echo "================================"
echo "📊 Verification Summary"
echo "================================"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}🎉 All checks passed! Deployment is healthy.${NC}"
    echo ""
    echo "✅ Ready for production traffic"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Run integration tests: export API_BASE=$RAILWAY_URL && npx tsx tests/run-comprehensive-tests.ts"
    echo "2. Configure monitoring alerts (Railway dashboard → Alerts)"
    echo "3. Set up custom domain (optional): railway domain"
    echo "4. Review logs: railway logs --follow"
    exit 0
else
    echo -e "${RED}❌ Deployment verification failed ($FAILED_CHECKS checks)${NC}"
    echo ""
    echo "🔧 Troubleshooting Steps:"
    echo "1. Check Railway logs: railway logs --tail 100"
    echo "2. Verify environment variables: railway variables"
    echo "3. Check service health in Railway dashboard"
    echo "4. Review docs/RAILWAY_DEPLOYMENT.md for common issues"
    exit 1
fi
