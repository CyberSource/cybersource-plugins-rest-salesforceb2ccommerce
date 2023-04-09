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

    var result = '';
    // var captureResult;
    // eslint-disable-next-line consistent-return
    instance.capturePayment(request, requestId, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
            try {
                var OrderMgr = require('dw/order/OrderMgr');
                var orderNo = result.clientReferenceInformation.code;
                var order = OrderMgr.getOrder(orderNo);

                var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
                var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
                var PaymentInstrumentUtils = require('~/cartridge/scripts/util/paymentInstrumentUtils');
                PaymentInstrumentUtils.UpdatePaymentTransactionCardCapture(paymentInstrument, order, result);
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
