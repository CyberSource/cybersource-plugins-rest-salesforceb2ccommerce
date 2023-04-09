'use strict';

var site = require('dw/system/Site');

var STATUSCODES = {
    AUTHORIZED: 'AUTHORIZED',
    DECLINED: 'DECLINED',
    ACTIVE: 'ACTIVE'
};

/**
 *
 * @param {string} paymentInstrumentId PI ID
 * @returns {Object} Payment Instrument
 */
function httpRetrievePaymentInstrument(paymentInstrumentId) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var instance = new cybersourceRestApi.PaymentInstrumentApi(configObject);
    var paymentInstrument = null;
    instance.getPaymentInstrument(configObject.profileId, paymentInstrumentId, function (data, error, response) {
        if (!error) {
            paymentInstrument = data;
        } else if (response.error === 404 || response.error === 410) {
            paymentInstrument = null;
        } else {
            throw new Error(data);
        }
    });
    return paymentInstrument;
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
 * @param {*} transientToken *
 * @param {*} customerEmail *
 * @param {*} address *
 * @param {*} referenceCode *
 * @returns {*} *
 */
function httpFlexCreateToken(
    transientToken,
    customerEmail, address, referenceCode
) {
    try { // eslint-disable-line no-useless-catch
        var payments = require('~/cartridge/scripts/http/payments.js');
        var result = payments.httpZeroDollarAuthWithTransientToken(
            transientToken,
            customerEmail, referenceCode,
            address, site.current.getDefaultCurrency()
        );
        if (result.status === STATUSCODES.AUTHORIZED) {
            return result.tokenInformation;
        }
        return result.status;
    } catch (e) {
        throw e;
    }
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
    httpFlexCreateToken: httpFlexCreateToken,
    httpDeletePaymentInstrument: httpDeletePaymentInstrument,
    httpRetrievePaymentInstrument: httpRetrievePaymentInstrument,
    httpUpdateCustomerPaymentInstrument: httpUpdateCustomerPaymentInstrument,
    httpDeleteCustomerPaymentInstrument: httpDeleteCustomerPaymentInstrument
};
