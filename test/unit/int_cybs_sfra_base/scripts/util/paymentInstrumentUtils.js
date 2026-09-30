'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Real CSV-ledger parser, matching webhookOrderStatusHelper.parseIdList, so the refund tests
 * exercise the actual append/idempotency logic rather than a hollow stub.
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
 * Load paymentInstrumentUtils with Transaction and the shared status helper stubbed.
 * @param {Function} applyStub stub for webhookOrderStatusHelper.applyCapturedAmount
 * @returns {Object} module exports
 */
function load(applyStub) {
    return proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/util/paymentInstrumentUtils', {
        'dw/system/Transaction': { wrap: function (fn) { return fn(); } },
        '*/cartridge/scripts/helpers/webhookOrderStatusHelper': {
            applyCapturedAmount: applyStub,
            parseIdList: parseIdList,
            round2: function (n) { return Math.round(Number(n) * 100) / 100; }
        }
    });
}

/**
 * Build a stub order that records notes and paymentStatus writes. The capture/refund ledger
 * lives on order.custom (hidden from BM Orders > Payment), so tests seed it via customSeed.
 * @param {Object} customSeed initial order.custom values (AmountPaid, refundedAmount, ...)
 * @returns {Object} order stub with a `notes` array and a `custom` bag
 */
function makeOrder(customSeed) {
    return {
        currencyCode: 'USD',
        paymentStatus: 1,
        notes: [],
        custom: customSeed || {},
        addNote: function (subject, body) { this.notes.push({ subject: subject, body: body }); }
    };
}

describe('paymentInstrumentUtils.UpdatePaymentTransactionCardCapture (BM form flow)', function () {
    it('prefers the KNOWN captured amount/currency passed by the caller over the response', function () {
        var call = null;
        var util = load(function (order, paymentTransaction, txnId, amount, currency) {
            call = { txnId: txnId, amount: amount, currency: currency };
        });
        var pi = { paymentTransaction: { custom: {} } };
        var order = { orderNo: 'ORD1' };
        // Response intentionally omits amountDetails (CyberSource may not echo it).
        var response = { status: 'PENDING', id: 'cap-9' };

        util.UpdatePaymentTransactionCardCapture(pi, order, response, 60, 'USD');

        assert.equal(call.txnId, 'cap-9');
        assert.equal(call.amount, 60);
        assert.equal(call.currency, 'USD');
    });

    it('falls back to the response amountDetails when no amount is passed', function () {
        var call = null;
        var util = load(function (order, paymentTransaction, txnId, amount, currency) {
            call = { txnId: txnId, amount: amount, currency: currency };
        });
        var pi = { paymentTransaction: { custom: {} } };
        var order = { orderNo: 'ORD1' };
        var response = { status: 'PENDING', id: 'cap-9', orderInformation: { amountDetails: { totalAmount: '40.00', currency: 'USD' } } };

        util.UpdatePaymentTransactionCardCapture(pi, order, response);

        assert.equal(call.amount, 40); // Number('40.00')
        assert.equal(call.currency, 'USD');
    });

    it('does nothing when the capture status is not PENDING', function () {
        var called = false;
        var util = load(function () { called = true; });
        util.UpdatePaymentTransactionCardCapture({ paymentTransaction: { custom: {} } }, { orderNo: 'X' }, { status: 'DECLINED' });
        assert.isFalse(called);
    });
});

describe('paymentInstrumentUtils.UpdatePaymentTransactionRefund', function () {
    it('records a partial refund: appends the txn id, accumulates amount, sets Partially Refunded', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder({ AmountPaid: 100 });

        util.UpdatePaymentTransactionRefund(pi, order, { status: 'PENDING', id: 'ref-1', refundAmountDetails: { refundAmount: '40' } });

        var ledger = order.custom;
        assert.equal(ledger.refundedAmount, 40);
        assert.equal(ledger.remainingRefundable, 60);
        assert.equal(ledger.refundTransactionIds, 'ref-1');
        assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, 'Partially Refunded');
        assert.equal(order.paymentStatus, 1, 'partial refund must not zero the payment status');
        assert.equal(order.notes[0].subject, 'Refund Processed');
        assert.include(order.notes[0].body, 'Refund Transaction ID: ref-1');
    });

    it('records a full refund: sets Refunded and zeroes paymentStatus', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder({ AmountPaid: 100, refundedAmount: 60, remainingRefundable: 40, refundTransactionIds: 'ref-1' });

        util.UpdatePaymentTransactionRefund(pi, order, { status: 'PENDING', id: 'ref-2', refundAmountDetails: { refundAmount: '40' } });

        var ledger = order.custom;
        assert.equal(ledger.refundedAmount, 100);
        assert.equal(ledger.remainingRefundable, 0);
        assert.equal(ledger.refundTransactionIds, 'ref-1,ref-2');
        assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, 'Refunded');
        assert.equal(order.paymentStatus, 0);
    });

    it('is idempotent: a replayed refund id does not double-count or re-append', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: { cybsTransactionStatus: 'Partially Refunded' } } };
        var order = makeOrder({ AmountPaid: 100, refundedAmount: 40, remainingRefundable: 60, refundTransactionIds: 'ref-1' });

        util.UpdatePaymentTransactionRefund(pi, order, { status: 'PENDING', id: 'ref-1', refundAmountDetails: { refundAmount: '40' } });

        var ledger = order.custom;
        assert.equal(ledger.refundedAmount, 40, 'must not double-count');
        assert.equal(ledger.refundTransactionIds, 'ref-1');
        assert.equal(order.notes.length, 0, 'no note for a replayed refund');
    });

    it('rounds float-drifted accumulation so a fully-refunded order reads Refunded, not Partially Refunded (bug repro)', function () {
        var util = load(function () {});
        // Prior partial refunds (59.01 + 60) drifted refundedAmount to 119.00999999999999.
        // This 38.98 refund completes the 157.99 captured total; without rounding, the sum is
        // 157.98999999999998 (< 157.99) and the order would stay Partially Refunded.
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder({ AmountPaid: 157.99, refundedAmount: 119.00999999999999, refundTransactionIds: 'ref-1,ref-2' });

        util.UpdatePaymentTransactionRefund(pi, order, { status: 'PENDING', id: 'ref-3', refundAmountDetails: { refundAmount: '38.98' } });

        var ledger = order.custom;
        assert.equal(ledger.refundedAmount, 157.99);
        assert.equal(ledger.remainingRefundable, 0);
        assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, 'Refunded');
        assert.equal(order.paymentStatus, 0);
        // Note carries clean cents values, not float noise.
        assert.include(order.notes[0].body, 'Total Refunded: 157.99');
        assert.include(order.notes[0].body, 'Remaining: 0');
        assert.include(order.notes[0].body, 'Amount: 38.98');
    });

    it('does nothing when the refund status is not PENDING', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();
        util.UpdatePaymentTransactionRefund(pi, order, { status: 'DECLINED', id: 'ref-x', refundAmountDetails: { refundAmount: '10' } });
        assert.isUndefined(order.custom.refundedAmount);
        assert.isUndefined(pi.paymentTransaction.custom.cybsTransactionStatus);
    });
});

describe('paymentInstrumentUtils.UpdatePaymentTransactionCardauthReversal', function () {
    it('records a full auth reversal: sets Reversed, records the reversal id, marks NOT_PAID, and adds a note', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();

        util.UpdatePaymentTransactionCardauthReversal(pi, order, { status: 'REVERSED', id: 'rev-1' }, 138, 'USD');

        assert.equal(order.custom.reversalTransactionIds, 'rev-1', 'reversal id ledger lives on order.custom');
        assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, 'Reversed');
        assert.equal(order.paymentStatus, 0);
        assert.equal(order.notes[0].subject, 'Auth Reversal Processed');
        assert.include(order.notes[0].body, 'Amount: 138 USD');
        assert.include(order.notes[0].body, 'Status: Reversed');
        assert.include(order.notes[0].body, 'Reversal Transaction ID: rev-1');
    });

    it('is idempotent: a replayed reversal id does not add a duplicate note or id', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: { cybsTransactionStatus: 'Reversed' } } };
        var order = makeOrder({ reversalTransactionIds: 'rev-1' });

        util.UpdatePaymentTransactionCardauthReversal(pi, order, { status: 'REVERSED', id: 'rev-1' }, 138, 'USD');

        assert.equal(order.custom.reversalTransactionIds, 'rev-1', 'must not re-append');
        assert.equal(order.notes.length, 0, 'no note for a replayed reversal');
    });

    it('falls back to the response amountDetails when no amount is passed', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();

        util.UpdatePaymentTransactionCardauthReversal(pi, order,
            { status: 'REVERSED', id: 'rev-2', reversalAmountDetails: { totalAmount: '55.00', currency: 'USD' } });

        assert.include(order.notes[0].body, 'Amount: 55 USD');
    });

    it('does nothing when the reversal status is not REVERSED', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();

        util.UpdatePaymentTransactionCardauthReversal(pi, order, { status: 'DECLINED', id: 'rev-x' }, 138, 'USD');

        assert.isUndefined(order.custom.reversalTransactionIds);
        assert.isUndefined(pi.paymentTransaction.custom.cybsTransactionStatus);
        assert.equal(order.notes.length, 0);
    });
});

describe('paymentInstrumentUtils.RecordRefundFailure', function () {
    it('sets Refund Failed and adds a note when there is no prior successful refund', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();

        util.RecordRefundFailure(pi, order, 'gateway error');

        assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, 'Refund Failed');
        assert.equal(order.notes[0].subject, 'Refund Failed');
        assert.equal(order.notes[0].body, 'gateway error');
    });

    it('does not overwrite a successful refund status (Partially Refunded / Refunded)', function () {
        var util = load(function () {});
        ['Partially Refunded', 'Refunded'].forEach(function (status) {
            var pi = { paymentTransaction: { custom: { cybsTransactionStatus: status } } };
            var order = makeOrder();
            util.RecordRefundFailure(pi, order, 'later failure');
            assert.equal(pi.paymentTransaction.custom.cybsTransactionStatus, status);
            assert.equal(order.notes[0].subject, 'Refund Failed', 'note still recorded');
        });
    });

    it('defaults the note body to "Unknown error" when no message is given', function () {
        var util = load(function () {});
        var pi = { paymentTransaction: { custom: {} } };
        var order = makeOrder();
        util.RecordRefundFailure(pi, order, '');
        assert.equal(order.notes[0].body, 'Unknown error');
    });
});
