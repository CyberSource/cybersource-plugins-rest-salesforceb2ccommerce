'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Load jweDecrypt with the dw/* module-level requires and config stubbed. `jweStub` lets a
 * test control what dw/crypto/JWE.parse(...).getPayload() returns for the encrypted path.
 * @param {Object} jweStub - stub for the dw/crypto/JWE module
 * @returns {Object} the jweDecrypt module
 */
function load(jweStub) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/mle/jweDecrypt', {
        'dw/system/Logger': { error: function () {} },
        'dw/crypto/Encoding': { fromBase64: function () { return { toString: function () { return '{"alg":"RSA-OAEP-256","enc":"A256GCM"}'; } }; } },
        'dw/crypto/JWE': jweStub || {},
        'dw/crypto/KeyRef': function () {},
        '*/cartridge/configuration/index': { responseMlePrivateKeyAlias: 'AliasX' }
    });
}

describe('jweDecrypt.decryptResponse', function () {
    it('returns a plain JSON body unchanged when it is not MLE-wrapped', function () {
        var mod = load();
        var body = '{"id":"123","status":"AUTHORIZED"}';
        assert.equal(mod.decryptResponse(body), body);
    });

    it('returns a bare (non-JSON) JWT string unchanged', function () {
        var mod = load();
        var jwt = 'AAA.BBB.CCC';
        assert.equal(mod.decryptResponse(jwt), jwt);
    });

    it('passes through null / non-string input', function () {
        var mod = load();
        assert.isNull(mod.decryptResponse(null));
        assert.equal(mod.decryptResponse(''), '');
    });

    it('decrypts and returns the inner payload when the body carries encryptedResponse', function () {
        var decrypted = '{"id":"456","status":"AUTHORIZED"}';
        var jweStub = {
            parse: function () {
                return {
                    decrypt: function () {},
                    getPayload: function () { return decrypted; }
                };
            }
        };
        var mod = load(jweStub);
        var body = JSON.stringify({ encryptedResponse: 'header.key.iv.ct.tag' });
        assert.equal(mod.decryptResponse(body), decrypted);
    });
});
