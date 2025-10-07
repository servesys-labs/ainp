/**
 * Request Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AINPEnvelope, AINPIntent } from '@ainp/core';

export function validateEnvelope(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;

  if (!envelope || !envelope.id || !envelope.from_did || !envelope.sig) {
    return res.status(400).json({ error: 'INVALID_ENVELOPE', message: 'Missing required fields' });
  }

  next();
}

export function validateIntent(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;
  const intent = envelope.payload as AINPIntent;

  if (!intent || !intent['@context'] || !intent['@type'] || !intent.version) {
    return res.status(400).json({ error: 'INVALID_INTENT', message: 'Missing required intent fields' });
  }

  next();
}
