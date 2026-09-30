/* eslint-disable no-plusplus */

'use strict';

var BasketCalculationHelpers = require('app_storefront_base/cartridge/scripts/helpers/basketCalculationHelpers');
var Money = require('dw/value/Money');
var taxCalculation = require('*/cartridge/scripts/http/taxCalculation.js');
var configObject = require('../../configuration/index');
var hmacHelper = require('*/cartridge/scripts/helpers/hmacHelper');

/**
 * @param {*} taxResult *
 */
function storeTaxResult(taxResult) {
    var Cookie = require('dw/web/Cookie');
    var taxData = JSON.stringify(taxResult);

    // Generate HMAC signature for the tax data
    var signature = hmacHelper.generateHMAC(taxData);

    // Store both data and signature
    var signedTaxData = {
        data: taxResult,
        signature: signature
    };

    var taxCookieValue = encodeURIComponent(JSON.stringify(signedTaxData));
    var taxCookie = new Cookie(configObject.taxCookieId, taxCookieValue);
    taxCookie.setHttpOnly(true);
    taxCookie.setSecure(true); // Ensure cookie is only sent over HTTPS
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

    var signedTaxData;
    try {
        signedTaxData = JSON.parse(decodeURIComponent(taxCookie.value));
    } catch (e) {
        // Invalid JSON in cookie, reject it
        return null;
    }

    // Verify this is a signed cookie with required fields
    if (!signedTaxData || !signedTaxData.data || !signedTaxData.signature) {
        // Cookie format is invalid or legacy unsigned cookie, reject it
        return null;
    }

    // Verify HMAC signature using constant-time comparison
    var taxData = JSON.stringify(signedTaxData.data);
    if (!hmacHelper.verifyHMAC(taxData, signedTaxData.signature)) {
        // Signature verification failed, cookie has been tampered with
        return null;
    }

    // Signature is valid, reconstruct Money objects
    var taxResult = signedTaxData.data;
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
 * Correct check that a stored tax result still applies to the basket, used for the Checkout-Begin
 * payment render. Returns true only when EVERY basket line item is represented in the cached tax by
 * UUID and, for product line items, the same quantity.
 *
 * This exists because `isTaxStale` has a quantity-comparison bug (it compares the stored string
 * quantity against a dw.value.Quantity object, so it reports any product basket as stale). That
 * always-stale behavior is relied on by the allowed checkout routes to force a fresh tax service call,
 * so isTaxStale is intentionally left as-is; this helper gives the render path a correct answer without
 * changing that.
 * @param {dw.order.Basket} basket - current basket
 * @param {Object} taxResult - stored SFRA-shaped tax result { taxes: [...] }
 * @returns {boolean} - true when the cached tax covers the basket exactly
 */
function cachedTaxMatchesBasket(basket, taxResult) {
    if (!taxResult || !taxResult.taxes) {
        return false;
    }
    var collections = require('*/cartridge/scripts/util/collections');
    var taxByUuid = {};
    for (var j = 0; j < taxResult.taxes.length; j++) {
        taxByUuid[taxResult.taxes[j].uuid] = taxResult.taxes[j];
    }
    var allMatch = true;
    collections.forEach(basket.getAllLineItems(), function (lineItem) {
        if (!allMatch) {
            return;
        }
        var tax = taxByUuid[lineItem.UUID];
        if (!tax) {
            allMatch = false;
            return;
        }
        // eslint-disable-next-line no-undef
        if (lineItem instanceof dw.order.ProductLineItem) {
            var qty = (lineItem.quantity && lineItem.quantity.value != null)
                ? lineItem.quantity.value.toString()
                : null;
            if (String(tax.quantity) !== String(qty)) {
                allMatch = false;
            }
        }
    });
    return allMatch;
}

/**
 * Calculate sales tax using ONLY the default tax jurisdiction, ignoring any shipping address on
 * the basket. Used on cart/minicart (non-checkout, non-Apple-Pay) routes: the DW Apple Pay express
 * flow leaves its shipping address on the shared cart basket, and TaxMgr would otherwise tax that
 * address's jurisdiction (0% in RefArch) and drop the cart total. Mirrors app_storefront_base
 * `scripts/hooks/taxes.js` calculateTaxes but pins the jurisdiction to the default.
 * @param {dw.order.Basket} basket - current basket
 * @returns {Object} - SFRA-shaped tax result { taxes: [...], custom: {} }
 */
function calculateDefaultJurisdictionTaxes(basket) {
    var TaxMgr = require('dw/order/TaxMgr');
    var collections = require('*/cartridge/scripts/util/collections');

    var taxJurisdictionId = TaxMgr.defaultTaxJurisdictionID;
    // No default jurisdiction configured — defer to the base implementation.
    if (!taxJurisdictionId) {
        return BasketCalculationHelpers.calculateTaxes(basket);
    }

    var taxes = [];
    collections.forEach(basket.getAllLineItems(), function (lineItem) {
        var taxClassId = lineItem.taxClassID;
        // do not touch line items with a fixed tax rate
        if (taxClassId === TaxMgr.customRateTaxClassID) {
            return;
        }
        if (!taxClassId) {
            taxClassId = TaxMgr.defaultTaxClassID;
        }
        if (!taxClassId) {
            return;
        }
        var taxRate = TaxMgr.getTaxRate(taxClassId, taxJurisdictionId);
        if (!taxRate && taxRate !== 0) {
            return;
        }
        taxes.push({ uuid: lineItem.UUID, value: taxRate, amount: false });
    });

    return { taxes: taxes, custom: {} };
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

    var allowedRoutes = configObject.calculateTaxOnRoute;
    var currentAction = helpers.getCurrentRouteAction();
    var isApplePay = currentAction.toLowerCase().indexOf('__SYSTEM__ApplePay'.toLowerCase()) >= 0;
    // Checkout-Begin is the full-page checkout render; the case that matters is the stage=payment
    // reload after a FAILED order (billingAddress is set). The CyberSource tax computed during checkout
    // is still cached and — as the basket line items are unchanged — still valid, so at render we just
    // RETURN it (never a tax API call during a page render). Gated on billingAddress so pre-payment /
    // initial-shipping loads keep their default-jurisdiction display.
    var isCheckoutBeginPayment = currentAction === 'Checkout-Begin' && !!basket.billingAddress;

    var allowedRouteResult = allowedRoutes.filter(function (el) {
        return el.route === currentAction;
    });
    var allowedRoute;
    if (isApplePay && basket.billingAddress) {
        allowedRoute = true;
    } else {
        allowedRoute = allowedRoutes.length > 0 ? allowedRouteResult[0] : null;
    }

    // Cart / minicart / PDP / etc. — any non-checkout route that is NOT the Apple Pay express flow —
    // must ALWAYS show the SFCC default-jurisdiction tax, independent of the CyberSource tax-service
    // config: this is a pre-checkout display concern, not a CyberSource-tax concern. The DW Apple Pay
    // express flow leaves its shipping address on the shared cart basket; without this the cart would
    // tax that address's jurisdiction (0% in RefArch) instead of the default and the total would drop.
    // Apple Pay routes fall through so the sheet/order still use the real shipping-address tax.
    // Checkout-Begin at the payment step (billingAddress set) also skips this branch so it can return
    // the cached CyberSource tax below; a pre-payment Checkout-Begin still shows default-jurisdiction.
    if (!allowedRoute && !isApplePay && !isCheckoutBeginPayment) {
        return calculateDefaultJurisdictionTaxes(basket);
    }

    // From here we are on a checkout or Apple Pay route. If the CyberSource tax calculation service
    // is not enabled, fall back to the base (address-based) SFCC implementation for those routes.
    if (!configObject.taxServiceEnabled) {
        return BasketCalculationHelpers.calculateTaxes(basket);
    }

    var calculatedTaxValue = retrieveTaxResult();

    // Checkout-Begin payment render (e.g. the reload after a failed order): return the CyberSource tax
    // already cached during checkout when it still matches the basket, otherwise fall back to base SFCC
    // — never a tax API call at render. We use cachedTaxMatchesBasket (a correct UUID + quantity check)
    // rather than isTaxStale, which has a quantity-comparison bug that reports every product basket as
    // stale; that always-stale behavior is relied on by the allowed checkout routes to force
    // recalculation, so it is deliberately left unchanged here.
    if (isCheckoutBeginPayment) {
        if (calculatedTaxValue && cachedTaxMatchesBasket(basket, calculatedTaxValue)) {
            return calculatedTaxValue;
        }
        return BasketCalculationHelpers.calculateTaxes(basket);
    }

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

    // The loop above only produces entries for the taxable line items sent to CyberSource (products,
    // non-zero shipping, surcharges, gift certificates). Every OTHER line item in the basket — a
    // zero-priced shipping line item, and the price adjustment / coupon line items a promotion creates
    // (both product-level and order-level) — is absent from `taxes`. Base calculate.calculateTax
    // iterates basket.getAllLineItems() and resets any line item missing from this list to an
    // unavailable tax via updateTax(null), which makes basket.updateTotals() report NOT_AVAILABLE total
    // tax / grand total (blank tax + total in the summary). So we mirror that same iteration and
    // backfill a zero tax for every not-yet-taxed line item, guaranteeing base never nulls one. Zero is
    // correct for a discount: its effect is already in the product line items' net CyberSource tax, so
    // the adjustment's own tax must be 0 — the same thing calculateAdjustments.js does for order-level
    // price adjustments.
    var collections = require('*/cartridge/scripts/util/collections');
    var taxedUuids = {};
    for (var t = 0; t < taxes.length; t++) {
        taxedUuids[taxes[t].uuid] = true;
    }
    collections.forEach(basket.getAllLineItems(), function (lineItem) {
        if (!taxedUuids[lineItem.UUID]) {
            taxes.push({
                amount: true,
                uuid: lineItem.UUID,
                value: new Money(0, currency),
                quantity: null,
                normalized: {
                    currency: currency,
                    taxAmount: 0
                }
            });
        }
    });

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
 