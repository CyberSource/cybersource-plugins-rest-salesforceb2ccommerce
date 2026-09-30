'use strict';

/**
 * Auth-reversal orchestration.
 *
 * Every caller that releases an authorization hold goes through reverseAuthorizationOnce so the
 * reversal is performed AT MOST ONCE per authorization transaction id.
 *
 * Why the guard is needed: Visa Acceptance webhook delivery is at-least-once. The subscription
 * this plugin creates sets numberOfRetries=3 / firstRetry=1min / interval=1min
 * (bm_cybs_sfra/cartridge/scripts/http/webhookManagement.js), and WebhookNotification itself
 * deliberately answers 503 to force a redelivery while an order is still committing. Without a
 * guard, every redelivery of risk.casemanagement.decision.reject re-ran the reversal: the order
 * is still found, its PaymentTransaction still carries the authorization id, so a second
 * POST /pts/v2/payments/{id}/reversals went out.
 *
 * The claim is written BEFORE the gateway call and is never released, including when the call
 * throws - an unreversed hold is visible (logged at error level, and reversible in the
 * Enterprise Business Center) whereas a double reversal is not recoverable from the storefront.
 *
 * Note this is a different ledger from order.custom.reversalTransactionIds, which
 * paymentInstrumentUtils writes from the reversal RESPONSE id. That one dedupes a replayed
 * response; only an AUTHORIZATION-keyed ledger can stop a second reversal request, because each
 * new request is issued a fresh reversal id.
 */

var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');

var logger = Logger.getLogger('VisaAcceptance', 'authReversal');

// session.privacy slot used when there is no order to hang the ledger on (UC PlaceOrderDirect
// declines the payment before the order is created).
var SESSION_LEDGER_KEY = 'cybsReversedAuthIds';

/**
 * Read an order's reversed-authorization ledger as a plain array.
 * @param {dw.order.Order} order the order carrying the ledger
 * @returns {Array<string>} authorization transaction ids already reversed for this order
 */
function getReversedAuthIds(order) {
    var statusHelper = require('*/cartridge/scripts/helpers/webhookOrderStatusHelper');
    return statusHelper.parseIdList(order.custom.reversedAuthTransactionIds);
}

/**
 * Claim the reversal of one authorization on the order ledger.
 * @param {dw.order.Order} order order to record the claim on
 * @param {string} authTransactionId authorization (payment) id being reversed
 * @returns {boolean} true when this call owns the reversal, false when it was already claimed
 */
function claimOnOrder(order, authTransactionId) {
    var ids = getReversedAuthIds(order);
    if (ids.indexOf(authTransactionId) !== -1) {
        return false;
    }
    ids.push(authTransactionId);
    Transaction.wrap(function () {
        order.custom.reversedAuthTransactionIds = ids.join(',');
    });
    return true;
}

/**
 * Claim the reversal of one authorization in the shopper session. Used only for the pre-order
 * decline path; a missing session (job/BM context) never blocks the reversal.
 * @param {string} authTransactionId authorization (payment) id being reversed
 * @returns {boolean} true when this call owns the reversal, false when it was already claimed
 */
function claimInSession(authTransactionId) {
    try {
        var statusHelper = require('*/cartridge/scripts/helpers/webhookOrderStatusHelper');
        var privacy = session.privacy;
        var ids = statusHelper.parseIdList(privacy[SESSION_LEDGER_KEY]);
        if (ids.indexOf(authTransactionId) !== -1) {
            return false;
        }
        ids.push(authTransactionId);
        privacy[SESSION_LEDGER_KEY] = ids.join(',');
        return true;
    } catch (e) {
        logger.debug('authReversalHelper: no session ledger available ({0}); proceeding without the duplicate guard.', e.message || e);
        return true;
    }
}

/**
 * Whether a notification detail object already advertises a reversal of its authorization, in
 * which case the gateway released the hold itself and ours would be a second reversal. Tolerant
 * of both spellings seen on the _embedded object (mirrors the _embedded.capture handling in
 * WebhookNotification / webhookOrderStatusHelper).
 * @param {Object} details normalized notification detail object
 * @returns {boolean} true when the payload carries a reversal
 */
function payloadAlreadyReversed(details) {
    var embedded = details && details._embedded;
    return !!(embedded && (embedded.reversal || embedded.authReversal));
}

/**
 * Reverse an authorization at most once.
 *
 * @param {Object} params call parameters
 * @param {dw.order.Order} [params.order] order to record the claim on; omit when the order does
 *        not exist yet (the claim then falls back to the shopper session)
 * @param {string} params.authTransactionId authorization (payment) id to reverse
 * @param {string} [params.referenceCode] merchant reference sent as clientReferenceInformation.code
 *        (defaults to order.orderNo)
 * @param {number|string} params.amount amount to release
 * @param {string} params.currency currency of the amount
 * @param {string} [params.context] log label, e.g. 'dmNotification' / 'PlaceOrderDirect'
 * @returns {Object} { reversed, skipped, reason }
 */
function reverseAuthorizationOnce(params) {
    var order = params.order || null;
    var authTransactionId = params.authTransactionId;
    var context = params.context || 'authReversal';
    var referenceCode = params.referenceCode || (order ? order.orderNo : null);
    var amount = params.amount;
    var currency = params.currency || (order ? order.currencyCode : null);

    if (!authTransactionId) {
        logger.error('{0}: cannot reverse the authorization for ( {1} ) - no authorization transaction id on the payment.', context, referenceCode);
        return { reversed: false, skipped: false, reason: 'NO_TRANSACTION_ID' };
    }
    if (amount === undefined || amount === null || amount === '') {
        logger.error('{0}: cannot reverse authorization {1} for ( {2} ) - no amount resolved.', context, authTransactionId, referenceCode);
        return { reversed: false, skipped: false, reason: 'NO_AMOUNT' };
    }
    if (!currency) {
        logger.error('{0}: cannot reverse authorization {1} for ( {2} ) - no currency resolved.', context, authTransactionId, referenceCode);
        return { reversed: false, skipped: false, reason: 'NO_CURRENCY' };
    }

    var claimed = order ? claimOnOrder(order, authTransactionId) : claimInSession(authTransactionId);
    if (!claimed) {
        logger.info('{0}: authorization {1} for ( {2} ) was already reversed; skipping the duplicate reversal.', context, authTransactionId, referenceCode);
        return { reversed: false, skipped: true, reason: 'ALREADY_REVERSED' };
    }

    try {
        var authReversal = require('*/cartridge/scripts/http/authReversal');
        authReversal.httpAuthReversal(authTransactionId, referenceCode, amount, currency);
        logger.info('{0}: auth reversal requested for ( {1} ) - authorization {2}, amount {3} {4}.', context, referenceCode, authTransactionId, amount, currency);
        return { reversed: true, skipped: false };
    } catch (e) {
        logger.error(
            '{0}: auth reversal FAILED for ( {1} ) - authorization {2}, amount {3} {4}: {5}. '
            + 'The authorization stays claimed so a redelivery cannot double-reverse; release the hold in the Enterprise Business Center if it is still open.',
            context, referenceCode, authTransactionId, amount, currency, (e && e.message ? e.message : e)
        );
        return { reversed: false, skipped: false, reason: 'GATEWAY_ERROR', errorMessage: (e && e.message ? e.message : String(e)) };
    }
}

module.exports = {
    reverseAuthorizationOnce: reverseAuthorizationOnce,
    payloadAlreadyReversed: payloadAlreadyReversed
};
