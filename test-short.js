// Test with a key that might produce a short hash
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

// Test with prefix + small number (might have leading zero in bigint representation)
const test1 = Buffer.from('ed01000000000000000000000000000000000000000000000000000000000000000000', 'hex');
console.log('Test 1 original:', test1.toString('hex'), `(${test1.length} bytes)`);
const enc1 = base58Encode(test1);
console.log('Encoded:', enc1);
const dec1 = base58Decode(enc1);
console.log('Decoded:', dec1.toString('hex'), `(${dec1.length} bytes)`);
console.log('Match:', test1.toString('hex') === dec1.toString('hex'));
console.log();

// Test with ed01 + random bytes starting with 00
const test2 = Buffer.from('ed0100112233445566778899aabbccddeeff00112233445566778899aabbccdd', 'hex');
console.log('Test 2 original:', test2.toString('hex'), `(${test2.length} bytes)`);
const enc2 = base58Encode(test2);
console.log('Encoded:', enc2);
const dec2 = base58Decode(enc2);
console.log('Decoded:', dec2.toString('hex'), `(${dec2.length} bytes)`);
console.log('Match:', test2.toString('hex') === dec2.toString('hex'));
