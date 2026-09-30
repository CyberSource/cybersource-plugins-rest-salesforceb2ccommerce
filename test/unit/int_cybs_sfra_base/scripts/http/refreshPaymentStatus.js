'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Fake RefreshPaymentStatusApi mirroring the runtime callback contract (data, error, response).
 * Captures the id and body it was called with for assertions.
 * @param {*} data response data
 * @param {*} error error flag
 * @param {Object} captured object the fake writes call args into
 * @returns {Function} constructor
 */
function fakeApi(data, error, captured) {
    return function () {
        this.refreshPaymentStatus = function (id, body, cb) {
            captured.id = id;
            captured.body = body;
            cb(data, error, {});
        };
    };
}

/**
 * Load refreshPaymentStatus with apiClient/config/Logger stubbed.
 * @param {Function} ApiCtor fake RefreshPaymentStatusApi
 * @returns {Object} module exports
 */
function load(ApiCtor) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/http/refreshPaymentStatus', {
        'dw/system/Logger': { error: function () {}, info: function () {} },
        '../../configuration/index': {},
        '../../apiClient/api/RefreshPaymentStatusApi': ApiCtor
    });
}

describe('refreshPaymentStatus.buildRequest', function () {
    it('sends the order number as clientReferenceInformation.code and AP_STATUS action', function () {
        var mod = load(fakeApi({}, false, {}));
        var body = mod.buildRequest('00001234');
        assert.equal(body.clientReferenceInformation.code, '00001234');
        assert.deepEqual(body.processingInformation.actionList, ['AP_STATUS']);
    });
});

describe('refreshPaymentStatus.getRefreshedStatus', function () {
    it('returns the raw status and full data on success', function () {
        var captured = {};
        var mod = load(fakeApi({ status: 'COMPLETED', id: 'txn-1' }, false, captured));
        var result = mod.getRefreshedStatus('txn-1', '00001234');
        assert.equal(result.status, 'COMPLETED');
        assert.equal(result.data.id, 'txn-1');
        // request id goes in the path, order number in the body
        assert.equal(captured.id, 'txn-1');
        assert.equal(captured.body.clientReferenceInformation.code, '00001234');
    });

    it('returns null when the API errors', function () {
        var mod = load(fakeApi('boom', true, {}));
        assert.isNull(mod.getRefreshedStatus('txn-1', '00001234'));
    });

    it('returns null when no transaction id is given', function () {
        var mod = load(fakeApi({ status: 'COMPLETED' }, false, {}));
        assert.isNull(mod.getRefreshedStatus(null, '00001234'));
    });

    it('returns { status: null } when the response omits status', function () {
        var mod = load(fakeApi({ id: 'txn-1' }, false, {}));
        var result = mod.getRefreshedStatus('txn-1', '00001234');
        assert.isNull(result.status);
    });
});
