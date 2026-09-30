'use strict';

const { encryptAndTag } = require('~/cartridge/scripts/mle/aesgcmCustom.js');

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

    // The JWE kid is the subject-DN serialNumber of the CyberSource_SJC_US encryption cert, and
    // the CEK below is wrapped with that same certificate's public key — deriving both from one
    // source means they can never drift apart (a mismatched kid returns "unauthorized_user").
    //
    // Two sources, in order of preference:
    //  1. the CyberSource_SJC_US certificate in the BM keystore (requestMleCertificateAlias)
    //  2. the .p12 bundle in IMPEX (requestMleP12ImpexPath), which also carries that certificate
    //
    // The keystore wins whenever it is configured, even if the IMPEX bundle is configured too:
    // Business Manager's keystore is the platform's intended store for certificate material,
    // whereas IMPEX is a WebDAV-reachable folder. The IMPEX bundle is only consulted when no
    // keystore alias is set. Note this is a deliberate precedence, NOT a fallback — a configured
    // but unusable alias fails loudly rather than quietly switching mechanism, so a typo cannot
    // look like a working Option 1.
    var kid;
    var publicKeyRef = null;
    if (!empty(configObject.requestMleCertificateAlias)) {
        var certHelper = require('*/cartridge/scripts/helpers/certHelper');
        kid = certHelper.getKidFromCertificateAlias(configObject.requestMleCertificateAlias, 'CyberSource_SJC_US');
        if (!kid) {
            // Abort rather than send a request with an empty kid, which the gateway would reject.
            throw new Error('MLE: could not derive the JWE kid (subject DN serialNumber) from the certificate at alias "'
                + configObject.requestMleCertificateAlias + '". Verify the CyberSource_SJC_US certificate is imported under'
                + ' Administration > Operations > Private Keys and Certificates with this exact alias, or clear'
                + ' VisaAcceptance_RequestMLECertificateAlias to read the certificate from the IMPEX .p12 bundle instead.');
        }
    } else if (!empty(configObject.requestMleP12ImpexPath)) {
        var requestMle = require('*/cartridge/scripts/mle/p12Reader').getRequestMleCertificate();
        kid = requestMle.kid;
        publicKeyRef = requestMle.certRef;
    } else {
        throw new Error('MLE: no request-MLE certificate is configured. Set either'
            + ' VisaAcceptance_RequestMLECertificateAlias (the CyberSource_SJC_US certificate imported under'
            + ' Administration > Operations > Private Keys and Certificates) or VisaAcceptance_RequestMLEP12ImpexPath.');
    }

    var joseHeader = {
        "alg": "RSA-OAEP",
        "enc": "A256GCM",
        "cty": "JWT",
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

    // Public key of the CyberSource_SJC_US certificate. Already resolved above from the IMPEX
    // .p12 bundle; otherwise reference it by keystore alias (Administration > Operations >
    // Private Keys and Certificates). Either way it is the SAME certificate the kid came from.
    if (!publicKeyRef) {
        var CertificateRef = require('dw/crypto/CertificateRef');
        publicKeyRef = new CertificateRef(configObject.requestMleCertificateAlias);
    }

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