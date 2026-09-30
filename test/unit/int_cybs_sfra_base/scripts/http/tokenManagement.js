'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Records the arguments getPaymentInstrument was last called with, so tests can
// assert the SDK is invoked with the correct positional contract.
var lastCall = null;

/**
 * Builds a fake PaymentInstrumentApi that MIRRORS the real generated SDK signature
 * getPaymentInstrument(paymentInstrumentTokenId, opts, callback): it records the
 * arguments and throws "Missing the required parameter 'paymentInstrumentTokenId'"
 * when the token id is absent — exactly like the real SDK. This is what makes the
 * argument-order regression observable in a unit test.
 * @param {*} data - response data passed to the callback
 * @param {*} error - error flag passed to the callback
 * @param {Object} response - dw.svc.Result-like object passed to the callback
 * @returns {Function} fake API constructor
 */
function fakeApi(data, error, response) {
    return function () {
        this.getPaymentInstrument = function (paymentInstrumentTokenId, opts, cb) {
            lastCall = { tokenId: paymentInstrumentTokenId, opts: opts };
            if (paymentInstrumentTokenId === undefined || paymentInstrumentTokenId === null) {
                throw new Error("Missing the required parameter 'paymentInstrumentTokenId' when calling getPaymentInstrument");
            }
            cb(data, error, response);
        };
    };
}

/**
 * Loads tokenManagement with the apiClient/configuration/Logger stubbed.
 * NOTE: the real configuration object has NO `profileId` property (it is undefined),
 * so the stub mirrors that — passing it as the token id (the old bug) would throw.
 * @param {Function} ApiCtor - fake PaymentInstrumentApi constructor
 * @returns {Object} the module exports
 */
function load(ApiCtor) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/http/tokenManagement', {
        'dw/system/Site': { current: { getDefaultCurrency: function () { return 'USD'; } } },
        'dw/system/Logger': { getLogger: function () { return { error: function () {} }; } },
        '../../configuration/index': {},
        '../../apiClient/index': { PaymentInstrumentApi: ApiCtor },
        '~/cartridge/configuration/index': {},
        '~/cartridge/apiClient/index': { PaymentInstrumentApi: ApiCtor }
    });
}

describe('tokenManagement.httpRetrievePaymentInstrument', function () {
    beforeEach(function () { lastCall = null; });

    it('passes the payment-instrument token id as the FIRST SDK argument (not profileId)', function () {
        var tm = load(fakeApi({ card: {} }, false, {}));
        tm.httpRetrievePaymentInstrument('pi-TOKEN-123');
        // Regression guard: the SDK requires the token id first; passing profileId
        // (undefined) first is the bug that caused "Missing the required parameter".
        assert.equal(lastCall.tokenId, 'pi-TOKEN-123');
    });

    it('returns updated + data on success', function () {
        var tm = load(fakeApi({ card: { expirationMonth: '12', expirationYear: '2030' } }, false, {}));
        var verdict = tm.httpRetrievePaymentInstrument('pi-1');
        assert.equal(verdict.status, 'updated');
        assert.equal(verdict.data.card.expirationMonth, '12');
    });

    it('returns notAvailable when dw.svc.Result.error is 404', function () {
        var tm = load(fakeApi('not found', true, { error: 404 }));
        assert.deepEqual(tm.httpRetrievePaymentInstrument('pi-1'), { status: 'notAvailable', data: null });
    });

    it('returns notAvailable when dw.svc.Result.statusCode is 410', function () {
        var tm = load(fakeApi('gone', true, { statusCode: 410 }));
        assert.equal(tm.httpRetrievePaymentInstrument('pi-1').status, 'notAvailable');
    });

    it('returns notAvailable when the JSON error body carries statusCode 404', function () {
        var tm = load(fakeApi('{"statusCode":404,"reason":"NOT_FOUND"}', 'NOT_FOUND', { error: true }));
        assert.equal(tm.httpRetrievePaymentInstrument('pi-1').status, 'notAvailable');
    });

    it('returns softFail on a generic server error', function () {
        var tm = load(fakeApi('boom', true, { error: 500 }));
        assert.deepEqual(tm.httpRetrievePaymentInstrument('pi-1'), { status: 'softFail', data: null });
    });

    it('returns softFail when error is truthy but response is null', function () {
        var tm = load(fakeApi(null, true, null));
        assert.deepEqual(tm.httpRetrievePaymentInstrument('pi-1'), { status: 'softFail', data: null });
    });
});
