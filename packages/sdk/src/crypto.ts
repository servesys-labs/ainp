/**
 * AINP Cryptographic Operations
 * Ed25519 signing and verification
 * Spec: RFC 001-SPEC Section 6
 */

import { createHash, randomBytes } from 'crypto';
import { SignatureError } from './errors';
import { Logger } from './logger';

const logger = new Logger({ serviceName: 'ainp-crypto' });

// Use Node.js native crypto for Ed25519 (Node 18+)
import { generateKeyPairSync, sign, verify } from 'crypto';

export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

/**
 * Generate Ed25519 key pair
 * @returns KeyPair with publicKey and privateKey as Buffers
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  logger.debug('Generated Ed25519 key pair', {
    publicKeyLength: publicKey.length,
    privateKeyLength: privateKey.length,
  });

  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey),
  };
}

/**
 * Sign data with Ed25519 private key
 * @param data - Data to sign (canonicalized JSON string)
 * @param privateKey - Ed25519 private key (PKCS8 DER format)
 * @returns Signature as Buffer
 */
export function signData(data: string | Buffer, privateKey: Buffer): Buffer {
  try {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    const signature = sign(null, dataBuffer, {
      key: privateKey,
      format: 'der',
      type: 'pkcs8',
    });

    logger.debug('Signed data', {
      dataLength: dataBuffer.length,
      signatureLength: signature.length,
    });

    return signature;
  } catch (error) {
    logger.error('Failed to sign data', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SignatureError(`Failed to sign data: ${error}`);
  }
}

/**
 * Verify Ed25519 signature
 * @param data - Original data (canonicalized JSON string)
 * @param signature - Signature to verify
 * @param publicKey - Ed25519 public key (SPKI DER format)
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(
  data: string | Buffer,
  signature: Buffer,
  publicKey: Buffer
): boolean {
  try {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    const isValid = verify(null, dataBuffer, {
      key: publicKey,
      format: 'der',
      type: 'spki',
    }, signature);

    logger.debug('Verified signature', {
      dataLength: dataBuffer.length,
      signatureLength: signature.length,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('Failed to verify signature', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Convert buffer to base58 encoding (low-level)
 * @param buffer - Buffer to encode (any length)
 * @returns Base58-encoded string
 */
function bufferToBase58(buffer: Buffer): string {
  // Base58 alphabet (Bitcoin style)
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  // Encode the buffer as-is
  let num = BigInt('0x' + buffer.toString('hex'));
  let encoded = '';

  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }

  // Add leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    encoded = '1' + encoded;
  }

  return encoded;
}

/**
 * Convert public key to base58 encoding (for DID verification methods)
 * Extracts raw 32-byte key from SPKI DER format if needed
 * @param publicKey - Ed25519 public key (raw 32 bytes or SPKI DER)
 * @returns Base58-encoded public key string
 */
export function publicKeyToBase58(publicKey: Buffer): string {
  // Extract raw 32-byte key from SPKI DER format if needed
  const rawKey = publicKey.length === 32 ? publicKey : publicKey.slice(-32);
  return bufferToBase58(rawKey);
}

/**
 * Convert base58 string to public key Buffer
 * @param base58 - Base58-encoded public key string
 * @returns Public key as Buffer (32 bytes)
 */
export function base58ToPublicKey(base58: string): Buffer {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  let num = 0n;
  for (const char of base58) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new SignatureError(`Invalid base58 character: ${char}`);
    }
    num = num * 58n + BigInt(index);
  }

  let hex = num.toString(16);
  // Pad to even length for Buffer.from
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }

  const decoded = Buffer.from(hex, 'hex');

  // Handle leading zeros (represented as '1' in base58)
  const leadingZeros = base58.match(/^1+/)?.[0].length || 0;
  if (leadingZeros > 0) {
    return Buffer.concat([Buffer.alloc(leadingZeros), decoded]);
  }

  return decoded;
}

/**
 * Hash data using SHA-256
 * @param data - Data to hash
 * @returns SHA-256 hash as Buffer
 */
export function hashData(data: string | Buffer): Buffer {
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return createHash('sha256').update(dataBuffer).digest();
}

/**
 * Generate random nonce for anti-replay
 * @param length - Nonce length in bytes (default: 16)
 * @returns Random nonce as Buffer
 */
export function generateNonce(length: number = 16): Buffer {
  return randomBytes(length);
}

/**
 * Constant-time comparison to prevent timing attacks
 * @param a - First buffer
 * @param b - Second buffer
 * @returns true if buffers are equal
 */
export function constantTimeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}
