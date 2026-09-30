'use strict';

var Logger = require('dw/system/Logger');
var configObject = require('../../configuration/index');
// var configObject = new configuration();
var cybersourceRestApi = require('../../apiClient/index');

/**
 * *
 * @param {*} requestId *
 * @param {*} referenceInformationCode *
 * @param {*} total *
 * @param {*} currency *
 * @returns {*} *
 */
function httpCapturePayment(requestId, referenceInformationCode, total, currency) {
    var instance = new cybersourceRestApi.CaptureApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsidcapturesOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency.toUpperCase();

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsidcapturesOrderInformation();
    orderInformation.amountDetails = amountDetails;

    var request = new cybersourceRestApi.CapturePaymentRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.orderInformation = orderInformation;

    //  Provide ability to customize request object with a hook.
    var HookMgr = require('dw/system/HookMgr');
    if (HookMgr.hasHook('app.payment.modifyrequest')) {
        var modifiedServiceRequest = HookMgr.callHook('app.payment.modifyrequest', 'Capture', request);
        // eslint-disable-next-line no-undef
        if (!empty(modifiedServiceRequest)) {
            request = modifiedServiceRequest;
        }
    }

    // Cap: never capture more than the authorized amount. Multiple partial captures are allowed,
    // so reject when this capture would push the cumulative captured total past what was authorized
    // (mirrors the over-refund guard in refund.js). Amounts are rounded to cents to avoid float
    // accumulation drift over multiple partial captures.
    var OrderMgr = require('dw/order/OrderMgr');
    var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
    var round2 = require('~/cartridge/scripts/helpers/webhookOrderStatusHelper').round2;
    var order = OrderMgr.getOrder(referenceInformationCode);
    var paymentInstrument = order ? CardHelper.getNonGCPaymemtInstument(order) : null;
    if (order && paymentInstrument && paymentInstrument.paymentTransaction) {
        var pt = paymentInstrument.paymentTransaction;
        // Authorized amount is the ceiling; fall back to the order gross total when the payment
        // transaction carries no authorized amount (e.g. wallet flows that don't set it).
        var authAmount = (pt.amount && pt.amount.available) ? pt.amount.getValue() : 0;
        var authorizedTotal = round2(authAmount > 0 ? authAmount : order.getTotalGrossPrice().getValue());
        // Captured-total ledger lives on the Order (hidden from BM Orders > Payment), not on pt.custom.
        var alreadyCaptured = round2(order.custom.AmountPaid || 0);
        var remainingCapturable = round2(authorizedTotal - alreadyCaptured);
        var requestedCapture = round2(Number(total));
        if (authorizedTotal > 0 && requestedCapture > remainingCapturable) {
            var capMsg = 'Capture amount (' + requestedCapture + ') exceeds remaining capturable balance ('
                + remainingCapturable + ')';
            var Transaction = require('dw/system/Transaction');
            Transaction.wrap(function () {
                order.addNote('Capture Rejected', capMsg);
            });
            Logger.error('[capture.js] Capture REJECTED (over-capture): order {0}, {1}',
                referenceInformationCode, capMsg);
            throw new Error(capMsg);
        }
    }

    var result = '';
    // var captureResult;
    // eslint-disable-next-line consistent-return
    instance.capturePayment(request, requestId, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
            try {
                var PaymentInstrumentUtils = require('~/cartridge/scripts/util/paymentInstrumentUtils');
                // Reuse the order / payment instrument resolved above for the over-capture cap
                // (same order as result.clientReferenceInformation.code). Pass the KNOWN captured
                // amount/currency (what we requested) so the update never depends on the capture
                // response echoing orderInformation.amountDetails.totalAmount, which Visa Acceptance
                // does not reliably populate.
                PaymentInstrumentUtils.UpdatePaymentTransactionCardCapture(paymentInstrument, order, result, total, currency);
            } catch (e) {
                Logger.error('[capture.js] Error in httpCapturePayment request ( {0} )', e.message);
                return { error: true, errorMsg: e.message };
            }
        } else {
            throw new Error(data);
        }
    });
    return result;
}

module.exports = {
    httpCapturePayment: httpCapturePayment
};
