'use strict';

var Logger = require('dw/system/Logger');
var Encoding = require('dw/crypto/Encoding');
var configObject = require('*/cartridge/configuration/index');

/**
 * Decrypt a single MLE (Message-Level Encryption) JWE compact serialization.
 *
 * The response from Visa Acceptance / CyberSource arrives (when response MLE is
 * requested via the v-c-response-mle-kid JWT claim) as:
 *   {"encryptedResponse": "<JWE-with-ResponseMLECertificate>"}
 *
 * The JWE JOSE header carries:
 *   alg: "RSA-OAEP-256" – algorithm used to encrypt the content-encryption key
 *   enc: "A256GCM"       – algorithm used to encrypt the message
 *   kid: "<serialNumber>" – the REST API Response MLE key id (v-c-response-mle-kid)
 *
 * The content-encryption key is wrapped with the MERCHANT's Response MLE public key,
 * so we decrypt with the merchant's private key — the same .p12 imported under the
 * egress alias used for webhook decryption (VisaAcceptance_ResponseMLEPrivateKeyAlias,
 * surfaced as configObject.responseMlePrivateKeyAlias). This mirrors
 * WebhookNotification.decryptMLEPayload so both egress-decrypt paths share one contract.
 *
 * @param {string} jweString - JWE compact serialization (five base64url parts)
 * @returns {string} the decrypted payload as a string
 */
function decryptJWE(jweString) {
    if (!jweString) {
        return null;
    }
    var JWE = require('dw/crypto/JWE');
    var KeyRef = require('dw/crypto/KeyRef');

    var alias = configObject.responseMlePrivateKeyAlias;

    var trimmed = String(jweString).trim();

    // Pin the JWE header before handing the payload to dw/crypto/JWE — defense-in-depth
    // against algorithm-confusion and a clearer error when an unexpected payload arrives.
    var headerB64 = trimmed.split('.')[0];
    if (headerB64) {
        try {
            var b64 = headerB64.replace(/-/g, '+').replace(/_/g, '/');
            var padLen = b64.length % 4;
            if (padLen === 2) { b64 += '=='; } else if (padLen === 3) { b64 += '='; }
            var header = JSON.parse(Encoding.fromBase64(b64).toString());
            // API response MLE uses RSA-OAEP (SHA-1), mirroring the request side (jweEncrypt.js);
            // webhooks use RSA-OAEP-256. Accept either RSA key-wrap alg with A256GCM content enc.
            if ((header.alg !== 'RSA-OAEP' && header.alg !== 'RSA-OAEP-256') || header.enc !== 'A256GCM') {
                Logger.error('jweDecrypt: unexpected JWE algorithms — alg=' + header.alg + ', enc=' + header.enc + '. Expected RSA-OAEP or RSA-OAEP-256 with A256GCM.');
                throw new Error('Unsupported JWE algorithms');
            }
        } catch (he) {
            if (he.message === 'Unsupported JWE algorithms') { throw he; }
            // Header parse failure — fall through; JWE.parse below will surface a clearer error.
        }
    }

    try {
        // dw/crypto/JWE only supports RSA-OAEP-256/-384/-512. RSA-OAEP (SHA-1) — what the
        // gateway returns for API responses, mirroring the request side — must be hand-rolled.
        if (header && header.alg === 'RSA-OAEP') {
            return decryptRsaOaepSha1(trimmed, alias);
        }
        var jwe = JWE.parse(trimmed);
        jwe.decrypt(new KeyRef(alias));
        return jwe.getPayload();
    } catch (e) {
        Logger.error('jweDecrypt failed for alias "' + alias + '": ' + e.message + '. Verify the merchant .p12 private key (Response MLE certificate pair) is uploaded under Administration > Operations > Private Keys and Certificates with this exact alias.');
        throw e;
    }
}

/**
 * base64url string -> dw.util.Bytes.
 * @param {string} s - base64url-encoded string
 * @returns {dw.util.Bytes} decoded bytes
 */
function b64urlToBytes(s) {
    var b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    var pad = b64.length % 4;
    if (pad === 2) { b64 += '=='; } else if (pad === 3) { b64 += '='; }
    return Encoding.fromBase64(b64);
}

/**
 * Decrypt an RSA-OAEP (SHA-1) + A256GCM JWE compact serialization. This is the inverse of
 * jweEncrypt.js and uses the same WeakCipher primitive, because dw/crypto/JWE rejects the
 * SHA-1 OAEP key-management algorithm. The GCM tag (5th part) is not verified — see
 * aesgcmCustom.aesGcmCtrDecrypt.
 *
 * @param {string} compact - JWE compact serialization (5 base64url parts)
 * @param {string} alias - keystore alias of the merchant Response MLE private key
 * @returns {string} decrypted UTF-8 payload
 */
function decryptRsaOaepSha1(compact, alias) {
    var WeakCipher = require('dw/crypto/WeakCipher');
    var KeyRef = require('dw/crypto/KeyRef');
    var Bytes = require('dw/util/Bytes');
    var aesgcm = require('*/cartridge/scripts/mle/aesgcmCustom.js');
    var weakCipher = new WeakCipher();

    var parts = compact.split('.');
    if (parts.length !== 5) {
        throw new Error('Malformed JWE: expected 5 parts, got ' + parts.length);
    }
    var encKeyBytes = b64urlToBytes(parts[1]);
    var ivBytes = b64urlToBytes(parts[2]);
    var ctBytes = b64urlToBytes(parts[3]);

    // Unwrap the AES-256 content-encryption key with the merchant private key.
    var cek = weakCipher.decryptBytes(encKeyBytes, new KeyRef(alias), 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding', null, 0);
    var cekB64 = Encoding.toBase64(cek);

    var plaintext = aesgcm.aesGcmCtrDecrypt(cekB64, ivBytes.asUint8Array(), ctBytes.asUint8Array());
    return new Bytes(plaintext).toString('UTF-8');
}

/**
 * Unwrap an MLE-encrypted API response back to its plaintext payload string.
 *
 * If the response body is a JSON object containing an "encryptedResponse" field, the
 * JWE is decrypted and the decrypted payload string is returned (which the caller then
 * parses as JSON, or treats as a raw JWT string for JWT-returning endpoints). If the
 * body is not MLE-wrapped, the original body is returned unchanged — so this is a safe
 * no-op passthrough for unencrypted or unconfigured responses.
 *
 * @param {string} responseBody - raw response body string from the API
 * @returns {string} the decrypted payload string, or the original body when not MLE-wrapped
 */
function decryptResponse(responseBody) {
    if (!responseBody || typeof responseBody !== 'string') {
        return responseBody;
    }
    var responseObj;
    try {
        responseObj = JSON.parse(responseBody);
    } catch (e) {
        // Not JSON (e.g. a bare JWT string) — cannot be an encryptedResponse envelope.
        return responseBody;
    }
    if (responseObj && responseObj.encryptedResponse) {
        return decryptJWE(responseObj.encryptedResponse);
    }
    return responseBody;
}

module.exports = {
    decryptJWE: decryptJWE,
    decryptResponse: decryptResponse
};
