'use strict';

/**
 * Reads the Visa Acceptance .p12 bundle from IMPEX to supply the REQUEST-MLE material:
 * the CN=CyberSource_SJC_US certificate (whose public key wraps the CEK) and its subject-DN
 * serialNumber, which is the JWE `kid`. Used only when no request-MLE keystore alias is
 * configured — the keystore takes priority (see jweEncrypt).
 *
 * IMPORTANT — this bundle holds PUBLIC certificates as far as this module is concerned, so it
 * deliberately does NOT drive response MLE. Response MLE is gated on the response private key
 * alias alone and its kid comes from that keystore entry (see ApiClient.callApi): a kid taken
 * from here would make the gateway encrypt a reply we hold no private key for. SFCC cannot build
 * a private key from raw bytes anyway (dw.crypto.KeyRef accepts a keystore alias only), so the
 * .p12 must ALSO be imported into Business Manager for response decryption. This module removes
 * the separate CyberSource_SJC_US certificate export/import, not the keystore import.
 *
 * getResponseMleKid() remains available for callers that want the merchant leaf serialNumber out
 * of the bundle, but nothing on the request path uses it.
 *
 * In a CyberSource-issued bundle the certificate bags sit in a PLAINTEXT "PKCS7 Data" section
 * (only the private key is a Shrouded Keybag), so no PBE key is needed to read the certificates.
 * A PBE key is only consulted if a bundle turns out to have encrypted certificate bags.
 */

var File = require('dw/io/File');
var Logger = require('dw/system/Logger');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var CertificateUtils = require('dw/crypto/CertificateUtils');

var SJC_CN = 'CyberSource_SJC_US';
var CA_CN = 'CyberSourceCertAuth';
var MAX_READ = 10240; // dw.io.RandomAccessFileReader.MAX_READ_BYTES

// Memo for repeat calls: a single storefront request can make several MLE-capable API calls
// (auth + payer auth + capture), and re-reading/re-parsing the bundle for each is wasted work.
//
// Keyed by the resolved IMPEX path, NOT a bare single slot. Site preferences are per-site, so two
// sites on one instance can legitimately point at different bundles; keying by path means a cached
// parse can never be handed to a site that asked for a different file, no matter how long module
// state lives. Two sites sharing one path share the parse, which is correct.
var cached = null; // { path: string, bundle: Object }

/**
 * Read a file under IMPEX into a Uint8Array. Reads are chunked because readBytes() is capped
 * at 10KB per call.
 *
 * @param {string} relativePath - path under IMPEX, e.g. 'src/mle/visaacceptance.p12'
 * @returns {Uint8Array} the file contents
 */
function readImpexBytes(relativePath) {
    var RandomAccessFileReader = require('dw/io/RandomAccessFileReader');
    var normalized = String(relativePath).replace(/^[\\/]+/, '');
    var file = new File(File.IMPEX + File.SEPARATOR + normalized);
    if (!file.exists()) {
        throw new Error('p12Reader: file not found at IMPEX/' + normalized
            + '. Upload the .p12 via WebDAV to /on/demandware.servlet/webdav/Sites/Impex/' + normalized + '.');
    }

    var reader = new RandomAccessFileReader(file);
    try {
        var total = reader.length();
        var out = new Uint8Array(total);
        var pos = 0;
        while (pos < total) {
            var want = Math.min(MAX_READ, total - pos);
            var chunk = reader.readBytes(want);
            var chunkLen = chunk ? (chunk.length || chunk.getLength()) : 0;
            if (!chunkLen) {
                break;
            }
            // Copy byte-by-byte with an unsigned mask instead of out.set(view): a Bytes bridged
            // from Java can expose signed values, and view offsets are unreliable here.
            var chunkArray = chunk.asUint8Array();
            for (var i = 0; i < chunkLen; i++) {
                out[pos + i] = chunkArray[i] & 0xFF;
            }
            pos += chunkLen;
        }
        if (pos !== total) {
            throw new Error('p12Reader: short read (' + pos + ' of ' + total + ' bytes)');
        }
        return out;
    } finally {
        reader.close();
    }
}

/**
 * Build the decrypt callback p12Parser needs for bundles whose certificate bags are encrypted.
 * CyberSource bundles keep certificates in plaintext, so this is a fallback path only.
 *
 * @param {string} pbeKey - the .p12 import key, or null for a plaintext bundle
 * @returns {Function} (algOid, salt, iterations, ciphertext) => Uint8Array
 */
function makeDecryptFn(pbeKey) {
    var p12Parser = require('*/cartridge/scripts/mle/p12Parser');
    return function (algOid, salt, iterations, ciphertext) {
        if (!pbeKey) {
            throw new Error('p12Reader: this bundle has ENCRYPTED certificate bags, which needs the .p12'
                + ' password. Visa Acceptance bundles keep their certificate bags in a plain "PKCS7 Data"'
                + ' section, so no password is configured — verify the bundle with:'
                + ' openssl pkcs12 -in <file>.p12 -info -nokeys -legacy (look for "PKCS7 Data" rather than'
                + ' "PKCS7 Encrypted data" above the Certificate bags). If encrypted bundles ever need to be'
                + ' supported, pass the password into makeDecryptFn from a new site preference.');
        }
        var WeakCipher = require('dw/crypto/WeakCipher');
        var transformation;
        if (algOid === p12Parser.OID.PBE_SHA1_RC2_40) {
            transformation = 'PBEWithSHA1AndRC2_40';
        } else if (algOid === p12Parser.OID.PBE_SHA1_3DES) {
            transformation = 'PBEWithSHA1AndDESede';
        } else {
            throw new Error('p12Reader: unsupported certificate-bag encryption algorithm ' + algOid);
        }
        var plain = new WeakCipher().decryptBytes(
            new Bytes(ciphertext), pbeKey, transformation, Encoding.toBase64(new Bytes(salt)), iterations);
        return plain.asUint8Array();
    };
}

/**
 * Describe one DER certificate by asking the platform to parse it — avoids hand-rolling X.509
 * parsing. Returns null when the bytes are not a certificate the platform accepts.
 *
 * @param {Uint8Array} der - DER-encoded certificate
 * @returns {Object|null} {certRef, subjectDN, cn, serialNumber, base64}
 */
function describeCertificate(der) {
    var certHelper = require('*/cartridge/scripts/helpers/certHelper');
    try {
        var base64 = Encoding.toBase64(new Bytes(der));
        var certRef = CertificateUtils.parseEncodedCertificate(base64);
        var cert = CertificateUtils.getCertificate(certRef);
        if (!cert) {
            return null;
        }
        var subjectDN = String(cert.getSubjectDN());
        return {
            certRef: certRef,
            subjectDN: subjectDN,
            cn: certHelper.extractRdn(subjectDN, ['CN']),
            serialNumber: certHelper.extractRdn(subjectDN, ['SERIALNUMBER', 'OID\\.2\\.5\\.4\\.5', '2\\.5\\.4\\.5']),
            base64: base64
        };
    } catch (e) {
        Logger.getLogger('VisaAcceptance', 'mle').warn('p12Reader: skipping an unparseable certificate bag: {0}', (e && e.message) || e);
        return null;
    }
}

/**
 * Read and classify every certificate in the configured bundle.
 *
 * @returns {Object} {sjc, leaf, all} — `sjc` is the CyberSource_SJC_US encryption cert (or null),
 *          `leaf` is the merchant certificate (or null), each as returned by describeCertificate
 */
function loadBundle() {
    var configObject = require('*/cartridge/configuration/index');
    var p12Parser = require('*/cartridge/scripts/mle/p12Parser');

    var relativePath = configObject.requestMleP12ImpexPath;
    if (!relativePath) {
        throw new Error('p12Reader: no IMPEX path configured (VisaAcceptance_RequestMLEP12ImpexPath).');
    }

    if (cached && cached.path === relativePath) {
        return cached.bundle;
    }

    var pfxBytes = readImpexBytes(relativePath);
    var derCerts;
    try {
        // No PBE key is passed: Visa Acceptance bundles keep their certificate bags in a plain
        // "PKCS7 Data" section, so decryption is never needed. The decrypt path is kept wired up
        // for bundles that do encrypt them — supply the key here (from a new site preference)
        // if that ever becomes necessary.
        derCerts = p12Parser.extractCertificates(pfxBytes, makeDecryptFn(null));
    } catch (parseErr) {
        // Always report WHAT we read, so a bad upload is diagnosable from one log line.
        throw new Error(((parseErr && parseErr.message) || parseErr)
            + ' [IMPEX/' + relativePath + ': ' + pfxBytes.length + ' bytes]');
    }

    var result = { sjc: null, leaf: null, all: [] };
    for (var i = 0; i < derCerts.length; i++) {
        var info = describeCertificate(derCerts[i]);
        if (!info) {
            continue;
        }
        result.all.push(info);
        if (info.cn === SJC_CN) {
            result.sjc = info;
        } else if (info.cn !== CA_CN && !result.leaf && info.serialNumber) {
            // The merchant leaf is the remaining cert that is neither the CyberSource encryption
            // cert nor the issuing CA, and (unlike the CA) carries a serialNumber RDN.
            result.leaf = info;
        }
    }

    cached = { path: relativePath, bundle: result };
    return result;
}

/**
 * Request-MLE material: the CyberSource encryption certificate and its kid.
 *
 * @returns {Object} {certRef, kid, subjectDN}
 * @throws {Error} if the bundle cannot be read or holds no CyberSource_SJC_US certificate
 */
function getRequestMleCertificate() {
    var bundle = loadBundle();
    if (!bundle.sjc) {
        var found = bundle.all.map(function (c) { return c.cn || '?'; }).join(', ');
        throw new Error('p12Reader: no "' + SJC_CN + '" certificate in the bundle (found: ' + found + ').');
    }
    if (!bundle.sjc.serialNumber) {
        throw new Error('p12Reader: the ' + SJC_CN + ' certificate has no serialNumber RDN, so the JWE kid cannot be derived.');
    }
    return { certRef: bundle.sjc.certRef, kid: bundle.sjc.serialNumber, subjectDN: bundle.sjc.subjectDN };
}

/**
 * Response-MLE kid: the merchant leaf certificate's subject-DN serialNumber. Never throws —
 * response MLE is an enhancement and must not fail a payment.
 *
 * @returns {string} the kid, or '' if it could not be derived
 */
function getResponseMleKid() {
    try {
        var bundle = loadBundle();
        return (bundle.leaf && bundle.leaf.serialNumber) ? bundle.leaf.serialNumber : '';
    } catch (e) {
        Logger.getLogger('VisaAcceptance', 'mle').warn('p12Reader.getResponseMleKid failed: {0}', (e && e.message) || e);
        return '';
    }
}

module.exports = {
    getRequestMleCertificate: getRequestMleCertificate,
    getResponseMleKid: getResponseMleKid,
    loadBundle: loadBundle,
    readImpexBytes: readImpexBytes
};
