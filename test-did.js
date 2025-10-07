// Quick test of DID encoding/decoding
const crypto = require('crypto');

// Generate key
const { publicKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});

console.log('Public key (SPKI DER):', publicKey.length, 'bytes');
console.log('Hex:', publicKey.toString('hex'));

// Extract raw key
const rawKey = publicKey.slice(-32);
console.log('\nRaw key:', rawKey.length, 'bytes');
console.log('Hex:', rawKey.toString('hex'));

// Add multicodec prefix
const prefix = Buffer.from([0xed, 0x01]);
const multicodecKey = Buffer.concat([prefix, rawKey]);
console.log('\nMulticodec key:', multicodecKey.length, 'bytes');
console.log('Hex:', multicodecKey.toString('hex'));
console.log('First 2 bytes:', multicodecKey[0].toString(16), multicodecKey[1].toString(16));
