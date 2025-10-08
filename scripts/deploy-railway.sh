#!/bin/bash
set -e  # Exit on error

echo "🚀 AINP Railway Deployment Script"
echo "=================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Validate Railway CLI
echo "1️⃣  Validating Railway CLI..."
if ! command -v railway &> /dev/null; then
  echo -e "${RED}❌ Railway CLI not found${NC}"
  echo "Install with: npm i -g @railway/cli"
  exit 1
fi
echo -e "${GREEN}✅ Railway CLI found${NC}"

# 2. Check authentication
echo ""
echo "2️⃣  Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
  echo -e "${RED}❌ Not authenticated with Railway${NC}"
  echo "Run: railway login"
  exit 1
fi
RAILWAY_USER=$(railway whoami 2>/dev/null || echo "unknown")
echo -e "${GREEN}✅ Authenticated as: $RAILWAY_USER${NC}"

# 3. Check git status
echo ""
echo "3️⃣  Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
  echo -e "${YELLOW}⚠️  Warning: Uncommitted changes detected${NC}"
  git status --short
  echo ""
  read -p "Continue with deployment anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 1
  fi
else
  echo -e "${GREEN}✅ Working directory clean${NC}"
fi

# 4. Pre-deployment checks
echo ""
echo "4️⃣  Running pre-deployment checks..."
echo "   - Linting..."
if ! pnpm lint; then
  echo -e "${RED}❌ Lint failed${NC}"
  exit 1
fi

echo "   - Type checking..."
if ! pnpm typecheck; then
  echo -e "${RED}❌ Typecheck failed${NC}"
  exit 1
fi

echo "   - Building..."
if ! pnpm build; then
  echo -e "${RED}❌ Build failed${NC}"
  exit 1
fi

echo "   - Running tests..."
if ! pnpm test; then
  echo -e "${RED}❌ Tests failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ All pre-deployment checks passed${NC}"

# 5. Deploy to Railway
echo ""
echo "5️⃣  Deploying to Railway..."
echo "   This may take a few minutes..."
if ! railway up; then
  echo -e "${RED}❌ Railway deployment failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Deployment triggered${NC}"

# 6. Wait for deployment to stabilize
echo ""
echo "6️⃣  Waiting for deployment to stabilize..."
WAIT_TIME=30
echo "   Waiting ${WAIT_TIME} seconds for services to start..."
sleep "$WAIT_TIME"

# 7. Get deployment URL and verify health
echo ""
echo "7️⃣  Verifying deployment health..."
RAILWAY_URL=$(railway domain 2>/dev/null || echo "")

if [[ -z "$RAILWAY_URL" ]]; then
  echo -e "${YELLOW}⚠️  Could not get Railway domain - skipping health check${NC}"
  echo "   You may need to configure a domain in Railway dashboard"
else
  echo "   Checking health endpoint: https://$RAILWAY_URL/health"

  # Retry health check up to 3 times with 10s delay
  MAX_RETRIES=3
  RETRY_COUNT=0
  HEALTH_OK=false

  while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$RAILWAY_URL/health" || echo "000")

    if [[ "$HEALTH_STATUS" == "200" ]]; then
      echo -e "${GREEN}✅ Health check passed (HTTP 200)${NC}"
      HEALTH_OK=true
      break
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; then
        echo "   Health check failed (HTTP $HEALTH_STATUS) - retrying in 10s... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 10
      fi
    fi
  done

  if [[ "$HEALTH_OK" == false ]]; then
    echo -e "${RED}❌ Health check failed after $MAX_RETRIES attempts (HTTP $HEALTH_STATUS)${NC}"
    echo "   Check Railway logs for errors: railway logs"
    exit 1
  fi
fi

# 8. Run smoke tests (if smoke-test.sh exists)
echo ""
echo "8️⃣  Running smoke tests..."
if [[ -f "scripts/smoke-test.sh" ]]; then
  if [[ -n "$RAILWAY_URL" ]]; then
    export RAILWAY_URL="https://$RAILWAY_URL"
  fi

  if bash scripts/smoke-test.sh; then
    echo -e "${GREEN}✅ Smoke tests passed${NC}"
  else
    echo -e "${RED}❌ Smoke tests failed${NC}"
    echo "   Deployment may be unhealthy - check Railway logs"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠️  Smoke test script not found - skipping${NC}"
fi

# Success summary
echo ""
echo "=================================="
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "=================================="
if [[ -n "$RAILWAY_URL" ]]; then
  echo "   Deployment URL: https://$RAILWAY_URL"
  echo "   Health endpoint: https://$RAILWAY_URL/health"
fi
echo "   View logs: railway logs"
echo "   Monitor: railway status"
echo ""
