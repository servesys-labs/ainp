/**
 * Discovery Routes
 */

import { Router } from 'express';
import { DiscoveryService } from '../services/discovery';
import { AINPEnvelope, DiscoveryQuery } from '@ainp/core';
import { validateEnvelope } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { SignatureService } from '../services/signature';
import { NATSClient } from '../lib/nats-client';
import crypto from 'crypto';

export function createDiscoveryRoutes(
  discoveryService: DiscoveryService,
  signatureService: SignatureService,
  natsClient: NATSClient
): Router {
  const router = Router();

  // JSON query-based discovery (public)
  router.post('/search', async (req, res) => {
    try {
      const query = req.body as DiscoveryQuery;
      const agents = await discoveryService.discover(query);
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Envelope-based discovery/advertise (authenticated)
  router.post(
    '/envelope',
    validateEnvelope,
    authMiddleware(signatureService),
    async (req, res) => {
      try {
        const envelope = req.body as AINPEnvelope;

        switch (envelope.msg_type) {
          case 'ADVERTISE': {
            const payload: any = envelope.payload || {};
            const address = payload.address;
            const ttl = (payload.ttl_minutes ?? 60) as number; // default 60 minutes
            if (!address) {
              return res.status(400).json({
                error: 'INVALID_ADVERTISE_PAYLOAD',
                message: 'Missing address in Advertise payload',
              });
            }
            await discoveryService.registerAgent(address, ttl);
            return res.json({ status: 'registered', ttl_minutes: ttl });
          }
          case 'DISCOVER': {
            const payload: any = envelope.payload || {};
            const query: DiscoveryQuery | undefined = (envelope as any).to_query || payload.query;
            if (!query) {
              return res.status(400).json({
                error: 'INVALID_DISCOVER_PAYLOAD',
                message: 'Missing query in envelope.to_query or payload.query',
              });
            }
            const results = await discoveryService.discover(query);

            // Return results directly (HTTP)
            res.json({ results });

            // Also emit DISCOVER_RESULT envelope back to requester via NATS (for WebSocket delivery)
            try {
              const resultEnvelope: AINPEnvelope = {
                version: '0.1.0',
                id: crypto.randomUUID(),
                trace_id: envelope.trace_id,
                from_did: 'did:ainp:broker', // logical identifier; signature omitted
                to_did: envelope.from_did,
                msg_type: 'DISCOVER_RESULT',
                ttl: 60_000,
                timestamp: Date.now(),
                sig: '',
                payload: { results } as any,
              };
              await natsClient.publishResult(resultEnvelope);
            } catch (e) {
              // Non-fatal if publish fails
              console.warn('[Discovery] Failed to publish DISCOVER_RESULT:', e);
            }
            return; // Response already sent
          }
          default:
            return res.status(400).json({
              error: 'UNSUPPORTED_MSG_TYPE',
              message: `Unsupported msg_type for /api/discovery/envelope: ${envelope.msg_type}`,
            });
        }
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    }
  );

  return router;
}
