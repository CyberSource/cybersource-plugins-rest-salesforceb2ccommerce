'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Sentinel status values — the job only compares them for equality, so any distinct
// values work as long as the stub and the fake orders use the same ones.
var ORDER_STATUS_CREATED = 'CREATED';
var ORDER_STATUS_OPEN = 'OPEN';
var CONFIRMATION_STATUS_CONFIRMED = 'CONFIRMED';

/**
 * Build a fake order.
 * @param {string} statusValue value returned by getStatus().getValue()
 * @returns {Object} fake order recording confirmation status / cancel description
 */
function makeOrder(statusValue) {
    var o = {
        statusValue: statusValue,
        confirmationStatus: null,
        cancelDescription: null
    };
    o.getStatus = function () { return { getValue: function () { return o.statusValue; } }; };
    o.setConfirmationStatus = function (v) { o.confirmationStatus = v; };
    o.setCancelDescription = function (v) { o.cancelDescription = v; };
    return o;
}

/**
 * Build a fake PaymentTransaction.
 * @param {string} transactionId transaction id to return from getTransactionID
 * @returns {Object} fake transaction
 */
function makeTxn(transactionId) {
    return {
        custom: {},
        getTransactionID: function () { return transactionId; }
    };
}

/**
 * Load the job module with all SFCC + cartridge dependencies stubbed.
 * @param {Object} cfg { order, txn, refreshedStatus, placeError, calls }
 * @returns {Object} module exports
 */
function load(cfg) {
    var calls = cfg.calls;

    function FakeStatus(code, msg, detail) {
        this.code = code;
        this.msg = msg;
        this.detail = detail;
    }
    FakeStatus.OK = 'OK';

    var OrderMgr = {
        getOrder: function (orderNo) {
            return Object.prototype.hasOwnProperty.call(cfg.orders, orderNo) ? cfg.orders[orderNo] : null;
        },
        placeOrder: function () {
            calls.placeOrder++;
            return { isError: function () { return !!cfg.placeError; } };
        },
        failOrder: function () {
            calls.failOrder++;
            return new FakeStatus(FakeStatus.OK);
        }
    };

    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/jobs/RefreshPaymentStatus', {
        'dw/system/Logger': { getLogger: function () { return { info: function () {}, warn: function () {}, error: function () {} }; } },
        'dw/order/Order': {
            ORDER_STATUS_CREATED: ORDER_STATUS_CREATED,
            CONFIRMATION_STATUS_CONFIRMED: CONFIRMATION_STATUS_CONFIRMED
        },
        'dw/order/OrderMgr': OrderMgr,
        'dw/system/Status': FakeStatus,
        'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
        '*/cartridge/scripts/helpers/CardHelper': {
            getNonGCPaymemtInstument: function (order) {
                return order && order.txn ? { paymentTransaction: order.txn } : null;
            }
        },
        '*/cartridge/scripts/http/refreshPaymentStatus': {
            getRefreshedStatus: function () {
                calls.refresh++;
                return cfg.refreshed;
            }
        },
        '*/cartridge/scripts/helpers/webhookOrderStatusHelper': {
            // simplistic Title Case echo — enough to assert the attribute is written
            formatTransactionStatus: function (raw) { return raw ? 'FMT:' + raw : ''; }
        }
    });
}

/**
 * Convenience: build cfg with a single order that has a payment transaction.
 * @param {string} orderStatus order status value
 * @param {string} txnId transaction id
 * @param {Object} refreshed { status } returned by the http wrapper
 * @param {boolean} placeError whether placeOrder reports an error
 * @returns {Object} cfg + call counters
 */
function singleOrderCfg(orderStatus, txnId, refreshed, placeError) {
    var order = makeOrder(orderStatus);
    order.txn = makeTxn(txnId);
    return {
        orders: { '00001234': order },
        order: order,
        refreshed: refreshed,
        placeError: placeError,
        calls: { placeOrder: 0, failOrder: 0, refresh: 0 }
    };
}

var jobParams = { OrderNumbers: '00001234' };

describe('RefreshPaymentStatus.parseOrderNumbers', function () {
    var mod = load(singleOrderCfg(ORDER_STATUS_CREATED, 'txn', { status: 'PENDING' }));

    it('splits, trims and de-duplicates', function () {
        assert.deepEqual(mod.parseOrderNumbers(' 1 , 2 ,2, 3 '), ['1', '2', '3']);
    });
    it('returns [] for empty / falsy input', function () {
        assert.deepEqual(mod.parseOrderNumbers(''), []);
        assert.deepEqual(mod.parseOrderNumbers(null), []);
    });
});

describe('RefreshPaymentStatus.decideAction', function () {
    var mod = load(singleOrderCfg(ORDER_STATUS_CREATED, 'txn', { status: 'PENDING' }));

    it('maps COMPLETED/SETTLED to PLACE (case-insensitive)', function () {
        assert.equal(mod.decideAction('COMPLETED'), 'PLACE');
        assert.equal(mod.decideAction('settled'), 'PLACE');
    });
    it('maps DECLINED/REVERSED/FAILED/CANCELLED/VOIDED to FAIL', function () {
        ['DECLINED', 'REVERSED', 'FAILED', 'CANCELLED', 'VOIDED'].forEach(function (s) {
            assert.equal(mod.decideAction(s), 'FAIL');
        });
    });
    it('maps PENDING / INVALID_REQUEST / unknown / empty to NONE', function () {
        assert.equal(mod.decideAction('PENDING'), 'NONE');
        assert.equal(mod.decideAction('INVALID_REQUEST'), 'NONE');
        assert.equal(mod.decideAction('WHATEVER'), 'NONE');
        assert.equal(mod.decideAction(''), 'NONE');
    });
});

describe('RefreshPaymentStatus.refreshOrders', function () {
    it('COMPLETED on a CREATED order places + confirms it and writes the attribute', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'COMPLETED' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.placeOrder, 1);
        assert.equal(cfg.calls.failOrder, 0);
        assert.equal(cfg.order.confirmationStatus, CONFIRMATION_STATUS_CONFIRMED);
        assert.equal(cfg.order.txn.custom.cybsTransactionStatus, 'FMT:COMPLETED');
        assert.isString(cfg.order.txn.custom.resultTimestamp);
    });

    it('DECLINED on a CREATED order fails it and sets a cancel description', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'DECLINED' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.failOrder, 1);
        assert.equal(cfg.calls.placeOrder, 0);
        assert.include(cfg.order.cancelDescription, 'DECLINED');
        assert.equal(cfg.order.txn.custom.cybsTransactionStatus, 'FMT:DECLINED');
    });

    it('COMPLETED on an already-placed (non-CREATED) order updates attribute only, no re-place', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_OPEN, 'txn-1', { status: 'COMPLETED' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.placeOrder, 0);
        assert.equal(cfg.calls.failOrder, 0);
        assert.equal(cfg.order.txn.custom.cybsTransactionStatus, 'FMT:COMPLETED');
    });

    it('does not overwrite a refund label (Refunded / Partially Refunded / Refund Failed)', function () {
        ['Refunded', 'Partially Refunded', 'Refund Failed'].forEach(function (refundLabel) {
            var cfg = singleOrderCfg(ORDER_STATUS_OPEN, 'txn-r', { status: 'COMPLETED' });
            cfg.order.txn.custom.cybsTransactionStatus = refundLabel;
            var mod = load(cfg);
            mod.refreshOrders(jobParams);
            assert.equal(cfg.order.txn.custom.cybsTransactionStatus, refundLabel,
                'refund label must be preserved by the refresh job');
            assert.isNotNull(cfg.order.txn.custom.resultTimestamp, 'timestamp still refreshed');
        });
    });

    it('PENDING never changes order state, only the attribute', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'PENDING' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.placeOrder, 0);
        assert.equal(cfg.calls.failOrder, 0);
        assert.equal(cfg.order.txn.custom.cybsTransactionStatus, 'FMT:PENDING');
    });

    it('inconclusive error reason (FAILED + INTERNAL_ERROR) leaves status and order untouched (the TINK case)', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'FAILED', reason: 'INTERNAL_ERROR' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.placeOrder, 0);
        assert.equal(cfg.calls.failOrder, 0);
        // status attribute must NOT be overwritten
        assert.isUndefined(cfg.order.txn.custom.cybsTransactionStatus);
    });

    it('genuine FAILED with no error reason still fails a CREATED order', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'FAILED', reason: null });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.failOrder, 1);
        assert.equal(cfg.order.txn.custom.cybsTransactionStatus, 'FMT:FAILED');
    });

    it('placeOrder error path fails the order', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'COMPLETED' }, true);
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.placeOrder, 1);
        assert.equal(cfg.calls.failOrder, 1);
    });

    it('skips an unknown order without calling the API or throwing', function () {
        var cfg = { orders: {}, refreshed: { status: 'COMPLETED' }, calls: { placeOrder: 0, failOrder: 0, refresh: 0 } };
        var mod = load(cfg);
        assert.doesNotThrow(function () { mod.refreshOrders(jobParams); });
        assert.equal(cfg.calls.refresh, 0);
    });

    it('skips an order whose transaction has no transaction id', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, null, { status: 'COMPLETED' });
        var mod = load(cfg);
        mod.refreshOrders(jobParams);
        assert.equal(cfg.calls.refresh, 0);
        assert.equal(cfg.calls.placeOrder, 0);
    });

    it('does nothing when no order numbers are supplied', function () {
        var cfg = singleOrderCfg(ORDER_STATUS_CREATED, 'txn-1', { status: 'COMPLETED' });
        var mod = load(cfg);
        mod.refreshOrders({ OrderNumbers: '' });
        assert.equal(cfg.calls.refresh, 0);
    });
});
