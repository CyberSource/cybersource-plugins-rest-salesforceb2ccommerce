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
function httpAuthReversal(requestId, referenceInformationCode, total, currency) {
    var instance = new cybersourceRestApi.ReversalApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsidreversalsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var currencyDetails = new cybersourceRestApi.Ptsv2paymentsidreversalsOrderInformationAmountDetails();
    currencyDetails.currency = currency.toUpperCase();

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsidreversalsOrderInformation();
    orderInformation.amountDetails = currencyDetails;

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsidreversalsReversalInformationAmountDetails();
    amountDetails.totalAmount = total.toString();

    var reversalInformation = new cybersourceRestApi.Ptsv2paymentsidreversalsReversalInformation();
    reversalInformation.amountDetails = amountDetails;

    var request = new cybersourceRestApi.AuthReversalRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.reversalInformation = reversalInformation;
    request.orderInformation = orderInformation;

    //  Provide ability to customize request object with a hook.
    var HookMgr = require('dw/system/HookMgr');
    if (HookMgr.hasHook('app.payment.modifyrequest')) {
        var modifiedServiceRequest = HookMgr.callHook('app.payment.modifyrequest', 'authReversal', request);
        // eslint-disable-next-line no-undef
        if (!empty(modifiedServiceRequest)) {
            request = modifiedServiceRequest;
        }
    }
    var result = '';
    // var authReversalResult;
    // eslint-disable-next-line consistent-return
    instance.authReversal(requestId, request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
            try {
                var OrderMgr = require('dw/order/OrderMgr');
                // The reversal response does not always echo clientReferenceInformation; fall back
                // to the reference we sent.
                var orderNo = (result.clientReferenceInformation && result.clientReferenceInformation.code)
                    || referenceInformationCode;
                var order = orderNo ? OrderMgr.getOrder(orderNo) : null;
                if (!order) {
                    // Expected for a Decision Manager decline at authorization time (UC
                    // PlaceOrderDirect): the hold is released before any order is created, so
                    // there is nothing to annotate. The reversal itself already succeeded.
                    Logger.info('[authReversal.js] Reversal ( {0} ) for reference ( {1} ) has no SFCC order to annotate.', result.id, orderNo);
                    return;
                }

                var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
                var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
                var PaymentInstrumentUtils = require('~/cartridge/scripts/util/paymentInstrumentUtils');
                // Pass the KNOWN reversed amount/currency (what we requested) so the note never
                // depends on the reversal response echoing amountDetails, which Visa Acceptance
                // does not reliably populate (mirrors the capture flow).
                PaymentInstrumentUtils.UpdatePaymentTransactionCardauthReversal(paymentInstrument, order, result, total, currency);
            } catch (e) {
                Logger.error('[authReversal.js] Error in httpAuthReversal request ( {0} )', e.message);
                return { error: true, errorMsg: e.message };
            }
        } else {
            throw new Error(data);
        }
    });
    return result;
}
module.exports = {
    httpAuthReversal: httpAuthReversal
};
