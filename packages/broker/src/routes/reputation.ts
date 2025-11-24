/**
 * Reputation routes
 */

import { Router } from 'express';
import { DatabaseClient } from '../lib/db-client.js';

export function createReputationRoutes(db: DatabaseClient): Router {
  const router = Router();

  router.get('/:did', async (req, res) => {
    try {
      const did = req.params.did;
      const rep = await db.query(
        `SELECT ar.q, ar.t, ar.r, ar.s, ar.v, ar.i, ar.e, ar.updated_at,
                ts.score, ts.reliability, ts.honesty, ts.competence, ts.timeliness
         FROM agents a
         LEFT JOIN agent_reputation ar ON ar.agent_id = a.id
         LEFT JOIN trust_scores ts ON ts.agent_id = a.id
         WHERE a.did = $1`,
        [did]
      );
      if (rep.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(rep.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}

