'use strict';

/**
 * PKCS#12 (PFX) structure walker — extracts the X.509 certificates from a .p12 bundle.
 *
 * Pure JavaScript with no dw/* dependencies: PBE decryption of encrypted bags is supplied by the
 * caller as `decryptFn`, so this module can be unit-tested against real .p12 fixtures outside
 * the SFCC runtime (an unencrypted fixture exercises every path except decryptFn itself).
 *
 * Only certificate bags are extracted. Key bags are deliberately ignored — SFCC has no API to
 * build a private key from raw bytes (dw.crypto.KeyRef takes a keystore alias only), so the
 * private key is unusable from script and is never touched here.
 *
 * Structure walked (RFC 7292):
 *   PFX ::= SEQUENCE { version, authSafe ContentInfo, macData OPTIONAL }
 *     authSafe = ContentInfo(data) -> OCTET STRING -> AuthenticatedSafe
 *   AuthenticatedSafe ::= SEQUENCE OF ContentInfo
 *     ContentInfo(data)          -> OCTET STRING -> SafeContents          (plaintext bags)
 *     ContentInfo(encryptedData) -> EncryptedData -> decrypt -> SafeContents
 *   SafeContents ::= SEQUENCE OF SafeBag
 *     SafeBag(certBag) -> CertBag { certId, [0] OCTET STRING = DER certificate }
 */

var asn1 = require('*/cartridge/scripts/mle/asn1');

var OID = {
    DATA: '1.2.840.113549.1.7.1',
    ENCRYPTED_DATA: '1.2.840.113549.1.7.6',
    CERT_BAG: '1.2.840.113549.1.12.10.1.3',
    X509_CERTIFICATE: '1.2.840.113549.1.9.22.1',
    // PKCS#12 PBE schemes actually used by CyberSource-issued .p12 files.
    PBE_SHA1_RC2_40: '1.2.840.113549.1.12.1.6',
    PBE_SHA1_3DES: '1.2.840.113549.1.12.1.3',
    // PBES2 (PBKDF2 + AES) — what modern OpenSSL emits by default. Unsupported: SFCC has no
    // PBKDF2 API, so we detect it to give a precise error instead of a generic parse failure.
    PBES2: '1.2.840.113549.1.5.13'
};

/**
 * Unwrap a `[0]` EXPLICIT context tag and return the single TLV it contains.
 *
 * @param {Uint8Array} buf - buffer being parsed
 * @param {Object} tlv - the context-tagged TLV
 * @returns {Object} the inner TLV
 */
function explicitChild(buf, tlv) {
    return asn1.readTlv(buf, tlv.valueStart);
}

/**
 * Return an OCTET STRING's content, transparently joining a constructed (segmented) one.
 *
 * @param {Uint8Array} buf - buffer being parsed
 * @param {Object} tlv - primitive (0x04) or constructed (0x24) OCTET STRING
 * @returns {Uint8Array} the concatenated content bytes
 */
function octetStringBytes(buf, tlv) {
    if (tlv.tag === asn1.TAG.OCTET_STRING) {
        return asn1.valueBytes(buf, tlv);
    }
    if (tlv.tag === 0x24) { // constructed OCTET STRING
        var segments = asn1.readChildren(buf, tlv.valueStart, tlv.valueEnd);
        var total = 0;
        var i;
        for (i = 0; i < segments.length; i++) {
            total += segments[i].length;
        }
        // Explicit byte copy rather than out.set(view) — see asn1.copyBytes on why views are
        // avoided on this engine.
        var out = new Uint8Array(total);
        var pos = 0;
        for (i = 0; i < segments.length; i++) {
            var seg = asn1.valueBytes(buf, segments[i]);
            for (var j = 0; j < seg.length; j++) {
                out[pos + j] = seg[j];
            }
            pos += seg.length;
        }
        return out;
    }
    throw new Error('p12: expected OCTET STRING, got tag 0x' + tlv.tag.toString(16));
}

/**
 * Collect DER certificates from a SafeContents blob (SEQUENCE OF SafeBag).
 *
 * @param {Uint8Array} buf - the SafeContents DER
 * @param {Uint8Array[]} out - accumulator, appended in encounter order
 */
function collectCertsFromSafeContents(buf, out) {
    var bags = asn1.readChildrenOf(buf, 0);
    for (var i = 0; i < bags.length; i++) {
        var bagChildren = asn1.readChildren(buf, bags[i].valueStart, bags[i].valueEnd);
        if (bagChildren.length < 2) {
            continue;
        }
        if (asn1.decodeOid(buf, bagChildren[0]) !== OID.CERT_BAG) {
            continue; // key bags and any future bag types are skipped
        }
        // bagValue is [0] EXPLICIT CertBag
        var certBag = explicitChild(buf, bagChildren[1]);
        var certBagChildren = asn1.readChildren(buf, certBag.valueStart, certBag.valueEnd);
        if (certBagChildren.length < 2) {
            continue;
        }
        if (asn1.decodeOid(buf, certBagChildren[0]) !== OID.X509_CERTIFICATE) {
            continue;
        }
        // certValue is [0] EXPLICIT OCTET STRING whose content is the complete DER certificate.
        var certValue = explicitChild(buf, certBagChildren[1]);
        out.push(octetStringBytes(buf, certValue));
    }
}

/**
 * Parse an EncryptedContentInfo and return the decrypted SafeContents.
 *
 * @param {Uint8Array} buf - buffer being parsed
 * @param {Object} encryptedDataTlv - the EncryptedData SEQUENCE
 * @param {Function} decryptFn - (algOid, salt: Uint8Array, iterations: number, ciphertext: Uint8Array) => Uint8Array
 * @returns {Uint8Array} decrypted SafeContents DER
 */
function decryptEncryptedData(buf, encryptedDataTlv, decryptFn) {
    var edChildren = asn1.readChildren(buf, encryptedDataTlv.valueStart, encryptedDataTlv.valueEnd);
    // EncryptedData ::= SEQUENCE { version INTEGER, encryptedContentInfo EncryptedContentInfo }
    var eci = edChildren[1];
    var eciChildren = asn1.readChildren(buf, eci.valueStart, eci.valueEnd);
    // EncryptedContentInfo ::= SEQUENCE { contentType, contentEncryptionAlgorithm, [0] encryptedContent }
    var algId = eciChildren[1];
    var algChildren = asn1.readChildren(buf, algId.valueStart, algId.valueEnd);
    var algOid = asn1.decodeOid(buf, algChildren[0]);

    if (algOid === OID.PBES2) {
        throw new Error('p12: this .p12 uses PBES2 (PBKDF2 + AES) encryption, which SFCC cannot decrypt'
            + ' (no PBKDF2 API). Re-export the bundle with the legacy PKCS#12 scheme, e.g.'
            + ' openssl pkcs12 -export -legacy -certpbe PBE-SHA1-RC2-40 ...');
    }

    // PBE parameters ::= SEQUENCE { salt OCTET STRING, iterations INTEGER }
    var pbeParams = asn1.readChildren(buf, algChildren[1].valueStart, algChildren[1].valueEnd);
    var salt = asn1.valueBytes(buf, pbeParams[0]);
    var iterations = asn1.decodeInteger(buf, pbeParams[1]);

    // encryptedContent is [0] IMPLICIT OCTET STRING: primitive 0x80, or constructed 0xA0.
    var encTlv = eciChildren[2];
    var ciphertext;
    if (encTlv.tag === 0x80) {
        ciphertext = asn1.valueBytes(buf, encTlv);
    } else {
        ciphertext = octetStringBytes(buf, asn1.readTlv(buf, encTlv.valueStart));
    }

    var plaintext = decryptFn(algOid, salt, iterations, ciphertext);
    assertDecryptedSafeContents(plaintext, ciphertext.length);
    return plaintext;
}

/**
 * Verify that decrypting an encrypted SafeContents actually produced DER.
 *
 * A wrong PBE key does not make decryption *fail* — CBC happily produces plausible-looking
 * noise. Without this check that noise reaches the ASN.1 reader and surfaces as a baffling
 * "TLV value overruns buffer" from deep inside the parse. Validating here converts the single
 * most likely misconfiguration into a message that names the preference to fix.
 *
 * Trailing bytes are tolerated: block ciphers pad, and the platform may or may not strip it.
 *
 * @param {Uint8Array} plaintext - decryptFn's output
 * @param {number} cipherLen - ciphertext length, for the diagnostic
 * @throws {Error} if the plaintext is not a readable DER SEQUENCE
 */
function assertDecryptedSafeContents(plaintext, cipherLen) {
    var bad = null;
    if (!plaintext || plaintext.length === 0) {
        bad = 'decryption returned no data';
    } else if (plaintext[0] !== asn1.TAG.SEQUENCE) {
        bad = 'expected a DER SEQUENCE (0x30) but got [' + hexPrefix(plaintext, 8) + ']';
    } else {
        try {
            var tlv = asn1.readTlv(plaintext, 0);
            if (tlv.end > plaintext.length) {
                bad = 'the decrypted SEQUENCE claims ' + tlv.length + ' bytes but only '
                    + plaintext.length + ' are present';
            }
        } catch (e) {
            bad = e.message;
        }
    }
    if (bad) {
        throw new Error('p12: could not decrypt the encrypted certificate bags — ' + bad
            + ' (' + cipherLen + ' encrypted bytes). The password used for this bundle is missing or wrong.'
            + ' Prefer a bundle whose certificate bags are NOT encrypted — those need no password at all;'
            + ' check with: openssl pkcs12 -in <file>.p12 -info -nokeys -legacy and look for "PKCS7 Data"'
            + ' rather than "PKCS7 Encrypted data" above the Certificate bags.');
    }
}

/**
 * Render the first few bytes as hex, for diagnostics.
 *
 * @param {Uint8Array} bytes - buffer to sample
 * @param {number} n - how many bytes to show
 * @returns {string} space-separated hex
 */
function hexPrefix(bytes, n) {
    var out = [];
    for (var i = 0; i < Math.min(n, bytes.length); i++) {
        var h = bytes[i].toString(16);
        out.push(h.length === 1 ? '0' + h : h);
    }
    return out.join(' ');
}

/**
 * Fail fast, with an actionable message, when the bytes are not an intact DER PKCS#12 file.
 *
 * A .p12 is binary. Transferring it in text/ASCII mode — or letting a client apply line-ending
 * conversion — rewrites individual bytes, which corrupts the DER length fields and produces
 * confusing "overruns buffer" errors deep inside the parse. The checks below turn that into a
 * clear diagnosis: the outer SEQUENCE of a well-formed PFX must span the whole file.
 *
 * @param {Uint8Array} bytes - the raw file contents
 * @throws {Error} if the buffer is not a plausible, intact PFX
 */
function assertLooksLikePfx(bytes) {
    if (!bytes || bytes.length === 0) {
        throw new Error('p12: file is empty.');
    }
    // A PEM/text file starts with '-' (0x2d) or whitespace; DER starts with SEQUENCE (0x30).
    if (bytes[0] !== 0x30) {
        throw new Error('p12: not a DER .p12 — file starts with bytes [' + hexPrefix(bytes, 8)
            + '] instead of 0x30 (SEQUENCE). If this is a PEM/base64 (.crt/.pem) file, upload the binary .p12 instead.');
    }

    var outer;
    try {
        outer = asn1.readTlv(bytes, 0);
    } catch (e) {
        throw new Error('p12: file is not intact DER (' + e.message + '). Size on disk is ' + bytes.length
            + ' bytes, starts with [' + hexPrefix(bytes, 8) + ']. Re-upload the .p12 in BINARY mode.');
    }

    // The outer SEQUENCE must cover the entire file. A mismatch means bytes were added, removed
    // or rewritten in transit — almost always a text-mode/line-ending-converted upload.
    if (outer.end !== bytes.length) {
        throw new Error('p12: file appears corrupted or truncated — the outer SEQUENCE spans ' + outer.end
            + ' bytes but the file on disk is ' + bytes.length + ' bytes'
            + (outer.end < bytes.length ? ' (trailing data present).' : '.')
            + ' A .p12 is binary: re-upload it in BINARY mode (a text/ASCII transfer or CRLF conversion'
            + ' rewrites bytes and corrupts it), then confirm the uploaded size matches the local file exactly.');
    }
}

/**
 * Extract every X.509 certificate from a PKCS#12 bundle.
 *
 * @param {Uint8Array} pfxBytes - the raw .p12 file contents
 * @param {Function} decryptFn - (algOid, salt, iterations, ciphertext) => Uint8Array plaintext.
 *        Only invoked for PBE-encrypted SafeContents; may be omitted for a plaintext bundle.
 * @returns {Uint8Array[]} DER-encoded certificates in encounter order
 */
function extractCertificates(pfxBytes, decryptFn) {
    var certs = [];

    assertLooksLikePfx(pfxBytes);

    // PFX ::= SEQUENCE { version, authSafe ContentInfo, macData OPTIONAL }
    var pfxChildren = asn1.readChildrenOf(pfxBytes, 0);
    var authSafe = pfxChildren[1];
    var authSafeChildren = asn1.readChildren(pfxBytes, authSafe.valueStart, authSafe.valueEnd);
    if (asn1.decodeOid(pfxBytes, authSafeChildren[0]) !== OID.DATA) {
        throw new Error('p12: unexpected authSafe content type (expected PKCS#7 data)');
    }
    var authSafeBytes = octetStringBytes(pfxBytes, explicitChild(pfxBytes, authSafeChildren[1]));

    // AuthenticatedSafe ::= SEQUENCE OF ContentInfo
    var contentInfos = asn1.readChildrenOf(authSafeBytes, 0);
    for (var i = 0; i < contentInfos.length; i++) {
        var ciChildren = asn1.readChildren(authSafeBytes, contentInfos[i].valueStart, contentInfos[i].valueEnd);
        var contentType = asn1.decodeOid(authSafeBytes, ciChildren[0]);

        if (contentType === OID.DATA) {
            var plainSafeContents = octetStringBytes(authSafeBytes, explicitChild(authSafeBytes, ciChildren[1]));
            collectCertsFromSafeContents(plainSafeContents, certs);
        } else if (contentType === OID.ENCRYPTED_DATA) {
            if (typeof decryptFn !== 'function') {
                throw new Error('p12: bundle contains encrypted SafeContents but no decrypt function was supplied');
            }
            var encryptedData = explicitChild(authSafeBytes, ciChildren[1]);
            var decrypted = decryptEncryptedData(authSafeBytes, encryptedData, decryptFn);
            collectCertsFromSafeContents(decrypted, certs);
        }
        // Any other content type (e.g. signedData) carries no cert bags we need.
    }

    return certs;
}

module.exports = {
    OID: OID,
    extractCertificates: extractCertificates
};
