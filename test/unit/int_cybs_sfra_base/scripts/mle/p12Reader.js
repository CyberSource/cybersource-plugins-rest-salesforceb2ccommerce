'use strict';

/**
 * p12Reader tests — drive the real ASN.1 + PKCS#12 modules over a real .p12 fixture, with only
 * the dw/* layer stubbed (file IO, base64, certificate parsing). This proves the end-to-end
 * classification: which cert becomes the request-MLE certificate and which kid goes where.
 */

var assert = require('chai').assert;
var fs = require('fs');
var path = require('path');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../../../../cartridges/int_cybs_sfra_base/cartridge';
var FIXTURES = path.join(__dirname, 'fixtures');

var WARNINGS = [];

/**
 * Read a fixture .p12 into a Buffer.
 * @param {string} name - fixture file name
 * @returns {Buffer} decoded bytes
 */
function fixtureBuffer(name) {
    var b64 = fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\s+/g, '');
    return Buffer.from(b64, 'base64');
}

/**
 * Load p12Reader with dw/* stubbed. File IO is backed by the given fixture; certificate parsing
 * is backed by Node's crypto.X509Certificate, standing in for dw.crypto.CertificateUtils.
 *
 * @param {Object} opts - {fixture, impexPath, exists}
 * @returns {Object} the p12Reader module
 */
function load(opts) {
    WARNINGS = [];
    var options = opts || {};
    var bytes = options.fixture ? fixtureBuffer(options.fixture) : Buffer.alloc(0);
    var asn1 = require(CARTRIDGE + '/scripts/mle/asn1');
    var certHelper = proxyquire(CARTRIDGE + '/scripts/helpers/certHelper', {
        'dw/crypto/CertificateUtils': {},
        'dw/crypto/KeyRef': function () {},
        'dw/crypto/CertificateRef': function () {},
        'dw/system/Logger': { getLogger: function () { return { error: function () {}, warn: function () {} }; } }
    });
    var p12Parser = proxyquire(CARTRIDGE + '/scripts/mle/p12Parser', {
        '*/cartridge/scripts/mle/asn1': asn1
    });

    /** Minimal dw.util.Bytes double. */
    function BytesStub(x) {
        var u8 = x instanceof Uint8Array ? x : new Uint8Array(x || 0);
        this._u8 = u8;
        this.length = u8.length;
        this.asUint8Array = function () { return this._u8; };
    }

    return proxyquire(CARTRIDGE + '/scripts/mle/p12Reader', {
        'dw/io/File': Object.assign(function (p) { this.path = p; this.exists = function () { return options.exists !== false; }; }, {
            IMPEX: 'IMPEX',
            SEPARATOR: '/'
        }),
        'dw/io/RandomAccessFileReader': function () {
            var pos = 0;
            this.length = function () { return bytes.length; };
            this.readBytes = function (n) {
                var slice = bytes.subarray(pos, pos + n);
                pos += slice.length;
                return new BytesStub(new Uint8Array(slice));
            };
            this.close = function () {};
        },
        'dw/system/Logger': {
            getLogger: function () {
                return { error: function () {}, warn: function (m) { WARNINGS.push(m); } };
            }
        },
        'dw/crypto/Encoding': {
            toBase64: function (b) { return Buffer.from(b.asUint8Array()).toString('base64'); }
        },
        'dw/util/Bytes': BytesStub,
        'dw/crypto/CertificateUtils': {
            // parseEncodedCertificate -> a ref carrying the base64; getCertificate -> subject DN
            parseEncodedCertificate: function (b64) { return { b64: b64 }; },
            getCertificate: function (ref) {
                var crypto = require('crypto');
                var cert = new crypto.X509Certificate(Buffer.from(ref.b64, 'base64'));
                var subject = cert.subject.replace(/\r?\n/g, ', ');
                return { getSubjectDN: function () { return subject; } };
            }
        },
        '*/cartridge/scripts/mle/p12Parser': p12Parser,
        '*/cartridge/scripts/helpers/certHelper': certHelper,
        // There is deliberately no password preference — bundles keep certificate bags in plaintext.
        '*/cartridge/configuration/index': {
            requestMleP12ImpexPath: options.impexPath !== undefined ? options.impexPath : 'src/mle/visaacceptance.p12'
        }
    });
}

describe('p12Reader — one .p12 for both MLE directions', function () {
    it('resolves the request-MLE certificate and kid from the CyberSource_SJC_US cert', function () {
        var mod = load({ fixture: 'cybs.p12.b64' });
        var req = mod.getRequestMleCertificate();
        assert.equal(req.kid, '1763424170787064972884');
        assert.include(req.subjectDN, 'CN=CyberSource_SJC_US');
        assert.isOk(req.certRef, 'a CertificateRef must be returned for CEK wrapping');
    });

    it('resolves the response-MLE kid from the merchant leaf cert in the SAME file', function () {
        var mod = load({ fixture: 'cybs.p12.b64' });
        assert.equal(mod.getResponseMleKid(), '1785476370580482147934');
    });

    it('never picks the issuing CA as the merchant leaf', function () {
        var bundle = load({ fixture: 'cybs.p12.b64' }).loadBundle();
        assert.equal(bundle.all.length, 3);
        assert.notInclude(bundle.leaf.subjectDN, 'CyberSourceCertAuth');
        assert.include(bundle.leaf.subjectDN, 'visa_acceptance_sfcc_rest');
    });

    // No password preference exists; plaintext certificate bags must work without one.
    it('needs no password for a bundle with plaintext certificate bags', function () {
        var mod = load({ fixture: 'cybs.p12.b64' });
        assert.equal(mod.getRequestMleCertificate().kid, '1763424170787064972884');
    });

    it('explains itself if a bundle ever has ENCRYPTED certificate bags', function () {
        var mod = load({ fixture: 'rc2.p12.b64' });
        assert.throws(function () { mod.getRequestMleCertificate(); }, /ENCRYPTED certificate bags/);
    });

    it('throws an actionable error when the IMPEX file is missing', function () {
        var mod = load({ fixture: 'cybs.p12.b64', exists: false });
        assert.throws(function () { mod.getRequestMleCertificate(); }, /file not found at IMPEX/);
    });

    it('throws when no IMPEX path is configured', function () {
        var mod = load({ fixture: 'cybs.p12.b64', impexPath: '' });
        assert.throws(function () { mod.getRequestMleCertificate(); }, /no IMPEX path configured/);
    });

    it('reports which certificates were found when the SJC cert is absent', function () {
        // plain.p12 has no CyberSource_SJC_US cert under that CN in this fixture pairing.
        var mod = load({ fixture: 'plain.p12.b64' });
        var bundle = mod.loadBundle();
        if (!bundle.sjc) {
            assert.throws(function () { mod.getRequestMleCertificate(); }, /no "CyberSource_SJC_US" certificate/);
        }
    });

    // Multi-site: the IMPEX path is a per-site preference, so two sites on one instance can point
    // at different bundles. The parse memo is keyed by path so a cached bundle can never be served
    // to a site that asked for a different file, however long module state lives.
    it('does not serve a cached bundle to a different configured path', function () {
        var siteA = load({ fixture: 'cybs.p12.b64', impexPath: 'src/mle/siteA.p12' });
        assert.equal(siteA.getRequestMleCertificate().kid, '1763424170787064972884');

        // Same module instance, different site preference AND different file contents.
        var siteB = load({ fixture: 'plain.p12.b64', impexPath: 'src/mle/siteB.p12' });
        var bundleB = siteB.loadBundle();
        assert.lengthOf(bundleB.all, 2, 'must reflect siteB\'s 2-cert bundle, not siteA\'s 3-cert one');
    });

    it('reuses the parse when the same path is requested again', function () {
        var mod = load({ fixture: 'cybs.p12.b64' });
        assert.strictEqual(mod.loadBundle(), mod.loadBundle(), 'second call should hit the memo');
    });

    // getResponseMleKid must never throw: response MLE is an enhancement, not a payment blocker.
    it('returns empty string instead of throwing when the bundle cannot be read', function () {
        var mod = load({ fixture: 'cybs.p12.b64', exists: false });
        assert.equal(mod.getResponseMleKid(), '');
        assert.isAbove(WARNINGS.length, 0, 'the failure should be logged');
    });
});
