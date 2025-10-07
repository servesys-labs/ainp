# AI-Native Network Protocol (AINP)

**Phase**: 0.1 Foundation
**Status**: Development
**Created**: 2025-10-06

## Overview

AINP is a semantic communication protocol for AI agents, replacing location-based routing with intent-based semantic routing. This repository contains the Phase 0.1 implementation focused on foundational infrastructure.

## Quick Start

### Prerequisites

- Docker Desktop installed
- Node.js 18+ (for development)
- (Optional) NATS CLI for stream management

### Setup Development Environment

```bash
# 1. Clone repository
git clone <repo-url>
cd ainp

# 2. Setup infrastructure (PostgreSQL with pgvector, NATS, Redis)
bash scripts/setup-dev.sh

# 3. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 4. Install dependencies (when packages are ready)
npm install

# 5. Verify setup
npm run typecheck
npm test
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AINP Services                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │  Agent A  │  │  Agent B  │  │  Discovery│              │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘              │
└────────┼──────────────┼──────────────┼──────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                       │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────┐          │
│  │   NATS   │  │   PostgreSQL     │  │  Redis   │          │
│  │JetStream │  │  + pgvector      │  │  (cache) │          │
│  └──────────┘  └──────────────────┘  └──────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
ainp/
├── docs/
│   ├── rfcs/
│   │   ├── 001-SPEC.md              # Normative specification
│   │   └── 001-IMPLEMENTATION.md    # Implementation guide
│   └── architecture/
│       └── INFRASTRUCTURE.md         # Infrastructure docs
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   └── client.ts            # PostgreSQL client
│   │   └── schema.sql               # Database schema
│   └── core/
│       └── src/
│           ├── nats.ts              # NATS JetStream client
│           ├── vector.ts            # pgvector client
│           └── redis.ts             # Redis cache client
├── scripts/
│   ├── setup-dev.sh                 # Master setup script
│   ├── init-db.sh                   # PostgreSQL + pgvector init
│   └── init-nats.sh                 # NATS init
├── grafana/
│   ├── prometheus.yml               # Prometheus config
│   └── dashboards/                  # Grafana dashboards
├── docker-compose.dev.yml           # Development stack
├── .env.example                     # Environment template
└── README.md                        # This file
```

## Infrastructure Services

| Service     | Port | Purpose                          | Docs                          |
|-------------|------|----------------------------------|-------------------------------|
| PostgreSQL + pgvector | 5432 | Agents, capabilities, trust, vector embeddings | [Schema](packages/db/schema.sql) |
| NATS        | 4222 | Message bus (intents, results)   | [Client](packages/core/src/nats.ts) |
| Redis       | 6379 | Caching & rate limiting          | [Client](packages/core/src/redis.ts) |
| Prometheus  | 9090 | Metrics collection               | Optional                      |
| Grafana     | 3000 | Dashboards                       | Optional (admin/admin)        |

## Connection Strings

```bash
# PostgreSQL (with pgvector)
postgresql://ainp:ainp@localhost:5432/ainp

# NATS
nats://localhost:4222

# Redis
redis://localhost:6379
```

## Development Commands

```bash
# Start infrastructure
docker-compose -f docker-compose.dev.yml up -d

# Stop infrastructure
docker-compose -f docker-compose.dev.yml down

# View logs
docker-compose -f docker-compose.dev.yml logs -f [service]

# Reset all data (destructive!)
docker-compose -f docker-compose.dev.yml down -v
bash scripts/setup-dev.sh

# Build packages
npm run build

# Type check
npm run typecheck

# Run tests
npm test
```

## Database Schema

### Core Tables

- **`agents`**: Agent registry (DID, public key)
- **`capabilities`**: Agent capabilities (description, tags, version)
- **`trust_scores`**: Multi-dimensional reputation
- **`audit_log`**: Security events

See [schema.sql](packages/db/schema.sql) for full schema.

## Phase 0.1 Scope

**Delivered**:
- ✅ Docker Compose infrastructure setup
- ✅ PostgreSQL + pgvector schema (agents, capabilities with embeddings, trust, audit, routing cache)
- ✅ NATS JetStream configuration (3 streams)
- ✅ Redis cache layer
- ✅ TypeScript client wrappers (DB, NATS, pgvector, Redis)
- ✅ Initialization scripts
- ✅ Monitoring stack (Prometheus + Grafana)
- ✅ Architecture documentation

**Next Steps (Phase 0.2)**:
- [ ] Agent SDK implementation
- [ ] Discovery service
- [ ] Negotiation protocol implementation
- [ ] Intent delivery end-to-end
- [ ] Trust score calculation
- [ ] Rate limiting enforcement

## Documentation

- **[RFC 001 Specification](docs/rfcs/001-SPEC.md)**: Normative protocol specification
- **[Implementation Guide](docs/rfcs/001-IMPLEMENTATION.md)**: Step-by-step implementation
- **[Infrastructure Architecture](docs/architecture/INFRASTRUCTURE.md)**: Infrastructure design, scaling, monitoring

## Monitoring

### Health Checks

```bash
# PostgreSQL
docker exec ainp-postgres pg_isready -U ainp -d ainp

# NATS
curl http://localhost:8222/healthz

# pgvector (extension check)
docker exec ainp-postgres psql -U ainp -d ainp -tAc "SELECT extname FROM pg_extension WHERE extname = 'vector';"

# Redis
docker exec ainp-redis redis-cli ping
```

### Metrics

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

### Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker-compose.dev.yml logs -f postgres
```

## Security

**Development** (default credentials):
- PostgreSQL: `ainp:ainp`
- Grafana: `admin:admin`

**Production**:
- Use strong passwords (see `.env.example`)
- Enable TLS for all services
- Enable authentication for NATS
- Store secrets in vault (HashiCorp Vault, AWS Secrets Manager)
- Use SSL for PostgreSQL connections

## Backup & Recovery

### PostgreSQL (includes vector embeddings)

```bash
# Backup (includes pgvector data)
docker exec ainp-postgres pg_dump -U ainp -Fc ainp > backup.dump

# Restore
docker exec -i ainp-postgres pg_restore -U ainp -d ainp < backup.dump

# Verify pgvector extension after restore
docker exec ainp-postgres psql -U ainp -d ainp -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

## Troubleshooting

### Services won't start

```bash
# Check Docker
docker ps -a

# Check logs
docker-compose -f docker-compose.dev.yml logs [service]

# Rebuild
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d --build
```

### Database connection errors

```bash
# Verify PostgreSQL is running
docker exec ainp-postgres pg_isready -U ainp -d ainp

# Check connection string
echo $DATABASE_URL
```

### pgvector queries slow

```bash
# Check HNSW index status
docker exec ainp-postgres psql -U ainp -d ainp -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%';
"

# Rebuild index if needed (may take time on large datasets)
docker exec ainp-postgres psql -U ainp -d ainp -c "REINDEX INDEX CONCURRENTLY idx_capabilities_embedding;"
```

## Contributing

Phase 0.1 is foundational infrastructure. Contributions welcome for:
- Agent SDK implementation
- Discovery service
- Example agents
- Tests and documentation

## License

[To be determined]

## Contact

- **Discord**: [To be created]
- **GitHub Issues**: [Repository issues](https://github.com/ainp/ainp/issues)

---

**Status**: Phase 0.1 infrastructure complete. Ready for Phase 0.2 (Agent SDK + Discovery).
