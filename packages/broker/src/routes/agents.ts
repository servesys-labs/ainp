/**
 * Agent Registration Routes
 */

import { Router } from 'express';
import { DiscoveryService } from '../services/discovery';
import { SemanticAddress } from '@ainp/core';

export function createAgentRoutes(discoveryService: DiscoveryService): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    try {
      const { address, ttl } = req.body as { address: SemanticAddress; ttl: number };

      // Validate DID format (SQL injection prevention)
      const didRegex = /^did:(key|web):[a-zA-Z0-9._-]+$/;
      if (!address?.did || !didRegex.test(address.did)) {
        return res.status(400).json({
          error: "INVALID_DID",
          message: "Invalid DID format"
        });
      }

      await discoveryService.registerAgent(address, ttl);

      res.json({ status: 'registered', did: address.did });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.get('/:did', async (req, res) => {
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
