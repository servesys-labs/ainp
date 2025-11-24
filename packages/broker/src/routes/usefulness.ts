/**
 * Usefulness API Routes
 * Endpoints for querying and triggering usefulness aggregation
 */

import { Router } from 'express';
import { UsefulnessAggregatorService } from '../services/usefulness-aggregator.js';
import { SignatureService } from '../services/signature.js';
import { RedisClient } from '../lib/redis-client.js';
import { validateProofSubmission } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.js';
import { ProofSubmissionRequest, ValidationError } from '@ainp/core';

/**
 * Create usefulness routes
 * @param aggregator - Usefulness aggregation service
 * @param signatureService - Signature verification service for auth middleware
 * @param redisClient - Redis client for rate limiting
 */
export function createUsefulnessRoutes(
  aggregator: UsefulnessAggregatorService,
  signatureService: SignatureService,
  redisClient: RedisClient
): Router {
  const router = Router();

  /**
   * GET /api/usefulness/agents/:did
   * Get usefulness score for specific agent
   */
  router.get('/agents/:did', async (req, res) => {
    try {
      const score = await aggregator.getAgentScore(req.params.did);

      if (!score) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json(score);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/usefulness/aggregate
   * Trigger manual aggregation (admin endpoint)
   */
  router.post('/aggregate', async (req, res) => {
    try {
      const startTime = Date.now();
      const updateCount = await aggregator.updateCachedScores();
      const duration = Date.now() - startTime;

      res.json({
        updated: updateCount,
        duration_ms: duration,
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * POST /api/usefulness/proofs
   * Submit proof of useful work (requires authentication)
   * ✅ Apply middleware at route level for correct ordering
   */
  router.post('/proofs',
    validateProofSubmission,                     // ✅ 1. Validate proof structure
    authMiddleware(signatureService),            // ✅ 2. Extract DID, verify signature
    rateLimitMiddleware(redisClient, 100, true), // ✅ 3. DID-based rate limiting
    async (req, res) => {
      try {
        // Extract DID from header (set by authMiddleware)
        const agentDID = req.headers['x-ainp-did'] as string;

        if (!agentDID) {
          return res.status(401).json({
            error: 'MISSING_DID',
            message: 'Agent DID not found in request headers'
          });
        }

        const proof = req.body as ProofSubmissionRequest;
        const result = await aggregator.submitProof(agentDID, proof);

        res.status(201).json(result);
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: error.message
          });
        }

        if (error instanceof Error && error.message.includes('disabled')) {
          return res.status(503).json({
            error: 'FEATURE_DISABLED',
            message: error.message
          });
        }

        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  return router;
}
