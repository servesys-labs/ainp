# Railway Quick Start Guide - 5 Minutes to Production

**Goal:** Deploy AINP Phase 0.3 to Railway in under 5 minutes.

---

## Prerequisites (2 minutes)

1. **Railway Account:** https://railway.app (sign up with GitHub)
2. **OpenAI API Key:** Get from https://platform.openai.com/api-keys
3. **Railway CLI:** `npm install -g @railway/cli`

---

## Automated Setup (3 minutes)

### Option A: One-Command Setup (Recommended)

```bash
# Run automated setup script
bash scripts/railway-setup.sh
```

This script will:
- ✅ Install Railway CLI (if needed)
- ✅ Login to Railway (browser auth)
- ✅ Initialize project
- ✅ Add PostgreSQL + Redis
- ✅ Enable pgvector extension
- ✅ Set environment variables
- ✅ Deploy NATS JetStream
- ✅ Run database migrations
- ✅ Deploy AINP broker
- ✅ Watch deployment logs

**Total time:** ~3 minutes (plus Railway build time)

---

### Option B: Manual Setup (if script fails)

```bash
# 1. Install CLI (if needed)
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
cd /Users/agentsy/developer/ainp
railway init

# 4. Add databases
railway add --database postgresql
railway add --database redis

# 5. Enable pgvector
railway connect postgresql
# In psql shell:
CREATE EXTENSION IF NOT EXISTS vector;
\q

# 6. Set environment variables
railway variables set OPENAI_API_KEY=sk-proj-your-key-here
railway variables set NATS_URL=nats://nats.railway.internal:4222
railway variables set NODE_ENV=production

# 7. Run migrations
railway run psql $DATABASE_URL < packages/db/schema.sql
railway run psql $DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql

# 8. Deploy NATS (via Railway dashboard)
# Dashboard → + New → Empty Service → Dockerfile: Dockerfile.nats

# 9. Deploy broker
railway up
```

**Total time:** ~5 minutes (plus Railway build time)

---

## Verification (1 minute)

**Get your Railway URL:**
```bash
railway domain
# Example output: https://ainp-broker-production-abc123.up.railway.app
```

**Verify deployment:**
```bash
bash scripts/verify-deployment.sh https://your-app.up.railway.app
```

**Expected output:**
```
🔍 AINP Deployment Verification
================================
1️⃣  Basic Health Check
✅ PASS - Service is responding

2️⃣  Readiness Check (Database, Redis, NATS)
  Database: ✅ OK
  Redis: ✅ OK
  NATS: ✅ OK

3️⃣  Discovery API Endpoint
✅ PASS - Discovery endpoint accessible

🎉 All checks passed! Deployment is healthy.
```

---

## Run Integration Tests

```bash
export API_BASE=https://your-app.up.railway.app
npx tsx tests/run-comprehensive-tests.ts
```

**Expected results:**
- ✅ 32/33 tests passing (96.9% success rate)
- ⚠️ WebSocket test may fail (Railway WebSocket support varies)

---

## Production Checklist

Before going live:

- [ ] All tests passing locally (32/32)
- [ ] Railway deployment verified (health check returns 200)
- [ ] Integration tests pass against production (96.9%+)
- [ ] Monitoring configured (Railway dashboard → Alerts)
- [ ] Backup policy reviewed (Railway auto-backups enabled)
- [ ] Rollback plan tested (redeploy previous deployment)
- [ ] Custom domain configured (optional): `railway domain add yourdomain.com`

---

## Common Issues

### Issue: "PostgreSQL connection refused"
**Fix:**
```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# Test connection
railway connect postgresql
```

### Issue: "NATS connection timeout"
**Fix:**
```bash
# Ensure NATS service is running
railway status

# Verify NATS_URL uses internal Railway DNS
railway variables set NATS_URL=nats://nats.railway.internal:4222
```

### Issue: "OpenAI API key missing"
**Fix:**
```bash
# Set API key via Railway CLI
railway variables set OPENAI_API_KEY=sk-proj-your-key-here
```

---

## Rollback (if needed)

```bash
# List recent deployments
railway deployments

# Rollback to previous deployment
railway rollback <deployment-id>
```

**Recovery time:** <2 minutes

---

## Monitoring & Logs

**Real-time logs:**
```bash
railway logs --follow
```

**Metrics:**
- Railway Dashboard → Your service → **Metrics** tab
- CPU, Memory, Network I/O, Request rate

**Alerts (recommended):**
- Railway Dashboard → Settings → Alerts
- Thresholds: CPU >80%, Memory >450MB, Crashes >3/hour

---

## Next Steps

1. **Custom Domain:** `railway domain add yourdomain.com`
2. **Horizontal Scaling:** `railway service scale --replicas 3`
3. **Review Full Docs:** [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md)
4. **Phase 1.0 Planning:** Scale to 1000+ agents, 10k+ req/min

---

## Support

- **Documentation:** docs/RAILWAY_DEPLOYMENT.md
- **Railway Help:** https://railway.app/help
- **AINP Issues:** https://github.com/yourusername/ainp/issues

---

**🎉 Congratulations! Your AINP broker is now live in production.**
