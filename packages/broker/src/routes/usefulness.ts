/**
 * Usefulness API Routes
 * Endpoints for querying and triggering usefulness aggregation
 */

import { Router } from 'express';
import { UsefulnessAggregatorService } from '../services/usefulness-aggregator';

export function createUsefulnessRoutes(aggregator: UsefulnessAggregatorService): Router {
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

  return router;
}
