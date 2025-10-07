// Test base58 encoding/decoding
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
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

function base58Decode(base58) {
  let num = 0n;
  for (const char of base58) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid: ${char}`);
    num = num * 58n + BigInt(index);
  }
  
  let hex = num.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  
  const decoded = Buffer.from(hex, 'hex');
  
  // Handle leading zeros
  const leadingZeros = base58.match(/^1+/)?.[0].length || 0;
  if (leadingZeros > 0) {
    return Buffer.concat([Buffer.alloc(leadingZeros), decoded]);
  }
  
  return decoded;
}

// Test with multicodec key
const multicodecKey = Buffer.from('ed0155275085b37db62c2df0c78fcd0d10479e81ff473313b1f042350602b49b0fbc', 'hex');
console.log('Original:', multicodecKey.toString('hex'), `(${multicodecKey.length} bytes)`);

const encoded = base58Encode(multicodecKey);
console.log('Base58:', encoded);

const decoded = base58Decode(encoded);
console.log('Decoded:', decoded.toString('hex'), `(${decoded.length} bytes)`);

console.log('Match:', multicodecKey.toString('hex') === decoded.toString('hex'));
console.log('First 2 bytes:', decoded[0].toString(16), decoded[1].toString(16));
