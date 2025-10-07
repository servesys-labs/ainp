# AINP Infrastructure Architecture

**Phase**: 0.1 Foundation
**Created**: 2025-10-06
**Status**: Active

## Table of Contents

1. [Overview](#overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow](#data-flow)
4. [Database Schema](#database-schema)
5. [Port Mappings](#port-mappings)
6. [Connection Strings](#connection-strings)
7. [Backup & Recovery](#backup--recovery)
8. [Scaling Considerations](#scaling-considerations)
9. [Security](#security)
10. [Monitoring](#monitoring)

## Overview

AINP Phase 0.1 infrastructure consists of three core services orchestrated via Docker Compose:

- **NATS JetStream**: Message bus for intent delivery and negotiation
- **PostgreSQL + pgvector**: Relational database with vector extension for agents, capabilities, trust scores, and semantic capability matching
- **Redis**: Cache layer for query results and rate limiting

Optional monitoring stack:
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AINP Services                          │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐             │
│  │  Agent A  │  │  Agent B  │  │  Discovery│             │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘             │
│        │              │              │                     │
└────────┼──────────────┼──────────────┼─────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────┐   │
│  │ NATS         │  │ PostgreSQL + pgvector            │   │
│  │ JetStream    │  │                                  │   │
│  │              │  │  - agents                        │   │
│  │ - Intents    │  │  - capabilities (with embeddings)│   │
│  │ - Negotiation│  │  - trust_scores                  │   │
│  │ - Results    │  │  - intent_routing_cache          │   │
│  │              │  │  - audit_log                     │   │
│  └──────────────┘  └──────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │ Redis        │  │ Prometheus   │                       │
│  │              │  │   +          │                       │
│  │ - Query cache│  │ Grafana      │                       │
│  │ - Rate limit │  │              │                       │
│  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Agent Registration & Advertisement

```mermaid
sequenceDiagram
    participant Agent
    participant PostgreSQL

    Agent->>PostgreSQL: 1. INSERT agent (DID, public_key)
    Agent->>PostgreSQL: 2. INSERT capabilities (description, embedding, tags)
    PostgreSQL-->>Agent: agent_id, capability_id
```

**Flow**:
1. Agent registers with DID and Ed25519 public key → PostgreSQL `agents` table
2. Agent declares capabilities with embeddings → PostgreSQL `capabilities` table (pgvector stores 1536-dim vectors)
3. PostgreSQL automatically indexes embeddings using HNSW for fast similarity search

### 2. Capability Discovery

```mermaid
sequenceDiagram
    participant Client
    participant Redis
    participant PostgreSQL

    Client->>Redis: 1. Check query cache
    alt Cache Hit
        Redis-->>Client: Cached results
    else Cache Miss
        Client->>PostgreSQL: 2. Vector similarity search (pgvector)
        PostgreSQL-->>Client: Top-K matches with agent metadata
        Client->>Redis: 3. Cache results (5min TTL)
    end
```

**Flow**:
1. Client checks Redis for cached query results (5-minute TTL)
2. If miss, performs cosine similarity search using pgvector (single query joins capabilities + trust_scores)
3. PostgreSQL returns matched capabilities with agent metadata and trust scores
4. Client caches results in Redis for subsequent queries

### 3. Intent Delivery

```mermaid
sequenceDiagram
    participant Sender
    participant NATS
    participant Receiver
    participant PostgreSQL

    Sender->>NATS: 1. Publish to ainp.agent.{id}.intents
    NATS->>Receiver: 2. Deliver message
    Receiver->>PostgreSQL: 3. Log audit event
    Receiver->>NATS: 4. Publish result to ainp.agent.{sender}.results
    NATS->>Sender: 5. Deliver result
```

**Flow**:
1. Sender publishes intent to NATS subject `ainp.agent.{receiver_id}.intents`
2. NATS delivers to receiver's consumer
3. Receiver logs interaction to `audit_log` table
4. Receiver publishes result to sender's result subject
5. Sender receives result via subscription

### 4. Trust Score Update

```mermaid
sequenceDiagram
    participant Agent
    participant PostgreSQL

    Agent->>PostgreSQL: 1. SELECT trust_scores WHERE agent_id
    PostgreSQL-->>Agent: Current dimensions
    Agent->>Agent: 2. Calculate new dimensions (EMA)
    Agent->>Agent: 3. Apply decay (days_since_update)
    Agent->>Agent: 4. Calculate aggregate score
    Agent->>PostgreSQL: 5. UPSERT trust_scores
```

**Flow**:
1. Retrieve current trust dimensions
2. Update dimensions using exponential moving average (α=0.2)
3. Apply exponential decay based on time since last update
4. Calculate aggregate score: `reliability×0.35 + honesty×0.35 + competence×0.20 + timeliness×0.10`
5. Upsert to `trust_scores` table

## Database Schema

### ER Diagram

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   agents    │◄────────│ capabilities │         │ trust_scores │
├─────────────┤   1:N   ├──────────────┤   1:1   ├──────────────┤
│ id (PK)     │         │ id (PK)      │◄────────│ agent_id (PK)│
│ did (UNIQUE)│         │ agent_id (FK)│         │ score        │
│ public_key  │         │ description  │         │ reliability  │
│ created_at  │         │ embedding_ref│         │ honesty      │
│ last_seen_at│         │ tags[]       │         │ competence   │
└─────────────┘         │ version      │         │ timeliness   │
       ▲                │ evidence_vc  │         │ decay_rate   │
       │                └──────────────┘         │ last_updated │
       │                                         └──────────────┘
       │
       │ 1:N
       │
┌──────────────┐
│  audit_log   │
├──────────────┤
│ id (PK)      │
│ agent_id (FK)│
│ event_type   │
│ details (JSONB)│
│ ip_address   │
│ timestamp    │
└──────────────┘
```

### Table Descriptions

#### `agents`
- **Purpose**: Registry of all AINP agents
- **Key Fields**:
  - `did` (TEXT, UNIQUE): W3C Decentralized Identifier
  - `public_key` (TEXT): Ed25519 public key for signature verification
  - `last_seen_at` (TIMESTAMPTZ): Activity tracking
- **Indexes**: `did`, `last_seen_at DESC`

#### `capabilities`
- **Purpose**: Agent capability declarations for discovery
- **Key Fields**:
  - `embedding` (vector(1536)): pgvector embedding for semantic search
  - `tags` (TEXT[]): Array for tag-based filtering
  - `version` (TEXT): Semantic version (e.g., "1.0.0")
  - `evidence_vc` (TEXT): Verifiable Credential URI
- **Indexes**: `agent_id`, GIN on `tags`, `version`, HNSW on `embedding`

#### `trust_scores`
- **Purpose**: Multi-dimensional reputation tracking
- **Key Fields**:
  - `score` (NUMERIC(5,4)): Aggregate trust (0-1)
  - `reliability`, `honesty`, `competence`, `timeliness`: Dimensions (0-1)
  - `decay_rate` (NUMERIC(5,4)): Default 0.977 (30-day half-life)
- **Indexes**: `score DESC`, `last_updated DESC`

#### `audit_log`
- **Purpose**: Security event tracking
- **Key Fields**:
  - `event_type` (TEXT): `auth_failure`, `rate_limit`, `malformed_message`, etc.
  - `details` (JSONB): Structured event metadata
  - `ip_address` (INET): Source IP (if applicable)
- **Indexes**: `timestamp DESC`, `agent_id`, `event_type`, GIN on `details`

### Database Functions

```sql
-- Calculate aggregate trust score
calculate_trust_score(reliability, honesty, competence, timeliness) → NUMERIC

-- Apply exponential decay
apply_trust_decay(score, decay_rate, days_since_update) → NUMERIC
```

## Port Mappings

| Service     | Internal Port | External Port | Purpose                |
|-------------|---------------|---------------|------------------------|
| NATS        | 4222          | 4222          | Client connections     |
| NATS        | 8222          | 8222          | HTTP monitoring        |
| NATS        | 6222          | 6222          | Cluster routing        |
| PostgreSQL  | 5432          | 5432          | Database connections   |
| Redis       | 6379          | 6379          | Cache connections      |
| Prometheus  | 9090          | 9090          | Metrics UI             |
| Grafana     | 3000          | 3000          | Dashboard UI           |

## Connection Strings

### Development (Docker Compose)

```bash
# PostgreSQL
DATABASE_URL=postgresql://ainp:ainp@localhost:5432/ainp

# NATS
NATS_URL=nats://localhost:4222


# Redis
REDIS_URL=redis://localhost:6379
```

### Production (Example: Railway/Fly.io)

```bash
# PostgreSQL (Railway example)
DATABASE_URL=postgresql://postgres:password@maglev.proxy.rlwy.net:14116/railway

# NATS (Internal service)
NATS_URL=nats://nats.railway.internal:4222


# Redis (Internal service)
REDIS_URL=redis://default:password@redis.railway.internal:6379
```

## Backup & Recovery

### PostgreSQL

**Automated Backups** (via `pg_dump`):
```bash
# Daily backup script
docker exec ainp-postgres pg_dump -U ainp -Fc ainp > backup_$(date +%Y%m%d).dump
```

**Restore**:
```bash
docker exec -i ainp-postgres pg_restore -U ainp -d ainp < backup_20251006.dump
```

**Continuous Archiving** (Production):
- Enable WAL archiving
- Store WAL files in S3/GCS
- PITR (Point-in-Time Recovery) support

### Vector Search (pgvector)

**Backup is included in PostgreSQL backups** - embeddings are stored in the `capabilities` table.

**Index Maintenance**:
```sql
-- Rebuild HNSW index if needed
REINDEX INDEX CONCURRENTLY idx_capabilities_embedding;

-- Check index statistics
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname = 'idx_capabilities_embedding';
```

### Redis

**RDB Snapshots** (configured in `docker-compose.dev.yml`):
- Auto-save every 300s if 100 keys changed
- Manual save: `docker exec ainp-redis redis-cli SAVE`

**Backup**:
```bash
docker cp ainp-redis:/data/dump.rdb ./redis-backup.rdb
```

## Scaling Considerations

### Horizontal Scaling

| Service     | Scaling Strategy                           | Notes                              |
|-------------|--------------------------------------------|------------------------------------|
| NATS        | Cluster (3+ nodes)                         | Automatic message routing          |
| PostgreSQL + pgvector | Read replicas + Connection pooling | Use PgBouncer for connection mgmt, replicas handle discovery queries |
| Redis       | Sentinel (HA) or Cluster (partitioning)    | Consider Redis Cluster for >10GB   |

### Vertical Scaling

**Phase 0.1 Targets** (single instance):
- **PostgreSQL + pgvector**: 4GB RAM, 2 vCPU (vector ops + relational data)
- **NATS**: 1GB RAM, 1 vCPU
- **Redis**: 512MB RAM, 1 vCPU

**Production Recommendations** (per service):
- **PostgreSQL**: 8GB RAM, 4 vCPU
- **NATS**: 2GB RAM, 2 vCPU
- **Redis**: 2GB RAM, 2 vCPU

### Data Volume Estimates

**Assumptions**:
- 1,000 agents
- 5 capabilities per agent
- 7-day message retention
- 100 intents/min throughput

**Storage Requirements**:
- **PostgreSQL**: ~500MB (agents + capabilities + trust + audit)
- **pgvector**: ~30MB (5,000 vectors × 1536 dims × 4 bytes, included in PostgreSQL)
- **NATS**: ~10GB (7 days × 100 intents/min × avg 2KB/message)
- **Redis**: ~100MB (embedding cache)

**Total**: ~11GB

## Security

### Network Isolation

```yaml
# Docker Compose network (development)
networks:
  ainp-dev:
    driver: bridge
```

**Production**: Use VPC/private subnets. Only expose:
- NATS client port (4222) to AINP services
- PostgreSQL (5432) to AINP services
- Redis (6379) to AINP services

### Authentication

- **PostgreSQL**: Password authentication (use strong passwords)
- **NATS**: Token-based auth (configure in `nats-server.conf`)
- **Redis**: Password authentication (`requirepass` in `redis.conf`)

### Encryption

**In Transit**:
- NATS: TLS encryption (configure certificates)
- PostgreSQL: SSL mode (`sslmode=require`)
- Redis: TLS support (Redis 6+)

**At Rest**:
- PostgreSQL: Transparent Data Encryption (TDE) via extensions (includes pgvector data)
- Encrypted storage volumes for all services
- Redis: Encrypted RDB files

### Rate Limiting

Configured per agent via Redis:
- **Default**: 100 intents/min
- **Burst**: 200 intents in 10s window
- **Discovery**: 10 queries/min

## Monitoring

### Metrics Collection (Prometheus)

**NATS Metrics** (port 8222):
- `nats_connections_total`
- `nats_msgs_in_total`
- `nats_msgs_out_total`
- `nats_jetstream_storage_bytes`

**pgvector Metrics** (via PostgreSQL):
- Query execution time (pg_stat_statements)
- Index scan counts (pg_stat_user_indexes)
- Table size and growth (pg_stat_user_tables)
- HNSW index statistics

**PostgreSQL Metrics** (via `pg_stat_statements`):
- Connection pool usage
- Query latency (p50, p95, p99)
- Slow queries (>100ms)
- Table sizes

**Redis Metrics**:
- Cache hit rate
- Memory usage
- Eviction count

### Dashboards (Grafana)

**Pre-configured Dashboards**:
1. **AINP Overview**: System health, message throughput, error rates
2. **NATS Dashboard**: Stream metrics, consumer lag, message rates
3. **pgvector Dashboard**: Vector search latency, HNSW index size, query rates
4. **PostgreSQL Dashboard**: Connection pool, query performance, table I/O
5. **Trust Scores**: Distribution, decay trends, outlier detection

### Alerts

**Critical Alerts**:
- Service down (any component)
- PostgreSQL connection pool exhausted
- pgvector search latency >500ms (p95)
- NATS stream lag >1000 messages
- Redis memory >90% usage

**Warning Alerts**:
- Trust score <0.3 for agent
- Rate limit violations >10/min
- Slow queries >500ms
- Disk usage >80%

### Health Checks

```bash
# PostgreSQL
docker exec ainp-postgres pg_isready -U ainp -d ainp

# NATS
curl http://localhost:8222/healthz

# pgvector (check extension)
docker exec ainp-postgres psql -U ainp -d ainp -tAc "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# Redis
docker exec ainp-redis redis-cli ping
```

## Appendix: Quick Reference

### Start Services

```bash
bash scripts/setup-dev.sh
```

### Stop Services

```bash
docker-compose -f docker-compose.dev.yml down
```

### View Logs

```bash
docker-compose -f docker-compose.dev.yml logs -f [service]
```

### Reset Data (Destructive)

```bash
docker-compose -f docker-compose.dev.yml down -v
bash scripts/setup-dev.sh
```

### Useful Commands

```bash
# NATS CLI
nats stream list
nats stream info AINP_INTENTS
nats consumer list AINP_INTENTS

# PostgreSQL CLI
docker exec -it ainp-postgres psql -U ainp -d ainp

# pgvector similarity search (example)
docker exec -it ainp-postgres psql -U ainp -d ainp -c "
SELECT
  c.description,
  1 - (c.embedding <=> '[0.1,0.2,...]'::vector) AS similarity
FROM capabilities c
ORDER BY c.embedding <=> '[0.1,0.2,...]'::vector
LIMIT 5;
"

# Redis CLI
docker exec -it ainp-redis redis-cli
```

---

## Vector Search Strategy (pgvector)

**Why pgvector over Qdrant?**
- **Single database**: Simpler architecture, fewer moving parts
- **ACID transactions**: Capability updates with trust scores are atomic
- **Mature ecosystem**: Backup, replication, monitoring tools all work
- **HNSW indexing**: Fast ANN search (~10ms for 1M vectors)
- **Cost-effective**: No separate vector database infrastructure

**Performance**:
- Embedding dimensions: 1536 (OpenAI text-embedding-3-small)
- Distance metric: Cosine (1 - cosine_similarity)
- Index type: HNSW (m=16, ef_construction=64)
- Search threshold: 0.7 (configurable)
- Cache: Redis (5-minute TTL for query results)

**Scaling** (future):
- Horizontal: PostgreSQL read replicas for discovery
- Vertical: Increase HNSW parameters (m=32, ef=128) for accuracy
- Partitioning: Shard by capability tags for >1M agents

---

**End of Infrastructure Documentation**
