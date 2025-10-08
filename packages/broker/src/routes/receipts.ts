/**
 * Receipts routes (read-only)
 */

import { Router } from 'express';
import { ReceiptService } from '../services/receipts';

export function createReceiptsRoutes(receipts: ReceiptService): Router {
  const router = Router();

  router.get('/:task_id', async (req, res) => {
    try {
      const data = await receipts.getReceipt(req.params.task_id);
      if (!data) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // Submit an attestation (requires auth header x-ainp-did)
  router.post('/:task_id/attestations', async (req, res) => {
    try {
      const by = (req.headers['x-ainp-did'] as string) || (req.body?.by_did as string);
      if (!by) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing DID' });
      const type = req.body?.type as string;
      if (!type) return res.status(400).json({ error: 'INVALID_REQUEST', message: 'type is required' });

      await receipts.addAttestations(req.params.task_id, [{
        by_did: by,
        type,
        score: req.body?.score,
        confidence: req.body?.confidence,
        evidence_ref: req.body?.evidence_ref,
        signature: req.body?.signature,
      }]);

      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
