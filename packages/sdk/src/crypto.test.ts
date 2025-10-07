/**
 * Tests for cryptographic operations
 * Testing Ed25519 signing, verification, base58 encoding, and key operations
 */

import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  signData,
  verifySignature,
  publicKeyToBase58,
  base58ToPublicKey,
  hashData,
  generateNonce,
  constantTimeCompare,
} from './crypto';
import { SignatureError } from './errors';

describe('Cryptographic Operations', () => {
  describe('generateKeyPair', () => {
    it('should generate Ed25519 key pair', () => {
      const keyPair = generateKeyPair();

      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey).toBeInstanceOf(Buffer);
      expect(keyPair.privateKey).toBeInstanceOf(Buffer);
    });

    it('should generate different key pairs on each call', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();

      expect(keyPair1.publicKey.toString('hex')).not.toBe(
        keyPair2.publicKey.toString('hex')
      );
      expect(keyPair1.privateKey.toString('hex')).not.toBe(
        keyPair2.privateKey.toString('hex')
      );
    });

    it('should generate keys in SPKI/PKCS8 DER format', () => {
      const keyPair = generateKeyPair();

      // SPKI public key should be > 32 bytes (includes metadata)
      expect(keyPair.publicKey.length).toBeGreaterThan(32);
      // PKCS8 private key should be > 32 bytes (includes metadata)
      expect(keyPair.privateKey.length).toBeGreaterThan(32);
    });
  });

  describe('signData and verifySignature', () => {
    it('should sign data with private key', () => {
      const keyPair = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair.privateKey);

      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify valid signature', () => {
      const keyPair = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const keyPair = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair.privateKey);

      // Tamper with signature
      signature[0] = signature[0] ^ 0xff;

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should reject signature with modified data', () => {
      const keyPair = generateKeyPair();
      const originalData = 'original message';
      const modifiedData = 'modified message';
      const signature = signData(originalData, keyPair.privateKey);

      const isValid = verifySignature(modifiedData, signature, keyPair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong public key', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair1.privateKey);

      const isValid = verifySignature(data, signature, keyPair2.publicKey);

      expect(isValid).toBe(false);
    });

    it('should sign Buffer data', () => {
      const keyPair = generateKeyPair();
      const data = Buffer.from('test message', 'utf8');
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should sign string data', () => {
      const keyPair = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should throw SignatureError for invalid private key', () => {
      const invalidKey = Buffer.from('invalid-key');
      const data = 'test message';

      expect(() => signData(data, invalidKey)).toThrow(SignatureError);
    });

    it('should return false for invalid public key during verification', () => {
      const keyPair = generateKeyPair();
      const data = 'test message';
      const signature = signData(data, keyPair.privateKey);
      const invalidPublicKey = Buffer.from('invalid-key');

      const isValid = verifySignature(data, signature, invalidPublicKey);

      expect(isValid).toBe(false);
    });

    it('should handle empty data signing and verification', () => {
      const keyPair = generateKeyPair();
      const data = '';
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should handle large data signing', () => {
      const keyPair = generateKeyPair();
      const data = 'a'.repeat(10000); // 10KB of data
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });
  });

  describe('publicKeyToBase58 and base58ToPublicKey', () => {
    it('should encode public key to base58', () => {
      const keyPair = generateKeyPair();
      const base58 = publicKeyToBase58(keyPair.publicKey);

      expect(typeof base58).toBe('string');
      expect(base58.length).toBeGreaterThan(0);
      expect(base58).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/); // Base58 alphabet
    });

    it('should decode base58 to public key', () => {
      const keyPair = generateKeyPair();
      const base58 = publicKeyToBase58(keyPair.publicKey);
      const decodedKey = base58ToPublicKey(base58);

      expect(decodedKey).toBeInstanceOf(Buffer);
      expect(decodedKey.length).toBe(32);
    });

    it('should round-trip encode/decode correctly', () => {
      const keyPair = generateKeyPair();
      const rawKey = keyPair.publicKey.slice(-32);
      const base58 = publicKeyToBase58(rawKey);
      const decodedKey = base58ToPublicKey(base58);

      expect(decodedKey.toString('hex')).toBe(rawKey.toString('hex'));
    });

    it('should handle 32-byte raw key', () => {
      const rawKey = Buffer.from('a'.repeat(64), 'hex'); // 32 bytes
      const base58 = publicKeyToBase58(rawKey);
      const decodedKey = base58ToPublicKey(base58);

      expect(decodedKey.toString('hex')).toBe(rawKey.toString('hex'));
    });

    it('should extract raw key from SPKI DER format', () => {
      const keyPair = generateKeyPair();
      const base58 = publicKeyToBase58(keyPair.publicKey);
      const decodedKey = base58ToPublicKey(base58);

      expect(decodedKey.length).toBe(32);
    });

    it('should throw SignatureError for invalid base58 characters', () => {
      const invalidBase58 = 'abc0OIl'; // Contains invalid characters (0, O, I, l)

      expect(() => base58ToPublicKey(invalidBase58)).toThrow(SignatureError);
    });

    it('should handle leading zeros in key', () => {
      const keyWithZeros = Buffer.concat([Buffer.alloc(2), Buffer.from('a'.repeat(60), 'hex')]);
      const base58 = publicKeyToBase58(keyWithZeros);

      expect(base58.startsWith('1')).toBe(true); // Leading zeros become '1' in base58
    });
  });

  describe('hashData', () => {
    it('should hash string data', () => {
      const data = 'test message';
      const hash = hashData(data);

      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32); // SHA-256 is 32 bytes
    });

    it('should hash Buffer data', () => {
      const data = Buffer.from('test message', 'utf8');
      const hash = hashData(data);

      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });

    it('should produce consistent hashes', () => {
      const data = 'test message';
      const hash1 = hashData(data);
      const hash2 = hashData(data);

      expect(hash1.toString('hex')).toBe(hash2.toString('hex'));
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData('message 1');
      const hash2 = hashData('message 2');

      expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));
    });

    it('should handle empty data', () => {
      const hash = hashData('');

      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });
  });

  describe('generateNonce', () => {
    it('should generate random nonce with default length', () => {
      const nonce = generateNonce();

      expect(nonce).toBeInstanceOf(Buffer);
      expect(nonce.length).toBe(16); // Default length
    });

    it('should generate nonce with custom length', () => {
      const nonce = generateNonce(32);

      expect(nonce).toBeInstanceOf(Buffer);
      expect(nonce.length).toBe(32);
    });

    it('should generate different nonces on each call', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1.toString('hex')).not.toBe(nonce2.toString('hex'));
    });

    it('should generate very short nonce', () => {
      const nonce = generateNonce(1);

      expect(nonce.length).toBe(1);
    });

    it('should generate very long nonce', () => {
      const nonce = generateNonce(256);

      expect(nonce.length).toBe(256);
    });
  });

  describe('constantTimeCompare', () => {
    it('should return true for equal buffers', () => {
      const buffer1 = Buffer.from('test');
      const buffer2 = Buffer.from('test');

      expect(constantTimeCompare(buffer1, buffer2)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const buffer1 = Buffer.from('test1');
      const buffer2 = Buffer.from('test2');

      expect(constantTimeCompare(buffer1, buffer2)).toBe(false);
    });

    it('should return false for buffers with different lengths', () => {
      const buffer1 = Buffer.from('test');
      const buffer2 = Buffer.from('testing');

      expect(constantTimeCompare(buffer1, buffer2)).toBe(false);
    });

    it('should handle empty buffers', () => {
      const buffer1 = Buffer.from('');
      const buffer2 = Buffer.from('');

      expect(constantTimeCompare(buffer1, buffer2)).toBe(true);
    });

    it('should handle binary data', () => {
      const buffer1 = Buffer.from([0, 1, 2, 3, 4]);
      const buffer2 = Buffer.from([0, 1, 2, 3, 4]);

      expect(constantTimeCompare(buffer1, buffer2)).toBe(true);
    });

    it('should detect single bit difference', () => {
      const buffer1 = Buffer.from([0b00000001]);
      const buffer2 = Buffer.from([0b00000000]);

      expect(constantTimeCompare(buffer1, buffer2)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent key generation', () => {
      const keyPairs = Array.from({ length: 10 }, () => generateKeyPair());

      // All keys should be unique
      const publicKeys = new Set(keyPairs.map((kp) => kp.publicKey.toString('hex')));
      expect(publicKeys.size).toBe(10);
    });

    it('should handle Unicode characters in data', () => {
      const keyPair = generateKeyPair();
      const data = '你好世界 🌍';
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });

    it('should handle binary data with null bytes', () => {
      const keyPair = generateKeyPair();
      const data = Buffer.from([0, 1, 2, 0, 0, 3, 4]);
      const signature = signData(data, keyPair.privateKey);

      const isValid = verifySignature(data, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });
  });

  describe('Negative Cases', () => {
    it('should reject signature verification with empty signature', () => {
      const keyPair = generateKeyPair();
      const data = 'test';
      const emptySignature = Buffer.alloc(0);

      const isValid = verifySignature(data, emptySignature, keyPair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should reject signature verification with truncated signature', () => {
      const keyPair = generateKeyPair();
      const data = 'test';
      const signature = signData(data, keyPair.privateKey);
      const truncatedSignature = signature.slice(0, signature.length - 1);

      const isValid = verifySignature(data, truncatedSignature, keyPair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should throw on invalid base58 with special characters', () => {
      expect(() => base58ToPublicKey('abc!@#$')).toThrow(SignatureError);
    });

    it('should handle zero-length nonce generation', () => {
      const nonce = generateNonce(0);

      expect(nonce.length).toBe(0);
    });
  });
});
