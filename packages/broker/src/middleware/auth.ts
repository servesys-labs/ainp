/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { SignatureService } from '../services/signature';
import { AINPEnvelope } from '@ainp/core';

export function authMiddleware(signatureService: SignatureService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract DID from envelope body (for routes that use envelopes)
    const envelope = req.body as AINPEnvelope;

    if (envelope && envelope.from_did) {
      // Expose DID via header for downstream handlers
      req.headers['x-ainp-did'] = envelope.from_did;
    }

    // Skip signature verification in test/development mode
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return next();
    }

    const isValid = await signatureService.verifyEnvelope(envelope);

    if (!isValid) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Envelope signature verification failed',
      });
    }

    next();
  };
}
