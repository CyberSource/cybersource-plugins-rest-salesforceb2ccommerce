'use strict';

var Logger = require('dw/system/Logger');
var configObject = require('../../configuration/index');
// Required directly (not via apiClient/index) so we don't have to regenerate the
// 300KB+ aggregated apiClient/index.js just to expose one endpoint.
var RefreshPaymentStatusApi = require('../../apiClient/api/RefreshPaymentStatusApi');

/**
 * Build the refresh-payment-status request body. The order number is sent as
 * clientReferenceInformation.code (the same field the webhook flow reads back to
 * locate the order), and processingInformation.actionList = ['AP_STATUS'] instructs
 * Visa Acceptance to return the current alternative-payment status.
 * @param {string} orderNo SFCC order number
 * @returns {Object} request body
 */
function buildRequest(orderNo) {
    return {
        clientReferenceInformation: {
            code: orderNo
        },
        processingInformation: {
            actionList: ['AP_STATUS']
        }
    };
}

/**
 * Refresh a transaction's status via POST /pts/v2/refresh-payment-status/{id}.
 *
 * NOTE: the apiClient callback contract is (data, error, response) — matching
 * scripts/http/transactionDetails.js — not the (error, data) order in the generated JSDoc.
 *
 * @param {string} transactionId Visa Acceptance request id (PaymentTransaction transaction id)
 * @param {string} orderNo SFCC order number (sent as clientReferenceInformation.code)
 * @returns {Object|null} { status, reason, data } or null on any failure. `reason` is the
 *          error reason (e.g. INTERNAL_ERROR) present when the refresh itself could not
 *          determine the payment status — distinct from a real payment outcome.
 */
function getRefreshedStatus(transactionId, orderNo) {
    if (!transactionId) {
        return null;
    }
    var instance = new RefreshPaymentStatusApi(configObject);
    var result = null;
    instance.refreshPaymentStatus(transactionId, buildRequest(orderNo), function (data, error) {
        if (error || !data) {
            Logger.error('[refreshPaymentStatus.js] refreshPaymentStatus failed for ( {0} ): {1}', transactionId, error);
            return;
        }
        result = { status: data.status || null, reason: data.reason || null, data: data };
    });
    return result;
}

module.exports = {
    buildRequest: buildRequest,
    getRefreshedStatus: getRefreshedStatus
};
