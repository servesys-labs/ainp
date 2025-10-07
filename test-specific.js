const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

const base58Key = '2CE4WMdHpzjwiEyXKfegmjgoxwFTfw2RADE6fDfQjaky';
const decoded = base58Decode(base58Key);
console.log('Decoded length:', decoded.length);
console.log('Decoded hex:', decoded.toString('hex'));
console.log('First 2 bytes:', decoded[0].toString(16), decoded[1].toString(16));
