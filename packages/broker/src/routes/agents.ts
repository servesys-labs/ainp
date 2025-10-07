/**
 * Agent Registration Routes
 */

import { Router } from 'express';
import { DiscoveryService } from '../services/discovery';
import { SemanticAddress } from '@ainp/core';

export function createAgentRoutes(discoveryService: DiscoveryService): Router {
  const router = Router();

  router.post('/agents/register', async (req, res) => {
    try {
      const { address, ttl } = req.body as { address: SemanticAddress; ttl: number };

      await discoveryService.registerAgent(address, ttl);

      res.json({ status: 'registered', did: address.did });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/agents/:did', async (req, res) => {
    try {
      const agent = await discoveryService.getAgent(req.params.did);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json(agent);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
