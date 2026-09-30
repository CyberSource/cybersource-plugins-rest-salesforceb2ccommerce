'use strict';

var site = require('dw/system/Site');

var STATUSCODES = {
    AUTHORIZED: 'AUTHORIZED',
    DECLINED: 'DECLINED',
    ACTIVE: 'ACTIVE'
};

/**
 * Parses a service error body into an object, tolerating a JSON string or a
 * pre-parsed object, and never throwing.
 * @param {string|Object} data - the error body passed to the SDK callback
 * @returns {Object} the parsed body, or {} if absent/unparseable
 */
function parseErrorBody(data) {
    try {
        return (typeof data === 'string') ? JSON.parse(data) : (data || {});
    } catch (e) {
        return {};
    }
}

/**
 * Detects a "payment instrument no longer exists at TMS" outcome (HTTP 404/410),
 * tolerating the several shapes SFCC/Visa Acceptance surface it in: the dw.svc.Result
 * `error` or `statusCode` fields, or a `statusCode` in the parsed JSON error body
 * (tolerant of the several shapes Visa Acceptance/SFCC surface a 404/410 in).
 * @param {Object} response - the dw.svc.Result passed to the SDK callback
 * @param {string|Object} data - the error body (JSON string or object)
 * @returns {boolean} true when the instrument is gone (404/410)
 */
function isInstrumentGone(response, data) {
    if (response && (response.error === 404 || response.error === 410
            || response.statusCode === 404 || response.statusCode === 410)) {
        return true;
    }
    var body = parseErrorBody(data);
    return body.statusCode === 404 || body.statusCode === 410;
}

/**
 * Retrieves a TMS payment instrument and classifies the outcome. Never throws so a
 * single failure cannot block the saved-card refresh flow.
 * @param {string} paymentInstrumentId - the TMS payment-instrument token id
 * @returns {{status: string, data: Object|null}} status is 'updated' (data = TMS
 *   response), 'notAvailable' (404/410), or 'softFail' (any other error)
 */
function httpRetrievePaymentInstrument(paymentInstrumentId) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var Logger = require('dw/system/Logger');
    var instance = new cybersourceRestApi.PaymentInstrumentApi(configObject);
    var verdict = { status: 'softFail', data: null };
    // SDK signature is getPaymentInstrument(paymentInstrumentTokenId, opts, callback):
    // the token id MUST be the first argument; the second carries the optional
    // profile-id header. Mirrors the live getInstrumentIdentifier/deletePaymentInstrument calls.
    instance.getPaymentInstrument(paymentInstrumentId, configObject.profileId, function (data, error, response) {
        if (!error) {
            verdict = { status: 'updated', data: data };
        } else if (isInstrumentGone(response, data)) {
            verdict = { status: 'notAvailable', data: null };
        } else {
            // Diagnostic: surface the real shape of an unclassified failure so the
            // retrieve outcome is observable (can be dialed to debug level later).
            var body = parseErrorBody(data);
            Logger.getLogger('VisaAcceptance', 'SavedCardRefresh').error(
                'TMS retrieve soft-fail: Result.error={0} Result.status={1} Result.statusCode={2} body.reason={3} body.statusCode={4}',
                response && response.error,
                response && response.status,
                response && response.statusCode,
                body.reason || body.status || '',
                body.statusCode
            );
            verdict = { status: 'softFail', data: null };
        }
    });
    return verdict;
}

/**
 * Create payment token using UC (Unified Checkout) transient token
 * @param {string} ucTransientToken - UC transient token from client
 * @param {string} customerEmail - Customer email
 * @param {Object} billingAddress - Billing address object
 * @param {string} referenceCode - Reference code for transaction
 * @returns {Object} Token creation response
 */
function httpUCCreateToken(ucTransientToken, customerEmail, billingAddress, referenceCode) {
    var Logger = require('dw/system/Logger');
    var logger = Logger.getLogger('VisaAcceptance', 'UC-TokenManagement');
    
    try {
        var payments = require('~/cartridge/scripts/http/payments.js');
        var result = payments.httpZeroDollarAuthWithTransientToken(
            ucTransientToken,
            customerEmail, 
            referenceCode,
            billingAddress, 
            site.current.getDefaultCurrency()
        );
        
        if (result.status === STATUSCODES.AUTHORIZED || result.status === 'AUTHORIZED_PENDING_REVIEW') {
            return {result:result.tokenInformation,
                success:true
            };
        }
        
        logger.error('UC token creation failed for reference: {0}, Status: {1}', referenceCode, result.status);
        return {
            success: false,
            error: 'UC token authorization failed with status: ' + result.status
        };
        
    } catch (e) {
        logger.error('Exception in UC token creation for reference: {0}, Error: {1}', referenceCode, e.message);
        throw e;
    }
}

/**
 *
 * @param {string} accounNumber accounNumber
 * @param {string} expiryMonth expiryMonth
 * @param {string} expiryYear expiryYear
 * @param {string} securityCode securityCode
 * @param {string} customerEmail customerEmail
 * @param { {countryCode: string, firstName: string, lastName: string, phone: string, address1: string, postalCode: string, city: string, stateCode: string} } address address
 * @param {string} referenceCode referenceCode
 * @param {boolean} skipDMFlag should we skip DM
 * @returns {string} token information
 */
function httpCreateToken(
    accounNumber, expiryMonth, expiryYear, securityCode,
    customerEmail, address, referenceCode, skipDMFlag
) {
    var errors = require('~/cartridge/scripts/util/errors');
    var payments = require('~/cartridge/scripts/http/payments.js');
    var result = payments.httpZeroDollarAuth(
        accounNumber, expiryMonth, expiryYear, securityCode,
        customerEmail, referenceCode,
        address, site.current.getDefaultCurrency(),
        skipDMFlag
    );
    if (result.status === STATUSCODES.AUTHORIZED) {
        return result.tokenInformation;
    }
    throw new Error(new errors.CARD_NOT_AUTHORIZED_ERROR('Error in token'));
}

/**
 *
 *
 * @param {string} tokenId tokenId
 * @returns {boolean} success or error
 */
function httpDeletePaymentInstrument(tokenId) {
    var configObject = require('~/cartridge/configuration/index');
    var cybersourceRestApi = require('~/cartridge/apiClient/index');
    try { // eslint-disable-line no-useless-catch
        var paymentInstrumentInstance = new cybersourceRestApi.PaymentInstrumentApi(configObject);
        // retrieve payment instruments associated with token
        var success = null;
        paymentInstrumentInstance.deletePaymentInstrument(configObject.profileId, tokenId, function (data, error, response) { // eslint-disable-line no-unused-vars
            if (!error) {
                success = true;
            } else {
                throw new Error(data);
            }
        });
        return success;
    } catch (error) {
        throw error;
    }
}

/**
 * @param {*} customerId *
 * @param {*} oldPaymentInstrumentId *
 * @param {*} expiryMonth *
 * @param {*} expiryYear *
 * @param {*} billingAddress *
 * @param {*} customerEmail *
 * @param {*} instrumentIdentifierId *
 * @returns {*} *
 */
function httpUpdateCustomerPaymentInstrument(customerId, oldPaymentInstrumentId, expiryMonth, expiryYear, billingAddress, customerEmail, instrumentIdentifierId) {
    var payments = require('~/cartridge/scripts/http/payments.js');
    try { // eslint-disable-line no-useless-catch
        var result = payments.updateCustomerPaymentInstrument(
            customerId, oldPaymentInstrumentId, expiryMonth, expiryYear,
            billingAddress, customerEmail, instrumentIdentifierId
        );
        if (result.state === STATUSCODES.ACTIVE) {
            var success = true;
            return success;
        }
    } catch (error) {
        throw error;
    }
    return 0;
}

/**
 * @param {*} customerTokenId *
 * @param {*} paymentInstrumentTokenId *
 * @returns {*} *
 */
function httpDeleteCustomerPaymentInstrument(customerTokenId, paymentInstrumentTokenId) {
    var configObject = require('~/cartridge/configuration/index');
    var cybersourceRestApi = require('~/cartridge/apiClient/index');
    try { // eslint-disable-line no-useless-catch
        var customerPaymentInstrumentInstance = new cybersourceRestApi.CustomerPaymentInstrumentApi(configObject);
        // delete payment instrument associated with token
        var success = null;
        customerPaymentInstrumentInstance.deleteCustomerPaymentInstrument(customerTokenId, paymentInstrumentTokenId, configObject.profileId, function (data, error, response) { // eslint-disable-line no-unused-vars
            if (!error) {
                success = true;
            } else {
                throw new Error(data);
            }
        });
        return success;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    httpCreateToken: httpCreateToken,
    httpUCCreateToken: httpUCCreateToken,
    httpDeletePaymentInstrument: httpDeletePaymentInstrument,
    httpRetrievePaymentInstrument: httpRetrievePaymentInstrument,
    httpUpdateCustomerPaymentInstrument: httpUpdateCustomerPaymentInstrument,
    httpDeleteCustomerPaymentInstrument: httpDeleteCustomerPaymentInstrument
};
