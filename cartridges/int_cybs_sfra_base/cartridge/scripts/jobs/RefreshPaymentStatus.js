/* eslint-disable no-plusplus */
'use strict';

/**
 * On-demand job: refresh the Visa Acceptance payment status for a merchant-supplied
 * list of orders and reflect the result in Business Manager.
 *
 * The merchant enters a comma-separated list of order numbers in the "OrderNumbers"
 * step parameter and runs the job (Administration > Operations > Jobs > Run Now).
 * For each order the job:
 *   1. reads the request id stored on the PaymentTransaction (its transaction id),
 *   2. calls POST /pts/v2/refresh-payment-status/{id},
 *   3. writes the normalized status to PaymentTransaction.custom.cybsTransactionStatus,
 *   4. promotes the order (place/fail) when the refreshed status is terminal — but only
 *      via GUARDED transitions, because arbitrary order numbers may already be in a
 *      state where placeOrder/failOrder is illegal.
 *
 * Unlike DMOrderStatusUpdate.js (which pre-filters its orders and can transition them
 * blindly), this job trusts merchant input, so every transition is guarded.
 */

var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');

var CardHelper = require('*/cartridge/scripts/helpers/CardHelper');
var refreshPaymentStatus = require('*/cartridge/scripts/http/refreshPaymentStatus');
var webhookOrderStatusHelper = require('*/cartridge/scripts/helpers/webhookOrderStatusHelper');

var logger = Logger.getLogger('VisaAcceptance', 'RefreshPaymentStatus');

// Raw gateway statuses that mean the payment is finalized and the order should be
// placed/confirmed. eWallet/APM captures report COMPLETED; SETTLED is treated the same.
var SUCCESS_STATUSES = ['COMPLETED', 'SETTLED'];
// Raw gateway statuses that mean the payment will not succeed and the order should fail.
// A top-level FAILED is only trusted when the response carries NO error reason (see
// ERROR_REASONS / isInconclusive) — an error-reason FAILED is inconclusive, not a decline.
var FAIL_STATUSES = ['DECLINED', 'REVERSED', 'FAILED', 'CANCELLED', 'VOIDED'];

// Refund outcomes are written to cybsTransactionStatus by the refund flow
// (paymentInstrumentUtils). The refresh endpoint reports the ORIGINAL payment transaction's
// status, which knows nothing about refunds, so we must not overwrite a refund label with it.
var REFUND_STATUSES = ['Refunded', 'Partially Refunded', 'Refund Failed'];

// Error "reason" codes that mean the refresh call itself could not determine the payment
// status (processor/lookup/config error) — NOT a real payment outcome. When present, the
// response's top-level status (often FAILED) is not authoritative: e.g. Pay by Bank / TINK
// can return status=FAILED, reason=INTERNAL_ERROR, previousTransactionStatus=SETTLE_INITIATED
// while the payment is still settling. We must not overwrite the existing status in that case.
var ERROR_REASONS = [
    'INTERNAL_ERROR',
    'SYSTEM_ERROR',
    'SERVICE_ERROR',
    'SERVICE_TIMEOUT',
    'INVALID_REQUEST',
    'INVALID_MERCHANT_CONFIGURATION',
    'PROCESSOR_UNAVAILABLE'
];

/**
 * Whether a refresh response is an error/inconclusive result (the status could not be
 * determined) rather than a real payment status.
 * @param {string} reason the response `reason` field
 * @returns {boolean} true when the result is inconclusive and must not overwrite status
 */
function isInconclusive(reason) {
    return !!reason && ERROR_REASONS.indexOf(String(reason).toUpperCase()) !== -1;
}

/**
 * Read a job step parameter as a plain string. Job parameters arrive as a Java-backed
 * map/object, so values are coerced with String() (see the SFCC prefs-not-native-strings
 * gotcha) and access supports both HashMap#get and plain property access.
 * @param {Object} jobParams job step parameters
 * @param {string} name parameter name
 * @returns {string} the parameter value, or '' when absent
 */
function readParam(jobParams, name) {
    if (!jobParams) {
        return '';
    }
    var val;
    if (typeof jobParams.get === 'function') {
        val = jobParams.get(name);
    } else {
        val = jobParams[name];
    }
    return val ? String(val) : '';
}

/**
 * Parse the comma-separated OrderNumbers parameter into a de-duplicated, trimmed list.
 * @param {string} raw raw parameter value
 * @returns {Array<string>} order numbers
 */
function parseOrderNumbers(raw) {
    var out = [];
    if (!raw) {
        return out;
    }
    var parts = String(raw).split(',');
    for (var i = 0; i < parts.length; i++) {
        var trimmed = parts[i].replace(/^\s+|\s+$/g, '');
        if (trimmed && out.indexOf(trimmed) === -1) {
            out.push(trimmed);
        }
    }
    return out;
}

/**
 * Decide what order-state action a refreshed gateway status implies.
 * Pure function (no SFCC dependency) so it can be unit tested.
 * @param {string} rawStatus raw gateway status (e.g. 'COMPLETED', 'DECLINED', 'PENDING')
 * @returns {string} 'PLACE' | 'FAIL' | 'NONE'
 */
function decideAction(rawStatus) {
    if (!rawStatus) {
        return 'NONE';
    }
    var upper = String(rawStatus).toUpperCase();
    if (SUCCESS_STATUSES.indexOf(upper) !== -1) {
        return 'PLACE';
    }
    if (FAIL_STATUSES.indexOf(upper) !== -1) {
        return 'FAIL';
    }
    return 'NONE';
}

/**
 * Locate the non-gift-certificate payment instrument's PaymentTransaction for an order.
 * @param {Object} order dw.order.Order
 * @returns {Object|null} PaymentTransaction or null
 */
function getPaymentTransaction(order) {
    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
    if (!paymentInstrument || !paymentInstrument.paymentTransaction) {
        return null;
    }
    return paymentInstrument.paymentTransaction;
}

/**
 * Apply a refreshed status to one order: always write the display attribute, then
 * promote the order via a GUARDED transition when the status is terminal.
 * @param {Object} order dw.order.Order
 * @param {Object} paymentTransaction dw.order.PaymentTransaction
 * @param {string} rawStatus raw gateway status
 * @returns {string} what happened: 'placed' | 'failed' | 'updated' | 'skipped-transition'
 */
function applyStatus(order, paymentTransaction, rawStatus) {
    var label = webhookOrderStatusHelper.formatTransactionStatus(rawStatus);
    var action = decideAction(rawStatus);
    var result = 'updated';
    // Never let the original payment's refreshed status clobber a refund label already
    // recorded by the refund flow (the refresh endpoint has no knowledge of refunds).
    var currentStatus = paymentTransaction.custom.cybsTransactionStatus;
    var preserveRefundStatus = REFUND_STATUSES.indexOf(currentStatus) !== -1;

    Transaction.wrap(function () {
        if (!preserveRefundStatus) {
            paymentTransaction.custom.cybsTransactionStatus = label;
        }
        paymentTransaction.custom.resultTimestamp = new Date().toISOString();

        if (action === 'PLACE') {
            // placeOrder is only legal from CREATED; a confirmed/placed order just keeps
            // the refreshed attribute (no illegal re-place).
            if (order.getStatus().getValue() === Order.ORDER_STATUS_CREATED) {
                var placeStatus = OrderMgr.placeOrder(order);
                if (placeStatus.isError()) {
                    OrderMgr.failOrder(order, true);
                    result = 'failed';
                } else {
                    order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                    result = 'placed';
                }
            } else {
                result = 'skipped-transition';
            }
        } else if (action === 'FAIL') {
            // failOrder is only legal from CREATED; an already placed/failed/cancelled
            // order is left alone (auto-cancelling a placed order is out of scope).
            if (order.getStatus().getValue() === Order.ORDER_STATUS_CREATED) {
                OrderMgr.failOrder(order, true);
                order.setCancelDescription('Refresh Payment Status job: gateway status ' + rawStatus);
                result = 'failed';
            } else {
                result = 'skipped-transition';
            }
        }
    });

    return result;
}

/**
 * Process a single order end-to-end. Never throws for expected conditions (missing order,
 * missing transaction id, API failure) — returns an outcome tag instead.
 * @param {string} orderNo order number
 * @returns {string} outcome: 'placed' | 'failed' | 'updated' | 'skipped-transition' | 'not-found' | 'no-transaction-id' | 'refresh-failed'
 */
function processOrder(orderNo) {
    var order = OrderMgr.getOrder(orderNo);
    if (!order) {
        logger.warn('Order ( {0} ) not found; skipping.', orderNo);
        return 'not-found';
    }

    var paymentTransaction = getPaymentTransaction(order);
    if (!paymentTransaction) {
        logger.warn('Order ( {0} ) has no payment transaction; skipping.', orderNo);
        return 'no-transaction-id';
    }

    var transactionId = paymentTransaction.getTransactionID();
    if (!transactionId) {
        logger.warn('Order ( {0} ) payment transaction has no transaction id; skipping.', orderNo);
        return 'no-transaction-id';
    }

    var refreshed = refreshPaymentStatus.getRefreshedStatus(transactionId, orderNo);
    if (!refreshed || !refreshed.status) {
        logger.error('Order ( {0} ): refresh-payment-status returned no status for txn ( {1} ).', orderNo, transactionId);
        return 'refresh-failed';
    }

    // Error/inconclusive result (e.g. status=FAILED, reason=INTERNAL_ERROR): the refresh
    // could not determine the payment status, so leave the existing cybsTransactionStatus
    // and order state untouched rather than overwriting a valid status (e.g. Settle Initiated).
    if (isInconclusive(refreshed.reason)) {
        logger.warn('Order ( {0} ): refresh inconclusive (status={1}, reason={2}) for txn ( {3} ); leaving status unchanged.',
            orderNo, refreshed.status, refreshed.reason, transactionId);
        return 'inconclusive';
    }

    var outcome = applyStatus(order, paymentTransaction, refreshed.status);
    logger.info('Order ( {0} ): refreshed status ( {1} ) -> {2}.', orderNo, refreshed.status, outcome);
    return outcome;
}

/**
 * Job step entry point.
 * @param {Object} jobParams step parameters (expects OrderNumbers: comma-separated string)
 * @returns {dw.system.Status} OK with a summary message
 */
function refreshOrders(jobParams) {
    var orderNos = parseOrderNumbers(readParam(jobParams, 'OrderNumbers'));
    if (orderNos.length === 0) {
        logger.warn('RefreshPaymentStatus: no order numbers supplied in the OrderNumbers parameter.');
        return new Status(Status.OK, 'OK', 'No order numbers supplied.');
    }

    logger.info('RefreshPaymentStatus: processing {0} order(s).', orderNos.length);

    var counts = { placed: 0, failed: 0, updated: 0, inconclusive: 0, skipped: 0, errors: 0 };
    for (var i = 0; i < orderNos.length; i++) {
        var orderNo = orderNos[i];
        try {
            var outcome = processOrder(orderNo);
            if (outcome === 'placed') {
                counts.placed++;
            } else if (outcome === 'failed') {
                counts.failed++;
            } else if (outcome === 'updated' || outcome === 'skipped-transition') {
                counts.updated++;
            } else if (outcome === 'inconclusive') {
                counts.inconclusive++;
            } else {
                counts.skipped++;
            }
        } catch (e) {
            counts.errors++;
            logger.error('RefreshPaymentStatus: error processing order ( {0} ): {1}', orderNo, (e && e.message) || e);
        }
    }

    var summary = 'Processed ' + orderNos.length + ' order(s): '
        + counts.placed + ' placed, '
        + counts.failed + ' failed, '
        + counts.updated + ' updated, '
        + counts.inconclusive + ' inconclusive, '
        + counts.skipped + ' skipped, '
        + counts.errors + ' errors.';
    logger.info('RefreshPaymentStatus: ' + summary);
    return new Status(Status.OK, 'OK', summary);
}

module.exports = {
    refreshOrders: refreshOrders,
    // exported for unit testing
    parseOrderNumbers: parseOrderNumbers,
    decideAction: decideAction
};
