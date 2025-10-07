# Railway Deployment Checklist - AINP Phase 0.3

**Purpose:** Pre-deployment verification and production readiness checklist.
**Last Updated:** 2025-10-07

---

## Phase 1: Pre-Deployment (Local Verification)

### Code Quality
- [ ] All tests passing locally (`npm test`)
  - Expected: 32/32 tests passing
  - Location: `tests/run-comprehensive-tests.ts`
- [ ] No TypeScript errors (`npm run typecheck`)
  - Verify: All packages compile without errors
- [ ] Build succeeds (`npm run build`)
  - Verify: `dist/` directories created in all packages
- [ ] No linting errors (optional: `npm run lint`)
- [ ] Git repository clean state
  - Run: `git status` → No uncommitted changes

### Local Services Healthy
- [ ] Docker Compose services running
  - Run: `docker-compose -f docker-compose.dev.yml up -d`
  - Verify: PostgreSQL, Redis, NATS all healthy
- [ ] Health check passes locally
  - Run: `curl http://localhost:8080/health/ready`
  - Expected: `{"status": "ready", "checks": {"database": "ok", "redis": "ok", "nats": "ok"}}`
- [ ] Integration tests pass locally
  - Run: `npx tsx tests/run-comprehensive-tests.ts`
  - Expected: 32/32 passing (100%)

### Configuration Files Ready
- [ ] `railway.toml` exists and configured
  - Location: `/Users/agentsy/developer/ainp/railway.toml`
  - Verify: Build and start commands correct
- [ ] `Dockerfile.railway` exists and optimized
  - Location: `/Users/agentsy/developer/ainp/Dockerfile.railway`
  - Verify: Multi-stage build, non-root user, health check
- [ ] `Dockerfile.nats` exists for NATS service
  - Location: `/Users/agentsy/developer/ainp/Dockerfile.nats`
- [ ] `.env.production.example` exists
  - Location: `/Users/agentsy/developer/ainp/.env.production.example`
  - Verify: All required variables documented
- [ ] `.gitignore` updated to exclude secrets
  - Verify: `.env.production`, `.railway` are ignored
  - Verify: `.env.production.example` is NOT ignored

### Database Migrations Ready
- [ ] `schema.sql` exists and validated
  - Location: `packages/db/schema.sql`
  - Verify: pgvector extension, all tables, indexes, functions
- [ ] Migration 001 exists
  - Location: `packages/db/migrations/001_add_agent_registration_fields.sql`
  - Verify: TTL and expiration fields added to agents table
- [ ] Migrations tested locally
  - Run: `psql $DATABASE_URL < packages/db/schema.sql`
  - Run: `psql $DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql`
  - Verify: No errors, schema version updated

### Documentation Complete
- [ ] `RAILWAY_QUICKSTART.md` created
  - 5-minute quick start guide
- [ ] `docs/RAILWAY_DEPLOYMENT.md` created
  - Comprehensive deployment guide with troubleshooting
- [ ] `DEPLOYMENT_CHECKLIST.md` (this file) exists
- [ ] README.md updated with Railway deployment section (optional)

---

## Phase 2: Railway Setup

### Account & CLI
- [ ] Railway account created
  - Sign up: https://railway.app
- [ ] Payment method added
  - Required for production services (PostgreSQL, Redis)
- [ ] Railway CLI installed
  - Run: `npm install -g @railway/cli`
  - Verify: `railway --version`
- [ ] Logged into Railway
  - Run: `railway login`
  - Verify: `railway whoami`

### Project Initialization
- [ ] Railway project initialized
  - Run: `railway init` or use automated script
  - Verify: `.railway` file created (not committed to git)
- [ ] Project name set (e.g., `ainp-broker`)
- [ ] Environment set to `production`

### Database Services
- [ ] PostgreSQL service added
  - Run: `railway add --database postgresql`
  - Verify: `DATABASE_URL` environment variable auto-set
- [ ] pgvector extension enabled
  - Run: `railway connect postgresql`
  - Execute: `CREATE EXTENSION IF NOT EXISTS vector;`
  - Verify: `\dx` shows pgvector
- [ ] Database schema applied
  - Run: `railway run psql $DATABASE_URL < packages/db/schema.sql`
  - Verify: No errors, tables created
- [ ] Migration 001 applied
  - Run: `railway run psql $DATABASE_URL < packages/db/migrations/001_add_agent_registration_fields.sql`
  - Verify: Schema version 0.1.1

### Cache & Messaging Services
- [ ] Redis service added
  - Run: `railway add --database redis`
  - Verify: `REDIS_URL` environment variable auto-set
- [ ] NATS JetStream service deployed
  - Method 1: Railway dashboard → + New → Empty Service → Dockerfile: `Dockerfile.nats`
  - Method 2: `railway up -d --service nats-jetstream --dockerfile Dockerfile.nats`
  - Verify: Service running, health check passing
- [ ] NATS internal URL configured
  - Run: `railway variables set NATS_URL=nats://nats.railway.internal:4222`
  - Verify: Uses internal Railway DNS (not public URL)

### Environment Variables
- [ ] `NODE_ENV=production` set
  - Run: `railway variables set NODE_ENV=production`
- [ ] `OPENAI_API_KEY` set (REQUIRED)
  - Run: `railway variables set OPENAI_API_KEY=sk-proj-...`
  - ⚠️ **USER MUST PROVIDE**
- [ ] `NATS_URL` set to internal service URL
  - Run: `railway variables set NATS_URL=nats://nats.railway.internal:4222`
- [ ] `PORT` auto-set by Railway
  - Verify: `railway variables | grep PORT`
  - Expected: `PORT=$PORT` (Railway injects dynamically)
- [ ] Verify all variables
  - Run: `railway variables`
  - Expected: DATABASE_URL, REDIS_URL, NATS_URL, OPENAI_API_KEY, NODE_ENV

---

## Phase 3: Deployment

### Broker Service Deployment
- [ ] Broker service deployed
  - Method 1: `railway up` (CLI)
  - Method 2: Connect GitHub repo via Railway dashboard
  - Verify: Build starts, no errors
- [ ] Build succeeds
  - Monitor: `railway logs --follow`
  - Verify: "npm run build" completes successfully
- [ ] Health check passes
  - Railway waits for `/health/ready` to return 200
  - Timeout: 300 seconds (configured in railway.toml)
  - Verify: Service status shows "Healthy" in dashboard
- [ ] Public domain assigned
  - Run: `railway domain`
  - Example: `https://ainp-broker-production-abc123.up.railway.app`

### Post-Deployment Verification
- [ ] Health check endpoint responds
  - Run: `curl https://your-app.up.railway.app/health`
  - Expected: `{"status": "healthy", ...}`
- [ ] Readiness check passes
  - Run: `curl https://your-app.up.railway.app/health/ready`
  - Expected: `{"status": "ready", "checks": {"database": "ok", "redis": "ok", "nats": "ok"}}`
- [ ] Discovery API accessible
  - Run: `curl https://your-app.up.railway.app/api/discovery?query=test`
  - Expected: 200 OK with JSON response
- [ ] Response time acceptable
  - Target: <500ms for `/health` endpoint
  - Run: `time curl https://your-app.up.railway.app/health`

### Automated Verification
- [ ] Run verification script
  - Run: `bash scripts/verify-deployment.sh https://your-app.up.railway.app`
  - Expected: All checks passing (7/7 or 8/8)

---

## Phase 4: Integration Testing

### Test Suite Against Production
- [ ] Set production API base URL
  - Run: `export API_BASE=https://your-app.up.railway.app`
- [ ] Run comprehensive test suite
  - Run: `npx tsx tests/run-comprehensive-tests.ts`
  - Expected: 32/33 passing (96.9% acceptable for Phase 0.3)
  - ⚠️ WebSocket test may fail (Railway WebSocket support varies)

### Manual Smoke Tests
- [ ] Agent registration works
  ```bash
  curl -X POST https://your-app.up.railway.app/api/v1/agents \
    -H "Content-Type: application/json" \
    -d '{"did": "did:key:test", "publicKey": "base64key", "capabilities": [{"description": "Test", "tags": ["test"], "version": "1.0.0"}]}'
  ```
  - Expected: 201 Created
- [ ] Discovery query works
  ```bash
  curl "https://your-app.up.railway.app/api/v1/discovery?query=test"
  ```
  - Expected: 200 OK with agents array
- [ ] Rate limiting active
  - Run 10+ rapid requests to `/health`
  - Expected: Eventually returns 429 Too Many Requests

---

## Phase 5: Monitoring & Observability

### Railway Built-in Monitoring
- [ ] Metrics dashboard configured
  - Railway Dashboard → Service → **Metrics** tab
  - Verify: CPU, Memory, Network graphs visible
- [ ] Alerts configured (recommended)
  - Railway Dashboard → Settings → **Alerts**
  - Suggested thresholds:
    - CPU >80% for 5 minutes
    - Memory >450MB for 5 minutes
    - Crashes >3 per hour
- [ ] Logs accessible
  - Run: `railway logs --follow`
  - Verify: Application logs streaming in real-time

### Application Health Monitoring
- [ ] Health check endpoint monitored
  - Set up external uptime monitor (optional)
  - Services: UptimeRobot, Pingdom, Railway built-in
  - Target: `/health/ready` every 60 seconds
- [ ] Error tracking configured (optional)
  - Sentry, Datadog, or similar
  - Environment variable: `SENTRY_DSN`

---

## Phase 6: Production Readiness

### Security
- [ ] Secrets not committed to git
  - Verify: `.env.production` is in `.gitignore`
  - Verify: No secrets in git history: `git log --all --full-history --source -- "*secret*" "*env*"`
- [ ] HTTPS enabled (Railway default)
  - Verify: URL starts with `https://`
- [ ] CORS configured (if applicable)
  - Environment variable: `CORS_ORIGINS`
  - Example: `railway variables set CORS_ORIGINS=https://yourdomain.com`
- [ ] Rate limiting active
  - Verify: 429 responses after burst traffic

### Backup & Recovery
- [ ] Database backups enabled
  - Railway provides automated daily backups
  - Verify: Railway Dashboard → PostgreSQL → **Backups** tab
  - Retention: 7 days (free tier), 30 days (pro tier)
- [ ] Rollback plan tested
  - List deployments: `railway deployments`
  - Practice rollback: `railway rollback <deployment-id>`
  - Expected recovery time: <2 minutes
- [ ] Disaster recovery documented
  - Location: `docs/RAILWAY_DEPLOYMENT.md` → Rollback Procedure

### Scaling Preparation
- [ ] Resource limits reviewed
  - Current: 1 instance, 512MB memory
  - Plan for Phase 1.0: 3 instances, 1GB each
- [ ] Connection pooling configured
  - PostgreSQL: Max 20 connections (Phase 0.3)
  - Redis: 512MB memory limit
- [ ] Horizontal scaling strategy documented
  - Railway CLI: `railway service scale --replicas 3`

---

## Phase 7: Go-Live

### Final Verification
- [ ] All checklist items above completed
- [ ] Test suite passes (32/33 minimum)
- [ ] Health check returns 200 for 5+ minutes continuously
- [ ] No errors in Railway logs
- [ ] Team notified of deployment

### Post-Deployment Monitoring (First 24 Hours)
- [ ] Monitor logs for errors
  - Run: `railway logs --follow | grep -i error`
- [ ] Monitor resource usage
  - Target: CPU <50%, Memory <400MB
- [ ] Verify zero crashes
  - Railway Dashboard → Service → **Deployments** → Crash count
- [ ] Monitor response times
  - Target: p95 latency <200ms for `/health`

### Documentation Updates
- [ ] Update README.md with production URL
- [ ] Update CHANGELOG.md with deployment date
- [ ] Create incident response runbook (optional)
  - Location: `docs/INCIDENT_RESPONSE.md`

---

## Rollback Triggers

If any of the following occur, initiate rollback:

- ❌ Health check fails for >5 minutes
- ❌ Test suite drops below 90% pass rate
- ❌ Error rate >5% of requests
- ❌ Memory usage >90% consistently
- ❌ Response time >1000ms p95
- ❌ Database connection failures
- ❌ NATS connection failures
- ❌ 3+ crashes in 1 hour

**Rollback command:** `railway rollback <previous-deployment-id>`

---

## Success Criteria

Deployment is considered successful when:

✅ All Phase 1-7 checklist items completed
✅ Health check returns 200 continuously for 1 hour
✅ Test suite passes at 96%+ (32/33 tests)
✅ Zero crashes in first 4 hours
✅ Response time <500ms p95
✅ Resource usage stable (CPU <60%, Memory <450MB)
✅ No critical errors in logs

---

## Next Steps After Successful Deployment

1. **Custom Domain:** `railway domain add yourdomain.com`
2. **Phase 1.0 Planning:** Scale to 1000+ agents, 10k+ req/min
3. **Advanced Monitoring:** Set up Datadog, Grafana, or similar
4. **Load Testing:** Use `autocannon` for performance benchmarking
5. **Documentation:** Update API documentation with production endpoints

---

## Emergency Contacts

- **Railway Support:** https://railway.app/help
- **Team Lead:** [Your contact info]
- **DevOps Slack:** #ainp-deployments
- **On-Call:** [Pager/phone number]

---

**Last Updated:** 2025-10-07
**Deployment Version:** Phase 0.3
**Next Review:** Before Phase 1.0 deployment
