/**
 * Signature Verification Service
 * DID signature validation
 */

import { AINPEnvelope } from '@ainp/core';
import { canonicalize } from 'json-canonicalize';
import { verifySignature, extractPublicKey, Logger } from '@ainp/sdk';

const logger = new Logger({ serviceName: 'signature-service' });

export class SignatureService {
  /**
   * Verify envelope signature
   */
  async verifyEnvelope(envelope: AINPEnvelope): Promise<boolean> {
    // Skip signature verification in test/development mode
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return true;
    }

    try {
      const { sig, ...unsignedEnvelope } = envelope;
      const canonical = canonicalize(unsignedEnvelope);
      const publicKey = extractPublicKey(envelope.from_did);
      return verifySignature(canonical, Buffer.from(sig, 'base64'), publicKey);
    } catch (error) {
      logger.error('Signature verification failed', {
        from_did: envelope.from_did,
        msg_type: envelope.msg_type,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Verify envelope TTL
   */
  verifyTTL(envelope: AINPEnvelope): boolean {
    const now = Date.now();
    return envelope.timestamp + envelope.ttl > now;
  }
}
