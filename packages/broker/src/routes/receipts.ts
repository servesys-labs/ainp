/**
 * Receipts routes (read-only)
 */

import { Router } from 'express';
import { ReceiptService } from '../services/receipts.js';

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
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.startsWith('UNAUTHORIZED_ATTESTATION')) {
        return res.status(403).json({ error: 'FORBIDDEN', message: msg });
      }
      if (msg === 'RECEIPT_NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      res.status(500).json({ error: 'INTERNAL_ERROR', message: msg });
    }
  });

  // Get committee
  router.get('/:task_id/committee', async (req, res) => {
    try {
      const committee = await receipts.getCommittee(req.params.task_id);
      res.json({ committee });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'RECEIPT_NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: msg });
    }
  });

  // Manual finalize (prototype)
  router.post('/:task_id/finalize', async (req, res) => {
    try {
      const task_id = req.params.task_id;
      const rec = await receipts.getReceipt(task_id);
      if (!rec) return res.status(404).json({ error: 'NOT_FOUND' });
      // Count attestations
      const db: any = (receipts as any).db;
      const quorumRes = await db.query(`SELECT k, committee FROM task_receipts WHERE id=$1`, [task_id]);
      const k = Number(quorumRes.rows[0].k || parseInt(process.env.POU_K || '3'));
      const committee: string[] = Array.isArray(quorumRes.rows[0].committee) ? quorumRes.rows[0].committee : [];
      const cCommittee = (rec.attestations as any[]).filter(a => a.type === 'AUDIT_PASS' && (committee.length === 0 || committee.includes(a.by_did))).length;
      const cAccepted = (rec.attestations as any[]).filter(a => a.type === 'ACCEPTED').length;
      if (cCommittee + cAccepted >= k) {
        await db.query(`UPDATE task_receipts SET status='finalized', finalized_at=NOW(), updated_at=NOW() WHERE id=$1`, [task_id]);
        return res.json({ ok: true, status: 'finalized' });
      }
      res.status(409).json({ error: 'QUORUM_NOT_MET', needed: k, have: cCommittee + cAccepted });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: msg });
    }
  });

  return router;
}
