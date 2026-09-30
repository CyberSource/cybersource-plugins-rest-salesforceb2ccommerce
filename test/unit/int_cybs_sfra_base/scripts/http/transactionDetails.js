'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Fake TransactionDetailsApi mirroring the runtime callback contract (data, error, response).
 * @param {*} data response data
 * @param {*} error error flag
 * @returns {Function} constructor
 */
function fakeApi(data, error) {
    return function () {
        this.getTransaction = function (id, cb) {
            cb(data, error, {});
        };
    };
}

/**
 * Load transactionDetails with apiClient/config/Logger stubbed.
 * @param {Function} ApiCtor fake TransactionDetailsApi
 * @returns {Object} module exports
 */
function load(ApiCtor) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/http/transactionDetails', {
        'dw/system/Logger': { error: function () {}, info: function () {} },
        '../../configuration/index': {},
        '../../apiClient/index': { TransactionDetailsApi: ApiCtor }
    });
}

describe('transactionDetails.getCapturedAmount', function () {
    it('returns capturedAmount and currency from orderInformation.amountDetails', function () {
        var td = load(fakeApi({ orderInformation: { amountDetails: { totalAmount: '40.00', currency: 'USD' } } }, false));
        assert.deepEqual(td.getCapturedAmount('txn-1'), { capturedAmount: 40, currency: 'USD' });
    });

    it('returns null when the API errors', function () {
        var td = load(fakeApi('boom', true));
        assert.isNull(td.getCapturedAmount('txn-1'));
    });

    it('returns null when no transaction id is given', function () {
        var td = load(fakeApi({}, false));
        assert.isNull(td.getCapturedAmount(null));
    });

    it('returns null when amountDetails is absent', function () {
        var td = load(fakeApi({ orderInformation: {} }, false));
        assert.isNull(td.getCapturedAmount('txn-1'));
    });
});
