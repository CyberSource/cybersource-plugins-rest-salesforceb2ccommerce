/* eslint-disable no-plusplus */

'use strict';

var BasketCalculationHelpers = require('app_storefront_base/cartridge/scripts/helpers/basketCalculationHelpers');
var Money = require('dw/value/Money');
var taxCalculation = require('*/cartridge/scripts/http/taxCalculation.js');
var configObject = require('../../configuration/index');

/**
 * @param {*} taxResult *
 */
function storeTaxResult(taxResult) {
    var Cookie = require('dw/web/Cookie');
    var taxCookieValue = encodeURIComponent(JSON.stringify(taxResult));
    var taxCookie = new Cookie(configObject.taxCookieId, taxCookieValue);
    taxCookie.setHttpOnly(true);
    // eslint-disable-next-line no-undef
    response.addHttpCookie(taxCookie);
}

/**
 * *
 * @returns {*} *
 */
function retrieveTaxResult() {
    /* eslint-disable block-scoped-var */
    // eslint-disable-next-line no-undef
    var cookies = request.getHttpCookies();
    var taxCookie = null;
    for (var i = 0; i < cookies.getCookieCount(); i++) {
        if (cookies[i].name === configObject.taxCookieId) {
            taxCookie = cookies[i];
            break;
        }
    }
    if (!taxCookie) return null;
    var taxResult = JSON.parse(decodeURIComponent(taxCookie.value));
    for (i = 0; i < taxResult.taxes.length; i++) {
        taxResult.taxes[i].value = new Money(
            taxResult.taxes[i].normalized.taxAmount,
            taxResult.taxes[i].normalized.currency
        );
    }
    return taxResult;
}

/**
 * @param {*} basket *
 * @param {*} taxResult *
 * @returns {*} *
 */
function isTaxStale(basket, taxResult) {
    var lineItems = basket.allLineItems;
    if (!taxResult) return true;
    var difference = [];
    for (var i = 0; i < lineItems.length; i++) {
        var found = false;
        var lineItem = lineItems[i];
        var quantity = null;
        // ('quantity' in lineItem) && (lineItem.quantity != null && 'value' in lineItem.quantity )? lineItem.quantity.value.toString() : null;
        if ('quantity' in lineItem) {
            if (lineItem === Object(lineItem.quantity)) {
                quantity = lineItem.quantity.value.toString();
            } else {
                quantity = lineItem.quantity;
            }
        }
        var UUID = lineItem.UUID;
        for (var j = 0; j < taxResult.taxes.length; j++) {
            var tax = taxResult.taxes[j];
            // eslint-disable-next-line no-undef
            if (tax.uuid === UUID && (tax.quantity === quantity || !(lineItem instanceof dw.order.ProductLineItem))) {
                found = true;
                break;
            }
        }
        if (!found) {
            difference.push(lineItem);
        }
    }
    return difference.length > 0;
}

/**
 * Calculate sales taxes
 * @param {dw.order.Basket} basket - current basket
 * @returns {Object} - object describing taxes that needs to be applied
 */
function calculateTaxes(basket) {
    var helpers = require('~/cartridge/scripts/util/helpers.js');
    // eslint-disable-next-line no-shadow
    var configObject = require('../../configuration/index');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    // If Rest Tax Calculation Service is not Enabled fall back into
    // base cartridge's implementation
    if (!configObject.taxServiceEnabled) {
        return BasketCalculationHelpers.calculateTaxes(basket);
    }

    var allowedRoutes = configObject.calculateTaxOnRoute;
    var currentAction = helpers.getCurrentRouteAction();

    var allowedRouteResult = allowedRoutes.filter(function (el) {
        return el.route === currentAction;
    });

    var isApplePay = currentAction.toLowerCase().indexOf('__SYSTEM__ApplePay'.toLowerCase()) >= 0;
    var allowedRoute;
    if (isApplePay && basket.billingAddress) {
        allowedRoute = true;
    } else {
        allowedRouteResult = allowedRoutes.filter(function (el) {
            return el.route === currentAction;
        });
        allowedRoute = allowedRoutes.length > 0 ? allowedRouteResult[0] : null;
    }

    var calculatedTaxValue = retrieveTaxResult();

    var isServiceTaxResponseStale = isTaxStale(basket, calculatedTaxValue);

    // If the taxes have been calculted previously and the basket hasn't changed and this is not an allowed route, return previous value.
    if (calculatedTaxValue && !isServiceTaxResponseStale && !allowedRoute) {
        return retrieveTaxResult();
    }
    if (!allowedRoute) {
        // If the taxes have not yet been calculated or the value is stale, and we are in a route that is not enabled
        // to use tax calculation services fall back into default implementation.
        return BasketCalculationHelpers.calculateTaxes(basket);
    }
    if (calculatedTaxValue && !isServiceTaxResponseStale && !allowedRoute.recalculate) {
        // If the taxes have been calculted previously and the basket hasn't changed and we are in an allowed route that does not
        // require recalculation, return previous value,
        return retrieveTaxResult();
    }

    // If we are in an enabled route and the taxes have not been calculated or they are stale, or we are in a route that requires
    // recalculation call external tax calculation services and store response.

    var allProductLineItems = mapper.MapOrderLineItems(basket.allLineItems, true);

    var taxCalculationResult = taxCalculation.httpCalculateTaxes(basket);
    var currency = taxCalculationResult.orderInformation.amountDetails.currency.toUpperCase();
    var taxLineItems = taxCalculationResult.orderInformation.lineItems;
    var taxes = [];

    // Tax list, this is assuming the API returns all items in the order they were sent,
    // if not, we need to find another way to do this since there's no UUID nor other way
    // to correlate items sent for calculation.
    for (var i = 0; i < allProductLineItems.length; i++) {
        var product = allProductLineItems[i];
        var productTax = taxLineItems[i];
        var taxAmount = productTax.taxAmount;
        taxes.push({
            amount: true,
            uuid: product.UUID,
            value: new Money(taxAmount, currency),
            quantity: ('quantity' in product) ? product.quantity : null,
            normalized: {
                currency: currency,
                taxAmount: taxAmount
            }
        });

        var basketItem = basket.getAllLineItems().toArray().filter(function (item) { return item.UUID === product.UUID; })[0]; // eslint-disable-line no-loop-func
        var quantity = ('quantity' in basketItem && basketItem.quantity.value) || product.quantity;

        var itemBasePrice = 0;
        var hasProrated = (basketItem.lineItemCtnr.priceAdjustments.length > 0 && 'proratedPrice' in basketItem);
        if (hasProrated) {
            itemBasePrice = basketItem.proratedPrice / quantity;
        } else {
            itemBasePrice = basketItem.basePrice;
        }

        var rate = (((taxAmount / quantity) / itemBasePrice));
        basketItem.updateTax(rate);
    }

    // Format required by SFRA to update basket
    var taxResult = {
        custom: {},
        taxes: taxes
    };
    storeTaxResult(taxResult);
    return taxResult;
}

var overrides = {};
if (configObject.cartridgeEnabled) {
    overrides.calculateTaxes = calculateTaxes;
}

// Register overrides
var BasketCalculationHelpersOverride = {};
var keys = Object.keys(BasketCalculationHelpers);
var overrideKey = Object.keys(overrides);

for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        BasketCalculationHelpersOverride[key] = overrides[key];
    } else {
        BasketCalculationHelpersOverride[key] = BasketCalculationHelpers[key];
    }
}

module.exports = BasketCalculationHelpersOverride;
