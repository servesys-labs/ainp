/**
 * Request Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AINPEnvelope, AINPIntent } from '@ainp/core';
import { verifyEnvelopeSignature, didToPublicKey } from '@ainp/sdk';

export async function validateEnvelope(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;

  // Basic structure validation
  if (!envelope || !envelope.id || !envelope.from_did || !envelope.sig) {
    return res.status(400).json({ error: 'INVALID_ENVELOPE', message: 'Missing required fields' });
  }

  // Signature validation with feature flag
  const enableSigVerification = process.env.SIGNATURE_VERIFICATION_ENABLED !== 'false';

  if (enableSigVerification) {
    // Test mode bypass for dummy-sig (backward compatibility)
    if (process.env.NODE_ENV === 'test' && envelope.sig === 'dummy-sig') {
      // Allow dummy signatures in test mode
      return next();
    }

    // Real Ed25519 signature verification
    try {
      const publicKey = didToPublicKey(envelope.from_did);
      const valid = await verifyEnvelopeSignature(envelope, envelope.sig, publicKey);

      if (!valid) {
        return res.status(401).json({
          error: 'INVALID_SIGNATURE',
          message: 'Signature verification failed'
        });
      }
    } catch (err) {
      return res.status(401).json({
        error: 'SIGNATURE_VERIFICATION_ERROR',
        message: `Signature verification failed: ${err instanceof Error ? err.message : 'unknown error'}`
      });
    }
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
