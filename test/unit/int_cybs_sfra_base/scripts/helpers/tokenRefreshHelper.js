'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Records the last upsertCreditCard call so tests can assert the replace-on-change path.
var lastUpsert = null;

/**
 * Builds a fake raw CustomerPaymentInstrument with a stored expiry (01/2020) + a token.
 * Note: the helper no longer mutates the instrument in place (SFCC masks it), so the
 * expiry setters here exist only to PROVE they are never called.
 * @param {string} uuid - card UUID
 * @param {string} token - serialized creditCardToken
 * @returns {Object} fake instrument
 */
function makePI(uuid, token) {
    return {
        UUID: uuid,
        creditCardExpirationMonth: 1,
        creditCardExpirationYear: 2020,
        _token: token,
        getCreditCardToken: function () { return this._token; },
        setCreditCardExpirationMonth: function () { throw new Error('must not mutate a masked instrument'); },
        setCreditCardExpirationYear: function () { throw new Error('must not mutate a masked instrument'); }
    };
}

/**
 * Loads tokenRefreshHelper with stubbed retrieve + transaction + upsert spy.
 * @param {string} status - verdict status from the retrieve stub
 * @param {Object} data - verdict data from the retrieve stub
 * @returns {Object} the helper exports
 */
function load(status, data) {
    lastUpsert = null;
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/tokenRefreshHelper', {
        'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
        '~/cartridge/scripts/http/tokenManagement': {
            httpRetrievePaymentInstrument: function () { return { status: status, data: data }; }
        },
        '~/cartridge/scripts/util/mapper.js': {
            deserializeTokenInformation: function (t) {
                var parts = t.split('-');
                return { instrumentIdentifier: { id: parts[0] }, paymentInstrument: { id: parts[1] } };
            }
        },
        '~/cartridge/scripts/helpers/ucPaymentHelper': {
            upsertCreditCard: function (wallet, serializedToken, cardDetails, instrumentIdentifierId) {
                lastUpsert = {
                    serializedToken: serializedToken,
                    cardDetails: cardDetails,
                    instrumentIdentifierId: instrumentIdentifierId
                };
                return { uuid: 'new-uuid', replacedExisting: true };
            }
        }
    });
}

describe('tokenRefreshHelper.refreshInstrument', function () {
    it('REPLACES the card (preserving token) when TMS expiry changed', function () {
        var helper = load('updated', { card: { expirationMonth: '08', expirationYear: '2031' } });
        var pi = makePI('u1', 'ii-1-pi-1-flex'); // stored 01/2020 -> changed
        var wallet = { removePaymentInstrument: function () { throw new Error('helper, not wallet, removes'); } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: true, replaced: true });
        assert.isNotNull(lastUpsert);
        assert.equal(lastUpsert.serializedToken, 'ii-1-pi-1-flex'); // original token preserved
        assert.equal(lastUpsert.instrumentIdentifierId, 'ii'); // first token segment
        assert.deepEqual(lastUpsert.cardDetails, { expirationMonth: 8, expirationYear: 2031 });
    });

    it('does nothing when TMS expiry matches the stored expiry', function () {
        var helper = load('updated', { card: { expirationMonth: '1', expirationYear: '2020' } });
        var pi = makePI('u1b', 'ii-1-pi-1-flex'); // stored 01/2020 -> unchanged
        var wallet = { removePaymentInstrument: function () { throw new Error('should not remove'); } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: true });
        assert.isNull(lastUpsert); // no replace attempted
    });

    it('removes the card and returns notAvailable on "notAvailable"', function () {
        var helper = load('notAvailable', null);
        var pi = makePI('u2', 'ii-2-pi-2-flex');
        var removed = {};
        var wallet = { removePaymentInstrument: function (p) { removed.uuid = p.UUID; } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: false, notAvailable: true });
        assert.equal(removed.uuid, 'u2');
        assert.isNull(lastUpsert);
    });

    it('leaves the card untouched and returns success:false on "softFail"', function () {
        var helper = load('softFail', null);
        var pi = makePI('u3', 'ii-3-pi-3-flex');
        var wallet = { removePaymentInstrument: function () { throw new Error('should not remove'); } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: false });
        assert.isNull(lastUpsert);
    });

    it('treats a missing/odd TMS card shape as a soft fail (no replace)', function () {
        var helper = load('updated', { somethingElse: true });
        var pi = makePI('u4', 'ii-4-pi-4-flex');
        var wallet = { removePaymentInstrument: function () { throw new Error('should not remove'); } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: false });
        assert.isNull(lastUpsert);
    });

    it('returns success:false without throwing when the card has no token', function () {
        var helper = load('updated', { card: { expirationMonth: '08', expirationYear: '2031' } });
        var pi = makePI('u5', null);
        var wallet = { removePaymentInstrument: function () { throw new Error('should not remove'); } };
        var result = helper.refreshInstrument(wallet, pi);
        assert.deepEqual(result, { success: false });
        assert.isNull(lastUpsert);
    });
});
