/**
 * Intent Routing Routes
 */

import { Router } from 'express';
import { RoutingService } from '../services/routing';
import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';

export function createIntentRoutes(routingService: RoutingService): Router {
  const router = Router();

  router.post('/intents/send', async (req, res) => {
    try {
      const { envelope, query } = req.body as { envelope: AINPEnvelope; query: DiscoveryQuery };

      const count = await routingService.routeIntent(envelope, query);

      res.json({ status: 'routed', agent_count: count });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
