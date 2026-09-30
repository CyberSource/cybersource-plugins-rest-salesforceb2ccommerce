'use strict';

var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');
var Order = require('dw/order/Order');

var STATUS_AUTHORIZED = 'Authorized';
var STATUS_CAPTURED = 'Captured';
var STATUS_PARTIAL = 'Partially Captured';

/**
 * Present a raw gateway status (e.g. 'AUTHORIZED', 'SETTLE_INITIATED', 'COMPLETED') as the
 * Title Case label shown in BM's "Visa Acceptance Transaction Status" attribute. Kept here so
 * auth-time (CheckoutServices) and webhook-time (this helper / WebhookNotification) writes share
 * one vocabulary — 'AUTHORIZED' normalizes to 'Authorized', matching STATUS_AUTHORIZED, so a later
 * capture/settlement webhook upgrades the value cleanly instead of flipping its casing. Returns ''
 * for an empty status so callers can guard against writing a literal "undefined".
 * @param {string} rawStatus gateway transaction status
 * @returns {string} display label (e.g. 'Authorized', 'Settle Initiated')
 */
function formatTransactionStatus(rawStatus) {
    if (!rawStatus) {
        return '';
    }
    return String(rawStatus).toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\w/g, function (m) {
        return m.toUpperCase();
    });
}

/**
 * Whether the webhook indicates a capture has occurred.
 * payments product: a payments.capture.status.* event IS the signal.
 * DM/FM case-management: the detail object embeds a capture link (_embedded.capture).
 * UC: details.status is CAPTURED or PARTIAL_CAPTURED.
 * @param {string} eventType webhook event type
 * @param {Object} details normalized transaction detail object
 * @returns {boolean} true if a capture happened
 */
function hasCaptureSignal(eventType, details) {
    if (eventType && eventType.indexOf('payments.capture.status') === 0) {
        return true;
    }
    // DM/FM case-management notification embeds a capture link when a capture occurred in EBC.
    if (details && details._embedded && details._embedded.capture) {
        return true;
    }
    var status = details && details.status;
    return status === 'CAPTURED' || status === 'PARTIAL_CAPTURED';
}

/**
 * Round a currency amount to cents (2 dp), ES5-safe. Currency sums must compare at 2-dp
 * precision, otherwise float accumulation drifts just under/over the intended value and a
 * legitimate full capture/refund is misjudged — e.g. capture sums 50 + 50 + 57.99 =
 * 157.98999999998 (stuck "Partially Captured"), or a remaining refundable balance reads
 * 53.379999999999995 and rejects a valid 53.38 refund. Shared by the capture accumulator here
 * and the over-amount caps in the capture/refund http scripts.
 * @param {number} n amount
 * @returns {number} amount rounded to 2 decimals
 */
function round2(n) {
    return Math.round(Number(n) * 100) / 100;
}

/**
 * Parse a comma-separated transaction-id ledger into a trimmed, non-empty array. Shared by the
 * capture ledger (captureTransactionIds) and the refund ledger (refundTransactionIds); both are
 * stored as a comma-separated string (a plain read-append-write value, like AmountPaid) rather
 * than a set-of-string, whose Collection read/write semantics dropped all but the first id in
 * this runtime.
 * @param {string} raw comma-separated id string (may be null/empty)
 * @returns {Array<string>} trimmed, non-empty ids
 */
function parseIdList(raw) {
    var arr = [];
    if (raw) {
        var parts = String(raw).split(',');
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].replace(/^\s+|\s+$/g, '');
            if (p) {
                arr.push(p);
            }
        }
    }
    return arr;
}

/**
 * Read the capture-id ledger as a plain array. The ledger lives on the Order (order.custom),
 * NOT the PaymentTransaction, because BM Orders > Payment renders every populated
 * PaymentTransaction custom attribute and there is no metadata way to hide it there.
 * @param {Object} order dw.order.Order
 * @returns {Array<string>} processed capture transaction ids
 */
function getProcessedIds(order) {
    return parseIdList(order.custom.captureTransactionIds);
}

/**
 * Apply a non-capture outcome (authorization, review, pending, decline): record the ACTUAL
 * gateway status and mark the order NOT_PAID, never downgrading a more-final (PAID/PART_PAID)
 * state. AUTHORIZED — or a missing status on an authorization event — keeps the canonical
 * 'Authorized' label (matches STATUS_AUTHORIZED). Any other status (AUTHORIZED_PENDING_REVIEW,
 * PENDING, DECLINED, ...) is reflected verbatim (normalized) rather than mislabeled as Authorized.
 * @param {Object} order dw.order.Order
 * @param {Object} paymentTransaction PaymentTransaction
 * @param {string} status raw gateway status from the notification
 * @returns {Object} { applied, status }
 */
function applyNonCaptureStatus(order, paymentTransaction, status) {
    var current = order.getPaymentStatus().getValue();
    if (current === Order.PAYMENT_STATUS_PAID || current === Order.PAYMENT_STATUS_PARTPAID) {
        return { applied: false, status: paymentTransaction.custom.cybsTransactionStatus };
    }
    var label = (!status || status === 'AUTHORIZED') ? STATUS_AUTHORIZED : formatTransactionStatus(status);
    Transaction.wrap(function () {
        paymentTransaction.custom.cybsTransactionStatus = label;
        order.setPaymentStatus(Order.PAYMENT_STATUS_NOTPAID);
    });
    return { applied: true, status: label };
}

/**
 * Apply a KNOWN captured amount to the order + payment transaction. Accumulates the captured
 * total, tracks remaining-to-capture, records the capture transaction id (idempotent), sets
 * Captured/PAID or Partially Captured/PART_PAID, and adds an order note. Shared by the webhook
 * flow and the BM capture form so both stay synchronized (neither overwrites the other).
 * @param {Object} order dw.order.Order
 * @param {Object} paymentTransaction PaymentTransaction
 * @param {string} transactionId capture transaction id (used for idempotency + ledger)
 * @param {number} capturedAmount the amount captured by this single capture
 * @param {string} currency currency of the captured amount (optional; verified against the order)
 * @returns {Object} { applied, status }
 */
function applyCapturedAmount(order, paymentTransaction, transactionId, capturedAmount, currency) {
    var processed = getProcessedIds(order);
    if (transactionId && processed.indexOf(transactionId) !== -1) {
        Logger.info('webhookOrderStatusHelper: capture txn {0} already applied; skipping (idempotent).', transactionId);
        return { applied: false, status: paymentTransaction.custom.cybsTransactionStatus };
    }
    if (!capturedAmount) {
        Logger.error('webhookOrderStatusHelper: missing captured amount for txn {0}', transactionId);
        return { applied: false, status: null };
    }

    var orderCurrency = order.getCurrencyCode();
    if (currency && orderCurrency && currency !== orderCurrency) {
        Logger.error('webhookOrderStatusHelper: currency mismatch for txn {0} ({1} vs {2})', transactionId, currency, orderCurrency);
        return { applied: false, status: null };
    }

    var orderTotal = round2(order.getTotalGrossPrice().getValue());
    var outcome = {};
    Transaction.wrap(function () {
        // Ledger totals + capture-id list live on the Order (hidden from BM Orders > Payment);
        // only cybsTransactionStatus stays on the PaymentTransaction (it is the visible
        // "Visa Acceptance Transaction Status" merchants read on the Payment tab).
        var prevPaid = Number(order.custom.AmountPaid) || 0;
        var cumulative = round2(prevPaid + Number(capturedAmount));
        var remaining = round2(orderTotal - cumulative);
        if (remaining < 0) { remaining = 0; }

        order.custom.AmountPaid = cumulative;
        order.custom.remainingToCapture = remaining;

        if (transactionId) {
            processed.push(transactionId);
            order.custom.captureTransactionIds = processed.join(',');
        }

        if (cumulative >= orderTotal) {
            paymentTransaction.custom.cybsTransactionStatus = STATUS_CAPTURED;
            order.setPaymentStatus(Order.PAYMENT_STATUS_PAID);
            outcome.status = STATUS_CAPTURED;
        } else {
            paymentTransaction.custom.cybsTransactionStatus = STATUS_PARTIAL;
            order.setPaymentStatus(Order.PAYMENT_STATUS_PARTPAID);
            outcome.status = STATUS_PARTIAL;
        }

        order.addNote('Capture Processed',
            'Amount: ' + Number(capturedAmount) + ' ' + (orderCurrency || '')
            + ' | Total Captured: ' + cumulative
            + ' | Remaining: ' + remaining
            + ' | Status: ' + outcome.status
            + ' | Capture Transaction ID: ' + (transactionId || ''));
    });
    outcome.applied = true;
    return outcome;
}

/**
 * Apply a capture outcome from the webhook: fetch the real captured amount, then apply it via
 * applyCapturedAmount. Idempotent per capture transaction id; skips the fetch for an already-
 * processed id and ignores missing/currency-mismatched fetches.
 * @param {Object} order dw.order.Order
 * @param {Object} paymentTransaction PaymentTransaction
 * @param {string} transactionId capture transaction id
 * @param {Function} fetchCapturedAmount (id) -> { capturedAmount, currency } | null
 * @returns {Object} { applied, status }
 */
function applyCapture(order, paymentTransaction, transactionId, fetchCapturedAmount) {
    if (transactionId && getProcessedIds(order).indexOf(transactionId) !== -1) {
        return { applied: false, status: paymentTransaction.custom.cybsTransactionStatus };
    }
    var fetched = fetchCapturedAmount ? fetchCapturedAmount(transactionId) : null;
    if (!fetched || !fetched.capturedAmount) {
        Logger.error('webhookOrderStatusHelper: could not fetch captured amount for txn {0}', transactionId);
        return { applied: false, status: null };
    }
    return applyCapturedAmount(order, paymentTransaction, transactionId, fetched.capturedAmount, fetched.currency);
}

/**
 * Map a webhook transaction outcome onto the order + payment transaction.
 * @param {Object} params { eventType, details, transactionId, order, fetchCapturedAmount }
 * @returns {Object} { applied: boolean, status: string|null }
 */
function applyTransactionOutcome(params) {
    var order = params.order;
    var details = params.details || {};
    var CardHelper = require('*/cartridge/scripts/helpers/CardHelper');
    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
    if (!paymentInstrument) {
        Logger.error('webhookOrderStatusHelper: no payment instrument on order {0}', order.orderNo);
        return { applied: false, status: null };
    }
    var paymentTransaction = paymentInstrument.paymentTransaction;

    if (!hasCaptureSignal(params.eventType, details)) {
        return applyNonCaptureStatus(order, paymentTransaction, details.status);
    }
    return applyCapture(order, paymentTransaction, params.transactionId, params.fetchCapturedAmount);
}

/**
 * Normalize the various payload envelopes (UC transactionResult, payments array, flat) to a detail object.
 * @param {Object} payload decrypted webhook payload
 * @returns {Object} detail object (contains status, id, clientReferenceInformation)
 */
function extractDetails(payload) {
    if (payload.payload && payload.payload.transactionResult) {
        return payload.payload.transactionResult.details;
    }
    if (payload.payload && payload.payload.length) {
        return payload.payload[0].data;
    }
    return payload;
}

/**
 * Extract the event type from either the top-level or the first payload entry.
 * @param {Object} payload decrypted webhook payload
 * @returns {string|null} event type
 */
function extractEventType(payload) {
    return payload.eventType || (payload.payload && payload.payload[0] ? payload.payload[0].eventType : null);
}

/**
 * End-to-end webhook handling: extract ids, look up the order, apply the outcome.
 * Does NOT do HTTP/signature/MLE/staging — that stays in the controller.
 * @param {Object} payload decrypted webhook payload
 * @param {Function} fetchCapturedAmount captured-amount fetcher (transactionDetails.getCapturedAmount)
 * @returns {Object} { orderFound, orderId, applied?, status? }
 */
function handleWebhook(payload, fetchCapturedAmount) {
    var details = extractDetails(payload);
    var orderId = details && details.clientReferenceInformation ? details.clientReferenceInformation.code : null;
    if (!orderId) {
        throw new Error('Missing Order ID');
    }
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderId);
    if (!order) {
        return { orderFound: false, orderId: orderId };
    }
    var outcome = applyTransactionOutcome({
        eventType: extractEventType(payload),
        details: details,
        transactionId: details && details.id ? details.id : null,
        order: order,
        fetchCapturedAmount: fetchCapturedAmount
    });
    return { orderFound: true, orderId: orderId, applied: outcome.applied, status: outcome.status };
}

module.exports = {
    hasCaptureSignal: hasCaptureSignal,
    applyTransactionOutcome: applyTransactionOutcome,
    applyCapturedAmount: applyCapturedAmount,
    handleWebhook: handleWebhook,
    formatTransactionStatus: formatTransactionStatus,
    parseIdList: parseIdList,
    round2: round2
};
