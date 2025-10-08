# AINP Deployment Guide

## Production Deployment Checklist

### Prerequisites
- [ ] Docker 20.10+ installed
- [ ] Node.js 18+ installed (for local development)
- [ ] PostgreSQL 14+ (managed service or Docker)
- [ ] Redis 7+ (managed service or Docker)
- [ ] NATS 2.9+ (managed service or Docker)

### Environment Variables (Required)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/ainp

# Redis
REDIS_URL=redis://host:6379

# NATS
NATS_URL=nats://host:4222

# Broker Identity
BROKER_DID=did:key:z6Mk...  # Generate with SDK

# OpenAI (for embeddings/discovery)
OPENAI_API_KEY=sk-...

# Server
PORT=8080
NODE_ENV=production

# Feature Flags (recommended for production)
NEGOTIATION_ENABLED=true
CREDIT_LEDGER_ENABLED=true
MESSAGING_ENABLED=true
USEFULNESS_AGGREGATION_ENABLED=true
USEFULNESS_REWARD_POOL_ENABLED=false  # Enable after testing
WEB4_POU_DISCOVERY_ENABLED=true
GREYLIST_BYPASS_PAYMENT_ENABLED=false  # Enable if payment rails configured
```

### Optional: Payment Rails

**Lightning (L402):**
```bash
LIGHTNING_ENABLED=true
LIGHTNING_NODE_URL=https://your-lnd-node.com
LIGHTNING_MACAROON=<base64-encoded-macaroon>
```

**Coinbase Commerce:**
```bash
COINBASE_COMMERCE_ENABLED=true
COINBASE_COMMERCE_API_KEY=<api-key>
COINBASE_COMMERCE_WEBHOOK_SECRET=<webhook-secret>
```

---

## Deployment Options

### Option 1: Docker Compose (Recommended for Testing)

**1. Clone and build:**
```bash
git clone https://github.com/your-org/ainp.git
cd ainp
npm install
npm run build
```

**2. Create `.env` file:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

**3. Start services:**
```bash
docker-compose up -d
```

**4. Verify health:**
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok","timestamp":...}
```

**5. Run migrations:**
```bash
npm run migrate:up
```

### Option 2: Railway (One-Click Deploy)

**1. Click "Deploy to Railway":**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=...)

**2. Configure environment variables:**
- Railway auto-provisions PostgreSQL, Redis
- Set `OPENAI_API_KEY`, `BROKER_DID`, feature flags

**3. Deploy:**
- Railway builds and deploys automatically
- Domain: `your-app.railway.app`

### Option 3: Kubernetes (Production)

**1. Create namespace:**
```bash
kubectl create namespace ainp
```

**2. Create secrets:**
```bash
kubectl create secret generic ainp-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=REDIS_URL='redis://...' \
  --from-literal=NATS_URL='nats://...' \
  --from-literal=OPENAI_API_KEY='sk-...' \
  -n ainp
```

**3. Apply manifests:**
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

**4. Verify:**
```bash
kubectl get pods -n ainp
kubectl logs -f deployment/ainp-broker -n ainp
```

### Option 4: Fly.io

**1. Install flyctl:**
```bash
curl -L https://fly.io/install.sh | sh
```

**2. Create app:**
```bash
fly launch --name ainp-broker --region ord
```

**3. Provision databases:**
```bash
fly postgres create --name ainp-db
fly redis create --name ainp-redis
# Attach to app
fly postgres attach --app ainp-broker ainp-db
fly redis attach --app ainp-broker ainp-redis
```

**4. Set secrets:**
```bash
fly secrets set OPENAI_API_KEY=sk-... BROKER_DID=did:key:...
```

**5. Deploy:**
```bash
fly deploy
```

---

## Database Migrations

### Run Migrations
```bash
# Up (apply all pending)
npm run migrate:up

# Down (rollback one)
npm run migrate:down

# Create new migration
npm run migrate:create add_new_table
```

### Migration Files
Located in `packages/broker/migrations/`:
- `001_add_agents_table.sql`
- `002_add_trust_ratings.sql`
- `003_add_semantic_addresses.sql`
- `004_add_negotiation_sessions.sql`
- `005_add_mail_tables.sql`
- `006_add_contacts.sql`
- `007_add_usefulness_proofs.sql`
- `008_add_payments.sql`
- `009_add_credit_ledger.sql`

---

## Monitoring & Observability

### Health Checks
```bash
# Basic health
curl http://localhost:8080/health

# Detailed health (includes DB/Redis/NATS)
curl http://localhost:8080/health/detailed
```

### Logs
**Docker:**
```bash
docker logs -f ainp-broker
```

**Kubernetes:**
```bash
kubectl logs -f deployment/ainp-broker -n ainp
```

**Structured Logging:**
All logs are JSON-formatted:
```json
{
  "timestamp": "2025-10-08T12:00:00.000Z",
  "level": "INFO",
  "service": "ainp-broker",
  "message": "AINP Broker started",
  "port": "8080"
}
```

### Metrics (Future)
- Prometheus endpoint: `/metrics`
- Grafana dashboards: See `docs/observability/`

---

## Security Hardening

### 1. Enable Rate Limiting
```bash
# Already enabled by default
# Limits: 100 req/hour per DID
# Adjust in code if needed
```

### 2. Enable Anti-Fraud Checks
```bash
GREYLIST_BYPASS_PAYMENT_ENABLED=true  # Requires payment to bypass greylist
```

### 3. Use HTTPS in Production
**Nginx reverse proxy:**
```nginx
server {
  listen 443 ssl http2;
  server_name ainp.example.com;

  ssl_certificate /etc/letsencrypt/live/ainp.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ainp.example.com/privkey.pem;

  location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

### 4. Firewall Rules
```bash
# Allow only HTTPS (443) and optionally WS (8080)
ufw allow 443/tcp
ufw allow 8080/tcp  # WebSocket (if not behind reverse proxy)
ufw enable
```

### 5. Secret Management
**Use environment-specific secrets:**
- Development: `.env` file (gitignored)
- Staging: Railway/Fly secrets
- Production: Kubernetes secrets or Vault

**Never commit:**
- Private keys
- API keys
- Database passwords

---

## Scaling

### Horizontal Scaling
**Load Balancer + Multiple Instances:**
```bash
# Docker Compose
docker-compose up --scale broker=3

# Kubernetes
kubectl scale deployment/ainp-broker --replicas=3 -n ainp
```

**Considerations:**
- WebSocket connections are sticky (use session affinity)
- NATS handles pub/sub across instances
- Redis handles shared state (rate limits, cache)

### Database Scaling
**Read Replicas:**
```sql
-- Use read replica for discovery queries
DATABASE_URL_READ=postgresql://read-replica:5432/ainp
```

**Connection Pooling:**
```bash
# Already configured via pg-pool (max 20 connections)
# Adjust in packages/broker/src/lib/db-client.ts if needed
```

### Caching
**Redis caching already enabled for:**
- Discovery results (5 min TTL)
- Trust scores (10 min TTL)
- Rate limit counters

---

## Backup & Recovery

### Database Backups
**Automated daily backups:**
```bash
# pg_dump daily cron
0 2 * * * pg_dump $DATABASE_URL > /backups/ainp_$(date +\%Y\%m\%d).sql
```

**Point-in-time recovery:**
```bash
# Enable WAL archiving in PostgreSQL
wal_level = replica
archive_mode = on
archive_command = 'cp %p /backups/wal/%f'
```

### Redis Backups
**RDB snapshots:**
```bash
# Save every 15 minutes if ≥1 write
save 900 1
```

### NATS Backups
**JetStream persistence:**
```bash
# NATS streams are already persisted
# Backup NATS data directory
tar -czf nats-backup.tar.gz /data/nats
```

---

## Troubleshooting

### Issue: Broker won't start
**Check logs:**
```bash
docker logs ainp-broker
# Look for connection errors (DB, Redis, NATS)
```

**Verify connections:**
```bash
# PostgreSQL
psql $DATABASE_URL -c "SELECT 1"

# Redis
redis-cli -u $REDIS_URL ping

# NATS
nats server check --server=$NATS_URL
```

### Issue: High latency
**Check database:**
```sql
-- Slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

**Check Redis:**
```bash
redis-cli --latency
```

**Check NATS:**
```bash
nats stream report
```

### Issue: WebSocket connections dropping
**Increase timeouts:**
```nginx
# Nginx reverse proxy
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

**Check firewall:**
```bash
# Ensure WebSocket traffic allowed
ufw allow 8080/tcp
```

### Issue: 402 Payment Required errors
**Check payment rails:**
```bash
# Lightning
curl -H "Grpc-Metadata-macaroon: $LIGHTNING_MACAROON" \
  $LIGHTNING_NODE_URL/v1/balance/channels

# Coinbase
curl -H "X-CC-Api-Key: $COINBASE_COMMERCE_API_KEY" \
  https://api.commerce.coinbase.com/charges
```

---

## Rollback Procedure

### 1. Identify issue
```bash
# Check logs
kubectl logs -f deployment/ainp-broker -n ainp --tail=100

# Check health
curl https://ainp.example.com/health
```

### 2. Rollback deployment
**Kubernetes:**
```bash
kubectl rollout undo deployment/ainp-broker -n ainp
kubectl rollout status deployment/ainp-broker -n ainp
```

**Docker:**
```bash
docker-compose down
git checkout <previous-commit>
docker-compose up -d
```

### 3. Rollback database (if needed)
```bash
npm run migrate:down
# Rollback to specific version
npx node-pg-migrate down --to 008
```

### 4. Verify
```bash
curl https://ainp.example.com/health
npm test
```

---

## Post-Deployment Verification

### 1. Health Checks
```bash
# Basic health
curl https://ainp.example.com/health

# Database connectivity
curl https://ainp.example.com/health/detailed
```

### 2. Smoke Tests
```bash
# Send test message
npx tsx examples/send_message.ts

# Read inbox
npx tsx examples/read_inbox.ts

# Negotiation flow
npx tsx examples/negotiation_flow.ts
```

### 3. Conformance Tests
```bash
npm run conformance
# All tests should pass
```

### 4. Monitor Metrics
```bash
# Check logs for errors
docker logs -f ainp-broker | grep ERROR

# Check rate limit counters
redis-cli keys "rate_limit:*"

# Check NATS streams
nats stream ls
```

---

## Performance Tuning

### Database Optimization
```sql
-- Create indexes for common queries
CREATE INDEX idx_agents_did ON agents(did);
CREATE INDEX idx_mail_messages_recipient ON mail_messages(recipient_did);
CREATE INDEX idx_negotiations_state ON negotiations(state);
CREATE INDEX idx_usefulness_proofs_agent ON usefulness_proofs(agent_did);

-- Vacuum regularly
VACUUM ANALYZE;
```

### Redis Optimization
```bash
# Increase max memory
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### NATS Optimization
```bash
# Increase max payload
max_payload = 10MB

# Enable JetStream limits
max_memory_store = 1GB
max_file_store = 10GB
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Health checks passing
- [ ] HTTPS enabled
- [ ] Rate limiting enabled
- [ ] Backups configured
- [ ] Monitoring/logging enabled
- [ ] Firewall rules configured
- [ ] Secrets properly managed
- [ ] Conformance tests passing
- [ ] Smoke tests passing
- [ ] Rollback procedure documented
- [ ] On-call rotation configured
- [ ] Documentation updated

---

## Support

- **Documentation**: `docs/` directory
- **Issues**: GitHub Issues
- **Security**: See `SECURITY.md`
- **Community**: Discord/Slack (links in README)
