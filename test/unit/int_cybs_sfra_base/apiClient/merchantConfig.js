'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Loads MerchantConfig with only the logger stubbed; constants and ApiException
 * are the real modules so a validation failure throws exactly as it would at runtime.
 * @returns {Function} the MerchantConfig constructor
 */
function load() {
    return proxyquire('../../../../cartridges/int_cybs_sfra_base/cartridge/apiClient/merchantConfig', {
        './logger': { getLogger: function () { return { info: function () {}, warn: function () {}, error: function () {} }; } }
    });
}

/**
 * Builds a minimal-but-valid config, with optional overrides. Both auth mechanisms
 * (shared-secret JWT and HTTP signature) use the REST shared-secret key pair, so a valid
 * config always carries merchantKeyId + merchantsecretKey.
 * @param {Object} overrides - keys to override on the base config
 * @returns {Object} config object for the MerchantConfig constructor
 */
function baseConfig(overrides) {
    var cfg = {
        merchantID: 'mid',
        merchantKeyId: 'kid',
        merchantsecretKey: 'secret',
        runEnvironment: 'cybersource.environment.sandbox',
        enableLog: false,
        logFileMaxSize: '100',
        logFilename: 'cybs'
    };
    var k;
    for (k in overrides) { cfg[k] = overrides[k]; }
    return cfg;
}

describe('MerchantConfig shared-secret validation', function () {
    it('accepts a config with merchant id, key id and secret key', function () {
        var MerchantConfig = load();
        var mc;
        assert.doesNotThrow(function () {
            mc = new MerchantConfig(baseConfig());
        });
        assert.equal(mc.getMerchantKeyID(), 'kid');
        assert.equal(mc.getMerchantsecretKey(), 'secret');
    });

    it('does not require a P12 private key alias (JWT now uses the shared secret)', function () {
        var MerchantConfig = load();
        assert.doesNotThrow(function () {
            new MerchantConfig(baseConfig({ p12PrivateKeyAlias: undefined }));
        });
    });

    it('throws when the merchant key id is missing', function () {
        var MerchantConfig = load();
        assert.throws(function () {
            new MerchantConfig(baseConfig({ merchantKeyId: undefined }));
        });
    });

    it('throws when the merchant secret key is missing', function () {
        var MerchantConfig = load();
        assert.throws(function () {
            new MerchantConfig(baseConfig({ merchantsecretKey: undefined }));
        });
    });
});
