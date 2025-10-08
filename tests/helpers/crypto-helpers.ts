/**
 * Crypto helper utilities for AINP tests
 * Provides functions to load test keypairs and sign envelopes
 */

import fs from 'fs';
import path from 'path';
import { signEnvelope } from '../../packages/sdk/src/crypto.js';
import type { AINPEnvelope } from '../../packages/core/src/types/envelope.js';

export interface TestKeypair {
  role: string;
  did: string;
  privateKey: string;
  publicKey: string;
}

let keypairsCache: TestKeypair[] | null = null;

/**
 * Load test keypairs from fixtures file
 * Results are cached in memory after first load
 * @returns Array of test keypairs
 */
export function loadTestKeypairs(): TestKeypair[] {
  if (keypairsCache) {
    return keypairsCache;
  }

  const filepath = path.join(process.cwd(), 'tests/fixtures/test-keypairs.json');
  try {
    const data = fs.readFileSync(filepath, 'utf-8');
    keypairsCache = JSON.parse(data);
    return keypairsCache!;
  } catch (error) {
    throw new Error(
      `Failed to load test keypairs from ${filepath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get a specific test keypair by role
 * @param role - Role identifier (e.g., 'test-caller', 'test-calendar-agent')
 * @returns Test keypair object
 * @throws Error if role not found
 */
export function getTestKeypair(role: string): TestKeypair {
  const keypairs = loadTestKeypairs();
  const kp = keypairs.find((k) => k.role === role);
  if (!kp) {
    const available = keypairs.map((k) => k.role).join(', ');
    throw new Error(
      `Test keypair not found: ${role}. Available roles: ${available}`
    );
  }
  return kp;
}

/**
 * Sign an AINP envelope with a test keypair
 * @param envelope - AINP envelope to sign (without 'sig' field)
 * @param role - Role of the test keypair to use
 * @returns Signed envelope with 'sig' field populated
 */
export async function signTestEnvelope(
  envelope: Omit<AINPEnvelope, 'sig'>,
  role: string
): Promise<AINPEnvelope> {
  const kp = getTestKeypair(role);
  const privateKey = new Uint8Array(Buffer.from(kp.privateKey, 'hex'));
  const sig = await signEnvelope(envelope as AINPEnvelope, privateKey);

  return { ...envelope, sig } as AINPEnvelope;
}

/**
 * Get all available test keypair roles
 * @returns Array of role identifiers
 */
export function getTestKeypairRoles(): string[] {
  const keypairs = loadTestKeypairs();
  return keypairs.map((k) => k.role);
}

/**
 * Clear the keypairs cache (useful for testing)
 */
export function clearKeypairsCache(): void {
  keypairsCache = null;
}
