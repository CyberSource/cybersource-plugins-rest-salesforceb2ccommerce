'use strict';

var Logger = require('dw/system/Logger');
var configObject = require('../../configuration/index');
var cybersourceRestApi = require('../../apiClient/index');

/**
 * Extract { capturedAmount, currency } from a Visa Acceptance transaction/capture response.
 * @param {Object} data API response object
 * @returns {Object|null} { capturedAmount: Number, currency: String } or null
 */
function extractAmount(data) {
    var amountDetails = data && data.orderInformation && data.orderInformation.amountDetails;
    if (amountDetails && amountDetails.totalAmount !== undefined && amountDetails.totalAmount !== null) {
        return {
            capturedAmount: Number(amountDetails.totalAmount.toString()),
            currency: amountDetails.currency || null
        };
    }
    return null;
}

/**
 * Retrieve a transaction's captured amount via GET /tss/v2/transactions/{id}.
 * The payments.* capture webhook carries only the transaction id, so the real
 * (possibly partial) captured amount must be fetched here.
 *
 * NOTE: the apiClient callback contract is (data, error, response) — matching
 * scripts/http/capture.js — not the (error, data) order in the generated JSDoc.
 *
 * @param {string} transactionId Visa Acceptance transaction (request) id
 * @returns {Object|null} { capturedAmount: Number, currency: String } or null on any failure
 */
function getCapturedAmount(transactionId) {
    if (!transactionId) {
        return null;
    }
    var instance = new cybersourceRestApi.TransactionDetailsApi(configObject);
    var result = null;
    instance.getTransaction(transactionId, function (data, error) {
        if (error || !data) {
            Logger.error('[transactionDetails.js] getTransaction failed for ( {0} ): {1}', transactionId, error);
            return;
        }
        try {
            result = extractAmount(data);
        } catch (e) {
            Logger.error('[transactionDetails.js] parse error for ( {0} ): {1}', transactionId, e.message);
        }
    });
    return result;
}

module.exports = {
    getCapturedAmount: getCapturedAmount
};
