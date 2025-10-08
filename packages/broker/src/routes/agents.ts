/**
 * Agent Registration Routes
 */

import { Router } from 'express';
import { DiscoveryService } from '../services/discovery';
import { CreditService } from '../services/credits';
import { SemanticAddress } from '@ainp/core';

export function createAgentRoutes(
  discoveryService: DiscoveryService,
  creditService: CreditService
): Router {
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

      // Register agent in discovery service
      await discoveryService.registerAgent(address, ttl);

      // Create credit account with initial balance (if enabled)
      const creditEnabled = process.env.CREDIT_LEDGER_ENABLED !== 'false';

      if (creditEnabled) {
        try {
          const initialBalance = BigInt(process.env.INITIAL_CREDITS || '1000000');
          await creditService.createAccount(address.did, initialBalance);
        } catch (error) {
          // Log but don't fail registration if credits fail (graceful degradation)
          console.error('[Credits] Failed to create account:', error);
        }
      }

      // Get credit balance for response (if enabled)
      let credits = null;
      if (creditEnabled) {
        try {
          const account = await creditService.getAccount(address.did);
          if (account) {
            credits = {
              balance: account.balance.toString(),
              reserved: account.reserved.toString()
            };
          }
        } catch (error) {
          console.error('[Credits] Failed to fetch account:', error);
        }
      }

      res.json({
        message: 'Agent registered successfully',
        agent: { did: address.did },
        credits
      });
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
