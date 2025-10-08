/**
 * Quick test script to verify test keypairs are valid
 */

import fs from 'fs';
import path from 'path';

interface TestKeypair {
  role: string;
  did: string;
  privateKey: string;
  publicKey: string;
}

console.log('Testing test keypairs...\n');

// Test 1: Load keypairs file
console.log('1. Loading test keypairs file:');
const filepath = path.join(process.cwd(), 'tests/fixtures/test-keypairs.json');
const data = fs.readFileSync(filepath, 'utf-8');
const keypairs: TestKeypair[] = JSON.parse(data);
console.log(`   ✓ Loaded ${keypairs.length} keypairs\n`);

// Test 2: List all roles and DIDs
console.log('2. Available test keypairs:');
keypairs.forEach((kp) => {
  console.log(`   - ${kp.role}`);
  console.log(`     DID: ${kp.did}`);
});
console.log('');

// Test 3: Verify all DIDs are unique
console.log('3. Verifying DID uniqueness:');
const dids = keypairs.map((kp) => kp.did);
const uniqueDids = new Set(dids);
if (dids.length === uniqueDids.size) {
  console.log(`   ✓ All ${dids.length} DIDs are unique\n`);
} else {
  console.log(`   ✗ Duplicate DIDs found!\n`);
  process.exit(1);
}

// Test 4: Verify DID format
console.log('4. Verifying DID format:');
let allValidDIDs = true;
for (const kp of keypairs) {
  if (!kp.did.startsWith('did:key:z6Mk')) {
    console.log(`   ✗ ${kp.role}: Invalid DID format: ${kp.did}`);
    allValidDIDs = false;
  }
}
if (allValidDIDs) {
  console.log('   ✓ All DIDs have valid format (did:key:z6Mk...)\n');
} else {
  process.exit(1);
}

// Test 5: Verify key lengths
console.log('5. Verifying key lengths:');
let allValid = true;
for (const kp of keypairs) {
  const privLen = Buffer.from(kp.privateKey, 'hex').length;
  const pubLen = Buffer.from(kp.publicKey, 'hex').length;

  if (privLen !== 32 || pubLen !== 32) {
    console.log(`   ✗ ${kp.role}: Invalid key length (priv=${privLen}, pub=${pubLen})`);
    allValid = false;
  }
}
if (allValid) {
  console.log('   ✓ All keys are 32 bytes (Ed25519 standard)\n');
} else {
  process.exit(1);
}

// Test 6: Verify hex encoding
console.log('6. Verifying hex encoding:');
let allValidHex = true;
for (const kp of keypairs) {
  if (!/^[0-9a-f]{64}$/i.test(kp.privateKey)) {
    console.log(`   ✗ ${kp.role}: Invalid private key hex encoding`);
    allValidHex = false;
  }
  if (!/^[0-9a-f]{64}$/i.test(kp.publicKey)) {
    console.log(`   ✗ ${kp.role}: Invalid public key hex encoding`);
    allValidHex = false;
  }
}
if (allValidHex) {
  console.log('   ✓ All keys are properly hex-encoded (64 characters)\n');
} else {
  process.exit(1);
}

console.log('✓ All test keypair validations passed!');
console.log('\nSummary:');
console.log(`  - ${keypairs.length} test keypairs generated`);
console.log(`  - All DIDs unique and properly formatted`);
console.log(`  - All keys valid Ed25519 (32 bytes, hex-encoded)`);
console.log(`  - Ready for use in test suite`);
