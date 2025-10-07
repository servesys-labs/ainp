/**
 * AINP DID (Decentralized Identifier) Implementation
 * did:key method for Ed25519 keys
 * Spec: RFC 001-SPEC Section 6.1
 */

import { publicKeyToBase58, base58ToPublicKey } from './crypto';
import { ValidationError } from './errors';
import { Logger } from './logger';

// Internal bufferToBase58 for multicodec encoding (encodes full buffer)
// This is needed because publicKeyToBase58 extracts raw keys
function bufferToBase58(buffer: Buffer): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + buffer.toString('hex'));
  let encoded = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    encoded = ALPHABET[remainder] + encoded;
    num = num / 58n;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    encoded = '1' + encoded;
  }
  return encoded;
}

const logger = new Logger({ serviceName: 'ainp-did' });

// Multicodec prefix for Ed25519 public key (0xed01)
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

// DID resolution cache (1-hour TTL)
interface CachedDIDDocument {
  document: DIDDocument;
  timestamp: number;
}

const didCache = new Map<string, CachedDIDDocument>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * DID Document structure
 */
export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyBase58: string;
}

/**
 * Create did:key identifier from Ed25519 public key
 * @param publicKey - Ed25519 public key (32 bytes or SPKI DER)
 * @returns did:key identifier string
 */
export function createDID(publicKey: Buffer): string {
  // Extract raw 32-byte key from SPKI DER format if needed
  const rawKey = publicKey.length === 32 ? publicKey : publicKey.slice(-32);

  // Prepend multicodec prefix
  const multicodecKey = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawKey]);

  // Encode to base58 (use bufferToBase58 to preserve multicodec prefix)
  const base58Key = bufferToBase58(multicodecKey);

  const did = `did:key:z${base58Key}`;

  logger.debug('Created DID', { did });

  return did;
}

/**
 * Resolve did:key to DID Document
 * @param did - DID identifier (did:key:z...)
 * @returns DID Document with verification methods
 */
export function resolveDID(did: string): DIDDocument {
  // Check cache first
  const cached = didCache.get(did);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('DID resolved from cache', { did });
    return cached.document;
  }

  // Validate DID format
  if (!did.startsWith('did:key:z')) {
    throw new ValidationError(`Invalid DID format: ${did}`);
  }

  // Extract base58 key
  const base58Key = did.slice('did:key:z'.length);

  // Decode base58
  const multicodecKey = base58ToPublicKey(base58Key);

  // Verify multicodec prefix
  if (
    multicodecKey.length < 34 ||
    multicodecKey[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    multicodecKey[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new ValidationError(`Invalid Ed25519 multicodec prefix in DID: ${did}`);
  }

  // Extract raw public key
  const publicKey = multicodecKey.slice(2);
  const publicKeyBase58 = publicKeyToBase58(publicKey);

  // Build DID Document
  const document: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#${publicKeyBase58}`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyBase58,
      },
    ],
    authentication: [`${did}#${publicKeyBase58}`],
    assertionMethod: [`${did}#${publicKeyBase58}`],
  };

  // Cache the document
  didCache.set(did, { document, timestamp: Date.now() });

  logger.debug('DID resolved', { did });

  return document;
}

/**
 * Extract public key from DID
 * @param did - DID identifier (did:key:z...)
 * @returns Public key as Buffer (32 bytes)
 */
export function extractPublicKey(did: string): Buffer {
  const document = resolveDID(did);
  const publicKeyBase58 = document.verificationMethod[0].publicKeyBase58;
  return base58ToPublicKey(publicKeyBase58);
}

/**
 * Validate DID format
 * @param did - DID identifier to validate
 * @returns true if valid, false otherwise
 */
export function validateDID(did: string): boolean {
  try {
    resolveDID(did);
    return true;
  } catch (error) {
    logger.warn('Invalid DID', {
      did,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Clear DID resolution cache
 */
export function clearDIDCache(): void {
  const size = didCache.size;
  didCache.clear();
  logger.debug('DID cache cleared', { entriesCleared: size });
}

/**
 * Prune expired entries from DID cache
 */
export function pruneDIDCache(): void {
  const now = Date.now();
  let pruned = 0;

  for (const [did, cached] of didCache.entries()) {
    if (now - cached.timestamp >= CACHE_TTL_MS) {
      didCache.delete(did);
      pruned++;
    }
  }

  logger.debug('DID cache pruned', { entriesPruned: pruned });
}

// Auto-prune cache every 10 minutes
setInterval(pruneDIDCache, 10 * 60 * 1000);
