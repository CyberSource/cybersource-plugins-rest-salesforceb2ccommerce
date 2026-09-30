'use strict';

/**
 * Parser tests against REAL .p12 fixtures produced by OpenSSL (see fixtures/README.md).
 * The bundles carry throwaway self-signed keys whose subjects mirror the production bundle
 * (CN=CyberSource_SJC_US + CN=wiproltd, each with a serialNumber RDN).
 */

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var FIXTURES = path.join(__dirname, 'fixtures');

/**
 * Load p12Parser with its cartridge-alias require pointed at the real asn1 module.
 * @returns {Object} the p12Parser module
 */
function load() {
    var asn1 = require('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/mle/asn1');
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/mle/p12Parser', {
        '*/cartridge/scripts/mle/asn1': asn1
    });
}

/**
 * Read a base64 fixture into a Uint8Array.
 * @param {string} name - fixture file name
 * @returns {Uint8Array} the decoded bytes
 */
function fixture(name) {
    var b64 = fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\s+/g, '');
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Pull the subject CN out of a DER certificate using Node's X509 parser — stands in for
 * SFCC's CertificateUtils.getCertificate(...).getSubjectDN(), which the cartridge uses.
 * @param {Uint8Array} der - DER-encoded certificate
 * @returns {string} the subject string
 */
function subjectOf(der) {
    var crypto = require('crypto');
    var cert = new crypto.X509Certificate(Buffer.from(der));
    return cert.subject.replace(/\r?\n/g, ', ');
}

describe('p12Parser.extractCertificates', function () {
    it('extracts both certificates from a plaintext-cert-bag .p12', function () {
        var certs = load().extractCertificates(fixture('plain.p12.b64'));
        assert.lengthOf(certs, 2);
        var subjects = certs.map(subjectOf).join(' | ');
        assert.include(subjects, 'CN=CyberSource_SJC_US');
        assert.include(subjects, 'CN=wiproltd');
    });

    it('yields certificates that parse as valid X.509 with the expected serialNumber RDN', function () {
        var certs = load().extractCertificates(fixture('plain.p12.b64'));
        var sjc = certs.map(subjectOf).filter(function (s) {
            return s.indexOf('CN=CyberSource_SJC_US') !== -1;
        })[0];
        assert.include(sjc, '1763424170787064972884');
    });

    it('reaches decryptFn with the RC2-40 PBE parameters for a legacy-encrypted .p12', function () {
        var seen = null;
        try {
            load().extractCertificates(fixture('rc2.p12.b64'), function (algOid, salt, iterations) {
                seen = { algOid: algOid, saltLen: salt.length, iterations: iterations };
                // Return an empty SEQUENCE so the walk completes without real RC2 decryption.
                return new Uint8Array([0x30, 0x00]);
            });
        } catch (e) {
            assert.fail('should not throw: ' + e.message);
        }
        assert.isNotNull(seen, 'decryptFn was never called');
        assert.equal(seen.algOid, '1.2.840.113549.1.12.1.6', 'pbeWithSHA1And40BitRC2-CBC');
        assert.equal(seen.iterations, 2048);
        assert.isAbove(seen.saltLen, 0);
    });

    it('throws a precise, actionable error for a PBES2 (modern OpenSSL) .p12', function () {
        assert.throws(function () {
            load().extractCertificates(fixture('pbes2.p12.b64'), function () {
                return new Uint8Array([0x30, 0x00]);
            });
        }, /PBES2.*PBKDF2/);
    });

    // A wrong PBE password does not make CBC decryption fail — it yields plausible noise. Without
    // an explicit check that noise reached the ASN.1 reader and surfaced as a baffling
    // "TLV value overruns buffer", which is exactly what a real deployment reported.
    it('blames the password when decryption yields noise instead of DER', function () {
        assert.throws(function () {
            load().extractCertificates(fixture('rc2.p12.b64'), function (algOid, salt, iterations, ciphertext) {
                // Deterministic noise that starts with 0x30 and claims an oversized length,
                // reproducing the reported "overruns buffer (offset 22, length 2162)" shape.
                var noise = new Uint8Array(ciphertext.length);
                noise[0] = 0x30; noise[1] = 0x82; noise[2] = 0x08; noise[3] = 0x72;
                for (var i = 4; i < noise.length; i++) { noise[i] = (i * 31) & 0xFF; }
                return noise;
            });
        }, /could not decrypt the encrypted certificate bags[\s\S]*password[\s\S]*missing or wrong/);
    });

    it('blames the password when decryption yields data that is not a SEQUENCE at all', function () {
        assert.throws(function () {
            load().extractCertificates(fixture('rc2.p12.b64'), function (algOid, salt, iterations, ciphertext) {
                var noise = new Uint8Array(ciphertext.length);
                for (var i = 0; i < noise.length; i++) { noise[i] = (i * 7 + 1) & 0xFF; }
                return noise;
            });
        }, /expected a DER SEQUENCE/);
    });

    it('throws when an encrypted bundle is given no decrypt function', function () {
        assert.throws(function () {
            load().extractCertificates(fixture('rc2.p12.b64'));
        }, /no decrypt function/);
    });

    // cybs.p12 reproduces the REAL Visa Acceptance bundle layout: MAC iteration 1, all three
    // certificate bags in a PLAINTEXT "PKCS7 Data" section, private key in a 3DES Shrouded
    // Keybag. No password-based decryption is needed to reach the certificates.
    describe('real Visa Acceptance bundle layout (plaintext cert bags)', function () {
        it('extracts all three certificates with NO decrypt function at all', function () {
            var certs = load().extractCertificates(fixture('cybs.p12.b64'));
            assert.lengthOf(certs, 3);
            var subjects = certs.map(subjectOf);
            assert.isTrue(subjects.some(function (s) { return s.indexOf('CN=visa_acceptance_sfcc_rest') !== -1; }));
            assert.isTrue(subjects.some(function (s) { return s.indexOf('CN=CyberSourceCertAuth') !== -1; }));
            assert.isTrue(subjects.some(function (s) { return s.indexOf('CN=CyberSource_SJC_US') !== -1; }));
        });

        it('lets the SJC encryption cert be singled out by CN, with its request-MLE kid', function () {
            var certs = load().extractCertificates(fixture('cybs.p12.b64'));
            var sjc = certs.map(subjectOf).filter(function (s) {
                return s.indexOf('CN=CyberSource_SJC_US') !== -1;
            });
            assert.lengthOf(sjc, 1, 'exactly one SJC cert');
            assert.include(sjc[0], '1763424170787064972884', 'request MLE kid');
        });

        it('exposes the merchant leaf cert carrying the response-MLE kid', function () {
            var certs = load().extractCertificates(fixture('cybs.p12.b64'));
            var leaf = certs.map(subjectOf).filter(function (s) {
                return s.indexOf('CN=visa_acceptance_sfcc_rest') !== -1;
            });
            assert.lengthOf(leaf, 1);
            assert.include(leaf[0], '1785476370580482147934', 'response MLE kid');
        });
    });

    // Only certificate bags are read, so a bundle with no key bag at all must still parse. Covers
    // merchants who strip the private key before uploading, and pins that key-bag independence.
    it('parses a certificate-ONLY bundle that contains no private key', function () {
        var certs = load().extractCertificates(fixture('cybs-certs-only.p12.b64'));
        assert.lengthOf(certs, 3);
        var subjects = certs.map(subjectOf).join(' | ');
        assert.include(subjects, 'CN=CyberSource_SJC_US');
        assert.include(subjects, 'CN=visa_acceptance_sfcc_rest');
    });

    // Regression: on SFCC's Rhino engine the parser failed with
    //   "asn1: TLV value overruns buffer (offset 22, length 2162)"
    // on a bundle that parsed fine under Node. Cause: the buffers were typed-array VIEWS, and
    // nesting a view inside a view compounded the byteOffset, shifting every index. These two
    // tests feed the parser the awkward buffer shapes a Java-backed engine can hand us.
    describe('engine-independence of the input buffer', function () {
        it('parses a buffer that is a VIEW with a non-zero byteOffset', function () {
            var raw = fixture('cybs.p12.b64');
            var padded = new Uint8Array(27 + raw.length);
            for (var i = 0; i < raw.length; i++) {
                padded[27 + i] = raw[i];
            }
            var view = new Uint8Array(padded.buffer, 27, raw.length);
            assert.equal(view.byteOffset, 27, 'precondition: the input really is an offset view');
            assert.lengthOf(load().extractCertificates(view), 3);
        });

        it('parses bytes exposed as SIGNED values (-128..127), as a Java bridge may', function () {
            var raw = fixture('cybs.p12.b64');
            var signed = new Int8Array(raw.length);
            for (var i = 0; i < raw.length; i++) {
                signed[i] = raw[i] < 128 ? raw[i] : raw[i] - 256;
            }
            assert.lengthOf(load().extractCertificates(signed), 3);
        });
    });

    it('ignores key bags — only certificate bags are returned', function () {
        // plain.p12 contains one key bag plus two cert bags; we must see exactly the 2 certs.
        var certs = load().extractCertificates(fixture('plain.p12.b64'));
        assert.lengthOf(certs, 2);
        certs.forEach(function (der) {
            assert.equal(der[0], 0x30, 'each result must be a DER SEQUENCE (a certificate)');
        });
    });
});
