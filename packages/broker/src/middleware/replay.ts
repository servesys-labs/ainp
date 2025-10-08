/**
 * Replay Protection Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AINPEnvelope } from '@ainp/core';
import { AntiFraudService } from '../services/anti-fraud';

export function replayProtectionMiddleware(antiFraud: AntiFraudService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const envelope = req.body as AINPEnvelope;
      if (!envelope || !envelope.id) return next();

      const composite = `${envelope.id}|${envelope.from_did}|${envelope.trace_id}`;
      const ok = await antiFraud.checkAndMarkReplay(composite);
      if (!ok) {
        return res.status(409).json({
          error: 'REPLAY_DETECTED',
          message: 'Duplicate envelope detected within replay window',
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

