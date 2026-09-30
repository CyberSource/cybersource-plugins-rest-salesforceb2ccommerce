'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/** Minimal dw.util.Bytes double backed by a Uint8Array. */
function makeBytes(x) {
    var u8 = x instanceof Uint8Array ? x : new Uint8Array(x || 0);
    return { _u8: u8, asUint8Array: function () { return this._u8; } };
}

/**
 * Load aesgcmCustom with dw/* stubbed. The WeakCipher stub echoes the counter block back as
 * the "keystream" so aesGcmCtrDecrypt's plaintext = ciphertext XOR counter-block — lets us
 * assert the counter sequence (start=2, increment), big-endian layout, XOR, and tail handling
 * without needing real AES.
 * @returns {Object} the aesgcmCustom module
 */
function load() {
    global.dw = { crypto: { Encoding: { toBase64: function () { return 'AAAA'; } } } };
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/mle/aesgcmCustom', {
        'dw/crypto/Cipher': function () {},
        'dw/crypto/WeakCipher': function () {
            this.encryptBytes = function (ctrBytes) { return makeBytes(new Uint8Array(ctrBytes._u8)); };
        },
        'dw/util/Bytes': function (x) { return makeBytes(x); }
    });
}

describe('aesgcmCustom.aesGcmCtrDecrypt', function () {
    it('XORs each block against E_K(IV||counter) with counter starting at 2', function () {
        var mod = load();
        var iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        // 20 bytes -> one full 16-byte block (counter 2) + a 4-byte tail (counter 3).
        var ct = new Uint8Array(20);
        for (var i = 0; i < 20; i++) { ct[i] = i; }

        var out = mod.aesGcmCtrDecrypt('key', iv, ct);

        // Rebuild the expected keystream the same way the code should: iv || big-endian counter.
        function ksBlock(counter) {
            var b = new Uint8Array(16);
            b.set(iv, 0);
            b[12] = (counter >>> 24) & 0xFF; b[13] = (counter >>> 16) & 0xFF;
            b[14] = (counter >>> 8) & 0xFF; b[15] = counter & 0xFF;
            return b;
        }
        var expected = new Uint8Array(20);
        var b0 = ksBlock(2);
        var b1 = ksBlock(3);
        for (var k = 0; k < 16; k++) { expected[k] = ct[k] ^ b0[k]; }
        for (var m = 0; m < 4; m++) { expected[16 + m] = ct[16 + m] ^ b1[m]; }

        assert.deepEqual(Array.from(out), Array.from(expected));
    });

    it('returns an empty result for empty ciphertext', function () {
        var mod = load();
        var out = mod.aesGcmCtrDecrypt('key', new Uint8Array(12), new Uint8Array(0));
        assert.equal(out.length, 0);
    });
});
