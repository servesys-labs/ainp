# Railway Deployment Guide - AINP Phase 0.3

**Status:** Production-Ready
**Last Updated:** 2025-10-07
**Stack:** Node.js 22, PostgreSQL 16+pgvector, Redis 7, NATS 2.10

---

## 📋 Prerequisites

1. **Railway Account**
   - Sign up: https://railway.app
   - Payment method added (required for production services)
   - Railway CLI installed: `npm install -g @railway/cli`

2. **Local Setup Complete**
   - All tests passing locally (32/32 ✅)
   - Docker Compose running successfully
   - Git repository initialized with clean state

3. **API Keys Ready**
   - OpenAI API key (for capability embeddings)
   - Railway GitHub integration (optional, for auto-deploys)

---

## 🚀 Deployment Steps

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway --version  # Verify installation
```

### Step 2: Login and Initialize Project

```bash
# Login to Railway (opens browser)
railway login

# Navigate to project directory
cd /Users/agentsy/developer/ainp

# Initialize Railway project
railway init
# When prompted:
# - Project name: ainp-broker
# - Environment: production
```

### Step 3: Create PostgreSQL Service

**Option A: Railway Dashboard (Recommended)**

1. Go to https://railway.app/dashboard
2. Select your project (`ainp-broker`)
3. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
4. Railway auto-provisions PostgreSQL 16 and sets `DATABASE_URL`

**Option B: Railway CLI**

```bash
railway add --database postgresql
```

**Verify PostgreSQL:**
```bash
railway variables
# Should show DATABASE_URL
```

### Step 4: Enable pgvector Extension

**Connect to Railway PostgreSQL:**

```bash
# Open Railway PostgreSQL shell
railway connect postgresql

# Inside psql shell, run:
CREATE EXTENSION IF NOT EXISTS vector;
\dx  # Verify pgvector is installed
\q   # Exit
```

**Alternative (if Railway shell unavailable):**

Use Railway dashboard → PostgreSQL service → **Data** tab → **Query** section:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 5: Run Database Migrations

**Upload schema files via Railway CLI:**

```bash
# Method 1: Direct SQL execution
railway run psql $DATABASE_URL < packages/db/schema.sql
railway run psql $DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql

# Method 2: Using npm script (if migration script exists)
railway run npm run migrate
```

**Verify schema:**
```bash
railway connect postgresql
\dt  # List tables - should see: agents, capabilities, trust_scores, etc.
\q
```

### Step 6: Create Redis Service

**Railway Dashboard:**
1. Click **"+ New"** → **"Database"** → **"Add Redis"**
2. Railway auto-provisions Redis 7 and sets `REDIS_URL`

**Railway CLI:**
```bash
railway add --database redis
```

**Verify Redis:**
```bash
railway variables | grep REDIS_URL
```

### Step 7: Deploy NATS JetStream Service

**Create NATS service from Dockerfile:**

1. Railway Dashboard → **"+ New"** → **"Empty Service"**
2. Name: `nats-jetstream`
3. Settings → **Source** → **Dockerfile Path**: `Dockerfile.nats`
4. Settings → **Deploy** → **Deploy**

**Configure internal networking:**

1. NATS service → **Settings** → **Networking**
2. Note the internal URL: `nats.railway.internal:4222`
3. This will be used for `NATS_URL` variable

**Alternative: Railway CLI**
```bash
# Deploy NATS service
railway up -d --service nats-jetstream --dockerfile Dockerfile.nats
```

### Step 8: Deploy AINP Broker Service

**Configure broker service:**

1. Railway Dashboard → **"+ New"** → **"GitHub Repo"**
   - Connect your GitHub repository
   - OR use Railway CLI: `railway up`

2. **Settings → Deploy:**
   - Root Directory: `/`
   - Builder: `NIXPACKS` (auto-detected)
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`

3. **Settings → Networking:**
   - Enable public domain
   - Copy the URL: `https://your-app.up.railway.app`

**Railway CLI deployment:**
```bash
# Deploy broker from current directory
railway up

# Watch deployment logs
railway logs
```

### Step 9: Configure Environment Variables

**Set required variables via Railway Dashboard:**

1. Broker service → **Variables** tab
2. Add the following:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Required |
| `PORT` | `$PORT` | Auto-set by Railway |
| `DATABASE_URL` | `$DATABASE_URL` | Auto-set by PostgreSQL plugin |
| `REDIS_URL` | `$REDIS_URL` | Auto-set by Redis plugin |
| `NATS_URL` | `nats://nats.railway.internal:4222` | Internal service URL |
| `OPENAI_API_KEY` | `sk-proj-...` | ⚠️ **USER MUST PROVIDE** |

**Railway CLI:**
```bash
# Set OpenAI API key (REQUIRED)
railway variables set OPENAI_API_KEY=sk-proj-your-key-here

# Set NATS internal URL
railway variables set NATS_URL=nats://nats.railway.internal:4222

# Verify all variables
railway variables
```

### Step 10: Verify Deployment

**Health check:**
```bash
# Replace with your Railway URL
curl https://your-app.up.railway.app/health/ready

# Expected response:
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "nats": "ok"
  },
  "timestamp": "2025-10-07T..."
}
```

**Run integration tests against production:**
```bash
# Set production URL
export API_BASE=https://your-app.up.railway.app

# Run comprehensive test suite
npx tsx tests/run-comprehensive-tests.ts

# Expected: 32/32 passing (96.9% success rate acceptable for Phase 0.3)
```

---

## 🔐 Security Configuration

### 1. Secrets Management

**DO NOT commit secrets to git:**
- `.env.production` is in `.gitignore` ✅
- Use Railway's built-in secret management
- Rotate `OPENAI_API_KEY` periodically

**Railway secrets best practices:**
```bash
# Set secrets via CLI (never commit to git)
railway variables set OPENAI_API_KEY=sk-proj-...
railway variables set JWT_SECRET=$(openssl rand -base64 32)

# View secrets (values are masked)
railway variables --list
```

### 2. Database Security

**PostgreSQL connection pooling:**
- Railway PostgreSQL auto-configures connection pooling
- Max connections: 20 (Phase 0.3 limit)
- Adjust via Railway dashboard if needed

**Backup policy:**
- Railway provides automated daily backups
- Retention: 7 days (free tier), 30 days (pro tier)
- Manual backup: Railway dashboard → PostgreSQL → **Backups**

### 3. Network Security

**Internal networking:**
- NATS service only accessible within Railway project (internal DNS)
- PostgreSQL and Redis use Railway's internal network
- Broker service exposes public HTTPS endpoint only

**CORS configuration:**
```bash
# Set allowed origins via environment variable
railway variables set CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

## 📊 Monitoring & Observability

### 1. Railway Built-in Monitoring

**Access metrics:**
1. Railway Dashboard → Your service
2. **Metrics** tab shows:
   - CPU usage
   - Memory usage
   - Network I/O
   - Request rate

**Alerts (optional):**
- Configure via Railway dashboard → **Settings** → **Alerts**
- Thresholds: CPU >80%, Memory >450MB, Crashes >3/hour

### 2. Application Logs

**View logs:**
```bash
# Real-time logs via CLI
railway logs --follow

# Filter by service
railway logs --service broker

# Filter by date
railway logs --since 1h
```

**Dashboard logs:**
- Railway Dashboard → Service → **Deployments** → Click deployment → **View Logs**

### 3. Health Checks

**Endpoints:**
- **Readiness:** `GET /health/ready` - All services operational
- **Liveness:** `GET /health/live` - Application running (basic check)

**Monitoring setup:**
```bash
# Railway auto-configures health checks from railway.toml
# Manual verification:
watch -n 10 'curl -s https://your-app.up.railway.app/health/ready | jq'
```

---

## 🔄 Deployment Strategies

### 1. Zero-Downtime Deployment (Railway Default)

Railway automatically handles zero-downtime deployments:

1. New deployment starts
2. Health check passes (`/health/ready` returns 200)
3. Traffic switches to new deployment
4. Old deployment kept alive for 60 seconds (drain period)
5. Old deployment terminated

**Verify:**
```bash
# Deploy new version
railway up

# Railway automatically:
# 1. Builds new image
# 2. Starts new container
# 3. Waits for health check (healthcheckTimeout: 300s)
# 4. Switches traffic
# 5. Terminates old container
```

### 2. Rollback Procedure

**Railway keeps last 10 deployments:**

1. Railway Dashboard → Service → **Deployments**
2. Find previous working deployment
3. Click **"⋯"** → **"Redeploy"**
4. Traffic switches back in <2 minutes

**CLI rollback:**
```bash
# List recent deployments
railway deployments

# Rollback to specific deployment
railway rollback <deployment-id>
```

**Expected recovery time:** <2 minutes

### 3. Database Migrations (Safe Strategy)

**Always use forward-compatible migrations:**

```sql
-- ✅ GOOD: Add nullable column (backward compatible)
ALTER TABLE agents ADD COLUMN new_field TEXT;

-- ❌ BAD: Drop column (breaks old deployments)
ALTER TABLE agents DROP COLUMN old_field;
```

**Migration workflow:**
1. Deploy additive schema changes (add columns)
2. Deploy application code that uses new columns
3. Backfill data if needed
4. Deploy code that stops using old columns
5. Drop old columns in final migration

---

## 🧪 Testing Production Deployment

### 1. Smoke Tests

**After deployment, verify:**

```bash
# Set production URL
export API_BASE=https://your-app.up.railway.app

# Test 1: Health check
curl $API_BASE/health/ready
# Expected: {"status": "ready", ...}

# Test 2: Agent registration
curl -X POST $API_BASE/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "did": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH",
    "publicKey": "base64-encoded-key",
    "capabilities": [
      {
        "description": "Test capability",
        "tags": ["test"],
        "version": "1.0.0"
      }
    ]
  }'
# Expected: 201 Created

# Test 3: Discovery
curl "$API_BASE/api/v1/discovery?query=test"
# Expected: 200 OK with agents array
```

### 2. Load Testing (Optional)

**Using autocannon (already in devDependencies):**

```bash
# Install autocannon globally (if not in devDependencies)
npm install -g autocannon

# Run load test (100 connections, 10 seconds)
autocannon -c 100 -d 10 https://your-app.up.railway.app/health/live

# Expected for Phase 0.3 (1 instance, 512MB):
# - Requests/sec: ~500-1000
# - Avg latency: <50ms
# - Errors: 0%
```

### 3. Integration Test Suite

**Run full test suite against production:**

```bash
export API_BASE=https://your-app.up.railway.app
npx tsx tests/run-comprehensive-tests.ts
```

**Expected results (Phase 0.3):**
- ✅ Agent Registration: 100% pass
- ✅ Discovery: 100% pass
- ✅ Intent Routing: 100% pass
- ✅ Authentication: 100% pass
- ✅ Rate Limiting: 100% pass
- ⚠️ WebSocket: May fail if Railway doesn't support WebSockets (expected)
- **Overall: 96.9% pass rate (32/33 tests)**

---

## 🐛 Troubleshooting

### Issue 1: Health Check Failing

**Symptoms:**
- Deployment shows "Unhealthy"
- Railway keeps restarting service

**Diagnosis:**
```bash
# Check logs for startup errors
railway logs --service broker | tail -100

# Common issues:
# 1. DATABASE_URL not set
# 2. OPENAI_API_KEY missing
# 3. NATS_URL incorrect (wrong internal URL)
```

**Fix:**
```bash
# Verify all required env vars
railway variables | grep -E '(DATABASE_URL|REDIS_URL|NATS_URL|OPENAI_API_KEY)'

# Set missing variables
railway variables set NATS_URL=nats://nats.railway.internal:4222
railway variables set OPENAI_API_KEY=sk-proj-your-key
```

### Issue 2: Database Connection Errors

**Symptoms:**
- Logs show "ECONNREFUSED" or "Connection timeout"

**Diagnosis:**
```bash
# Test database connection
railway run psql $DATABASE_URL -c "SELECT 1;"
```

**Fix:**
1. Verify PostgreSQL service is running (Railway dashboard)
2. Check `DATABASE_URL` format: `postgresql://user:pass@host:port/db`
3. Ensure pgvector extension is installed: `CREATE EXTENSION vector;`

### Issue 3: NATS Connection Errors

**Symptoms:**
- Logs show "NATS connection failed"
- Health check shows `"nats": "error"`

**Diagnosis:**
```bash
# Check NATS service logs
railway logs --service nats-jetstream

# Verify NATS_URL is internal Railway URL
railway variables | grep NATS_URL
```

**Fix:**
```bash
# Set correct internal URL (Railway provides DNS resolution)
railway variables set NATS_URL=nats://nats.railway.internal:4222

# Verify NATS service is running
railway status
```

### Issue 4: Build Failures

**Symptoms:**
- Deployment fails during build step
- Logs show "npm ci failed" or "TypeScript errors"

**Diagnosis:**
```bash
# Check build logs
railway logs --deployment <deployment-id>

# Common issues:
# 1. Missing dependencies in package.json
# 2. TypeScript errors in code
# 3. Out of memory during build
```

**Fix:**
```bash
# Test build locally first
npm ci
npm run build

# If local build passes but Railway fails:
# - Check Railway service memory settings (increase to 1GB for build)
# - Verify Node.js version matches (node: ">=18.0.0")
```

### Issue 5: High Memory Usage

**Symptoms:**
- Service crashes with OOM (Out of Memory)
- Railway shows memory >500MB consistently

**Diagnosis:**
```bash
# Check memory usage in Railway dashboard
# Metrics tab → Memory graph

# Check for memory leaks in logs
railway logs | grep -i "heap\|memory"
```

**Fix:**
1. Scale memory via Railway dashboard:
   - Service → **Settings** → **Resources**
   - Increase memory to 1GB (from 512MB)
2. Review code for memory leaks (large in-memory caches, unclosed connections)
3. Enable Node.js memory profiling (optional):
   ```bash
   railway variables set NODE_OPTIONS="--max-old-space-size=1024"
   ```

---

## 📈 Scaling Strategy (Future)

### Phase 0.3 (Current):
- **Broker:** 1 instance, 512MB
- **PostgreSQL:** 10GB storage
- **Redis:** 512MB memory
- **NATS:** 1GB storage
- **Expected load:** <100 agents, <1000 req/min

### Phase 1.0 (Production):
- **Broker:** 3 instances (horizontal scaling), 1GB each
- **PostgreSQL:** 50GB storage, connection pooling via PgBouncer
- **Redis:** 2GB memory, Redis Sentinel for HA
- **NATS:** 5GB storage, NATS cluster (3 nodes)
- **Expected load:** 1000+ agents, 10k+ req/min

**Scaling via Railway:**
```bash
# Horizontal scaling (add replicas)
railway service scale --replicas 3

# Vertical scaling (increase memory)
railway service scale --memory 1024
```

---

## 🔒 Production Checklist

Before going live, verify:

- [ ] All tests passing locally (32/32)
- [ ] Railway PostgreSQL deployed with pgvector
- [ ] Railway Redis deployed
- [ ] NATS JetStream deployed and accessible
- [ ] Broker deployed with public URL
- [ ] `OPENAI_API_KEY` set via Railway variables (not committed to git)
- [ ] Database migrations applied (schema.sql + 001_add_agent_registration_fields.sql)
- [ ] Health check returns 200: `/health/ready`
- [ ] Integration tests pass against production (96.9% acceptable)
- [ ] Monitoring configured (Railway metrics + alerts)
- [ ] Backup policy reviewed (Railway auto-backups enabled)
- [ ] Rollback plan tested (redeploy previous deployment)
- [ ] CORS origins configured (if applicable)
- [ ] Rate limiting verified (100 req/min default)
- [ ] Error tracking configured (optional: Sentry)

---

## 📚 Additional Resources

- **Railway Documentation:** https://docs.railway.app
- **AINP Specification:** [SPEC.md](../SPEC.md)
- **Local Development:** [README.md](../README.md)
- **Phase 0.3 Plan:** [PHASE_0.3_PLAN.md](PHASE_0.3_PLAN.md)
- **API Documentation:** [API.md](API.md)

---

## 🆘 Support

**Issues:**
- GitHub Issues: https://github.com/yourusername/ainp/issues
- Railway Support: https://railway.app/help

**Emergency Rollback:**
```bash
# List deployments
railway deployments

# Rollback to last working deployment
railway rollback <deployment-id>

# Expected recovery time: <2 minutes
```

**Contact:**
- Email: support@yourdomain.com
- Slack: #ainp-deployments
