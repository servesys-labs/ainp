/**
 * Integration tests for Usefulness API Routes (Phase 2A)
 *
 * Tests validation middleware, service layer, and API endpoints for proof submission.
 * Target: 13 tests total, 95%+ coverage
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { DatabaseClient } from '../../lib/db-client';
import { UsefulnessAggregatorService } from '../../services/usefulness-aggregator';
import { createUsefulnessRoutes } from '../usefulness';
import { validateProofSubmission } from '../../middleware/validation';
import { ProofSubmissionRequest } from '@ainp/core';

describe('Usefulness API Routes', () => {
  let app: express.Application;
  let db: DatabaseClient;
  const testDID = 'did:key:test-usefulness-api-' + Date.now();

  beforeAll(async () => {
    const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ainp:ainp@localhost:5432/ainp';
    db = new DatabaseClient(DATABASE_URL);

    const aggregator = new UsefulnessAggregatorService(db);

    // Create mock services for route-level middleware
    const mockSignatureService = {
      verifyEnvelope: vi.fn().mockResolvedValue(true)
    } as any;

    const mockRedisClient = {
      incrementRateLimit: vi.fn().mockResolvedValue(1)  // Under rate limit
    } as any;

    const routes = createUsefulnessRoutes(aggregator, mockSignatureService, mockRedisClient);

    app = express();
    app.use(express.json());
    app.use('/api/usefulness', routes);

    // Create test agent
    await db.query(
      `
      INSERT INTO agents (did, public_key)
      VALUES ($1, $2)
      ON CONFLICT (did) DO NOTHING
    `,
      [testDID, 'test-key']
    );

    // Insert test proof with generated UUID for intent_id
    await db.query(
      `
      INSERT INTO usefulness_proofs (intent_id, agent_did, work_type, metrics, trace_id, usefulness_score)
      VALUES (gen_random_uuid(), $1, 'compute', '{}', 'trace-1', 75)
    `,
      [testDID]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM usefulness_proofs WHERE agent_did = $1', [testDID]);
    await db.query('DELETE FROM agents WHERE did = $1', [testDID]);
    await db.disconnect();
  });

  // ============================================================================
  // Existing Tests (from Phase 2A baseline)
  // ============================================================================

  it('GET /api/usefulness/agents/:did should return agent score', async () => {
    const response = await request(app).get(`/api/usefulness/agents/${testDID}`).expect(200);

    expect(response.body).toHaveProperty('usefulness_score');
    expect(response.body.usefulness_score).toBeCloseTo(75, 1);
    expect(response.body.total_proofs).toBe(1);
    expect(response.body).toHaveProperty('work_type_breakdown');
    expect(response.body).toHaveProperty('last_proof_at');
  });

  it('GET /api/usefulness/agents/:did should return 404 for non-existent agent', async () => {
    const response = await request(app)
      .get('/api/usefulness/agents/did:key:nonexistent')
      .expect(404);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Agent not found');
  });

  it('POST /api/usefulness/aggregate should trigger aggregation', async () => {
    const response = await request(app).post('/api/usefulness/aggregate').expect(200);

    expect(response.body).toHaveProperty('updated');
    expect(response.body).toHaveProperty('duration_ms');
    expect(response.body.updated).toBeGreaterThan(0);
    expect(typeof response.body.duration_ms).toBe('number');
  });

  // ============================================================================
  // Phase 2A: Validation Middleware Tests (4 tests)
  // ============================================================================

  describe('validateProofSubmission middleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('should reject missing required fields', () => {
      const invalidProof = {
        work_type: 'compute',
        // Missing: metrics, trace_id, timestamp
      };

      mockReq.body = invalidProof;
      validateProofSubmission(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'INVALID_PROOF',
        message: 'Missing required fields: work_type, metrics, trace_id, timestamp',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid work_type enum', () => {
      const invalidProof: ProofSubmissionRequest = {
        work_type: 'invalid_type' as any,
        metrics: { compute_ms: 1000 },
        trace_id: 'trace-123',
        timestamp: Date.now(),
      };

      mockReq.body = invalidProof;
      validateProofSubmission(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'INVALID_WORK_TYPE',
        message: 'work_type must be one of: compute, memory, routing, validation, learning',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject stale timestamp (>5 minutes old)', () => {
      const staleProof: ProofSubmissionRequest = {
        work_type: 'compute',
        metrics: { compute_ms: 1000 },
        trace_id: 'trace-123',
        timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      };

      mockReq.body = staleProof;
      validateProofSubmission(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'STALE_PROOF',
        message: 'Proof timestamp must be within 5 minutes of server time',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject empty metrics (all zeros)', () => {
      const emptyMetricsProof: ProofSubmissionRequest = {
        work_type: 'compute',
        metrics: {
          compute_ms: 0,
          memory_bytes: 0,
        },
        trace_id: 'trace-123',
        timestamp: Date.now(),
      };

      mockReq.body = emptyMetricsProof;
      validateProofSubmission(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'EMPTY_METRICS',
        message: 'Proof must contain at least one non-zero metric',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept valid proof', () => {
      const validProof: ProofSubmissionRequest = {
        work_type: 'compute',
        metrics: { compute_ms: 1000 },
        trace_id: 'trace-123',
        timestamp: Date.now(),
      };

      mockReq.body = validProof;
      validateProofSubmission(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Phase 2A: calculateScore() Unit Tests (5 tests)
  // ============================================================================

  describe('UsefulnessAggregatorService.calculateScore()', () => {
    let service: UsefulnessAggregatorService;

    beforeAll(() => {
      service = new UsefulnessAggregatorService(db);
    });

    it('should score compute work correctly', () => {
      const proof: ProofSubmissionRequest = {
        work_type: 'compute',
        metrics: { compute_ms: 5000 }, // 5 seconds = 50 points
        trace_id: 'trace-compute',
        timestamp: Date.now(),
      };

      // Access private method via (service as any) for unit testing
      const score = (service as any).calculateScore(proof);

      expect(score).toBe(50);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should score memory work correctly', () => {
      const proof: ProofSubmissionRequest = {
        work_type: 'memory',
        metrics: { memory_bytes: 5 * 1024 * 1024 }, // 5MB = 5 points
        trace_id: 'trace-memory',
        timestamp: Date.now(),
      };

      const score = (service as any).calculateScore(proof);

      expect(score).toBe(5);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should score routing work correctly', () => {
      const proof: ProofSubmissionRequest = {
        work_type: 'routing',
        metrics: { routing_hops: 3 }, // 3 hops = 30 points
        trace_id: 'trace-routing',
        timestamp: Date.now(),
      };

      const score = (service as any).calculateScore(proof);

      expect(score).toBe(30);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should score validation work correctly', () => {
      const proof: ProofSubmissionRequest = {
        work_type: 'validation',
        metrics: { validation_checks: 10 }, // 10 checks = 50 points
        trace_id: 'trace-validation',
        timestamp: Date.now(),
      };

      const score = (service as any).calculateScore(proof);

      expect(score).toBe(50);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should score learning work correctly', () => {
      const proof: ProofSubmissionRequest = {
        work_type: 'learning',
        metrics: { learning_samples: 500 }, // 500 samples = 50 points
        trace_id: 'trace-learning',
        timestamp: Date.now(),
      };

      const score = (service as any).calculateScore(proof);

      expect(score).toBe(50);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // ============================================================================
  // Phase 2A: Integration Tests (4 tests)
  // ============================================================================

  describe('POST /api/usefulness/proofs', () => {
    let appWithAuth: express.Application;

    beforeAll(() => {
      // Create app with auth middleware simulation
      const aggregator = new UsefulnessAggregatorService(db);

      // Create mock services for route-level middleware
      const mockSignatureService = {
        verifyEnvelope: vi.fn().mockResolvedValue(true)
      } as any;

      const mockRedisClient = {
        incrementRateLimit: vi.fn().mockResolvedValue(1)  // Under rate limit
      } as any;

      const routes = createUsefulnessRoutes(aggregator, mockSignatureService, mockRedisClient);

      appWithAuth = express();
      appWithAuth.use(express.json());

      // Simulate auth middleware (set x-ainp-did header)
      appWithAuth.use((req, _res, next) => {
        if (req.body && req.body.agent_did) {
          req.headers['x-ainp-did'] = req.body.agent_did;
        }
        next();
      });

      appWithAuth.use('/api/usefulness', routes);
    });

    it('should accept valid proof submission (happy path)', async () => {
      // Generate a UUID for intent_id (database requires NOT NULL)
      const intentId = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0').slice(-12);

      const validProof = {
        agent_did: testDID, // Used by mock middleware
        intent_id: intentId,
        work_type: 'compute',
        metrics: { compute_ms: 5000 },
        trace_id: 'trace-integration-1',
        timestamp: Date.now(),
      };

      const response = await request(appWithAuth)
        .post('/api/usefulness/proofs')
        .send(validProof)
        .expect(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('usefulness_score');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body.usefulness_score).toBeCloseTo(50, 1);
    });

    it('should reject missing DID header (authMiddleware not called)', async () => {
      const validProof = {
        work_type: 'compute',
        metrics: { compute_ms: 5000 },
        trace_id: 'trace-integration-2',
        timestamp: Date.now(),
      };

      // Use original app without auth simulation
      // ✅ Now expects 400 because validateProofSubmission runs BEFORE authMiddleware
      // Validation passes, but authMiddleware rejects due to missing signature
      const response = await request(app)
        .post('/api/usefulness/proofs')
        .send(validProof)
        .expect(400);

      // Auth middleware returns 400 for missing/invalid envelope signature
      expect(response.body).toHaveProperty('error');
    });

    it('should reject agent not found (invalid DID)', async () => {
      const intentId = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0').slice(-12);

      const invalidDIDProof = {
        agent_did: 'did:key:nonexistent-agent-' + Date.now(),
        intent_id: intentId,
        work_type: 'compute',
        metrics: { compute_ms: 5000 },
        trace_id: 'trace-integration-3',
        timestamp: Date.now(),
      };

      const response = await request(appWithAuth)
        .post('/api/usefulness/proofs')
        .send(invalidDIDProof)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body.message).toContain('Agent not found');
    });

    it('should reject when feature flag disabled', async () => {
      // Save original env value
      const originalFlag = process.env.USEFULNESS_AGGREGATION_ENABLED;

      // Disable feature flag
      process.env.USEFULNESS_AGGREGATION_ENABLED = 'false';

      const intentId = '00000000-0000-0000-0000-' + Date.now().toString().padStart(12, '0').slice(-12);

      const validProof = {
        agent_did: testDID,
        intent_id: intentId,
        work_type: 'compute',
        metrics: { compute_ms: 5000 },
        trace_id: 'trace-integration-4',
        timestamp: Date.now(),
      };

      // ✅ Now expects 503 (Service Unavailable) because implementation correctly returns FEATURE_DISABLED
      const response = await request(appWithAuth)
        .post('/api/usefulness/proofs')
        .send(validProof)
        .expect(503);

      expect(response.body).toHaveProperty('error', 'FEATURE_DISABLED');
      expect(response.body.message).toContain('Usefulness aggregation is disabled');

      // Restore original env value
      if (originalFlag !== undefined) {
        process.env.USEFULNESS_AGGREGATION_ENABLED = originalFlag;
      } else {
        delete process.env.USEFULNESS_AGGREGATION_ENABLED;
      }
    });
  });
});
