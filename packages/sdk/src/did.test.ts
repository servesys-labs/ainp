/**
 * Tests for DID operations
 * Testing DID generation, resolution, validation, and caching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPair } from './crypto';
import {
  createDID,
  resolveDID,
  extractPublicKey,
  validateDID,
  clearDIDCache,
  pruneDIDCache,
} from './did';
import { ValidationError } from './errors';

describe('DID Operations', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearDIDCache();
  });

  describe('createDID', () => {
    it('should create valid did:key from Ed25519 public key', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);

      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(did.startsWith('did:key:z')).toBe(true);
    });

    it('should create consistent DID from same public key', () => {
      const { publicKey } = generateKeyPair();
      const did1 = createDID(publicKey);
      const did2 = createDID(publicKey);

      expect(did1).toBe(did2);
    });

    it('should create different DIDs from different public keys', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();

      const did1 = createDID(keyPair1.publicKey);
      const did2 = createDID(keyPair2.publicKey);

      expect(did1).not.toBe(did2);
    });

    it('should handle 32-byte raw Ed25519 public key', () => {
      const { publicKey } = generateKeyPair();
      // Extract raw 32-byte key from SPKI DER format
      const rawKey = publicKey.slice(-32);
      const did = createDID(rawKey);

      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it('should handle SPKI DER formatted public key', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);

      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
      expect(publicKey.length).toBeGreaterThan(32); // SPKI format is longer
    });
  });

  describe('resolveDID', () => {
    it('should resolve valid did:key to DID Document', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);
      const document = resolveDID(did);

      expect(document).toHaveProperty('@context');
      expect(document).toHaveProperty('id', did);
      expect(document).toHaveProperty('verificationMethod');
      expect(document).toHaveProperty('authentication');
      expect(document).toHaveProperty('assertionMethod');
    });

    it('should include Ed25519VerificationKey2020 verification method', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);
      const document = resolveDID(did);

      expect(document.verificationMethod).toHaveLength(1);
      expect(document.verificationMethod[0]).toMatchObject({
        type: 'Ed25519VerificationKey2020',
        controller: did,
      });
      expect(document.verificationMethod[0].publicKeyBase58).toBeDefined();
    });

    it('should throw ValidationError for invalid DID format', () => {
      expect(() => resolveDID('invalid-did')).toThrow(ValidationError);
      expect(() => resolveDID('did:invalid:z123')).toThrow(ValidationError);
      expect(() => resolveDID('did:key:invalid')).toThrow(ValidationError);
    });

    it('should throw ValidationError for DID with invalid multicodec prefix', () => {
      // Create a DID with invalid prefix
      const invalidDID = 'did:key:z11111111111111111111111111111111111111111';
      expect(() => resolveDID(invalidDID)).toThrow(ValidationError);
    });

    it('should cache DID document on first resolution', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);

      const doc1 = resolveDID(did);
      const doc2 = resolveDID(did);

      // Should return same reference from cache
      expect(doc1).toBe(doc2);
    });

    it('should include W3C DID context', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);
      const document = resolveDID(did);

      expect(document['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(document['@context']).toContain(
        'https://w3id.org/security/suites/ed25519-2020/v1'
      );
    });
  });

  describe('extractPublicKey', () => {
    it('should extract public key from DID', () => {
      const { publicKey: originalKey } = generateKeyPair();
      const did = createDID(originalKey);
      const extractedKey = extractPublicKey(did);

      expect(extractedKey).toBeInstanceOf(Buffer);
      expect(extractedKey.length).toBe(32); // Raw Ed25519 key is 32 bytes
    });

    it('should extract same public key that was used to create DID', () => {
      const { publicKey } = generateKeyPair();
      const rawKey = publicKey.slice(-32);
      const did = createDID(publicKey);
      const extractedKey = extractPublicKey(did);

      expect(extractedKey.toString('hex')).toBe(rawKey.toString('hex'));
    });

    it('should throw ValidationError for invalid DID', () => {
      expect(() => extractPublicKey('invalid-did')).toThrow(ValidationError);
    });
  });

  describe('validateDID', () => {
    it('should return true for valid DID', () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);

      expect(validateDID(did)).toBe(true);
    });

    it('should return false for invalid DID format', () => {
      expect(validateDID('invalid-did')).toBe(false);
      expect(validateDID('did:invalid:z123')).toBe(false);
      expect(validateDID('')).toBe(false);
    });

    it('should return false for DID with invalid characters', () => {
      expect(validateDID('did:key:z@#$%')).toBe(false);
    });

    it('should return false for DID with invalid multicodec prefix', () => {
      const invalidDID = 'did:key:z11111111111111111111111111111111111111111';
      expect(validateDID(invalidDID)).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should clear all cache entries', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      const did1 = createDID(keyPair1.publicKey);
      const did2 = createDID(keyPair2.publicKey);

      // Populate cache
      resolveDID(did1);
      resolveDID(did2);

      clearDIDCache();

      // After clearing, resolution should create new documents
      const doc1 = resolveDID(did1);
      const doc2 = resolveDID(did1);

      // Should still cache after clearing
      expect(doc1).toBe(doc2);
    });

    it('should prune expired entries from cache', async () => {
      const { publicKey } = generateKeyPair();
      const did = createDID(publicKey);

      // Resolve to populate cache
      resolveDID(did);

      // Prune won't remove recently added entries
      pruneDIDCache();

      // Should still be in cache
      const doc1 = resolveDID(did);
      const doc2 = resolveDID(did);
      expect(doc1).toBe(doc2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty public key gracefully', () => {
      const emptyKey = Buffer.alloc(0);
      // Empty key will create DID with just multicodec prefix, which should work
      const did = createDID(emptyKey);
      expect(did).toMatch(/^did:key:z/);
    });

    it('should handle malformed base58 in DID', () => {
      const malformedDID = 'did:key:z0000000000000000000000000000000000000000';
      // Will throw SignatureError due to invalid base58 character '0'
      expect(() => resolveDID(malformedDID)).toThrow();
    });

    it('should handle very long DID strings', () => {
      const longDID = 'did:key:z' + 'a'.repeat(1000);
      expect(validateDID(longDID)).toBe(false);
    });

    it('should handle DID with special characters in base58 part', () => {
      const specialDID = 'did:key:z!!!***###';
      expect(validateDID(specialDID)).toBe(false);
    });
  });

  describe('Negative Cases', () => {
    it('should reject DID without did:key prefix', () => {
      expect(() => resolveDID('z123456789')).toThrow(ValidationError);
    });

    it('should reject DID with wrong method', () => {
      expect(() => resolveDID('did:web:example.com')).toThrow(ValidationError);
    });

    it('should reject null or undefined DID', () => {
      expect(() => resolveDID(null as any)).toThrow();
      expect(() => resolveDID(undefined as any)).toThrow();
    });

    it('should reject DID with missing base58 part', () => {
      expect(() => resolveDID('did:key:z')).toThrow();
    });
  });
});
