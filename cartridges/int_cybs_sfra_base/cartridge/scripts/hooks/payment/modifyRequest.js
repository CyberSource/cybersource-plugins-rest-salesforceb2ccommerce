'use strict';

/**
 * SFCC payment-instrument method name (set by the UC PayPal/Venmo payment processor
 * hooks) mapped to the Visa Acceptance paymentInformation.paymentType.method.name value.
 * PayPal and Venmo are the only eWallet APMs with dedicated payment methods; every
 * other scheme (cards, PPRO bank transfers, BNPL, ...) is intentionally absent so its
 * request is left unchanged.
 */
var EWALLET_METHODS = {
    PAYPAL: 'payPal',
    VENMO: 'venmo'
};

/**
 * Resolve the Visa Acceptance eWallet method name for the order an order-management request
 * targets. The order number is read from request.clientReferenceInformation.code, which
 * capture.js / authReversal.js / refund.js all set before invoking this hook.
 *
 * @param {Object} request - the Visa Acceptance order-management request object
 * @returns {string|null} 'payPal' or 'venmo' for a PayPal/Venmo order, otherwise null
 */
function resolveEwalletMethod(request) {
    var orderNo = request &&
        request.clientReferenceInformation &&
        request.clientReferenceInformation.code;
    if (!orderNo) {
        return null;
    }

    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderNo);
    if (!order) {
        return null;
    }

    var CardHelper = require('*/cartridge/scripts/helpers/CardHelper');
    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
    if (!paymentInstrument) {
        return null;
    }

    return EWALLET_METHODS[paymentInstrument.paymentMethod] || null;
}

/**
 * Add the alternative-payment-method (eWallet) fields Visa Acceptance requires for a
 * PayPal/Venmo order-management call - processingInformation.actionList and
 * paymentInformation.paymentType (name 'eWallet', method.name 'payPal' or 'venmo') -
 * and return the request. Card and non-eWallet orders are returned unchanged so the
 * existing credit-card / bank-transfer flows are unaffected.
 *
 * @param {Object} request - the Visa Acceptance request object built by the order-management script
 * @param {string} action - 'AP_CAPTURE', 'AP_AUTH_REVERSAL', or 'AP_REFUND'
 * @returns {Object} the request, with the eWallet fields added when applicable
 */
function addEwalletFields(request, action) {
    var methodName = resolveEwalletMethod(request);
    if (!methodName) {
        return request;
    }

    if (!request.processingInformation) {
        request.processingInformation = {};
    }
    request.processingInformation.actionList = [action];

    if (!request.paymentInformation) {
        request.paymentInformation = {};
    }
    request.paymentInformation.paymentType = {
        name: 'eWallet',
        method: {
            name: methodName
        }
    };

    return request;
}

/**
 * app.payment.modifyrequest hook for the capture call (discriminator 'Capture').
 * @param {Object} request - the CapturePaymentRequest being built in capture.js
 * @returns {Object} the (possibly eWallet-augmented) request
 */
function Capture(request) {
    return addEwalletFields(request, 'AP_CAPTURE');
}

/**
 * app.payment.modifyrequest hook for the authorization-reversal call (discriminator
 * 'authReversal').
 * @param {Object} request - the AuthReversalRequest being built in authReversal.js
 * @returns {Object} the (possibly eWallet-augmented) request
 */
function authReversal(request) {
    return addEwalletFields(request, 'AP_AUTH_REVERSAL');
}

/**
 * app.payment.modifyrequest hook for the refund call (discriminator 'Refund').
 * @param {Object} request - the RefundCaptureRequest being built in refund.js
 * @returns {Object} the (possibly eWallet-augmented) request
 */
function Refund(request) {
    return addEwalletFields(request, 'AP_REFUND');
}

module.exports = {
    Capture: Capture,
    authReversal: authReversal,
    Refund: Refund
};
