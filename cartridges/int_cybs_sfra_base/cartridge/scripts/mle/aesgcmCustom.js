'use strict';

var Cipher = require('dw/crypto/Cipher');
var WeakCipher = require('dw/crypto/WeakCipher');

var cipher = new Cipher();
var weakCipher = new WeakCipher();

var Bytes = require('dw/util/Bytes');

// Utility to XOR two Uint8Arrays
function xorArrays(a, b) {
  let result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// Custom GF(2^128) multiplication (shift-and-reduce method)
function gf128Multiply(X, H) {
  let blockSize = 16; // 128 bits in bytes
  let Z = new Uint8Array(blockSize); // Accumulator, initially 0
  let V = new Uint8Array(H); // Working copy of H
  let poly = new Uint8Array([0xE1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // x^128 + x^7 + x^2 + x + 1

  for (let i = 0; i < blockSize; i++) {
    let xByte = X[i];
    for (let bit = 7; bit >= 0; bit--) {
      if (xByte & (1 << bit)) {
        Z = xorArrays(Z, V); // Z ^= V if bit is 1
      }
      let highBit = V[blockSize - 1] & 1; // Check LSB
      // Right shift V by 1
      for (let j = blockSize - 1; j > 0; j--) {
        V[j] = (V[j] >>> 1) | ((V[j - 1] & 1) << 7);
      }
      V[0] = V[0] >>> 1;
      if (highBit) {
        V = xorArrays(V, poly); // Reduce modulo polynomial
      }
    }
  }
  return Z;
}


function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// Utility to convert string or array to Uint8Array
function toUint8Array(input) {
  if (typeof input === 'string') {
    var Bytes = require('dw/util/Bytes');
    const bytes = new Bytes(input, 'UTF-8');
    return bytes.asUint8Array();
  }
  return new Uint8Array(input);
}

// Custom GHASH implementation
function customGhash(H, aad, ciphertext) {
  let blockSize = 16; // 128 bits in bytes
  let X = new Uint8Array(blockSize); // Initial GHASH state (zero)

  // Process AAD (Additional Authenticated Data)
  let aadBytes = aad ? toUint8Array(aad) : null;
  if (aadBytes && aadBytes.length > 0) {
    for (let i = 0; i < aadBytes.length; i += blockSize) {
      let block = new Uint8Array(blockSize);
      for (let j = 0; j < blockSize && (i + j) < aadBytes.length; j++) {
        block[j] = aadBytes[i + j];
      }
      X = xorArrays(X, block);
      X = gf128Multiply(X, H);
    }
  }

  // Process Ciphertext (convert Buffer to Uint8Array)
  let cipherBytes = new Uint8Array(ciphertext);
  for (let i = 0; i < cipherBytes.length; i += blockSize) {
    let blok = new Uint8Array(blockSize);
    for (let j = 0; j < blockSize && (i + j) < cipherBytes.length; j++) {
      blok[j] = cipherBytes[i + j];
    }
    X = xorArrays(X, blok);
    X = gf128Multiply(X, H);
  }

  // Append length block (AAD length || Ciphertext length in bits)
  let lenBlock = new Uint8Array(blockSize);
  let aadLenBits = BigInt((aadBytes ? aadBytes.length : 0) * 8);
  let cipherLenBits = BigInt(cipherBytes.length * 8);
  // Write 64-bit lengths as big-endian
  for (let i = 0; i < 8; i++) {
    lenBlock[7 - i] = Number((aadLenBits >> BigInt(i * 8)) & 0xFFn);
    lenBlock[15 - i] = Number((cipherLenBits >> BigInt(i * 8)) & 0xFFn);
  }
  X = xorArrays(X, lenBlock);
  X = gf128Multiply(X, H);

  return X;
}

// Main function to encrypt and compute custom tag
function encryptAndTag(key, iv, plaintext, aad) {

  var encryptedpayload = cipher.encrypt(plaintext, key, 'AES/GCM/NOPADDING', iv, 0);
  // seperating cipher text and auth tag from encryptedpayload
  var encryptedPayloadBytes = dw.crypto.Encoding.fromBase64(encryptedpayload);
  var l = encryptedPayloadBytes.getLength();

  var ciphertextBytes = encryptedPayloadBytes.bytesAt(0, l - 16);
  var ciphertext = ciphertextBytes.asUint8Array();

  // Step 2: Compute H (hash subkey) = AES encryption of zero block
  const zeroBlock = new Uint8Array(16);
  const IVnull = new Uint8Array(16);// 128-bit zero block

  var zeroblockbase64 = dw.crypto.Encoding.toBase64(new Bytes(zeroBlock));
  var IVnullBase64 = dw.crypto.Encoding.toBase64(new Bytes(IVnull));

  var aesForHBytes = weakCipher.encryptBytes(new Bytes(zeroBlock), key, 'AES/CBC/NOPADDING', IVnullBase64, 0);
  var H = aesForHBytes.asUint8Array().subarray(0, 16);

  // Step 3: Compute GHASH(H, AAD, Ciphertext)
  const ghashResult = customGhash(H, aad, ciphertext);

  // Step 4: Compute E_K(IV || 0^31 || 1) - the initial counter block encryption
  var ivBytes = dw.crypto.Encoding.fromBase64(iv);
  var ivArray = ivBytes.asUint8Array();
  const counterBlock = concatBytes(ivArray, new Uint8Array([0, 0, 0, 1])); // IV || 0^31 || 1

  var counterBlockbase64 = dw.crypto.Encoding.toBase64(new Bytes(counterBlock));

  var aesForCounter = weakCipher.encryptBytes(new Bytes(counterBlock), key, 'AES/CBC/NOPADDING', IVnullBase64, 0);
  var encCounter = aesForCounter.asUint8Array().subarray(0, 16);

  // Step 5: Finalize Tag = GHASH XOR E_K(IV || 0^31 || 1)
  const customTag = xorArrays(ghashResult, encCounter);

  return { ciphertext, customTag };
}

module.exports = {
  encryptAndTag
};