'use strict';

var configObject = require('../../configuration/index');

var REASONCODES = {
    MISSING_FIELD: 'MISSING_FIELD',
    APARTMENTNUMBERNOT_FOUND: 'APARTMENTNUMBERNOT_FOUND',
    INSUFFICIENTADDRESSINFORMATION: 'INSUFFICIENTADDRESSINFORMATION',
    HOUSEORBOXNUMBERNOT_FOUND: 'HOUSEORBOXNUMBERNOT_FOUND',
    MULTIPLEADDRESSMATCHES: 'MULTIPLEADDRESSMATCHES',
    BOXNUMBERNOT_FOUND: 'BOXNUMBERNOT_FOUND',
    ROUTESERVICENOT_FOUND: 'ROUTESERVICENOT_FOUND',
    STREETNAMENOT_FOUND: 'STREETNAMENOT_FOUND',
    POSTALCODENOT_FOUND: 'POSTALCODENOT_FOUND',
    UNVERIFIABLE_ADDRESS: 'UNVERIFIABLE_ADDRESS',
    MULTIPLEADDRESSMATCHES_INTERNATIONAL: 'MULTIPLEADDRESSMATCHES_INTERNATIONAL',
    ADDRESSMATCHNOT_FOUND: 'ADDRESSMATCHNOT_FOUND',
    UNSUPPORTEDCHARACTERSET: 'UNSUPPORTEDCHARACTERSET'
};

var STATUSCODES = {
    COMPLETED: 'COMPLETED',
    INVALID_REQUEST: 'INVALID_REQUEST',
    DECLINED: 'DECLINED'
};

/**
 * *
 * @param {*} response *
 * @returns {*} *
 */
function handleDAVResponse(response) {
    var status = response.status;
    var returnValue = {
        status: status,
        reason: null,
        data: null
    };
    switch (status) { // eslint-disable-line default-case
        case STATUSCODES.COMPLETED:
            returnValue.data = response.addressVerificationInformation;
            break;
        case STATUSCODES.INVALID_REQUEST:
        case STATUSCODES.DECLINED:
            var reason = response.reason;
            var message = response.message;
            if (reason === STATUSCODES.MISSING_FIELD) {
                var details = response.details;
                returnValue.data = details;
            } else {
                returnValue.data = message;
            }
            returnValue.reason = reason;
    }
    return returnValue;
}

/**
 *
 * @param {module:model/apiClient/model/Riskv1addressverificationsOrderInformationShipTo} billTo bill to info
 * @param {module:model/apiClient/model/Riskv1addressverificationsOrderInformationShipTo} shipTo ship to info
 * @param {string} referenceInformationCode referenceInformationCode
 * @param {string} merchantCustomerId merchantCustomerId
 * @returns {JSON} valid address
 */
function httpVerifyCustomerAddress(billTo, shipTo, referenceInformationCode, merchantCustomerId) {
    var cybersourceRestApi = require('../../apiClient/index');
    var instance = new cybersourceRestApi.VerificationApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var orderInformation = new cybersourceRestApi.Riskv1addressverificationsOrderInformation();
    orderInformation.billTo = billTo;
    orderInformation.shipTo = billTo; // For DAV set same address for BillTo and shipTo

    var buyerInformation = new cybersourceRestApi.Riskv1addressverificationsBuyerInformation();
    buyerInformation.merchantCustomerId = merchantCustomerId;

    var request = new cybersourceRestApi.VerifyCustomerAddressRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.orderInformation = orderInformation;
    request.buyerInformation = buyerInformation;

    var result = '';
    instance.verifyCustomerAddress(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = handleDAVResponse(data);
        } else {
            throw new Error(data);
        }
    });
    return result;
}

module.exports = {
    handleDAVResponse: handleDAVResponse,
    httpVerifyCustomerAddress: httpVerifyCustomerAddress,
    STATUSCODES: STATUSCODES,
    REASONCODES: REASONCODES
};
