/**
 * Payments API Routes (scaffold)
 */

import { Router } from 'express';
import { PaymentService, PaymentMethod } from '../services/payment.js';
import { FeatureFlag, getFeatureFlag } from '../lib/feature-flags.js';

export function createPaymentsRoutes(paymentService: PaymentService): Router {
  const router = Router();

  // Create payment request
  router.post('/requests', async (req, res) => {
    try {
      if (!getFeatureFlag(FeatureFlag.PAYMENTS_ENABLED)) {
        return res.status(503).json({ error: 'FEATURE_DISABLED', message: 'Payments are not enabled' });
      }

      const ownerDid = req.headers['x-ainp-did'] as string;
      if (!ownerDid) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing agent DID' });
      }

      const { amount_atomic, method, currency, description, expires_in_seconds } = req.body || {};
      if (!amount_atomic || !method) {
        return res.status(400).json({ error: 'INVALID_REQUEST', message: 'amount_atomic and method are required' });
      }

      const challenge = await paymentService.createRequest({
        owner_did: ownerDid,
        amount_atomic: BigInt(amount_atomic),
        currency: currency || 'credits',
        method: method as PaymentMethod,
        description,
        expires_in_seconds,
      });

      // Suggest 402 usage headers if client wants to retry the original request
      if (challenge.headers) {
        for (const [k, v] of Object.entries(challenge.headers)) {
          res.setHeader(k, v);
        }
      }

      res.status(201).json(challenge);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get payment request status
  router.get('/requests/:id', async (req, res) => {
    try {
      if (!getFeatureFlag(FeatureFlag.PAYMENTS_ENABLED)) {
        return res.status(503).json({ error: 'FEATURE_DISABLED', message: 'Payments are not enabled' });
      }
      const request = await paymentService.getRequest(req.params.id);
      if (!request) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Coinbase webhook (scaffold)
  router.post('/webhooks/coinbase', async (req, res) => {
    try {
      if (!getFeatureFlag(FeatureFlag.PAYMENTS_ENABLED)) {
        return res.status(503).json({ error: 'FEATURE_DISABLED', message: 'Payments are not enabled' });
      }
      const signature = req.headers['x-cc-webhook-signature'] as string | undefined;
      const payload = JSON.stringify(req.body);
      const result = await paymentService.processWebhook('coinbase', signature, payload);
      res.json({ ok: true, request_id: result.request_id });
    } catch (error) {
      res.status(400).json({ error: 'WEBHOOK_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

