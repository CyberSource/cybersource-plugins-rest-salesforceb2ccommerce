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
                var orderNo = result.clientReferenceInformation.code;
                var order = OrderMgr.getOrder(orderNo);

                var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
                var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
                var PaymentInstrumentUtils = require('~/cartridge/scripts/util/paymentInstrumentUtils');
                PaymentInstrumentUtils.UpdatePaymentTransactionCardauthReversal(paymentInstrument, order, result);
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
