# AINP Phase 0.2 Comprehensive Test Plan

**Sprint**: Phase 0.2 System Testing
**Owner**: IPSA (Implementation Planner & Sprint Architect)
**Created**: 2025-10-06
**Status**: Ready for Execution

## Sprint Overview

### Goal
Validate the deployed AINP Phase 0.2 system across infrastructure, API, integration, security, and observability layers to ensure production readiness.

### Scope

**In Scope**:
- Infrastructure connectivity and operations (PostgreSQL + pgvector, Redis, NATS, OpenAI)
- Core API endpoints (agent registration, discovery, intent routing)
- End-to-end integration flows (registration → discovery → delivery)
- Security mechanisms (rate limiting, authentication, validation)
- Observability and monitoring (health checks, metrics, logging)

**Out of Scope**:
- Performance benchmarking beyond basic load testing
- Horizontal scaling tests
- Disaster recovery procedures
- Multi-region deployment
- Advanced negotiation protocol edge cases

### Success Criteria

**Must Pass**:
- ✅ All infrastructure health checks pass
- ✅ All API endpoints return expected responses
- ✅ End-to-end agent registration and intent delivery works
- ✅ Rate limiting enforces configured limits
- ✅ Authentication rejects invalid signatures
- ✅ WebSocket connections handle real-time delivery
- ✅ All quality gates pass (lint, typecheck, build, tests)

**Nice to Have**:
- Load testing shows acceptable performance under 100 concurrent requests
- Prometheus metrics are accurate and queryable
- Structured logs are parseable and useful

### Estimated Duration
- **Phase 1**: 2-3 hours (Infrastructure Validation)
- **Phase 2**: 4-6 hours (Core API Testing)
- **Phase 3**: 6-8 hours (Integration Testing)
- **Phase 4**: 4-6 hours (Security & Performance)
- **Phase 5**: 2-3 hours (Observability)
- **Total**: 18-26 hours (3-4 working days with buffer)

### Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenAI API rate limits during embedding tests | Medium | High | Use cached embeddings, throttle requests, prepare fallback test data |
| NATS JetStream stream configuration mismatch | Low | High | Verify streams before tests, include stream creation in setup |
| Race conditions in concurrent tests | Medium | Medium | Use proper test isolation, sequential execution where needed |
| WebSocket connection instability | Medium | High | Implement retry logic, test reconnection scenarios |
| Redis cache inconsistency | Low | Medium | Clear cache between test phases, verify TTLs |

---

## Phase 1: Infrastructure Validation

### Purpose
Verify all infrastructure dependencies are operational and meet performance baselines.

### Owner
**IE (Implementation Engineer)** - Infrastructure tests
**IV (Implementation Validator)** - Validation of test results

### Entry Criteria
- ✅ Docker Compose stack running (verified in previous session)
- ✅ All containers healthy (postgres, nats, redis, broker)
- ✅ Environment variables configured (.env file)

### Detailed Checklist

#### 1.1 PostgreSQL + pgvector
- [ ] **DB-001**: Verify PostgreSQL connection
  - Command: `docker exec ainp-postgres pg_isready -U ainp -d ainp`
  - Expected: `ainp:5432 - accepting connections`

- [ ] **DB-002**: Verify pgvector extension installed
  - Query: `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`
  - Expected: `vector | 0.8.0` (or current version)

- [ ] **DB-003**: Verify schema tables exist
  - Query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
  - Expected tables: `agents`, `capabilities`, `trust_scores`, `audit_log`, `routing_cache`

- [ ] **DB-004**: Test vector operations
  - Insert test embedding: `INSERT INTO capabilities (agent_id, description, embedding, tags, version) VALUES (1, 'test', '[0.1, 0.2, 0.3, ...]', ARRAY['test'], '1.0.0');`
  - Query with cosine similarity: `SELECT * FROM capabilities ORDER BY embedding <=> '[0.1, 0.2, 0.3, ...]' LIMIT 5;`
  - Expected: Results with cosine distance scores

- [ ] **DB-005**: Verify HNSW index on embeddings
  - Query: `SELECT indexname, indexdef FROM pg_indexes WHERE indexname LIKE '%embedding%';`
  - Expected: `idx_capabilities_embedding` exists with `USING hnsw`

#### 1.2 Redis Cache
- [ ] **REDIS-001**: Verify Redis connection
  - Command: `docker exec ainp-redis redis-cli ping`
  - Expected: `PONG`

- [ ] **REDIS-002**: Test SET/GET operations
  - SET: `SET test:key "test-value" EX 60`
  - GET: `GET test:key`
  - Expected: `test-value`

- [ ] **REDIS-003**: Test TTL expiration
  - SET: `SET test:ttl "expire-me" EX 2`
  - Wait 3 seconds
  - GET: `GET test:ttl`
  - Expected: `(nil)`

- [ ] **REDIS-004**: Test rate limit key structure
  - SET: `SET rate_limit:did:key:z6MkTest:60 5 EX 60`
  - GET: `GET rate_limit:did:key:z6MkTest:60`
  - Expected: `5`

#### 1.3 NATS JetStream
- [ ] **NATS-001**: Verify NATS connection
  - Command: `curl http://localhost:8222/healthz`
  - Expected: HTTP 200 OK

- [ ] **NATS-002**: List JetStream streams
  - Command: `docker exec ainp-nats nats stream list`
  - Expected streams: `INTENTS`, `RESULTS`, `NEGOTIATIONS`

- [ ] **NATS-003**: Verify stream configuration
  - Command: `docker exec ainp-nats nats stream info INTENTS`
  - Expected: Retention policy, max messages, max age

- [ ] **NATS-004**: Publish test message
  - Publish to `intents.{did}` subject
  - Verify message stored in stream

- [ ] **NATS-005**: Subscribe and consume message
  - Create consumer on INTENTS stream
  - Consume published message
  - Verify message content

#### 1.4 OpenAI API Integration
- [ ] **OPENAI-001**: Verify API key configured
  - Check: `echo $OPENAI_API_KEY | grep -o '^sk-proj-' | wc -l`
  - Expected: `1`

- [ ] **OPENAI-002**: Test embeddings API
  - Call: `POST https://api.openai.com/v1/embeddings` with test text
  - Expected: 1536-dimensional embedding vector

- [ ] **OPENAI-003**: Verify embedding dimensions
  - Response dimensions: `1536` (text-embedding-3-small)
  - Data type: `Float32Array` compatible

- [ ] **OPENAI-004**: Test error handling for invalid API key
  - Call with invalid key
  - Expected: `401 Unauthorized` error

### Exit Criteria
- ✅ All infrastructure health checks pass
- ✅ All database tables accessible
- ✅ Redis cache operational with TTL expiration
- ✅ NATS streams operational and message flow confirmed
- ✅ OpenAI embeddings API accessible and returning valid vectors

### Artifacts
- `tests/infrastructure/db-validation.test.ts`
- `tests/infrastructure/redis-validation.test.ts`
- `tests/infrastructure/nats-validation.test.ts`
- `tests/infrastructure/openai-validation.test.ts`
- Test execution log: `logs/phase1-infrastructure.log`

### Dependencies
**None** (baseline infrastructure tests)

---

## Phase 2: Core API Testing

### Purpose
Validate all broker API endpoints with valid inputs, edge cases, and error scenarios.

### Owner
**IE (Implementation Engineer)** - API test implementation
**TA (Test Author)** - Test coverage validation

### Entry Criteria
- ✅ Phase 1 complete (infrastructure operational)
- ✅ Broker running on http://localhost:8080
- ✅ Health endpoint returning 200 OK

### Detailed Checklist

#### 2.1 Health Endpoints
- [ ] **HEALTH-001**: Test `/health` endpoint
  - Request: `GET http://localhost:8080/health`
  - Expected: `{ status: 'healthy', timestamp: <number>, uptime: <number> }`
  - Status: `200 OK`

- [ ] **HEALTH-002**: Test `/health/ready` endpoint - all healthy
  - Request: `GET http://localhost:8080/health/ready`
  - Expected: `{ status: 'ready', checks: { database: 'ok', redis: 'ok', nats: 'ok' } }`
  - Status: `200 OK`

- [ ] **HEALTH-003**: Test `/health/ready` - degraded (Redis down)
  - Stop Redis: `docker stop ainp-redis`
  - Request: `GET http://localhost:8080/health/ready`
  - Expected: `{ status: 'not_ready', checks: { database: 'ok', redis: 'error: ...', nats: 'ok' } }`
  - Status: `503 Service Unavailable`
  - Cleanup: `docker start ainp-redis`

#### 2.2 Agent Registration (`POST /api/agents/register`)

**Test Data Setup**:
```typescript
const testAgent1: SemanticAddress = {
  did: 'did:key:z6MkfZa2pXJk5WQkJVKGx8Y9UjQrPkRhN3D2H5qXkQwE1Abc',
  capabilities: [
    {
      description: 'Schedule meetings and manage calendar events',
      embedding: '<base64-encoded-1536-dim-vector>',
      tags: ['calendar', 'scheduling', 'meetings'],
      version: '1.0.0',
      evidence: 'https://example.com/calendar-agent'
    }
  ],
  trust: {
    score: 0.85,
    dimensions: {
      reliability: 0.9,
      honesty: 0.85,
      competence: 0.8,
      timeliness: 0.85
    },
    decay_rate: 0.977,
    last_updated: Date.now()
  },
  credentials: ['did:web:example.com#credential-1']
};
```

- [ ] **REG-001**: Register agent successfully
  - Request: `POST /api/agents/register` with `testAgent1` and `ttl: 3600`
  - Expected: `{ status: 'registered', did: 'did:key:z6Mk...' }`
  - Status: `200 OK`
  - Verify: Agent stored in `agents` table
  - Verify: Capability stored in `capabilities` table with embedding

- [ ] **REG-002**: Register agent with multiple capabilities
  - Add second capability: "Process payment transactions"
  - Request with agent having 2 capabilities
  - Expected: Both capabilities stored with separate embeddings

- [ ] **REG-003**: Test duplicate registration (idempotent)
  - Register same DID twice
  - Expected: Second registration updates existing record
  - Verify: No duplicate rows in database

- [ ] **REG-004**: Test invalid DID format
  - Request with `did: 'invalid-did-format'`
  - Expected: `400 Bad Request` with validation error

- [ ] **REG-005**: Test missing required fields
  - Request without `capabilities` array
  - Expected: `400 Bad Request`

- [ ] **REG-006**: Test invalid embedding format
  - Request with embedding that's not base64 or wrong dimensions
  - Expected: `400 Bad Request`

- [ ] **REG-007**: Test TTL boundary values
  - Request with `ttl: 0` (immediate expiration)
  - Request with `ttl: -1` (invalid)
  - Request with `ttl: 86400` (1 day, valid)
  - Expected: Reject negative, accept valid values

#### 2.3 Agent Retrieval (`GET /api/agents/:did`)

- [ ] **GET-001**: Retrieve registered agent
  - Request: `GET /api/agents/did:key:z6MkfZa2pXJk5WQkJVKGx8Y9UjQrPkRhN3D2H5qXkQwE1Abc`
  - Expected: Full `SemanticAddress` object with capabilities and trust

- [ ] **GET-002**: Retrieve non-existent agent
  - Request: `GET /api/agents/did:key:z6MkNonExistent`
  - Expected: `404 Not Found` with error message

- [ ] **GET-003**: Test malformed DID parameter
  - Request: `GET /api/agents/not-a-did`
  - Expected: `400 Bad Request`

#### 2.4 Semantic Discovery (`POST /api/discovery/search`)

**Test Queries**:
```typescript
const query1: DiscoveryQuery = {
  description: 'I need an agent to schedule a meeting for tomorrow at 2pm',
  tags: ['calendar', 'scheduling'],
  min_trust: 0.7,
  max_latency_ms: 1000,
  max_cost: 0.05
};

const query2: DiscoveryQuery = {
  description: 'Process a $500 credit card payment',
  tags: ['payment', 'transactions'],
  min_trust: 0.9 // High trust required for payments
};
```

- [ ] **DISC-001**: Search with semantic description only
  - Request: `POST /api/discovery/search` with `query1`
  - Expected: `{ agents: [...], count: N }` with relevant agents
  - Verify: Results ranked by cosine similarity to query embedding

- [ ] **DISC-002**: Search with tag filters
  - Request with `tags: ['calendar']`
  - Expected: Only agents with matching tags returned

- [ ] **DISC-003**: Search with trust threshold
  - Request with `min_trust: 0.9`
  - Expected: Only agents with `trust.score >= 0.9` returned

- [ ] **DISC-004**: Search with latency constraint
  - Request with `max_latency_ms: 500`
  - Expected: Agents filtered by latency capability

- [ ] **DISC-005**: Search with cost constraint
  - Request with `max_cost: 0.01`
  - Expected: Only low-cost agents returned

- [ ] **DISC-006**: Search with no results
  - Request: `{ description: 'Build a spaceship', min_trust: 0.99 }`
  - Expected: `{ agents: [], count: 0 }`

- [ ] **DISC-007**: Search with empty description
  - Request: `{ description: '', tags: ['calendar'] }`
  - Expected: Tag-based filtering still works

- [ ] **DISC-008**: Verify embedding caching
  - Search same query twice
  - Verify: Second request uses cached embedding (faster response)
  - Check Redis: `GET embedding:<hash-of-description>`

#### 2.5 Intent Routing (`POST /api/intents/send`)

**Test Envelope**:
```typescript
const testEnvelope: AINPEnvelope = {
  id: 'intent-001',
  trace_id: 'trace-abc-123',
  from_did: 'did:key:z6MkSender...',
  to_did: 'did:key:z6MkReceiver...', // Optional for broadcast
  msg_type: 'INTENT',
  ttl: 300, // 5 minutes
  timestamp: Date.now(),
  sig: '<base64-signature>',
  payload: {
    intent_id: 'intent-001',
    action: 'schedule_meeting',
    params: {
      title: 'Sprint Planning',
      date: '2025-10-07T14:00:00Z',
      duration_minutes: 60,
      attendees: ['alice@example.com', 'bob@example.com']
    },
    constraints: {
      max_latency_ms: 1000,
      max_cost: 0.05,
      privacy: 'private'
    }
  }
};

const discoveryQuery: DiscoveryQuery = {
  description: 'Schedule meeting',
  tags: ['calendar'],
  min_trust: 0.7
};
```

- [ ] **ROUTE-001**: Route intent to specific agent (unicast)
  - Request: `POST /api/intents/send` with envelope having `to_did` set
  - Expected: `{ status: 'routed', agent_count: 1 }`
  - Verify: Message published to NATS `intents.{to_did}` subject

- [ ] **ROUTE-002**: Route intent with discovery (broadcast)
  - Request with envelope without `to_did` + `query`
  - Expected: `{ status: 'routed', agent_count: N }` (multiple matching agents)
  - Verify: Message published to each matching agent's NATS subject

- [ ] **ROUTE-003**: Route intent with no matching agents
  - Request with query that matches no agents
  - Expected: `{ status: 'routed', agent_count: 0 }`
  - Verify: No NATS messages published

- [ ] **ROUTE-004**: Test invalid envelope signature
  - Request with `sig: 'invalid-signature'`
  - Expected: `401 Unauthorized` (authentication middleware should catch)

- [ ] **ROUTE-005**: Test expired TTL
  - Request with `ttl: 0` and timestamp in the past
  - Expected: `400 Bad Request` (validation should catch)

- [ ] **ROUTE-006**: Test malformed envelope
  - Request missing required fields (`id`, `from_did`, `msg_type`)
  - Expected: `400 Bad Request`

- [ ] **ROUTE-007**: Test different message types
  - Send `msg_type: 'RESULT'`
  - Send `msg_type: 'NEGOTIATE'`
  - Expected: Different NATS stream routing (RESULTS, NEGOTIATIONS)

### Exit Criteria
- ✅ All API endpoints return correct responses for valid inputs
- ✅ All validation logic catches invalid inputs with proper error codes
- ✅ Semantic discovery returns ranked results based on embeddings
- ✅ Intent routing publishes to correct NATS subjects
- ✅ Database state reflects API operations (agents registered, capabilities stored)

### Artifacts
- `tests/api/health.test.ts`
- `tests/api/agents.test.ts`
- `tests/api/discovery.test.ts`
- `tests/api/intents.test.ts`
- Test execution log: `logs/phase2-api.log`

### Dependencies
**Depends on**: Phase 1 (infrastructure operational)

---

## Phase 3: Integration Testing

### Purpose
Validate end-to-end flows spanning multiple services and components.

### Owner
**ICA (Integration & Cohesion Auditor)** - Integration flow validation
**IE (Implementation Engineer)** - Test implementation
**TA (Test Author)** - Coverage validation

### Entry Criteria
- ✅ Phase 1 and Phase 2 complete
- ✅ All API endpoints functional
- ✅ NATS streams operational

### Detailed Checklist

#### 3.1 End-to-End Agent Lifecycle

**Scenario**: Register → Discover → Route Intent → Deliver

- [ ] **E2E-001**: Complete agent lifecycle (happy path)
  1. Register Agent A (calendar scheduling capability)
  2. Register Agent B (payment processing capability)
  3. Discover agents with query "schedule meeting"
  4. Verify Agent A returned, Agent B not returned
  5. Route intent to Agent A via discovery
  6. Verify intent delivered to Agent A's NATS subject
  7. Verify intent NOT delivered to Agent B

- [ ] **E2E-002**: Multi-agent discovery and routing
  1. Register 3 agents with overlapping "scheduling" capability
  2. Discover with "schedule meeting" query
  3. Verify all 3 agents returned, ranked by trust score
  4. Route intent without `to_did` (broadcast to all 3)
  5. Verify 3 NATS messages published

- [ ] **E2E-003**: Agent TTL expiration and cleanup
  1. Register agent with `ttl: 5` (5 seconds)
  2. Verify agent discoverable immediately
  3. Wait 6 seconds
  4. Discover with same query
  5. Verify agent no longer returned
  6. Verify agent marked as expired in database

#### 3.2 WebSocket Real-Time Delivery

**Test Setup**:
```typescript
// Simulate agent connecting via WebSocket
const ws = new WebSocket('ws://localhost:8080?did=did:key:z6MkReceiver...');
```

- [ ] **WS-001**: WebSocket connection establishment
  - Connect with valid DID
  - Expected: Connection accepted, DID registered in `wsHandler`

- [ ] **WS-002**: WebSocket connection rejection (missing DID)
  - Connect without `?did=` parameter
  - Expected: Connection closed with code `1008` and message "Missing DID parameter"

- [ ] **WS-003**: Real-time intent delivery
  1. Agent connects via WebSocket
  2. Route intent to agent's DID
  3. Verify intent delivered via WebSocket in <100ms
  4. Verify WebSocket message contains full envelope

- [ ] **WS-004**: Multiple intents delivery
  1. Agent connected
  2. Route 5 intents rapidly
  3. Verify all 5 delivered in order
  4. Verify no message loss

- [ ] **WS-005**: WebSocket disconnection and reconnection
  1. Agent connects
  2. Route intent while connected
  3. Disconnect WebSocket
  4. Route second intent
  5. Reconnect WebSocket
  6. Verify second intent delivered on reconnect (NATS replay)

- [ ] **WS-006**: Concurrent WebSocket connections (same DID)
  1. Open 2 WebSocket connections with same DID
  2. Route intent to DID
  3. Verify both connections receive intent (or test single-connection policy)

#### 3.3 Multi-Round Negotiation Flow

**Scenario**: Agent A initiates payment, Agent B negotiates price

- [ ] **NEG-001**: Negotiation initiation (OFFER)
  1. Agent A routes NEGOTIATE envelope with `phase: 'OFFER'`
  2. Proposal: `{ price: 0.05, latency_ms: 500, confidence: 0.9 }`
  3. Verify envelope published to NEGOTIATIONS stream
  4. Verify Agent B receives via WebSocket

- [ ] **NEG-002**: Negotiation counter-offer (COUNTER)
  1. Agent B sends NEGOTIATE envelope with `phase: 'COUNTER'`
  2. Proposal: `{ price: 0.03, latency_ms: 1000, confidence: 0.85 }`
  3. Verify round number incremented
  4. Verify Agent A receives counter-offer

- [ ] **NEG-003**: Negotiation acceptance (ACCEPT)
  1. Agent A sends NEGOTIATE with `phase: 'ACCEPT'`
  2. Verify negotiation marked as complete
  3. Verify trust scores updated for both agents

- [ ] **NEG-004**: Negotiation rejection (REJECT)
  1. Agent B sends NEGOTIATE with `phase: 'REJECT'`
  2. Verify negotiation aborted
  3. Verify no trust score changes

- [ ] **NEG-005**: Negotiation timeout (max rounds exceeded)
  1. Initiate negotiation
  2. Send 10 COUNTER messages (assume max rounds = 5)
  3. Verify negotiation auto-aborted after max rounds

#### 3.4 Trust Score Updates

- [ ] **TRUST-001**: Trust score update after successful intent
  1. Register agent with initial trust `{ score: 0.7 }`
  2. Route intent, agent delivers result successfully
  3. Route RESULT envelope with `status: 'success'`
  4. Verify trust score increased (e.g., `0.7 → 0.72`)

- [ ] **TRUST-002**: Trust score penalty after failure
  1. Agent delivers ERROR result
  2. Route ERROR envelope
  3. Verify trust score decreased

- [ ] **TRUST-003**: Trust score decay over time
  1. Register agent, don't interact
  2. Wait 1 day (or simulate with timestamp manipulation)
  3. Verify trust score decayed based on `decay_rate: 0.977`

- [ ] **TRUST-004**: Trust dimension updates
  1. Agent is late (exceeded `max_latency_ms`)
  2. Verify `timeliness` dimension decreased
  3. Agent delivers wrong result
  4. Verify `competence` dimension decreased

### Exit Criteria
- ✅ End-to-end agent lifecycle works without errors
- ✅ WebSocket delivery is reliable and fast (<100ms)
- ✅ Multi-round negotiation completes successfully
- ✅ Trust scores update correctly based on interactions
- ✅ All NATS streams used correctly (INTENTS, RESULTS, NEGOTIATIONS)

### Artifacts
- `tests/integration/e2e-lifecycle.test.ts`
- `tests/integration/websocket-delivery.test.ts`
- `tests/integration/negotiation-flow.test.ts`
- `tests/integration/trust-updates.test.ts`
- Test execution log: `logs/phase3-integration.log`

### Dependencies
**Depends on**: Phase 1 (infrastructure), Phase 2 (API functional)

---

## Phase 4: Security & Performance

### Purpose
Validate security mechanisms and performance under load.

### Owner
**SA (Security Auditor)** - Security validation
**PO (Performance Optimizer)** - Performance baseline
**IE (Implementation Engineer)** - Test implementation

### Entry Criteria
- ✅ Phase 1, 2, 3 complete
- ✅ Integration tests passing
- ✅ Security middleware deployed

### Detailed Checklist

#### 4.1 Rate Limiting

**Configuration** (from `.env`):
```bash
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=10  # 10 requests per minute per DID
```

- [ ] **RATE-001**: Test rate limit enforcement
  1. Send 10 requests from same DID within 1 minute
  2. Expected: All 10 succeed (200 OK)
  3. Send 11th request
  4. Expected: `429 Too Many Requests` with `Retry-After` header

- [ ] **RATE-002**: Test rate limit reset after window
  1. Hit rate limit (10 requests)
  2. Wait 61 seconds
  3. Send request
  4. Expected: `200 OK` (limit reset)

- [ ] **RATE-003**: Test rate limit per-DID isolation
  1. Send 10 requests from DID A
  2. Send 1 request from DID B
  3. Expected: DID A blocked, DID B succeeds

- [ ] **RATE-004**: Test rate limit Redis key structure
  1. Hit rate limit
  2. Check Redis: `GET rate_limit:{did}:60`
  3. Verify: Key exists with correct TTL

#### 4.2 Authentication (Signature Verification)

**Test Setup**:
```typescript
import * as ed25519 from '@noble/ed25519';

// Generate keypair
const privateKey = ed25519.utils.randomPrivateKey();
const publicKey = await ed25519.getPublicKey(privateKey);

// Sign envelope
const message = JSON.stringify(envelope);
const signature = await ed25519.sign(message, privateKey);
```

- [ ] **AUTH-001**: Valid signature accepted
  1. Create envelope
  2. Sign with private key
  3. Send request with signature
  4. Expected: `200 OK`

- [ ] **AUTH-002**: Invalid signature rejected
  1. Create envelope
  2. Tamper with signature (flip one byte)
  3. Send request
  4. Expected: `401 Unauthorized` with error "Invalid signature"

- [ ] **AUTH-003**: Missing signature rejected
  1. Create envelope without `sig` field
  2. Send request
  3. Expected: `400 Bad Request` (validation middleware catches)

- [ ] **AUTH-004**: Signature for wrong message rejected
  1. Create envelope A, sign it
  2. Modify envelope payload (change `action` field)
  3. Send with original signature
  4. Expected: `401 Unauthorized` (signature doesn't match message)

- [ ] **AUTH-005**: Replay attack protection
  1. Send valid envelope with signature
  2. Send exact same envelope again (same `id`, `timestamp`, `sig`)
  3. Expected: Idempotent or reject as duplicate (depends on implementation)

#### 4.3 Input Validation

- [ ] **VAL-001**: Test SQL injection prevention
  1. Send registration with `did: "'; DROP TABLE agents; --"`
  2. Expected: Request rejected or DID escaped safely

- [ ] **VAL-002**: Test XSS prevention in descriptions
  1. Register capability with `description: "<script>alert('xss')</script>"`
  2. Retrieve agent via GET
  3. Verify: Description escaped or sanitized

- [ ] **VAL-003**: Test oversized payload rejection
  1. Send envelope with 10MB payload
  2. Expected: `413 Payload Too Large` (if limit configured)

- [ ] **VAL-004**: Test malformed JSON
  1. Send request with invalid JSON body
  2. Expected: `400 Bad Request` with parse error

- [ ] **VAL-005**: Test embedding dimension validation
  1. Register capability with 512-dim embedding (wrong size)
  2. Expected: `400 Bad Request` (must be 1536-dim)

#### 4.4 Performance & Load Testing

**Tool**: Use `k6` or `autocannon` for load testing

**Test Script** (example):
```javascript
// k6 load test
import http from 'k6/http';

export const options = {
  vus: 100, // 100 concurrent virtual users
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({ /* discovery query */ });
  http.post('http://localhost:8080/api/discovery/search', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **PERF-001**: Baseline discovery query performance
  1. Send 1000 sequential discovery queries
  2. Measure: P50, P95, P99 latency
  3. Expected: P95 < 200ms (without OpenAI API calls)

- [ ] **PERF-002**: Concurrent discovery queries
  1. Send 100 concurrent queries for 30 seconds
  2. Measure: Throughput (req/sec), error rate
  3. Expected: >50 req/sec, <1% error rate

- [ ] **PERF-003**: Intent routing throughput
  1. Route 1000 intents to same agent
  2. Measure: NATS publish latency
  3. Expected: <50ms per message

- [ ] **PERF-004**: WebSocket delivery latency
  1. 10 agents connected via WebSocket
  2. Route 100 intents to each
  3. Measure: Time from route request to WebSocket delivery
  4. Expected: <100ms P95

- [ ] **PERF-005**: Database query performance
  1. Insert 1000 agents with 5 capabilities each
  2. Run vector similarity search
  3. Measure: Query latency
  4. Expected: <100ms with HNSW index

- [ ] **PERF-006**: Redis cache hit rate
  1. Run 1000 discovery queries with 10 unique descriptions
  2. Measure: Cache hit rate for embeddings
  3. Expected: >90% hit rate after warmup

### Exit Criteria
- ✅ Rate limiting enforces configured limits accurately
- ✅ Authentication rejects all invalid signatures
- ✅ Input validation catches malicious/malformed inputs
- ✅ Performance meets baseline targets (P95 < 200ms for discovery)
- ✅ System handles 100 concurrent requests without errors

### Artifacts
- `tests/security/rate-limit.test.ts`
- `tests/security/authentication.test.ts`
- `tests/security/validation.test.ts`
- `tests/performance/load-test.k6.js`
- Performance report: `reports/performance-baseline.md`
- Test execution log: `logs/phase4-security-performance.log`

### Dependencies
**Depends on**: Phase 1, 2, 3 (full system operational)

---

## Phase 5: Observability

### Purpose
Validate monitoring, logging, and metrics collection.

### Owner
**OLA (Observability & Logging Agent)** - Observability validation
**IE (Implementation Engineer)** - Test implementation

### Entry Criteria
- ✅ Phase 1-4 complete
- ✅ Prometheus configured (optional, but recommended)
- ✅ Broker running with structured logging

### Detailed Checklist

#### 5.1 Structured Logging

**Log Format** (expected):
```json
{
  "level": "info",
  "timestamp": "2025-10-06T23:00:00.000Z",
  "service": "ainp-broker",
  "message": "Agent registered",
  "did": "did:key:z6Mk...",
  "capabilities_count": 2
}
```

- [ ] **LOG-001**: Verify log output format
  1. Register agent
  2. Check broker logs
  3. Verify: JSON structure with `level`, `timestamp`, `service`, `message`

- [ ] **LOG-002**: Verify log levels
  1. Trigger INFO event (agent registration)
  2. Trigger WARN event (rate limit warning)
  3. Trigger ERROR event (invalid signature)
  4. Verify: Correct log levels emitted

- [ ] **LOG-003**: Verify request tracing
  1. Send intent with `trace_id: 'trace-abc-123'`
  2. Check logs for all operations related to that intent
  3. Verify: All logs include `trace_id: 'trace-abc-123'`

- [ ] **LOG-004**: Verify sensitive data redaction
  1. Check logs for private keys, API keys, credentials
  2. Expected: No sensitive data in logs (masked or omitted)

- [ ] **LOG-005**: Verify log aggregation
  1. Run 100 operations
  2. Search logs for specific `did` or `trace_id`
  3. Verify: Logs are searchable and filterable

#### 5.2 Health Endpoints Under Load

- [ ] **HEALTH-006**: Test health endpoint under load
  1. Send 1000 concurrent `/health` requests
  2. Verify: All return 200 OK
  3. Verify: Response time < 50ms

- [ ] **HEALTH-007**: Test ready endpoint during degraded state
  1. Stop Redis container
  2. Call `/health/ready`
  3. Verify: Returns `503 Service Unavailable` with Redis error
  4. Restart Redis
  5. Verify: Returns `200 OK` again

- [ ] **HEALTH-008**: Test health endpoint monitoring integration
  1. Configure uptime monitor (Prometheus, UptimeRobot, etc.)
  2. Verify: Health endpoint polled every N seconds
  3. Verify: Alerts triggered when unhealthy

#### 5.3 Prometheus Metrics (Optional)

**Metrics to Collect**:
- `ainp_requests_total` (counter): Total API requests
- `ainp_request_duration_seconds` (histogram): Request latency
- `ainp_agent_registrations_total` (counter): Agent registrations
- `ainp_intent_routes_total` (counter): Intent routing events
- `ainp_nats_messages_published` (counter): NATS messages published
- `ainp_redis_cache_hits` (counter): Redis cache hits
- `ainp_redis_cache_misses` (counter): Redis cache misses

- [ ] **PROM-001**: Verify metrics endpoint exists
  1. Request: `GET http://localhost:8080/metrics`
  2. Expected: Prometheus-formatted metrics

- [ ] **PROM-002**: Verify request counter increments
  1. Send 10 API requests
  2. Check: `ainp_requests_total` increases by 10

- [ ] **PROM-003**: Verify latency histogram
  1. Send requests
  2. Check: `ainp_request_duration_seconds` bucket counts

- [ ] **PROM-004**: Verify cache metrics
  1. Trigger cache hit and miss
  2. Check: `ainp_redis_cache_hits` and `ainp_redis_cache_misses` counters

- [ ] **PROM-005**: Verify Prometheus scraping
  1. Configure Prometheus to scrape broker metrics
  2. Query Prometheus UI: `http://localhost:9090`
  3. Verify: Metrics visible in Prometheus

#### 5.4 Error Handling & Recovery

- [ ] **ERR-001**: Test graceful degradation (Redis down)
  1. Stop Redis
  2. Send discovery query
  3. Expected: Request succeeds (embedding not cached, but computed)
  4. Verify: Warning log emitted

- [ ] **ERR-002**: Test graceful degradation (NATS down)
  1. Stop NATS
  2. Route intent
  3. Expected: `503 Service Unavailable` or retry queue activated

- [ ] **ERR-003**: Test database connection pool exhaustion
  1. Open 100 concurrent long-running DB queries
  2. Send new request
  3. Verify: Request queued or timeout error with retry advice

- [ ] **ERR-004**: Test OpenAI API failure
  1. Use invalid API key
  2. Register agent (requires embedding)
  3. Expected: `500 Internal Server Error` or fallback behavior

- [ ] **ERR-005**: Test uncaught exception handling
  1. Trigger runtime error (e.g., divide by zero in middleware)
  2. Verify: Error logged, process doesn't crash
  3. Verify: Next request succeeds (service recovered)

### Exit Criteria
- ✅ Structured logs are emitted for all operations
- ✅ Logs are searchable and include trace IDs
- ✅ Health endpoints accurately reflect system state
- ✅ Prometheus metrics (if configured) are accurate
- ✅ System degrades gracefully when dependencies fail

### Artifacts
- `tests/observability/logging.test.ts`
- `tests/observability/health.test.ts`
- `tests/observability/metrics.test.ts` (if Prometheus used)
- `tests/observability/error-handling.test.ts`
- Observability report: `reports/observability-validation.md`
- Test execution log: `logs/phase5-observability.log`

### Dependencies
**Depends on**: Phase 1-4 (full system operational)

---

## Agent Assignments & Responsibilities

| Agent | Phases | Responsibilities |
|-------|--------|------------------|
| **IPSA** | All | Sprint planning, phase coordination, final report |
| **IE** | 1, 2, 3, 4, 5 | Implement all test code, execute tests |
| **IV** | 1 | Validate infrastructure test results |
| **TA** | 2, 3 | Validate test coverage, ensure edge cases covered |
| **ICA** | 3 | Validate integration flows, identify cohesion issues |
| **SA** | 4 | Validate security mechanisms, penetration testing |
| **PO** | 4 | Performance baseline, load testing, optimization recommendations |
| **OLA** | 5 | Observability validation, logging standards, metrics design |
| **PRV** | Final | Final production readiness checklist before deployment |

---

## Evidence Pack Template

Each agent must complete this template for their phase:

```markdown
## Evidence Pack: Phase N - [Phase Name]

### Plan vs. Actual
- **Planned test cases**: [count]
- **Actual test cases executed**: [count]
- **Variance explanation**: [if any]

### Test Results Summary
- **Total tests**: [count]
- **Passed**: [count]
- **Failed**: [count] (with issue tickets)
- **Skipped**: [count] (with justification)

### Quality Gates Results
- **Lint**: ✅/❌ [output summary]
- **Typecheck**: ✅/❌ [output summary]
- **Build**: ✅/❌ [output summary]
- **Tests**: ✅/❌ [pass rate, coverage]

### Key Findings
- **Bugs found**: [list with severity]
- **Performance issues**: [list with metrics]
- **Security vulnerabilities**: [list with CVSS scores]
- **Improvements needed**: [list]

### Test Artifacts
- **Test files**: [list of .test.ts files]
- **Logs**: [path to execution logs]
- **Reports**: [path to reports]
- **Screenshots/traces** (if applicable)

### Follow-up Work
- **Blockers**: [issues preventing progress]
- **Technical debt**: [shortcuts taken]
- **Next steps**: [what needs to happen next]
```

---

## Rollback Plan

If any phase fails critically:

1. **Identify failure point** (which test case, which component)
2. **Assess impact** (does it block next phases?)
3. **Decision tree**:
   - **Blocker**: Stop testing, fix issue, re-run phase
   - **Non-blocker**: Document as known issue, continue testing
   - **Regression**: Rollback recent changes, investigate root cause
4. **Rollback procedure**:
   - Stop broker: `docker-compose -f docker-compose.dev.yml down`
   - Restore database: `docker exec -i ainp-postgres pg_restore -U ainp -d ainp < backup.dump`
   - Restart stack: `bash scripts/setup-dev.sh`
5. **Post-mortem**: Document what failed, why, and how to prevent recurrence

---

## Success Metrics

**Must Achieve**:
- ✅ 100% of critical path tests passing (agent registration → discovery → routing → delivery)
- ✅ 0 security vulnerabilities (rate limit, auth, validation all working)
- ✅ P95 latency < 200ms for discovery queries
- ✅ 0 data loss in NATS message delivery
- ✅ Health checks 100% accurate

**Nice to Have**:
- ≥95% overall test pass rate
- ≥80% code coverage (if coverage measured)
- Load test handles 100 concurrent users
- Prometheus metrics 100% accurate

---

## Timeline & Milestones

| Milestone | Target Date | Deliverable |
|-----------|-------------|-------------|
| Phase 1 Complete | Day 1 | Infrastructure validation report |
| Phase 2 Complete | Day 2 | API test suite + report |
| Phase 3 Complete | Day 3 | Integration test suite + report |
| Phase 4 Complete | Day 4 | Security & performance report |
| Phase 5 Complete | Day 4 | Observability validation report |
| Final Report | Day 5 | Complete test plan evidence pack |
| PRV Sign-off | Day 5 | Production readiness approval |

---

## Clarifications Needed

**None at this time.** All requirements are clear based on:
- Deployed system architecture (PostgreSQL, NATS, Redis, Broker)
- API route implementations (agents, discovery, intents, health)
- Type definitions (SemanticAddress, DiscoveryQuery, AINPEnvelope)

If during test execution any ambiguities arise, they will be documented and resolved before proceeding.

---

## Final Checklist (PRV Phase)

Before declaring Phase 0.2 production-ready:

- [ ] All 5 test phases complete with evidence packs
- [ ] No critical or high-severity bugs unresolved
- [ ] Performance baselines documented
- [ ] Security audit complete (SA sign-off)
- [ ] Observability verified (OLA sign-off)
- [ ] Documentation updated (README, API docs, architecture diagrams)
- [ ] Rollback procedures tested
- [ ] Monitoring/alerting configured
- [ ] Deployment runbook created
- [ ] Stakeholder approval obtained

---

**Status**: Ready for test execution. IE to begin Phase 1 implementation.

**Next Step**: IE implements Phase 1 infrastructure validation tests and executes them.
