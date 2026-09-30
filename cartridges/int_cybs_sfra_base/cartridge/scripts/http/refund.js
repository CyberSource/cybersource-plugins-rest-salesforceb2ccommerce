'use strict';

var Logger = require('dw/system/Logger');
var configObject = require('../../configuration/index');
var cybersourceRestApi = require('../../apiClient/index');
var Constants = require('../../apiClient/constants');

var auditLogger = Logger.getLogger('VisaAcceptance', 'refund');

// endpoint selector values posted from refundServiceForm.isml.
// 'payments' -> /pts/v2/payments/{id}/refunds  (eCheck and APMs)
// 'captures' -> /pts/v2/captures/{id}/refunds  (all other payments)
var REFUND_VIA_PAYMENTS = 'payments';

/**
 * *
 * @param {*} transactionId the id the refund is issued against — a payment id when
 *   refunding via /payments/{id}/refunds (eCheck/APMs) or a capture id when refunding
 *   via /captures/{id}/refunds (other payments) *
 * @param {*} referenceInformationCode merchant order reference (order number) *
 * @param {*} total refund amount *
 * @param {*} currency currency code *
 * @param {*} refundEndpointType 'payments' for eCheck/APMs (refund the payment) or
 *   'captures'/undefined for other payments (refund the capture) *
 * @returns {*} *
 */
function httpRefundPayment(transactionId, referenceInformationCode, total, currency, refundEndpointType) {
    var instance = new cybersourceRestApi.RefundApi(configObject);
    var refundViaPayments = String(refundEndpointType) === REFUND_VIA_PAYMENTS;

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;
    clientReferenceInformation.applicationName = Constants.APPLICATION_NAME;
    clientReferenceInformation.applicationVersion = Constants.APPLICATION_VERSION;

    var partner = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformationPartner();
    // PSID for this release is the existing partner solution id exposed on the config object.
    partner.solutionId = configObject.solutionId;
    clientReferenceInformation.partner = partner;

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsidcapturesOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency.toUpperCase();

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsidrefundsOrderInformation();
    orderInformation.amountDetails = amountDetails;

    // Both endpoints take the same clientReferenceInformation/orderInformation shape;
    // only the request class and the API method (and therefore the URL) differ.
    var request = refundViaPayments
        ? new cybersourceRestApi.RefundPaymentRequest()
        : new cybersourceRestApi.RefundCaptureRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.orderInformation = orderInformation;

    //  Provide ability to customize request object with a hook.
    var HookMgr = require('dw/system/HookMgr');
    if (HookMgr.hasHook('app.payment.modifyrequest')) {
        var modifiedServiceRequest = HookMgr.callHook('app.payment.modifyrequest', 'Refund', request);
        // eslint-disable-next-line no-undef
        if (!empty(modifiedServiceRequest)) {
            request = modifiedServiceRequest;
        }
    }

    var OrderMgr = require('dw/order/OrderMgr');
    var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
    var PaymentInstrumentUtils = require('~/cartridge/scripts/util/paymentInstrumentUtils');
    var round2 = require('~/cartridge/scripts/helpers/webhookOrderStatusHelper').round2;
    var order = OrderMgr.getOrder(referenceInformationCode);
    var paymentInstrument = order ? CardHelper.getNonGCPaymemtInstument(order) : null;

    // Cap: never refund more than the remaining refundable balance. When the captured
    // total is known on the order's payment transaction, reject an over-refund (full,
    // single partial, or the running total of multiple partials) before the gateway call.
    if (order && paymentInstrument && paymentInstrument.paymentTransaction) {
        // Capture/refund ledger lives on the Order (hidden from BM Orders > Payment), not on the
        // payment transaction. Round to cents before comparing: capturedTotal/refundedAmount are
        // float-accumulated over multiple partial captures/refunds, so the raw remaining balance
        // can read 53.379999999999995 and wrongly reject a legitimate 53.38 refund.
        var orderCustom = order.custom;
        var capturedTotal = round2(orderCustom.AmountPaid || 0);
        var remainingRefundable = round2(capturedTotal - (orderCustom.refundedAmount || 0));
        var requestedRefund = round2(Number(total));
        if (capturedTotal > 0 && requestedRefund > remainingRefundable) {
            var capMsg = 'Refund amount (' + requestedRefund + ') exceeds remaining refundable balance ('
                + remainingRefundable + ')';
            PaymentInstrumentUtils.RecordRefundFailure(paymentInstrument, order, capMsg);
            auditLogger.error('[refund.js] Refund REJECTED (over-refund): order {0}, {1}',
                referenceInformationCode, capMsg);
            throw new Error(capMsg);
        }
    }

    var result = '';
    // eslint-disable-next-line consistent-return
    var refundCallback = function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
            try {
                if (order && paymentInstrument) {
                    PaymentInstrumentUtils.UpdatePaymentTransactionRefund(paymentInstrument, order, result);
                }
            } catch (e) {
                Logger.error('[refund.js] Error in httpRefundPayment request ( {0} )', e.message);
                return { error: true, errorMsg: e.message };
            }
        } else {
            if (order && paymentInstrument) {
                PaymentInstrumentUtils.RecordRefundFailure(paymentInstrument, order, JSON.stringify(data));
            }
            // Audit log: failed outcome.
            auditLogger.error('[refund.js] Refund outcome FAILED: order {0}, error {1}',
                referenceInformationCode, JSON.stringify(data));
            throw new Error(data);
        }
    };

    if (refundViaPayments) {
        // eCheck and APMs: refund the payment — /pts/v2/payments/{id}/refunds
        instance.refundPayment(request, transactionId, refundCallback);
    } else {
        // Other payments: refund the capture — /pts/v2/captures/{id}/refunds
        instance.refundCapture(request, transactionId, refundCallback);
    }
    return result;
}

module.exports = {
    httpRefundPayment: httpRefundPayment
};
