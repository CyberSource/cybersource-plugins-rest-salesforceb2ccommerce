'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var WARNINGS = [];

/**
 * Load certHelper with dw/* stubbed. `subjectDN` is what the resolved certificate reports;
 * pass null to simulate no certificate bound to the alias.
 * @param {string|null} subjectDN - subject DN the stubbed certificate returns
 * @returns {Object} the certHelper module
 */
function load(subjectDN) {
    WARNINGS = [];
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/certHelper', {
        'dw/crypto/CertificateUtils': {
            getCertificate: function () {
                if (subjectDN === null) { return null; }
                if (subjectDN === 'THROW') { throw new Error('no such alias'); }
                return { getSubjectDN: function () { return subjectDN; } };
            }
        },
        'dw/crypto/KeyRef': function () {},
        'dw/crypto/CertificateRef': function () {},
        'dw/system/Logger': {
            getLogger: function () {
                return {
                    error: function () {},
                    warn: function (msg) { WARNINGS.push(msg); }
                };
            }
        }
    });
}

// Real subject DN from the merchant .p12 egress key entry (OpenSSL slash form).
var REAL_DN = '/CN=wiproltd/serialNumber=1785233805202157407912';

describe('certHelper.getKidFromAlias', function () {
    it('derives the kid from the subject DN serialNumber (OpenSSL slash form)', function () {
        var mod = load(REAL_DN);
        assert.equal(mod.getKidFromAlias('wiproltd-responsemle'), '1785233805202157407912');
    });

    it('derives the kid from the RFC 2253 comma form, case-insensitively', function () {
        var mod = load('CN=wiproltd, SERIALNUMBER=1785233805202157407912');
        assert.equal(mod.getKidFromAlias('a'), '1785233805202157407912');
    });

    it('does NOT return the X.509 cert serial - only the subject DN attribute', function () {
        // A DN with no serialNumber attribute must fail rather than fall back to anything else.
        var mod = load('CN=wiproltd');
        assert.throws(function () { mod.getKidFromAlias('a'); }, /could not derive MLE key id/);
    });

    it('throws when no certificate is bound to the alias', function () {
        var mod = load(null);
        assert.throws(function () { mod.getKidFromAlias('missing'); }, /no certificate bound to alias/);
    });

    it('throws when no alias is provided', function () {
        var mod = load(REAL_DN);
        assert.throws(function () { mod.getKidFromAlias(''); }, /no P12 alias provided/);
    });

    it('warns when the cert CN does not match the expected merchant id, but still returns the kid', function () {
        var mod = load(REAL_DN);
        assert.equal(mod.getKidFromAlias('a', 'someoneelse'), '1785233805202157407912');
        assert.lengthOf(WARNINGS, 1);
    });

    it('does not warn when the CN matches the merchant id', function () {
        var mod = load(REAL_DN);
        assert.equal(mod.getKidFromAlias('a', 'wiproltd'), '1785233805202157407912');
        assert.lengthOf(WARNINGS, 0);
    });
});

// Real subject DN of the CyberSource_SJC_US encryption cert bundled in the merchant .p12.
var SJC_DN = '/CN=CyberSource_SJC_US/serialNumber=1763424170787064972884';

describe('certHelper.getKidFromCertificateAlias (request MLE)', function () {
    it('derives the SJC encryption cert kid from its subject DN', function () {
        var mod = load(SJC_DN);
        assert.equal(mod.getKidFromCertificateAlias('sjc-alias', 'CyberSource_SJC_US'), '1763424170787064972884');
        assert.lengthOf(WARNINGS, 0);
    });

    it('warns when the alias points at the merchant cert instead of the encryption cert', function () {
        var mod = load(REAL_DN); // CN=wiproltd - wrong cert for request MLE
        var kid = mod.getKidFromCertificateAlias('wrong-alias', 'CyberSource_SJC_US');
        assert.equal(kid, '1785233805202157407912');
        assert.lengthOf(WARNINGS, 1);
    });

    // Must NEVER throw - request MLE is on the payment path and falls back to the preference.
    it('returns empty string (no throw) when the alias is missing or unresolvable', function () {
        assert.equal(load(SJC_DN).getKidFromCertificateAlias(''), '');
        assert.equal(load(null).getKidFromCertificateAlias('a'), '');
        assert.equal(load('THROW').getKidFromCertificateAlias('a'), '');
    });

    it('returns empty string when the DN carries no serialNumber', function () {
        var mod = load('CN=CyberSource_SJC_US');
        assert.equal(mod.getKidFromCertificateAlias('a'), '');
    });
});
