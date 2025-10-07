/**
 * Discovery Routes
 */

import { Router } from 'express';
import { DiscoveryService } from '../services/discovery';
import { DiscoveryQuery } from '@ainp/core';

export function createDiscoveryRoutes(discoveryService: DiscoveryService): Router {
  const router = Router();

  router.post('/search', async (req, res) => {
    try {
      const query = req.body as DiscoveryQuery;

      const agents = await discoveryService.discover(query);

      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
