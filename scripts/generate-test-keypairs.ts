/**
 * Generate test keypairs for AINP test suite
 * Creates 5 keypairs with DID:key identifiers for different test scenarios
 *
 * Usage: npx tsx scripts/generate-test-keypairs.ts
 */

import * as ed25519 from '@noble/ed25519';
import { base58btc } from 'multiformats/bases/base58';
import fs from 'fs/promises';
import path from 'path';

interface TestKeypair {
  role: string;
  did: string;
  privateKey: string;
  publicKey: string;
}

// Multicodec prefix for Ed25519 public keys (0xed01)
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

/**
 * Convert Ed25519 public key to DID:key format
 */
function publicKeyToDID(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length: ${publicKey.length}`);
  }

  // Prepend multicodec prefix (0xed01 for Ed25519 public key)
  const prefixed = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length);
  prefixed.set(ED25519_MULTICODEC_PREFIX);
  prefixed.set(publicKey, ED25519_MULTICODEC_PREFIX.length);

  // Encode with base58btc
  const encoded = base58btc.encode(prefixed);

  return `did:key:${encoded}`;
}

/**
 * Generate Ed25519 keypair
 */
async function generateKeypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  did: string;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const did = publicKeyToDID(publicKey);

  return { privateKey, publicKey, did };
}

async function main() {
  const keypairs: TestKeypair[] = [];

  const roles = [
    'test-caller',
    'test-calendar-agent',
    'test-email-agent',
    'test-payment-agent',
    'test-validator'
  ];

  console.log('Generating test keypairs...\n');

  for (const role of roles) {
    const kp = await generateKeypair();
    keypairs.push({
      role,
      did: kp.did,
      privateKey: Buffer.from(kp.privateKey).toString('hex'),
      publicKey: Buffer.from(kp.publicKey).toString('hex')
    });

    console.log(`✓ ${role}: ${kp.did}`);
  }

  // Ensure fixtures directory exists
  const outputPath = path.join(process.cwd(), 'tests/fixtures/test-keypairs.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write keypairs to file
  await fs.writeFile(outputPath, JSON.stringify(keypairs, null, 2) + '\n');

  console.log(`\n✓ Generated ${keypairs.length} test keypairs`);
  console.log(`✓ Saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to generate test keypairs:', error);
  process.exit(1);
});
