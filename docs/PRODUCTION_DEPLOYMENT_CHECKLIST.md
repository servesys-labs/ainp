# Production Deployment Checklist

## Phase B: Proof of Usefulness System - Ready for Production

This checklist covers the deployment of the complete AINP broker with Phase A (Task Receipts & Reputation) and Phase B (Attestations & Finalization) features.

---

## ✅ Pre-Deployment Verification (COMPLETE)

### Code Quality
- [x] TypeScript compilation passes (all packages)
- [x] No linter errors
- [x] Server starts without errors
- [x] All cron jobs scheduled successfully

### Documentation
- [x] [Integration Guide](INTEGRATION_GUIDE.md) - Developer integration guide
- [x] [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment guide
- [x] [Proof of Usefulness Guide](pou/PROOF_OF_USEFULNESS.md) - Complete PoU system docs

### Features Implemented
- [x] Phase 2A: Enhanced usefulness proof validation (duplicate detection, rate limiting, fraud detection)
- [x] Phase 2B: Credit distribution based on usefulness scores
- [x] Phase 2C: Discovery integration (usefulness-based ranking)
- [x] Negotiation flow completion (settlement endpoint + WebSocket notifications)
- [x] Phase A: Task receipts + reputation system (7 dimensions with EWMA)
- [x] Phase B: Attestation submission + quorum-based finalization + committee selection

---

## 🚀 Deployment Steps

### 1. Database Migrations

**Apply migrations 017-021 in order:**

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Apply migrations
\i packages/db/migrations/017_add_task_receipts.sql
\i packages/db/migrations/018_add_task_attestations.sql
\i packages/db/migrations/019_add_agent_reputation.sql
\i packages/db/migrations/020_update_task_receipts_status.sql
\i packages/db/migrations/021_add_agent_stakes.sql

# Verify tables exist
\dt task_receipts
\dt task_attestations
\dt agent_reputation
\dt agent_stakes

# Verify columns
\d task_receipts
```

**Expected schemas:**

- **task_receipts**: id, intent_id, negotiation_id, agent_did, client_did, intent_type, inputs_ref, outputs_ref, metrics, payment_request_id, amount_atomic, status, committee, k, m, finalized_at, created_at
- **task_attestations**: id, task_id, by_did, type, score, confidence, evidence_ref, signature, created_at
- **agent_reputation**: agent_id, q, t, r, s, v, i, e, updated_at
- **agent_stakes**: agent_id, amount_locked, slashed_total, locked_until, created_at, updated_at

### 2. Environment Variables

**Add to your `.env` file:**

```bash
# PoU Finalizer Configuration
POU_FINALIZER_ENABLED=true          # Enable automatic finalization
POU_K=3                              # Quorum threshold (k-of-m attestations required)
POU_M=5                              # Committee size (m members)
POU_FINALIZER_CRON=*/1 * * * *      # Run every minute (adjust for production)

# Usefulness Aggregation (already configured)
USEFULNESS_AGGREGATOR_ENABLED=true
USEFULNESS_AGGREGATOR_CRON=0 * * * * # Run hourly

# Credit Distribution (already configured)
USEFULNESS_REWARD_POOL_ENABLED=false # Enable when ready to distribute credits
USEFULNESS_REWARD_POOL_HOURLY=1000000000n # 1000 satoshis per hour
```

**Production recommendations:**
- `POU_K=5` and `POU_M=9` for higher security (requires more attestations)
- `POU_FINALIZER_CRON=*/5 * * * *` (every 5 minutes) to reduce load
- `USEFULNESS_REWARD_POOL_ENABLED=true` to activate credit rewards

### 3. Deployment

**Option A: Railway (Recommended)**

```bash
# Deploy via Git push
git push railway main

# Check logs
railway logs

# Verify migrations
railway run -- psql $DATABASE_URL -c "\dt task_receipts"
```

**Option B: Docker**

```bash
# Build image
docker build -t ainp-broker:phase-b .

# Run migrations
docker run --rm -e DATABASE_URL=$DATABASE_URL ainp-broker:phase-b \
  npm run migrate

# Start server
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  -e NATS_URL=$NATS_URL \
  -e POU_FINALIZER_ENABLED=true \
  -e POU_K=3 \
  -e POU_M=5 \
  ainp-broker:phase-b
```

**Option C: Kubernetes**

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete Kubernetes manifests.

### 4. Post-Deployment Verification

**Check server logs:**

```bash
# Look for successful startup messages
✅ Redis connected
[UsefulnessAggregator] Cron job scheduled (0 * * * *)
[PoU Finalizer] Cron job scheduled (*/1 * * * *)
[Startup] Updated X usefulness scores
AINP Broker started on port 8080
```

**Verify API endpoints:**

```bash
# Health check
curl http://localhost:8080/health

# Test receipt creation (after a negotiation settle)
curl http://localhost:8080/api/receipts/{task_id}

# Test committee endpoint
curl http://localhost:8080/api/receipts/{task_id}/committee

# Test reputation endpoint
curl http://localhost:8080/api/reputation/{agent_did}
```

**Monitor cron jobs:**

```bash
# Watch logs for finalizer activity
tail -f logs/broker.log | grep "PoU Finalizer"

# Expected messages (every minute):
# [PoU Finalizer] Checking 0 pending receipts (when no receipts)
# [PoU Finalizer] Finalized task receipt (when quorum reached)
```

---

## 📊 Monitoring & Observability

### Key Metrics to Track

1. **Receipt Creation Rate**
   - Query: `SELECT COUNT(*) FROM task_receipts WHERE created_at > NOW() - INTERVAL '1 hour'`
   - Expected: Matches negotiation settlement rate

2. **Attestation Submission Rate**
   - Query: `SELECT COUNT(*) FROM task_attestations WHERE created_at > NOW() - INTERVAL '1 hour'`
   - Expected: k * receipt_count minimum

3. **Finalization Success Rate**
   - Query: `SELECT COUNT(*) FROM task_receipts WHERE status='finalized' AND finalized_at > NOW() - INTERVAL '1 hour'`
   - Expected: >90% of receipts finalized within 5-10 minutes

4. **Reputation Updates**
   - Query: `SELECT COUNT(*) FROM agent_reputation WHERE updated_at > NOW() - INTERVAL '1 hour'`
   - Expected: Matches settlement rate

5. **Cron Job Health**
   - Monitor logs for `[PoU Finalizer]` and `[UsefulnessAggregator]` messages
   - Alert if no messages for >2 * cron_interval

### Alerts to Configure

- **Database errors**: `relation "task_receipts" does not exist` (migrations not applied)
- **Quorum failures**: Receipts stuck in `pending` status for >1 hour
- **Committee selection failures**: Empty committee when m > active agent count
- **Reputation update failures**: Receipts created but no reputation update

---

## 🔐 Security Checklist

- [ ] Rate limiting enabled for attestation endpoints
- [ ] DID authentication required for attestation submission (`X-AINP-DID` header)
- [ ] Committee validation enforced (only committee members can submit `AUDIT_PASS`)
- [ ] Client validation enforced (only client can submit `ACCEPTED`)
- [ ] Signature verification on attestations (if implemented)
- [ ] Database credentials rotated
- [ ] Redis AUTH enabled
- [ ] NATS JWT authentication enabled
- [ ] HTTPS/TLS enabled for all API endpoints
- [ ] WebSocket connections authenticated

---

## 🧪 Testing in Production

### End-to-End PoU Flow Test

1. **Create negotiation and settle:**
   ```bash
   # POST /api/negotiations/{id}/settle
   # Verify receipt created in response
   ```

2. **Check receipt:**
   ```bash
   curl http://localhost:8080/api/receipts/{task_id}
   # Expected: status=pending, committee=[...], k=3, m=5
   ```

3. **Get committee:**
   ```bash
   curl http://localhost:8080/api/receipts/{task_id}/committee
   # Expected: array of 5 agent DIDs (top trust scores)
   ```

4. **Submit client attestation:**
   ```bash
   curl -X POST http://localhost:8080/api/receipts/{task_id}/attestations \
     -H "X-AINP-DID: {client_did}" \
     -H "Content-Type: application/json" \
     -d '{"type": "ACCEPTED", "score": 0.95, "confidence": 0.98}'
   # Expected: 201 Created
   ```

5. **Submit committee attestations (from 3+ committee members):**
   ```bash
   curl -X POST http://localhost:8080/api/receipts/{task_id}/attestations \
     -H "X-AINP-DID: {committee_member_did}" \
     -H "Content-Type: application/json" \
     -d '{"type": "AUDIT_PASS", "score": 0.90, "confidence": 0.95}'
   # Expected: 201 Created
   ```

6. **Wait for automatic finalization (or trigger manually):**
   ```bash
   # Option A: Wait for cron (1 minute max)
   # Option B: Manual finalize
   curl -X POST http://localhost:8080/api/receipts/{task_id}/finalize
   # Expected: {"ok": true, "status": "finalized"}
   ```

7. **Verify reputation updated:**
   ```bash
   curl http://localhost:8080/api/reputation/{agent_did}
   # Expected: updated_at timestamp should be recent
   ```

---

## 🚨 Rollback Plan

If issues arise, rollback migrations in reverse order:

```sql
-- Rollback 021
DROP TABLE IF EXISTS agent_stakes;

-- Rollback 020
ALTER TABLE task_receipts DROP COLUMN IF EXISTS status;
ALTER TABLE task_receipts DROP COLUMN IF EXISTS committee;
ALTER TABLE task_receipts DROP COLUMN IF EXISTS k;
ALTER TABLE task_receipts DROP COLUMN IF EXISTS m;
ALTER TABLE task_receipts DROP COLUMN IF EXISTS finalized_at;

-- Rollback 019
DROP TABLE IF EXISTS agent_reputation;

-- Rollback 018
DROP TABLE IF EXISTS task_attestations;

-- Rollback 017
DROP TABLE IF EXISTS task_receipts;
```

Then redeploy previous version:
```bash
git checkout {previous_commit_sha}
railway deploy
```

---

## 📈 Performance Tuning

### Database Indexes

Migrations include these indexes:
- `idx_task_attestations_task_id` (attestations by task)
- `idx_task_attestations_created` (recent attestations)
- `idx_agent_stakes_updated` (stake updates)

**Additional indexes for production:**
```sql
-- Fast receipt status lookups
CREATE INDEX IF NOT EXISTS idx_task_receipts_status
  ON task_receipts(status, created_at DESC);

-- Fast committee member lookups
CREATE INDEX IF NOT EXISTS idx_task_receipts_committee
  ON task_receipts USING GIN(committee);

-- Fast reputation lookups by agent DID
CREATE INDEX IF NOT EXISTS idx_agent_reputation_did
  ON agent_reputation(agent_id);
```

### Cron Job Tuning

For high-volume production:
- Increase `POU_FINALIZER_CRON` to `*/5 * * * *` (every 5 minutes)
- Add batch size limit in finalizer query: `LIMIT 100`
- Consider separate worker processes for cron jobs

---

## 🎯 Success Criteria

Deployment is successful when:

- ✅ All 5 migrations (017-021) applied successfully
- ✅ Server starts with both cron jobs scheduled
- ✅ No database errors in logs
- ✅ Health check endpoint returns 200
- ✅ Receipt creation works (POST settle → receipt created)
- ✅ Attestation submission works (POST attestation → 201)
- ✅ Automatic finalization works (pending → finalized within 1-2 minutes)
- ✅ Reputation updates work (settlement → reputation.updated_at changed)
- ✅ Committee selection works (GET committee → array of DIDs)
- ✅ WebSocket notifications work (settlement → both parties notified)

---

## 📞 Support & Troubleshooting

**Common Issues:**

1. **"relation task_receipts does not exist"**
   - Cause: Migrations not applied
   - Fix: Run migrations 017-020 in order

2. **"UNAUTHORIZED_ATTESTATION: Only committee members can submit AUDIT_PASS"**
   - Cause: Attestation submitted by non-committee DID
   - Fix: Check committee list first: `GET /api/receipts/:task_id/committee`

3. **"QUORUM_NOT_MET: needed 3, have 1"**
   - Cause: Not enough attestations submitted
   - Fix: Submit more attestations (k attestations required)

4. **Receipts stuck in pending status**
   - Cause: Cron job not running or k threshold too high
   - Fix: Check logs for `[PoU Finalizer]` messages; verify `POU_FINALIZER_ENABLED=true`

5. **Empty committee array**
   - Cause: Not enough agents in database (need >= m agents)
   - Fix: Register more agents or lower `POU_M` value

**For more detailed troubleshooting, see:**
- [docs/pou/PROOF_OF_USEFULNESS.md](pou/PROOF_OF_USEFULNESS.md#troubleshooting)
- [docs/DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#troubleshooting)

---

## 🎉 Next Steps (Post-Deployment)

After successful deployment:

1. **Monitor for 24-48 hours** - Watch metrics, logs, error rates
2. **Enable credit rewards** - Set `USEFULNESS_REWARD_POOL_ENABLED=true`
3. **Tune quorum parameters** - Adjust k/m based on network size
4. **Implement signature verification** - Verify attestation signatures
5. **Add committee eligibility rules** - Restrict committee to staked agents
6. **Plan Phase C** - Dispute resolution system
7. **Plan Phase D** - Cross-chain PoU (Ethereum L2)

---

## 📝 Deployment Log Template

```
Date: _____________________
Deployed by: ______________
Environment: ______________
Commit SHA: _______________

Pre-deployment checks:
[ ] TypeScript compilation passed
[ ] Linter passed
[ ] Migrations ready (017-021)
[ ] Environment variables configured

Deployment:
[ ] Migrations applied successfully
[ ] Server started successfully
[ ] Cron jobs scheduled
[ ] Health check passed

Post-deployment verification:
[ ] Receipt creation tested
[ ] Attestation submission tested
[ ] Automatic finalization tested
[ ] Reputation updates tested
[ ] Committee selection tested

Issues encountered:
_________________________________
_________________________________

Resolution:
_________________________________
_________________________________

Sign-off: ______________
```

---

**Last updated:** 2025-10-08
**Version:** Phase B (Attestations & Finalization)
**Status:** ✅ Production Ready
