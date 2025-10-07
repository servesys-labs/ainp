// Check what happens with ed01 prefix
const test = Buffer.from('ed0111bbd7e4205b8441cd2cde6344af473ce55394d56485a5bd26342e07fc20715a', 'hex');
console.log('Original:', test.toString('hex'), test.length, 'bytes');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Encode
let num = BigInt('0x' + test.toString('hex'));
console.log('BigInt:', num.toString(16));

let encoded = '';
while (num > 0n) {
  const remainder = Number(num % 58n);
  encoded = ALPHABET[remainder] + encoded;
  num = num / 58n;
}

// Check for leading zeros in original
for (let i = 0; i < test.length && test[i] === 0; i++) {
  encoded = '1' + encoded;
  console.log('Added leading 1 for zero byte at position', i);
}

console.log('Encoded:', encoded);

// Now decode
let decNum = 0n;
for (const char of encoded) {
  const index = ALPHABET.indexOf(char);
  decNum = decNum * 58n + BigInt(index);
}

console.log('Decoded BigInt:', decNum.toString(16));

let hex = decNum.toString(16);
if (hex.length % 2 !== 0) {
  hex = '0' + hex;
}

console.log('Hex (padded):', hex, hex.length, 'chars');

const decoded = Buffer.from(hex, 'hex');
console.log('Decoded buffer:', decoded.toString('hex'), decoded.length, 'bytes');

// The problem: we lost the leading ed01!
