/**
 * Intent Routing Routes
 */

import { Router } from 'express';
import { RoutingService } from '../services/routing';
import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';

export function createIntentRoutes(routingService: RoutingService): Router {
  const router = Router();

  router.post('/send', async (req, res) => {
    try {
      // Extract envelope and query from request body
      // Support both formats: root envelope or nested {envelope, query}
      const envelope = (req.body as any).envelope || req.body as AINPEnvelope;
      const query = (req.body as any).query;

      const count = await routingService.routeIntent(envelope, query);

      res.json({ status: 'routed', agent_count: count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
