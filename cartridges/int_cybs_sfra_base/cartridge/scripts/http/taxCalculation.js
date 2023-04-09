/* eslint-disable no-plusplus */

'use strict';

/**
 * @param {*} lineItems *
 * @param {*} index *
 * @param {*} priceAdjustments *
 */
function handlePriceAdjustment(lineItems, index, priceAdjustments) {
    if (typeof lineItems[index] !== 'undefined' && lineItems[index].productName === 'PRICE_ADJUSTMENT') {
        priceAdjustments.push(lineItems[index]);
        lineItems.splice(index, 1);
        handlePriceAdjustment(lineItems, index, priceAdjustments);
    }
}

/**
 * @param {*} basket *
 * @param {*} includeRequest *
 * @returns {*} *
 */
function httpCalculateTaxes(basket, includeRequest) {
    var errors = require('~/cartridge/scripts/util/errors.js');
    var configObject = require('../../configuration/index');
    var mapper = require('../util/mapper');
    var cybersourceRestApi = require('../../apiClient/index');
    var requestObject = mapper.buildRequestFromBasket(basket, basket.UUID);
    var priceAdjustments = [];
    var lineItems = requestObject.orderInformation.lineItems;
    for (var i = 0; i < lineItems.length; i++) {
        handlePriceAdjustment(lineItems, i, priceAdjustments);
    }
    requestObject.orderInformation.lineItems = lineItems;

    var instance = new cybersourceRestApi.TaxesApi(configObject);
    var taxResult = {};
    instance.calculateTax(requestObject, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            taxResult = data;
        } else if (error >= 400 && error < 500) {
            var obj = JSON.parse(data);
            throw new errors.SERVICE_ERROR(error, obj);
        } else {
            throw JSON.parse(data);
        }
    });
    taxResult.orderInformation.lineItems = taxResult.orderInformation.lineItems.concat(priceAdjustments);
    if (!includeRequest) {
        return taxResult;
    }
    return [requestObject, taxResult];
}

module.exports = {
    httpCalculateTaxes: httpCalculateTaxes
};
