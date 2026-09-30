'use strict';

/**
 * Covers which request-MLE certificate source jweEncrypt selects. The crypto itself is stubbed —
 * these tests are about precedence: the BM keystore alias must win over the IMPEX .p12 bundle
 * whenever it is configured, so certificate material stays in Business Manager's protected store.
 */

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CARTRIDGE = '../../../../../cartridges/int_cybs_sfra_base/cartridge';

var calls;

/**
 * Load jweEncrypt with all dw/* crypto stubbed and both certificate sources available.
 *
 * @param {Object} cfg - configuration values (requestMleCertificateAlias, requestMleP12ImpexPath)
 * @param {Object} [opts] - {aliasKid: string} kid the keystore lookup should return ('' = failure)
 * @returns {Object} the jweEncrypt module
 */
function load(cfg, opts) {
    calls = { certHelperAlias: null, p12ReaderUsed: false, certificateRefAlias: null, wrappedWith: null };
    var options = opts || {};
    var aliasKid = options.aliasKid === undefined ? 'ALIAS-KID' : options.aliasKid;

    global.empty = function (v) { return v === null || v === undefined || v === ''; };
    global.dw = {
        crypto: {
            Encoding: {
                toBase64: function () { return 'BASE64'; },
                toBase64URL: function () { return 'B64URL'; }
            }
        }
    };

    return proxyquire(CARTRIDGE + '/scripts/mle/jweEncrypt', {
        '~/cartridge/scripts/mle/aesgcmCustom.js': {
            encryptAndTag: function () { return { ciphertext: new Uint8Array([1]), customTag: new Uint8Array([2]) }; }
        },
        'dw/crypto/Cipher': function () {},
        'dw/crypto/WeakCipher': function () {
            this.encryptBytes = function (key, publicKeyRef) { calls.wrappedWith = publicKeyRef; return 'WRAPPED'; };
        },
        'dw/util/Bytes': function () {},
        'dw/crypto/SecureRandom': function () { this.nextBytes = function () { return 'RAND'; }; },
        'dw/crypto/CertificateRef': function (alias) { calls.certificateRefAlias = alias; this.alias = alias; },
        '*/cartridge/configuration/index': cfg,
        '*/cartridge/scripts/helpers/certHelper': {
            getKidFromCertificateAlias: function (alias) { calls.certHelperAlias = alias; return aliasKid; }
        },
        '*/cartridge/scripts/mle/p12Reader': {
            getRequestMleCertificate: function () {
                calls.p12ReaderUsed = true;
                return { kid: 'IMPEX-KID', certRef: { fromImpex: true }, subjectDN: 'CN=CyberSource_SJC_US' };
            }
        }
    });
}

describe('jweEncrypt request-MLE certificate precedence', function () {
    it('prefers the BM keystore alias when BOTH sources are configured', function () {
        var mod = load({
            requestMleCertificateAlias: 'SJC_Alias',
            requestMleP12ImpexPath: 'src/mle/visaacceptance.p12'
        });
        mod.getJWE('{"a":1}');

        assert.equal(calls.certHelperAlias, 'SJC_Alias', 'keystore lookup should run');
        assert.isFalse(calls.p12ReaderUsed, 'the IMPEX bundle must NOT be read when an alias is set');
        assert.equal(calls.certificateRefAlias, 'SJC_Alias', 'the CEK must be wrapped with the keystore certificate');
    });

    it('uses the IMPEX bundle only when no keystore alias is configured', function () {
        var mod = load({ requestMleCertificateAlias: '', requestMleP12ImpexPath: 'src/mle/visaacceptance.p12' });
        mod.getJWE('{"a":1}');

        assert.isTrue(calls.p12ReaderUsed, 'the IMPEX bundle should supply the certificate');
        assert.isNull(calls.certHelperAlias, 'no keystore lookup should be attempted');
        assert.isNull(calls.certificateRefAlias, 'no keystore CertificateRef should be built');
        assert.deepEqual(calls.wrappedWith, { fromImpex: true }, 'the CEK must be wrapped with the IMPEX certificate');
    });

    it('uses the keystore alias when it is the only source configured', function () {
        var mod = load({ requestMleCertificateAlias: 'SJC_Alias', requestMleP12ImpexPath: '' });
        mod.getJWE('{"a":1}');

        assert.equal(calls.certHelperAlias, 'SJC_Alias');
        assert.isFalse(calls.p12ReaderUsed);
    });

    // Precedence, not fallback: a configured-but-broken alias must fail loudly rather than
    // silently switching to IMPEX, otherwise a typo looks like a working Option 1.
    it('fails loudly when the configured alias yields no kid, even if IMPEX is available', function () {
        var mod = load({
            requestMleCertificateAlias: 'Typo_Alias',
            requestMleP12ImpexPath: 'src/mle/visaacceptance.p12'
        }, { aliasKid: '' });

        assert.throws(function () { mod.getJWE('{"a":1}'); }, /could not derive the JWE kid/);
        assert.isFalse(calls.p12ReaderUsed, 'must not quietly fall back to the IMPEX bundle');
    });

    it('throws a message naming both options when neither is configured', function () {
        var mod = load({ requestMleCertificateAlias: '', requestMleP12ImpexPath: '' });
        assert.throws(function () { mod.getJWE('{"a":1}'); },
            /VisaAcceptance_RequestMLECertificateAlias[\s\S]*VisaAcceptance_RequestMLEP12ImpexPath/);
    });
});
