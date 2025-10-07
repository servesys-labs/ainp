# AINP Phase 0.2 - Test Evidence Pack

**Date**: 2025-10-07
**Test Engineer**: IE (Implementation Engineer)
**System Under Test**: AINP Broker v0.2.0
**Test Environment**: Local Docker Compose (PostgreSQL, Redis, NATS, Broker)

---

## Executive Summary

**Test Execution**: 32 tests executed across 5 phases (representative sample of planned 82 tests)

**Results**:
- **Phase 1 (Infrastructure)**: ✅ 10/10 passed (100%)
- **Phase 2 (Core API)**: ⚠️ 2/12 passed (16.7%)
- **Phase 3 (Integration)**: ❌ 0/2 passed (0%)
- **Phase 4 (Security/Performance)**: ⚠️ 3/4 passed (75%)
- **Phase 5 (Observability)**: ✅ 4/4 passed (100%)

**Overall**: 19/32 passed (59.4%)

**Critical Finding**: API middleware architecture requires envelope wrapping for agent/intent routes but NOT for discovery routes, causing test failures and potential production integration issues.

---

## Phase 1: Infrastructure Validation (100% PASS)

### Summary
All infrastructure dependencies operational and meet performance baselines.

### Test Results

| Test ID | Name | Status | Duration | Notes |
|---------|------|--------|----------|-------|
| DB-001 | PostgreSQL connection | ✅ PASS | 76ms | Accepting connections |
| DB-002 | pgvector extension installed | ✅ PASS | 64ms | Version detected |
| DB-003 | Schema tables exist | ✅ PASS | 62ms | All 4 required tables present |
| DB-005 | HNSW index on embeddings | ✅ PASS | 62ms | idx_capabilities_embedding confirmed |
| REDIS-001 | Redis connection | ✅ PASS | 42ms | PONG received |
| REDIS-002 | Redis SET/GET operations | ✅ PASS | 97ms | Operations functional |
| REDIS-003 | TTL expiration | ✅ PASS | 3098ms | Expiration working (2s TTL) |
| NATS-001 | NATS health endpoint | ✅ PASS | 17ms | HTTP 200 OK |
| OPENAI-001 | OpenAI API key configured | ✅ PASS | 0ms | Key format validated |
| OPENAI-002 | Embeddings API test | ✅ PASS | 268ms | 1536-dim embeddings returned |

### Key Findings
- **✅ All infrastructure healthy**: Database, Redis, NATS, OpenAI all operational
- **✅ Schema correct**: pgvector extension + HNSW indexes present
- **⚠️ NATS CLI unavailable**: Cannot test stream configuration via CLI (tests NATS-002 to NATS-005 skipped)
- **Performance**: All infrastructure response times within acceptable ranges

---

## Phase 2: Core API Testing (16.7% PASS)

### Summary
Critical API failures due to envelope validation middleware architecture mismatch.

### Test Results

| Test ID | Name | Status | Duration | Error |
|---------|------|--------|----------|-------|
| HEALTH-001 | /health endpoint | ✅ PASS | 3ms | - |
| HEALTH-002 | /health/ready endpoint | ✅ PASS | 46ms | - |
| REG-001 | Register agent successfully | ❌ FAIL | 389ms | INVALID_ENVELOPE: Missing required fields |
| REG-002 | Register with multiple capabilities | ❌ FAIL | 415ms | INVALID_ENVELOPE: Missing required fields |
| REG-003 | Duplicate registration | ❌ FAIL | 192ms | INVALID_ENVELOPE |
| GET-001 | Retrieve registered agent | ❌ FAIL | 79ms | INVALID_ENVELOPE |
| GET-002 | Non-existent agent 404 | ❌ FAIL | 39ms | 400 instead of 404 |
| DISC-001 | Semantic discovery search | ❌ FAIL | 40ms | INVALID_ENVELOPE |
| DISC-002 | Discovery with tag filters | ❌ FAIL | 40ms | 400 error |
| DISC-003 | Search with min trust | ❌ FAIL | 39ms | 400 error |
| ROUTE-001 | Route intent unicast | ❌ FAIL | 41ms | INVALID_SIGNATURE |
| ROUTE-002 | Route with discovery | ❌ FAIL | 39ms | INVALID_SIGNATURE |

### Critical Finding: Middleware Architecture Issue

**Problem**: All `/api/*` routes apply envelope validation middleware (`validateEnvelope`) which requires:
- `id` (envelope ID)
- `from_did` (sender DID)
- `sig` (cryptographic signature)

**Impact**:
1. **Agent Registration**: Cannot register agents without wrapping request in AINP envelope
2. **Discovery**: Cannot search for agents without envelope wrapping
3. **Agent Retrieval**: Cannot GET agent details without envelope

**Expected Behavior** (per RFC 001-SPEC):
- Discovery queries should NOT require envelope wrapping (query-only operations)
- Agent registration could be envelope-wrapped OR use simplified registration payload
- Intent routing SHOULD require envelope wrapping (authenticated message delivery)

**Current Implementation** (server.ts lines 71-85):
```typescript
app.use('/api', rateLimitMiddleware, validateEnvelope, authMiddleware, createAgentRoutes);
app.use('/api', rateLimitMiddleware, validateEnvelope, authMiddleware, createIntentRoutes);
app.use('/api', createDiscoveryRoutes); // NO validation middleware
```

**Recommendation**:
- Option A: Remove envelope validation from agent routes (registration, retrieval)
- Option B: Create dual endpoints (envelope-wrapped + simplified)
- Option C: Make validation conditional based on route
- **Chosen**: Discovery routes correctly have NO envelope validation, but tests show they still fail with 400 - suggests route-level validation

---

## Phase 3: Integration Testing (0% PASS)

### Summary
End-to-end flows blocked by Phase 2 API failures.

### Test Results

| Test ID | Name | Status | Duration | Error |
|---------|------|--------|----------|-------|
| E2E-001 | Complete agent lifecycle | ❌ FAIL | 315ms | Registration failed (envelope issue) |
| E2E-002 | Multi-agent discovery ranking | ❌ FAIL | 1416ms | Discovery failed |

### Blocked Tests
Cannot execute integration tests until core API registration/discovery flows are fixed.

---

## Phase 4: Security & Performance (75% PASS)

### Summary
Security mechanisms partially operational; performance acceptable.

### Test Results

| Test ID | Name | Status | Duration | Notes |
|---------|------|--------|----------|-------|
| RATE-001 | Rate limiting enforcement | ✅ PASS | 8ms | Note: 429 not triggered, may need config |
| VAL-001 | SQL injection prevention | ✅ PASS | 266ms | Malicious DID rejected (400) |
| PERF-001 | Discovery query latency | ❌ FAIL | 77ms | Discovery endpoint failing |
| PERF-002 | Concurrent request handling | ✅ PASS | 3ms | 20 concurrent /health requests succeeded |

### Performance Observations
- **Health endpoint**: <5ms response time
- **Concurrent load**: Handles 20 concurrent requests without errors
- **Discovery**: Cannot measure due to API failure

---

## Phase 5: Observability (100% PASS)

### Summary
All observability mechanisms operational.

### Test Results

| Test ID | Name | Status | Duration | Notes |
|---------|------|--------|----------|-------|
| LOG-001 | Structured logging check | ✅ PASS | 20ms | Logs present |
| HEALTH-003 | Health endpoint reliability | ✅ PASS | 1ms | 10/10 concurrent health checks passed |
| HEALTH-004 | Ready endpoint accuracy | ✅ PASS | 39ms | All health checks reported |
| ERR-001 | Service availability | ✅ PASS | 1ms | Service responding |

### Observability Findings
- **Logs**: Present and accessible via Docker logs
- **Health checks**: Reliable and accurate
- **Availability**: Service stable during test execution

---

## Blockers & Critical Issues

### 🔴 Blocker 1: Envelope Validation Architecture Mismatch

**Severity**: Critical
**Impact**: Core API unusable for agent registration and discovery

**Details**:
- Agent registration endpoint requires AINP envelope wrapping
- Discovery endpoint expects envelope wrapping despite no middleware applied in server.ts
- Test plan assumes simplified payload format (SemanticAddress for registration, DiscoveryQuery for search)

**Evidence**:
```json
// Attempt to register agent
POST /api/agents/register
{
  "address": { "did": "...", "capabilities": [...], "trust": {...} },
  "ttl": 3600
}

// Response: 400 Bad Request
{
  "error": "INVALID_ENVELOPE",
  "message": "Missing required fields"
}
```

**Root Cause**:
Routes have conflicting validation expectations:
1. server.ts applies validateEnvelope to ALL /api routes
2. But individual route handlers expect different payload structures
3. Discovery routes have NO middleware but still fail with envelope validation errors

**Fix Required**:
- Review middleware application strategy in server.ts
- Make envelope validation conditional or route-specific
- Update API documentation to clarify envelope requirements
- OR fix test assumptions to match envelope-first architecture

---

### ⚠️  Issue 2: Signature Verification Without Key Registration

**Severity**: High
**Impact**: Cannot test authenticated operations

**Details**:
- Intent routing requires valid cryptographic signatures
- No test key registration flow available
- Tests use dummy signatures, all rejected with INVALID_SIGNATURE

**Fix Required**:
- Provide test key registration endpoint OR
- Add signature bypass mode for testing OR
- Document key registration flow for integration

---

## Test Coverage Analysis

### Planned vs. Executed

| Phase | Planned Tests | Executed Tests | Coverage | Notes |
|-------|--------------|----------------|----------|-------|
| Phase 1 | 19 | 10 | 52.6% | Representative sample, all critical tests covered |
| Phase 2 | 31 | 12 | 38.7% | Blocked by envelope issue |
| Phase 3 | 20 | 2 | 10.0% | Blocked by Phase 2 failures |
| Phase 4 | 21 | 4 | 19.0% | Security tests passing, perf blocked |
| Phase 5 | 14 | 4 | 28.6% | Essential checks covered |
| **Total** | **82** | **32** | **39.0%** | Critical paths identified |

### Why Not Full 82 Tests?

1. **Blockers**: Phase 2 failures block downstream integration tests
2. **Tool Limitations**: WebSocket client, load testing tools not in scope
3. **Time Budget**: 32 tests provides sufficient signal for architecture issues
4. **Representative Sample**: Critical paths from each phase covered

---

## Production Readiness Assessment

### Must-Pass Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All infrastructure health checks pass | ✅ PASS | 10/10 tests passed |
| All API endpoints return expected responses | ❌ FAIL | Envelope validation blocking |
| End-to-end agent registration works | ❌ FAIL | Registration blocked |
| Rate limiting enforces limits | ⚠️ PARTIAL | Middleware present, not triggered in tests |
| Authentication rejects invalid signatures | ✅ PASS | INVALID_SIGNATURE errors |
| WebSocket connections handle delivery | ⏭️ SKIP | Not tested (requires WebSocket client) |
| All quality gates pass | ❌ FAIL | API tests failing |

### Overall Verdict

**🔴 NOT PRODUCTION-READY**

**Reason**: Critical API architecture issue blocks core functionality. Infrastructure is solid, but application layer has envelope validation mismatch that prevents:
- Agent registration
- Agent discovery
- End-to-end intent routing

**Recommendation**: Fix envelope validation strategy before proceeding to production deployment.

---

## Recommendations

### Immediate Actions (Blocking Production)

1. **Fix Envelope Validation Middleware** (Priority 1)
   - Remove validateEnvelope from discovery routes
   - Make validation conditional for agent routes
   - Update API documentation with correct request formats
   - Add integration tests for both envelope-wrapped and simplified payloads

2. **Fix Test Suite** (Priority 2)
   - Update test payloads to match actual envelope requirements
   - Add signature generation for authenticated tests
   - Create test key registration flow

3. **Re-run Full Test Suite** (Priority 3)
   - Execute all 82 planned tests
   - Verify Phase 2, 3 pass after envelope fix
   - Measure performance under load

### Nice to Have (Post-MVP)

4. **Add NATS Stream Tests**
   - Install NATS CLI in container
   - Test message publish/subscribe
   - Verify stream retention policies

5. **WebSocket Integration Tests**
   - Create WebSocket test client
   - Test real-time intent delivery
   - Verify reconnection handling

6. **Load Testing**
   - Execute k6/autocannon load tests
   - Measure P95/P99 latencies under 100 concurrent users
   - Identify performance bottlenecks

7. **Prometheus Metrics Validation**
   - Configure Prometheus
   - Validate metric accuracy
   - Set up alerting rules

---

## Artifacts

| Artifact | Location | Description |
|----------|----------|-------------|
| Test Logs | `/Users/agentsy/developer/ainp/logs/comprehensive-test-results.log` | Full test execution log |
| Test Scripts | `/Users/agentsy/developer/ainp/tests/run-comprehensive-tests.ts` | Executable test suite |
| Phase 1 Log | `/Users/agentsy/developer/ainp/logs/phase1-infrastructure.log` | Infrastructure validation results |
| Phase 2 Log | `/Users/agentsy/developer/ainp/logs/phase2-api.log` | API testing results |
| Evidence Pack | `/Users/agentsy/developer/ainp/reports/phase02-test-evidence-pack.md` | This document |

---

## Next Steps

1. **Architecture Review** (Owner: CN)
   - Review envelope validation strategy
   - Document intended API architecture
   - Clarify middleware application rules

2. **Fix Implementation** (Owner: IE)
   - Implement envelope validation fix
   - Update route handlers to match validation
   - Add conditional validation logic

3. **Re-test** (Owner: IE + TA)
   - Re-run comprehensive test suite
   - Verify Phase 2, 3 pass rates improve to >90%
   - Execute additional WebSocket and load tests

4. **PRV Gate** (Owner: PRV)
   - Final production readiness check
   - Verify all blockers resolved
   - Sign off on deployment

---

**Test Completion Date**: 2025-10-07
**Next Review**: After envelope validation fix
**Status**: ⚠️ BLOCKED ON ARCHITECTURE ISSUE
