/**
 * Request Validation Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AINPEnvelope, AINPIntent, ProofSubmissionRequest } from '@ainp/core';
import { verifyEnvelopeSignature, didToPublicKey } from '@ainp/sdk';
import { FeatureFlag, getFeatureFlag } from '../lib/feature-flags';

export async function validateEnvelope(req: Request, res: Response, next: NextFunction) {
  const envelope = req.body as AINPEnvelope;

  // Basic structure validation
  if (!envelope || !envelope.id || !envelope.from_did || !envelope.sig) {
    return res.status(400).json({ error: 'INVALID_ENVELOPE', message: 'Missing required fields' });
  }

  // Optional protocol version check (tolerant for backward compatibility)
  if (envelope.version && envelope.version !== '0.1.0') {
    return res.status(400).json({
      error: 'UNSUPPORTED_VERSION',
      message: `Envelope version ${envelope.version} is not supported (expected 0.1.0)`
    });
  }

  // Signature validation with feature flag
  const enableSigVerification = getFeatureFlag(FeatureFlag.SIGNATURE_VERIFICATION_ENABLED);

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

export function validateProofSubmission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const proof = req.body as ProofSubmissionRequest;

  // Required fields check
  if (!proof.work_type || !proof.metrics || !proof.trace_id || !proof.timestamp) {
    return res.status(400).json({
      error: 'INVALID_PROOF',
      message: 'Missing required fields: work_type, metrics, trace_id, timestamp'
    });
  }

  // work_type enum validation
  const validWorkTypes = ['compute', 'memory', 'routing', 'validation', 'learning'];
  if (!validWorkTypes.includes(proof.work_type)) {
    return res.status(400).json({
      error: 'INVALID_WORK_TYPE',
      message: `work_type must be one of: ${validWorkTypes.join(', ')}`
    });
  }

  // Timestamp freshness (within 5 minutes)
  const now = Date.now();
  const age = now - proof.timestamp;
  if (Math.abs(age) > 5 * 60 * 1000) {
    return res.status(400).json({
      error: 'STALE_PROOF',
      message: 'Proof timestamp must be within 5 minutes of server time'
    });
  }

  // At least one metric must be present
  const metricsPresent = Object.values(proof.metrics).some(
    v => v !== undefined && v !== null && typeof v === 'number' && v > 0
  );
  if (!metricsPresent) {
    return res.status(400).json({
      error: 'EMPTY_METRICS',
      message: 'Proof must contain at least one non-zero metric'
    });
  }

  next();
}
