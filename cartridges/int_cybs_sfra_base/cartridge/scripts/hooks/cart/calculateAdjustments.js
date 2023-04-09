/* eslint-disable no-plusplus */

'use strict';

var calculate = require('app_storefront_base/cartridge/scripts/hooks/cart/calculate');
var Status = require('dw/system/Status');
var configObject = require('../../../configuration/index');

var overrides = {};
var collections = require('*/cartridge/scripts/util/collections');

/**
 * *
 * @param {*} basket *
 * @returns {*} *
 */
function calculateTax(basket) {
    calculate.calculateTax(basket);
    if (configObject.taxServiceEnabled) {
        var basketPriceAdjustments = basket.getPriceAdjustments();
        collections.forEach(basketPriceAdjustments, function (basketPriceAdjustment) {
            basketPriceAdjustment.updateTax(0);
        });
    }
    return new Status(Status.OK);
}

if (configObject.cartridgeEnabled) {
    overrides.calculateTax = calculateTax;
}

var calculateTaxOverrides = {};
var keys = Object.keys(calculate);
var overrideKey = Object.keys(overrides);

for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        calculateTaxOverrides[key] = overrides[key];
    } else {
        calculateTaxOverrides[key] = calculate[key]; // eslint-disable-line no-self-assign
    }
}

module.exports = calculateTaxOverrides;
