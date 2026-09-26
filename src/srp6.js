const crypto = require('node:crypto');

const GENERATOR = 7n;
const MODULUS = BigInt(`0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7`);

function sha1(...parts) {
  const hash = crypto.createHash('sha1');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

function littleEndianBufferToBigInt(buffer) {
  return BigInt(`0x${Buffer.from(buffer).reverse().toString('hex')}`);
}

function bigIntToLittleEndianBuffer(value, length) {
  const hex = value.toString(16).padStart(length * 2, '0');
  return Buffer.from(hex, 'hex').reverse();
}

function makeRegistrationData(username, password) {
  const normalizedUsername = username.toUpperCase();
  const normalizedPassword = password.toUpperCase();
  const salt = crypto.randomBytes(32);
  const passwordHash = sha1(`${normalizedUsername}:${normalizedPassword}`);
  const privateKey = littleEndianBufferToBigInt(sha1(salt, passwordHash));
  const verifier = bigIntToLittleEndianBuffer(modPow(GENERATOR, privateKey, MODULUS), 32);

  return { salt, verifier };
}

function modPow(base, exponent, modulus) {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) {
      result = (result * base) % modulus;
    }
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

module.exports = { makeRegistrationData };
