'use strict';

const { encryptAndTag } = require('~/cartridge/scripts/mleEncrypt/aesgcmCustom.js');

var Cipher = require('dw/crypto/Cipher');
var WeakCipher = require('dw/crypto/WeakCipher');
var cipher = new Cipher();
var weakCipher = new WeakCipher();
var Bytes = require('dw/util/Bytes');
var SecureRandom = require('dw/crypto/SecureRandom');
SecureRandom = new SecureRandom();
var configObject = require('*/cartridge/configuration/index');

function getJWE(payload) {
    //JWE header
    var currentTimestamp = new Date().getTime();
    currentTimestamp = Math.floor(currentTimestamp / 1000);

    var kid = configObject.mleCertificateSerialNumber;

    var joseHeader = {
        "alg": "RSA-OAEP",
        "enc": "A256GCM",
        "iat": currentTimestamp,
        "kid": kid,
    }
    var aad = dw.crypto.Encoding.toBase64URL(new Bytes(JSON.stringify(joseHeader), 'UTF-8'));

    var requestString = payload;

    // generating random key(256 bit) and IV(96 bit)
    var key = SecureRandom.nextBytes(32); // AES key
    var keybase64 = dw.crypto.Encoding.toBase64(key);
    var iv = SecureRandom.nextBytes(12);
    var ivbase64 = dw.crypto.Encoding.toBase64(iv);

    const encryptedpayload = encryptAndTag(
        keybase64,
        ivbase64,
        requestString,
        aad
    );

    var cipherText = new Bytes(encryptedpayload.ciphertext);
    var authTag = new Bytes(encryptedpayload.customTag);

    //public key (certificate extracted from p12 file using openssl) uploaded in Business Manager keystore (Admnistration --> Private Keys and Certificate)
    var CertificateRef = require('dw/crypto/CertificateRef');
    var alias = configObject.mleCertificateAlias;

    var publicKeyRef = new CertificateRef(alias);

    //encrypt the AES key using public key
    var encryptedAESKey = weakCipher.encryptBytes(key, publicKeyRef, 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding', null, 0);

    joseHeader = dw.crypto.Encoding.toBase64URL(new Bytes(JSON.stringify(joseHeader), 'UTF-8'));

    //base64url encoding all 5 parts of JWE.
    encryptedAESKey = dw.crypto.Encoding.toBase64URL(encryptedAESKey);
    iv = dw.crypto.Encoding.toBase64URL(iv);
    cipherText = dw.crypto.Encoding.toBase64URL(cipherText);
    authTag = dw.crypto.Encoding.toBase64URL(authTag);


    // JWE token
    var jwe = joseHeader + '.' + encryptedAESKey + '.' + iv + '.' + cipherText + '.' + authTag;

    var jwePayload = {
        encryptedRequest: jwe
    }

    return JSON.stringify(jwePayload);
}

module.exports = {
    getJWE
  };