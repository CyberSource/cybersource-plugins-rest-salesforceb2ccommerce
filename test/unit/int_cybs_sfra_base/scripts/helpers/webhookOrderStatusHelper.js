'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var Order = {
    PAYMENT_STATUS_NOTPAID: 0,
    PAYMENT_STATUS_PAID: 1,
    PAYMENT_STATUS_PARTPAID: 2
};

/**
 * Build a fake order whose paymentStatus/AmountPaid/cybsTransactionStatus are observable.
 * @param {Object} opts { total, currency, paymentStatus, amountPaid, capturedIds }
 * @returns {Object} fake order + its payment transaction
 */
function makeOrder(opts) {
    opts = opts || {};
    // cybsTransactionStatus stays on the payment transaction (visible on BM Payment tab);
    // the capture/refund ledger lives on order.custom (hidden from the Payment tab).
    var txn = {
        custom: {
            cybsTransactionStatus: opts.cybsTransactionStatus || null
        }
    };
    return {
        orderNo: 'ORD1',
        custom: {
            AmountPaid: opts.amountPaid || 0,
            captureTransactionIds: opts.capturedIds || null,
            remainingToCapture: null
        },
        _paymentStatus: opts.paymentStatus || 0,
        notes: [],
        paymentInstrument: { paymentTransaction: txn },
        getPaymentStatus: function () { var v = this._paymentStatus; return { getValue: function () { return v; } }; },
        setPaymentStatus: function (s) { this._paymentStatus = s; },
        getCurrencyCode: function () { return opts.currency || 'USD'; },
        getTotalGrossPrice: function () { var t = opts.total || 100; return { getValue: function () { return t; } }; },
        addNote: function (title, msg) { this.notes.push({ title: title, msg: msg }); },
        _txn: txn
    };
}

/**
 * Capture-amount fetch stub returning a fixed amount/currency.
 * @param {number} amount captured amount
 * @param {string} currency currency code
 * @returns {Function} fetchCapturedAmount(transactionId)
 */
function fetchStub(amount, currency) {
    return function () { return { capturedAmount: amount, currency: currency || 'USD' }; };
}

/**
 * Load the helper. orderById maps orderNo -> fake order (or undefined => not found).
 * @param {Object} orderById lookup table for OrderMgr.getOrder
 * @returns {Object} module exports
 */
function load(orderById) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/webhookOrderStatusHelper', {
        'dw/system/Logger': { error: function () {}, info: function () {} },
        'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
        'dw/order/Order': Order,
        'dw/order/OrderMgr': { getOrder: function (id) { return (orderById || {})[id] || null; } },
        '*/cartridge/scripts/helpers/CardHelper': {
            getNonGCPaymemtInstument: function (order) { return order.paymentInstrument; }
        }
    });
}

describe('webhookOrderStatusHelper.applyTransactionOutcome', function () {
    it('AUTHORIZED with no capture signal sets Authorized + NOT_PAID', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.authorization.status.accepted',
            details: { status: 'AUTHORIZED' },
            transactionId: 'auth-1',
            order: order
        });
        assert.equal(out.status, 'Authorized');
        assert.equal(order._txn.custom.cybsTransactionStatus, 'Authorized');
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_NOTPAID);
    });

    it('UC AUTHORIZED_PENDING_REVIEW reflects the review status, not Authorized', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'uc.orders.transactionresults',
            details: { status: 'AUTHORIZED_PENDING_REVIEW' },
            transactionId: 'uc-1',
            order: order
        });
        assert.equal(out.status, 'Authorized Pending Review');
        assert.equal(order._txn.custom.cybsTransactionStatus, 'Authorized Pending Review');
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_NOTPAID);
    });

    it('UC DECLINED reflects the declined status, not Authorized', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'uc.orders.transactionresults',
            details: { status: 'DECLINED' },
            transactionId: 'uc-1',
            order: order
        });
        assert.equal(out.status, 'Declined');
        assert.equal(order._txn.custom.cybsTransactionStatus, 'Declined');
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_NOTPAID);
    });

    it('does not downgrade an already-PAID order on a late AUTHORIZED event', function () {
        var helper = load();
        var order = makeOrder({ total: 100, paymentStatus: Order.PAYMENT_STATUS_PAID, cybsTransactionStatus: 'Captured' });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.authorization.status.accepted',
            details: { status: 'AUTHORIZED' },
            transactionId: 'auth-1',
            order: order
        });
        assert.isFalse(out.applied);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
        assert.equal(order._txn.custom.cybsTransactionStatus, 'Captured');
    });

    it('full capture (>= total) sets Captured + PAID with fetched amount', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.capture.status.accepted',
            details: { status: 'PENDING' },
            transactionId: 'cap-1',
            order: order,
            fetchCapturedAmount: fetchStub(100, 'USD')
        });
        assert.equal(out.status, 'Captured');
        assert.equal(order.custom.AmountPaid, 100);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
    });

    it('partial capture (< total) sets Partially Captured + PART_PAID', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.capture.status.accepted',
            details: { status: 'PENDING' },
            transactionId: 'cap-1',
            order: order,
            fetchCapturedAmount: fetchStub(40, 'USD')
        });
        assert.equal(out.status, 'Partially Captured');
        assert.equal(order.custom.AmountPaid, 40);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PARTPAID);
    });

    it('accumulates multiple partial captures and flips to PAID when total is reached', function () {
        var helper = load();
        var order = makeOrder({ total: 100, amountPaid: 40, capturedIds: 'cap-1' });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.capture.status.accepted',
            details: { status: 'PENDING' },
            transactionId: 'cap-2',
            order: order,
            fetchCapturedAmount: fetchStub(60, 'USD')
        });
        assert.equal(out.status, 'Captured');
        assert.equal(order.custom.AmountPaid, 100);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
    });

    it('is idempotent: a duplicate capture transaction id is not re-applied', function () {
        var helper = load();
        var order = makeOrder({ total: 100, amountPaid: 40, capturedIds: 'cap-1' });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.capture.status.accepted',
            details: { status: 'PENDING' },
            transactionId: 'cap-1',
            order: order,
            fetchCapturedAmount: fetchStub(40, 'USD')
        });
        assert.isFalse(out.applied);
        assert.equal(order.custom.AmountPaid, 40);
    });

    it('treats a currency mismatch as undeterminable (no status change)', function () {
        var helper = load();
        var order = makeOrder({ total: 100, currency: 'USD' });
        var out = helper.applyTransactionOutcome({
            eventType: 'payments.capture.status.accepted',
            details: { status: 'PENDING' },
            transactionId: 'cap-1',
            order: order,
            fetchCapturedAmount: fetchStub(100, 'EUR')
        });
        assert.isFalse(out.applied);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_NOTPAID);
    });

    it('UC CAPTURED status is a capture signal even without a payments.capture event', function () {
        var helper = load();
        var order = makeOrder({ total: 50 });
        var out = helper.applyTransactionOutcome({
            eventType: 'uc.orders.transactionresults',
            details: { status: 'CAPTURED' },
            transactionId: 'uc-1',
            order: order,
            fetchCapturedAmount: fetchStub(50, 'USD')
        });
        assert.equal(out.status, 'Captured');
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
    });

    it('DM/FM _embedded.capture is a capture signal (case-management accept)', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'risk.casemanagement.decision.accept',
            details: { _embedded: { capture: { status: 'PENDING' } } },
            transactionId: '7816113601776026104501',
            order: order,
            fetchCapturedAmount: fetchStub(100, 'USD')
        });
        assert.equal(out.status, 'Captured');
        assert.equal(order.custom.AmountPaid, 100);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
    });

    it('DM/FM _embedded.capture with partial amount sets Partially Captured', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyTransactionOutcome({
            eventType: 'risk.casemanagement.decision.accept',
            details: { _embedded: { capture: { status: 'PENDING' } } },
            transactionId: '7816113601776026104501',
            order: order,
            fetchCapturedAmount: fetchStub(60, 'USD')
        });
        assert.equal(out.status, 'Partially Captured');
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PARTPAID);
    });
});

describe('webhookOrderStatusHelper.applyCapturedAmount (shared by webhook + BM form)', function () {
    var pt = function (order) { return order.paymentInstrument.paymentTransaction; };

    it('partial capture sets cumulative AmountPaid, remainingToCapture, PART_PAID, and an order note', function () {
        var helper = load();
        var order = makeOrder({ total: 100 });
        var out = helper.applyCapturedAmount(order, pt(order), 'cap-1', 40, 'USD');
        assert.equal(out.status, 'Partially Captured');
        assert.equal(order.custom.AmountPaid, 40);
        assert.equal(order.custom.remainingToCapture, 60);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PARTPAID);
        assert.equal(order.custom.captureTransactionIds, 'cap-1');
        assert.equal(order.notes.length, 1);
        assert.include(order.notes[0].msg, 'Remaining: 60');
        assert.include(order.notes[0].msg, 'Capture Transaction ID: cap-1');
    });

    it('does not overwrite a prior capture: a second form capture accumulates and flips to PAID', function () {
        var helper = load();
        // Simulates: webhook already captured 40 (recorded cap-1); merchant then captures 60 via the form.
        var order = makeOrder({ total: 100, amountPaid: 40, capturedIds: 'cap-1' });
        var out = helper.applyCapturedAmount(order, pt(order), 'cap-2', 60, 'USD');
        assert.equal(out.status, 'Captured');
        assert.equal(order.custom.AmountPaid, 100);
        assert.equal(order.custom.remainingToCapture, 0);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
        assert.equal(order.custom.captureTransactionIds, 'cap-1,cap-2');
    });

    it('reaches Captured/PAID when partial captures sum to the total despite float error (50 + 50 + 57.99 = 157.99)', function () {
        var helper = load();
        var order = makeOrder({ total: 157.99, amountPaid: 100, capturedIds: 'cap-1,cap-2' });
        var out = helper.applyCapturedAmount(order, pt(order), 'cap-3', 57.99, 'USD');
        assert.equal(out.status, 'Captured');
        assert.equal(order.custom.AmountPaid, 157.99);
        assert.equal(order.custom.remainingToCapture, 0);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_PAID);
        assert.equal(order.custom.captureTransactionIds, 'cap-1,cap-2,cap-3');
    });

    it('is idempotent: re-applying the same capture id is a no-op', function () {
        var helper = load();
        var order = makeOrder({ total: 100, amountPaid: 40, capturedIds: 'cap-1' });
        var out = helper.applyCapturedAmount(order, pt(order), 'cap-1', 40, 'USD');
        assert.isFalse(out.applied);
        assert.equal(order.custom.AmountPaid, 40);
    });

    it('rejects a currency mismatch without mutating state', function () {
        var helper = load();
        var order = makeOrder({ total: 100, currency: 'USD' });
        var out = helper.applyCapturedAmount(order, pt(order), 'cap-1', 100, 'EUR');
        assert.isFalse(out.applied);
        assert.equal(order._paymentStatus, Order.PAYMENT_STATUS_NOTPAID);
    });
});

describe('webhookOrderStatusHelper.formatTransactionStatus', function () {
    it('normalizes AUTHORIZED to the Authorized label the auth/capture path writes', function () {
        var helper = load();
        assert.equal(helper.formatTransactionStatus('AUTHORIZED'), 'Authorized');
    });

    it('title-cases multi-word underscore statuses', function () {
        var helper = load();
        assert.equal(helper.formatTransactionStatus('SETTLE_INITIATED'), 'Settle Initiated');
        assert.equal(helper.formatTransactionStatus('AUTHORIZED_PENDING_REVIEW'), 'Authorized Pending Review');
    });

    it('normalizes APM terminal statuses', function () {
        var helper = load();
        assert.equal(helper.formatTransactionStatus('COMPLETED'), 'Completed');
        assert.equal(helper.formatTransactionStatus('DECLINED'), 'Declined');
    });

    it('returns empty string for an absent status (no literal "undefined")', function () {
        var helper = load();
        assert.equal(helper.formatTransactionStatus(undefined), '');
        assert.equal(helper.formatTransactionStatus(null), '');
        assert.equal(helper.formatTransactionStatus(''), '');
    });
});

describe('webhookOrderStatusHelper.handleWebhook', function () {
    it('extracts orderId from a payments-style payload and applies the outcome', function () {
        var order = makeOrder({ total: 100 });
        var helper = load({ ORD1: order });
        var payload = {
            eventType: 'payments.authorization.status.accepted',
            payload: [{ eventType: 'payments.authorization.status.accepted', data: { status: 'AUTHORIZED', id: 'auth-1', clientReferenceInformation: { code: 'ORD1' } } }]
        };
        var res = helper.handleWebhook(payload, fetchStub(0, 'USD'));
        assert.isTrue(res.orderFound);
        assert.equal(res.orderId, 'ORD1');
        assert.equal(res.status, 'Authorized');
    });

    it('returns orderFound=false when the order does not exist', function () {
        var helper = load({});
        var payload = { eventType: 'payments.capture.status.accepted', payload: [{ data: { status: 'PENDING', id: 'cap-1', clientReferenceInformation: { code: 'MISSING' } } }] };
        var res = helper.handleWebhook(payload, fetchStub(100, 'USD'));
        assert.isFalse(res.orderFound);
        assert.equal(res.orderId, 'MISSING');
    });

    it('throws when no order id is present', function () {
        var helper = load({});
        assert.throws(function () {
            helper.handleWebhook({ eventType: 'x', payload: [{ data: { status: 'AUTHORIZED' } }] }, fetchStub(0));
        }, 'Missing Order ID');
    });
});

describe('webhookOrderStatusHelper.round2', function () {
    it('rounds to 2 decimals', function () {
        var helper = load({});
        assert.equal(helper.round2(53.38), 53.38);
        assert.equal(helper.round2(1.005 * 100 / 100), 1);
        assert.equal(helper.round2(0), 0);
    });

    it('collapses float-accumulation drift so a full-remaining refund is not rejected (bug repro)', function () {
        var helper = load({});
        // capturedTotal - refundedAmount drifted to 53.379999999999995; the raw value wrongly
        // failed `53.38 > remaining`. Rounded, both sides equal 53.38 and the refund is allowed.
        var driftedRemaining = 53.379999999999995;
        assert.equal(helper.round2(driftedRemaining), 53.38);
        assert.isFalse(helper.round2(53.38) > helper.round2(driftedRemaining));
    });

    it('coerces a Java-backed (typeof object) numeric value via Number()', function () {
        var helper = load({});
        assert.equal(helper.round2({ valueOf: function () { return 10.001; } }), 10);
    });
});

describe('webhookOrderStatusHelper.parseIdList', function () {
    it('returns an empty array for null/empty input', function () {
        var helper = load({});
        assert.deepEqual(helper.parseIdList(null), []);
        assert.deepEqual(helper.parseIdList(''), []);
    });

    it('splits, trims, and drops empty entries', function () {
        var helper = load({});
        assert.deepEqual(helper.parseIdList(' a , b ,,c '), ['a', 'b', 'c']);
    });

    it('coerces a non-string (Java-backed) value via String()', function () {
        var helper = load({});
        assert.deepEqual(helper.parseIdList({ toString: function () { return 'x,y'; } }), ['x', 'y']);
    });
});
