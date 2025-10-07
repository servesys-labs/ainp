/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { SignatureService } from '../services/signature';
import { AINPEnvelope } from '@ainp/core';

export function authMiddleware(signatureService: SignatureService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip signature verification in test/development mode
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return next();
    }

    const envelope = req.body as AINPEnvelope;

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
