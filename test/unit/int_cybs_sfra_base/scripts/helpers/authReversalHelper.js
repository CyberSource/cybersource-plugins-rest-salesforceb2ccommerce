'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var HELPER_PATH = '../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/authReversalHelper';

/**
 * Real CSV-ledger parser, matching webhookOrderStatusHelper.parseIdList, so the idempotency
 * tests exercise the actual append/dedupe logic rather than a hollow stub.
 * @param {string} raw comma-separated id string
 * @returns {Array<string>} trimmed, non-empty ids
 */
function parseIdList(raw) {
    var arr = [];
    if (raw) {
        var parts = String(raw).split(',');
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].replace(/^\s+|\s+$/g, '');
            if (p) { arr.push(p); }
        }
    }
    return arr;
}

/**
 * Load authReversalHelper with the gateway call, Transaction and Logger stubbed.
 * @param {Object} options { reversalStub, sessionPrivacy }
 * @returns {Object} { helper, calls } where calls records every gateway reversal request
 */
function load(options) {
    var opts = options || {};
    var calls = [];
    // The proxyquire wrapper below is what records each call; the stub only decides the outcome.
    var reversalStub = opts.reversalStub || function () { return { status: 'REVERSED' }; };

    var helper = proxyquire(HELPER_PATH, {
        'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
        'dw/system/Logger': {
            getLogger: function () {
                return { info: function () {}, warn: function () {}, error: function () {}, debug: function () {} };
            }
        },
        '*/cartridge/scripts/helpers/webhookOrderStatusHelper': { parseIdList: parseIdList },
        '*/cartridge/scripts/http/authReversal': {
            httpAuthReversal: function (requestId, referenceCode, total, currency) {
                calls.push({ requestId: requestId, referenceCode: referenceCode, total: total, currency: currency });
                return reversalStub(requestId, referenceCode, total, currency);
            }
        }
    });

    return { helper: helper, calls: calls };
}

/**
 * Build a stub order carrying the reversed-authorization ledger on order.custom.
 * @param {Object} customSeed initial order.custom values
 * @returns {Object} order stub
 */
function makeOrder(customSeed) {
    return {
        orderNo: 'ORD1',
        currencyCode: 'USD',
        custom: customSeed || {}
    };
}

describe('authReversalHelper.reverseAuthorizationOnce (order ledger)', function () {
    it('reverses the authorization and records the auth id in the order ledger', function () {
        var loaded = load();
        var order = makeOrder();

        var result = loaded.helper.reverseAuthorizationOnce({
            order: order,
            authTransactionId: 'auth-1',
            referenceCode: 'ORD1',
            amount: 25.5,
            currency: 'USD',
            context: 'dmNotification'
        });

        assert.isTrue(result.reversed);
        assert.isFalse(result.skipped);
        assert.equal(loaded.calls.length, 1);
        assert.deepEqual(loaded.calls[0], { requestId: 'auth-1', referenceCode: 'ORD1', total: 25.5, currency: 'USD' });
        assert.equal(order.custom.reversedAuthTransactionIds, 'auth-1');
    });

    it('skips a second reversal of the same authorization (webhook redelivery)', function () {
        var loaded = load();
        var order = makeOrder();
        var params = {
            order: order,
            authTransactionId: 'auth-1',
            referenceCode: 'ORD1',
            amount: 25.5,
            currency: 'USD',
            context: 'dmNotification'
        };

        loaded.helper.reverseAuthorizationOnce(params);
        var second = loaded.helper.reverseAuthorizationOnce(params);

        assert.isFalse(second.reversed);
        assert.isTrue(second.skipped);
        assert.equal(second.reason, 'ALREADY_REVERSED');
        assert.equal(loaded.calls.length, 1, 'the gateway must be called exactly once per authorization');
        assert.equal(order.custom.reversedAuthTransactionIds, 'auth-1', 'the ledger must not grow on a duplicate');
    });

    it('honours a ledger seeded by an earlier delivery in a previous request', function () {
        var loaded = load();
        var order = makeOrder({ reversedAuthTransactionIds: 'auth-0,auth-1' });

        var result = loaded.helper.reverseAuthorizationOnce({
            order: order,
            authTransactionId: 'auth-1',
            amount: 10,
            currency: 'USD'
        });

        assert.isTrue(result.skipped);
        assert.equal(loaded.calls.length, 0);
    });

    it('still reverses a different authorization on the same order', function () {
        var loaded = load();
        var order = makeOrder({ reversedAuthTransactionIds: 'auth-0' });

        loaded.helper.reverseAuthorizationOnce({ order: order, authTransactionId: 'auth-9', amount: 10, currency: 'USD' });

        assert.equal(loaded.calls.length, 1);
        assert.equal(order.custom.reversedAuthTransactionIds, 'auth-0,auth-9');
    });

    it('keeps the claim when the gateway call throws, so a redelivery cannot double-reverse', function () {
        var loaded = load({
            reversalStub: function () { throw new Error('502 Bad Gateway'); }
        });
        var order = makeOrder();

        var result = loaded.helper.reverseAuthorizationOnce({ order: order, authTransactionId: 'auth-1', amount: 10, currency: 'USD' });

        assert.isFalse(result.reversed);
        assert.equal(result.reason, 'GATEWAY_ERROR');
        assert.equal(order.custom.reversedAuthTransactionIds, 'auth-1');
        assert.equal(loaded.calls.length, 1);
    });

    it('reports a missing authorization transaction id instead of calling the gateway', function () {
        var loaded = load();
        var result = loaded.helper.reverseAuthorizationOnce({ order: makeOrder(), amount: 10, currency: 'USD' });

        assert.isFalse(result.reversed);
        assert.equal(result.reason, 'NO_TRANSACTION_ID');
        assert.equal(loaded.calls.length, 0);
    });

    it('falls back to order.orderNo when no referenceCode is supplied', function () {
        var loaded = load();
        loaded.helper.reverseAuthorizationOnce({ order: makeOrder(), authTransactionId: 'auth-1', amount: 10, currency: 'USD' });
        assert.equal(loaded.calls[0].referenceCode, 'ORD1');
    });
});

describe('authReversalHelper.reverseAuthorizationOnce (no order yet - PlaceOrderDirect)', function () {
    var originalSession;

    beforeEach(function () {
        originalSession = global.session;
        global.session = { privacy: {} };
    });

    afterEach(function () {
        global.session = originalSession;
    });

    it('reverses when there is no order and records the auth id in the session ledger', function () {
        var loaded = load();

        var result = loaded.helper.reverseAuthorizationOnce({
            order: null,
            authTransactionId: 'auth-risk-1',
            referenceCode: '00001234',
            amount: '41.99',
            currency: 'usd',
            context: 'PlaceOrderDirect'
        });

        assert.isTrue(result.reversed);
        assert.equal(loaded.calls.length, 1);
        assert.equal(loaded.calls[0].requestId, 'auth-risk-1');
        assert.equal(loaded.calls[0].referenceCode, '00001234');
        assert.equal(global.session.privacy.cybsReversedAuthIds, 'auth-risk-1');
    });

    it('skips a resubmitted completeMandate JWT for the same authorization', function () {
        var loaded = load();
        var params = { order: null, authTransactionId: 'auth-risk-1', referenceCode: '00001234', amount: '41.99', currency: 'USD' };

        loaded.helper.reverseAuthorizationOnce(params);
        var second = loaded.helper.reverseAuthorizationOnce(params);

        assert.isTrue(second.skipped);
        assert.equal(loaded.calls.length, 1);
    });

    it('does not block the reversal when no session is available', function () {
        global.session = undefined;
        var loaded = load();

        var result = loaded.helper.reverseAuthorizationOnce({ order: null, authTransactionId: 'auth-risk-1', amount: 5, currency: 'USD' });

        assert.isTrue(result.reversed);
        assert.equal(loaded.calls.length, 1);
    });
});

describe('authReversalHelper.payloadAlreadyReversed', function () {
    it('detects an embedded reversal on the notification detail object', function () {
        var loaded = load();
        assert.isTrue(loaded.helper.payloadAlreadyReversed({ _embedded: { reversal: { _links: {} } } }));
        assert.isTrue(loaded.helper.payloadAlreadyReversed({ _embedded: { authReversal: { _links: {} } } }));
    });

    it('is false for a detail object with no reversal', function () {
        var loaded = load();
        assert.isFalse(loaded.helper.payloadAlreadyReversed(null));
        assert.isFalse(loaded.helper.payloadAlreadyReversed({}));
        assert.isFalse(loaded.helper.payloadAlreadyReversed({ _embedded: { capture: {} } }));
    });
});
