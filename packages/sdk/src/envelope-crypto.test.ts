/**
 * Tests for AINP envelope cryptographic operations
 * Testing Ed25519 envelope signing, verification, DID:key format, and canonical JSON
 */

import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  signEnvelope,
  verifyEnvelopeSignature,
  didToPublicKey,
} from './crypto';
import { SignatureError } from './errors';
import type { AINPEnvelope } from '@ainp/core';

describe('AINP Envelope Cryptography', () => {
  describe('generateKeypair', () => {
    it('should generate Ed25519 keypair with DID', async () => {
      const keypair = await generateKeypair();

      expect(keypair).toHaveProperty('privateKey');
      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('did');
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey.length).toBe(32);
      expect(keypair.publicKey.length).toBe(32);
      expect(keypair.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it('should generate different keypairs on each call', async () => {
      const keypair1 = await generateKeypair();
      const keypair2 = await generateKeypair();

      expect(Buffer.from(keypair1.publicKey).toString('hex')).not.toBe(
        Buffer.from(keypair2.publicKey).toString('hex')
      );
      expect(Buffer.from(keypair1.privateKey).toString('hex')).not.toBe(
        Buffer.from(keypair2.privateKey).toString('hex')
      );
      expect(keypair1.did).not.toBe(keypair2.did);
    });

    it('should generate raw 32-byte keys (not DER-encoded)', async () => {
      const keypair = await generateKeypair();

      // Raw Ed25519 keys are exactly 32 bytes (unlike SPKI/PKCS8 which are longer)
      expect(keypair.publicKey.length).toBe(32);
      expect(keypair.privateKey.length).toBe(32);
    });
  });

  describe('didToPublicKey', () => {
    it('should extract public key from DID:key format', async () => {
      const keypair = await generateKeypair();
      const extractedKey = didToPublicKey(keypair.did);

      expect(extractedKey).toBeInstanceOf(Uint8Array);
      expect(extractedKey.length).toBe(32);
      expect(Buffer.from(extractedKey).toString('hex')).toBe(
        Buffer.from(keypair.publicKey).toString('hex')
      );
    });

    it('should round-trip DID encoding/decoding correctly', async () => {
      const keypair = await generateKeypair();
      const extractedKey = didToPublicKey(keypair.did);

      expect(Buffer.from(extractedKey).toString('hex')).toBe(
        Buffer.from(keypair.publicKey).toString('hex')
      );
    });

    it('should throw SignatureError for invalid DID format (missing did:key: prefix)', () => {
      expect(() => didToPublicKey('z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toThrow(
        SignatureError
      );
      expect(() => didToPublicKey('z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toThrow(
        /Invalid DID:key format/
      );
    });

    it('should throw SignatureError for invalid DID format (not starting with z)', () => {
      expect(() => didToPublicKey('did:key:a6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toThrow(
        SignatureError
      );
    });

    it('should throw SignatureError for invalid multicodec prefix', () => {
      // Valid base58btc encoding but wrong multicodec prefix (not 0xed01)
      expect(() => didToPublicKey('did:key:z4MXj1wBzi9jUstyPMS4jQqB6KdJaiatPkAtVtGc6bQEQEEsKTic4G7Rou3iBf9vPmT5dbkm9qsZsuVNjq8HCuW1s')).toThrow(
        SignatureError
      );
    });

    it('should handle real DID:key example', () => {
      // Real example from did:key spec
      const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
      const publicKey = didToPublicKey(did);

      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(32);
    });
  });

  describe('signEnvelope and verifyEnvelopeSignature', () => {
    const createTestEnvelope = (): AINPEnvelope => ({
      id: 'test-envelope-id',
      trace_id: 'test-trace-id',
      from_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      to_did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
      msg_type: 'INTENT',
      ttl: 3600000,
      timestamp: Date.now(),
      sig: '',
      payload: {
        '@context': 'https://ainp.io/context/v1',
        '@type': 'Intent',
        version: '1.0.0',
        embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
        semantics: {
          capability: 'test-capability',
          params: { test: 'data' },
        },
        budget: {
          max_credits: 100,
          max_rounds: 5,
          timeout_ms: 30000,
        },
      },
    });

    it('should sign envelope and return base64 signature', async () => {
      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature = await signEnvelope(envelope, keypair.privateKey);

      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
      expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it('should verify valid envelope signature', async () => {
      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature = await signEnvelope(envelope, keypair.privateKey);
      const isValid = await verifyEnvelopeSignature(envelope, signature, keypair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature = await signEnvelope(envelope, keypair.privateKey);

      // Tamper with signature
      const tamperedSig = signature.slice(0, -4) + 'AAAA';

      const isValid = await verifyEnvelopeSignature(envelope, tamperedSig, keypair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should reject signature with modified envelope', async () => {
      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature = await signEnvelope(envelope, keypair.privateKey);

      // Modify envelope after signing
      const modifiedEnvelope = { ...envelope, ttl: 7200000 };

      const isValid = await verifyEnvelopeSignature(
        modifiedEnvelope,
        signature,
        keypair.publicKey
      );

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong public key', async () => {
      const keypair1 = await generateKeypair();
      const keypair2 = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature = await signEnvelope(envelope, keypair1.privateKey);

      const isValid = await verifyEnvelopeSignature(envelope, signature, keypair2.publicKey);

      expect(isValid).toBe(false);
    });

    it('should produce different signatures for different envelopes', async () => {
      const keypair = await generateKeypair();
      const envelope1 = createTestEnvelope();
      const envelope2 = { ...createTestEnvelope(), id: 'different-id' };

      const signature1 = await signEnvelope(envelope1, keypair.privateKey);
      const signature2 = await signEnvelope(envelope2, keypair.privateKey);

      expect(signature1).not.toBe(signature2);
    });

    it('should produce same signature for identical envelopes', async () => {
      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      const signature1 = await signEnvelope(envelope, keypair.privateKey);
      const signature2 = await signEnvelope(envelope, keypair.privateKey);

      expect(signature1).toBe(signature2);
    });

    it('should ignore sig field when signing (canonical JSON)', async () => {
      const keypair = await generateKeypair();
      const envelope1 = createTestEnvelope();
      const envelope2 = { ...createTestEnvelope(), sig: 'existing-signature' };

      const signature1 = await signEnvelope(envelope1, keypair.privateKey);
      const signature2 = await signEnvelope(envelope2, keypair.privateKey);

      // Signatures should be identical since sig field is excluded from canonical JSON
      expect(signature1).toBe(signature2);
    });

    it('should support test mode bypass with dummy-sig', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      delete process.env.SIGNATURE_VERIFICATION_ENABLED;

      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      // Dummy signature should pass in test mode
      const isValid = await verifyEnvelopeSignature(envelope, 'dummy-sig', keypair.publicKey);

      expect(isValid).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should enforce real verification when SIGNATURE_VERIFICATION_ENABLED=true', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalVerificationEnabled = process.env.SIGNATURE_VERIFICATION_ENABLED;

      process.env.NODE_ENV = 'test';
      process.env.SIGNATURE_VERIFICATION_ENABLED = 'true';

      const keypair = await generateKeypair();
      const envelope = createTestEnvelope();

      // Dummy signature should fail when verification is explicitly enabled
      const isValid = await verifyEnvelopeSignature(envelope, 'dummy-sig', keypair.publicKey);

      expect(isValid).toBe(false);

      process.env.NODE_ENV = originalEnv;
      if (originalVerificationEnabled !== undefined) {
        process.env.SIGNATURE_VERIFICATION_ENABLED = originalVerificationEnabled;
      } else {
        delete process.env.SIGNATURE_VERIFICATION_ENABLED;
      }
    });
  });

  describe('Canonical JSON Edge Cases', () => {
    it('should produce deterministic canonical JSON (key order)', async () => {
      const keypair = await generateKeypair();

      const testPayload = {
        '@context': 'https://ainp.io/context/v1',
        '@type': 'Intent',
        version: '1.0.0',
        embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
        semantics: { capability: 'test', params: {} },
        budget: { max_credits: 100, max_rounds: 5, timeout_ms: 30000 },
      };

      // Create two envelopes with same data but different key insertion order
      const envelope1: AINPEnvelope = {
        id: 'test-id',
        trace_id: 'test-trace',
        from_did: 'did:key:z6Mk1',
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: 1234567890,
        sig: '',
        payload: testPayload,
      };

      const envelope2: AINPEnvelope = {
        timestamp: 1234567890,
        ttl: 3600000,
        msg_type: 'INTENT',
        from_did: 'did:key:z6Mk1',
        trace_id: 'test-trace',
        id: 'test-id',
        payload: testPayload,
        sig: '',
      };

      const signature1 = await signEnvelope(envelope1, keypair.privateKey);
      const signature2 = await signEnvelope(envelope2, keypair.privateKey);

      // Signatures should be identical despite different key order
      expect(signature1).toBe(signature2);
    });

    it('should handle nested objects in payload', async () => {
      const keypair = await generateKeypair();
      const envelope: AINPEnvelope = {
        id: 'test-id',
        trace_id: 'test-trace',
        from_did: 'did:key:z6Mk1',
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: '',
        payload: {
          '@context': 'https://ainp.io/context/v1',
          '@type': 'Intent',
          version: '1.0.0',
          embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
          semantics: {
            capability: 'test',
            params: {
              nested: {
                deeply: {
                  structured: 'data',
                },
              },
            },
          },
          budget: { max_credits: 100, max_rounds: 5, timeout_ms: 30000 },
        },
      };

      const signature = await signEnvelope(envelope, keypair.privateKey);
      const isValid = await verifyEnvelopeSignature(envelope, signature, keypair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should handle special characters in payload', async () => {
      const keypair = await generateKeypair();
      const envelope: AINPEnvelope = {
        id: 'test-id',
        trace_id: 'test-trace',
        from_did: 'did:key:z6Mk1',
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: '',
        payload: {
          '@context': 'https://ainp.io/context/v1',
          '@type': 'Intent',
          version: '1.0.0',
          embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
          semantics: {
            capability: 'test',
            params: {
              message: 'Hello 世界 🌍 "quotes" & <html>',
            },
          },
          budget: { max_credits: 100, max_rounds: 5, timeout_ms: 30000 },
        },
      };

      const signature = await signEnvelope(envelope, keypair.privateKey);
      const isValid = await verifyEnvelopeSignature(envelope, signature, keypair.publicKey);

      expect(isValid).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should verify envelope with DID extracted from from_did field', async () => {
      const keypair = await generateKeypair();
      const envelope: AINPEnvelope = {
        id: 'test-id',
        trace_id: 'test-trace',
        from_did: keypair.did,
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: '',
        payload: {
          '@context': 'https://ainp.io/context/v1',
          '@type': 'Intent',
          version: '1.0.0',
          embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
          semantics: { capability: 'test', params: {} },
          budget: { max_credits: 100, max_rounds: 5, timeout_ms: 30000 },
        },
      };

      const signature = await signEnvelope(envelope, keypair.privateKey);

      // Extract public key from envelope's from_did
      const extractedPublicKey = didToPublicKey(envelope.from_did);

      const isValid = await verifyEnvelopeSignature(envelope, signature, extractedPublicKey);

      expect(isValid).toBe(true);
    });

    it('should handle complete envelope lifecycle (generate → sign → verify)', async () => {
      // Generate sender keypair
      const senderKeypair = await generateKeypair();

      // Create envelope
      const envelope: AINPEnvelope = {
        id: 'lifecycle-test-id',
        trace_id: 'lifecycle-trace-id',
        from_did: senderKeypair.did,
        to_did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
        msg_type: 'INTENT',
        ttl: 3600000,
        timestamp: Date.now(),
        sig: '',
        payload: {
          '@context': 'https://ainp.io/context/v1',
          '@type': 'Intent',
          version: '1.0.0',
          embedding: Buffer.from(new Float32Array(1536).fill(0.5)).toString('base64'),
          semantics: { capability: 'test-capability', params: { action: 'test' } },
          budget: { max_credits: 500, max_rounds: 10, timeout_ms: 60000 },
        },
      };

      // Sign envelope
      const signature = await signEnvelope(envelope, senderKeypair.privateKey);

      // Update envelope with signature
      envelope.sig = signature;

      // Receiver extracts public key from from_did
      const senderPublicKey = didToPublicKey(envelope.from_did);

      // Verify signature
      const isValid = await verifyEnvelopeSignature(envelope, envelope.sig, senderPublicKey);

      expect(isValid).toBe(true);
      expect(envelope.sig).toBe(signature);
    });
  });
});
