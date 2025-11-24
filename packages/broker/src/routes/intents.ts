/**
 * Intent Routing Routes
 */

import { Router } from 'express';
import { RoutingService } from '../services/routing.js';
import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';

export function createIntentRoutes(routingService: RoutingService): Router {
  const router = Router();

  router.post('/send', async (req, res) => {
    try {
      // Extract envelope and query from request body
      // Support both formats: root envelope or nested {envelope, query}
      const envelope = (req.body as any).envelope || (req.body as AINPEnvelope);
      // Support both top-level { query } and envelope.to_query
      const query = (req.body as any).query || (envelope as any).to_query;

      const count = await routingService.routeIntent(envelope, query);

      res.json({ status: 'routed', agent_count: count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
