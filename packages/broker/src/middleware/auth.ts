/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { SignatureService } from '../services/signature.js';
import { AINPEnvelope } from '@ainp/core';

export function authMiddleware(signatureService: SignatureService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // ✅ Extract DID from envelope (intents API) OR plain JSON (negotiation API)
    const envelope = req.body as AINPEnvelope;
    let did: string | undefined;

    if (envelope && envelope.from_did) {
      // Envelope-based request (intents API)
      did = envelope.from_did;
    } else if (req.body) {
      // Plain JSON request (negotiation API) - extract DID from body fields
      did = req.body.initiator_did || req.body.proposer_did || req.body.acceptor_did || req.body.rejector_did;
    }

    // Expose DID via header for downstream handlers
    if (did) {
      req.headers['x-ainp-did'] = did;
    }

    // Skip signature verification in test/development mode
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return next();
    }

    // ✅ Only verify signature if this is an envelope request
    if (envelope && envelope.from_did && envelope.sig) {
      const isValid = await signatureService.verifyEnvelope(envelope);

      if (!isValid) {
        return res.status(401).json({
          error: 'INVALID_SIGNATURE',
          message: 'Envelope signature verification failed',
        });
      }
    }

    next();
  };
}
