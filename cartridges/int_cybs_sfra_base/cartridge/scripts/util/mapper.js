/* eslint-disable no-undef */
/* eslint-disable no-plusplus */
/* eslint-disable block-scoped-var */

'use strict';

var configObject = require('../../configuration/index');

// TAX Calculation Fields
/**
 *
 * @param {Object} basketAddress basketAddress
 * @returns {Object} address
 */
function mapAddress(basketAddress) {
    return basketAddress ? {
        address1: basketAddress.address1,
        address2: basketAddress.address2,
        locality: basketAddress.city,
        administrativeArea: basketAddress.stateCode,
        postalCode: basketAddress.postalCode,
        country: basketAddress.countryCode.value
    } : null;
}

/**
 * @param {*} lineItems *
 * @param {*} overrideTax *
 * @returns {*} *
 */
function MapOrderLineItems(lineItems, overrideTax) {
    var StringUtils = require('dw/util/StringUtils');
    var mappedProductLineItems = [];
    var locale = request.locale.equals('default') ? 'en-us' : request.locale.replace('_', '-').toLowerCase();
    for (var i = 0; i < lineItems.length; i++) {
        var lineItem = lineItems[i];

        var itemObject = {};
        if (lineItem instanceof dw.order.ProductLineItem) {
            itemObject = {
                productName: lineItem.productName,
                quantity: lineItem.quantityValue.toString(),
                unitPrice: StringUtils.formatNumber(lineItem.basePrice.value, '000000.00', locale),
                totalAmount: lineItem.adjustedGrossPrice.value,
                amount: overrideTax ? lineItem.priceValue : null,
                taxAmount: overrideTax ? StringUtils.formatNumber(lineItem.adjustedTax.value > 0 ? lineItem.adjustedTax.value : 0, '000000.00', locale) : null,
                taxRate: overrideTax ? lineItem.taxRate : null,
                productCode: 'default',
                productSKU: lineItem.productID,
                UUID: lineItem.UUID
            };

            if (lineItem.lineItemCtnr.priceAdjustments.length > 0 || lineItem.proratedPriceAdjustmentPrices.length > 0) {
                itemObject.unitPrice = StringUtils.formatNumber(lineItem.proratedPrice.value / lineItem.quantityValue, '000000.00', locale);
                itemObject.totalAmount = StringUtils.formatNumber(lineItem.proratedPrice.value, '000000.00', locale);
                itemObject.amount = lineItem.proratedPrice.value;
            }
            if (!overrideTax && lineItem.taxClassID === 'exempt') {
                itemObject.taxAmount = 0;
                itemObject.taxRate = 0;
            }
        } else if (lineItem instanceof dw.order.GiftCertificateLineItem) {
            itemObject = {
                productName: 'GIFT_CERTIFICATE',
                quantity: '1',
                unitPrice: StringUtils.formatNumber(lineItem.adjustedPrice.value, '000000.00', locale),
                totalAmount: lineItem.adjustedGrossPrice.value,
                amount: lineItem.priceValue,
                taxAmount: overrideTax ? StringUtils.formatNumber(0, '000000.00', locale) : null,
                taxRate: overrideTax ? lineItem.taxRate : null,
                productCode: 'GIFT_CERTIFICATE',
                productSKU: 'GIFT_CERTIFICATE',
                UUID: lineItem.UUID
            };
        } else if (lineItem instanceof dw.order.ShippingLineItem) {
            itemObject = {
                productName: lineItem.ID,
                quantity: '1',
                unitPrice: overrideTax ? StringUtils.formatNumber(lineItem.adjustedPrice.value, '000000.00', locale) : lineItem.basePrice.value,
                totalAmount: lineItem.adjustedGrossPrice.value,
                amount: overrideTax ? lineItem.priceValue : null,
                taxRate: overrideTax ? lineItem.taxRate : null,
                productCode: lineItem.ID,
                productSKU: lineItem.ID,
                UUID: lineItem.UUID
            };
            if (lineItem.adjustedTax.available && lineItem.adjustedTax.value > 0 && overrideTax) {
                itemObject.taxAmount = StringUtils.formatNumber(lineItem.adjustedTax.value, '000000.00', locale);
            }
        } else if (lineItem instanceof dw.order.ProductShippingLineItem) {
            itemObject = {
                productName: 'SHIPPING_SURCHARGE',
                quantity: '1',
                unitPrice: StringUtils.formatNumber(lineItem.adjustedPrice.value, '000000.00', locale),
                totalAmount: lineItem.adjustedGrossPrice.value,
                amount: overrideTax ? lineItem.priceValue : null,
                taxRate: overrideTax ? lineItem.taxRate : null,
                taxAmount: overrideTax ? StringUtils.formatNumber(lineItem.adjustedTax.value, '000000.00', locale) : null,
                productCode: 'SHIPPING_SURCHARGE',
                productSKU: 'SHIPPING_SURCHARGE',
                UUID: lineItem.UUID
            };
        } else if (lineItem instanceof dw.order.PriceAdjustment) {
            itemObject = {
                productName: 'PRICE_ADJUSTMENT',
                quantity: '1',
                unitPrice: StringUtils.formatNumber(lineItem.basePrice.value < 0 ? 0 : lineItem.basePrice.value, '000000.00', locale),
                totalAmount: lineItem.basePrice.value < 0 ? 0 : lineItem.basePrice.value,
                amount: lineItem.priceValue < 0 ? 0 : lineItem.priceValue,
                taxAmount: StringUtils.formatNumber(lineItem.tax.value > 0 ? lineItem.tax.value : 0, '000000.00', locale),
                taxRate: lineItem.taxRate,
                productCode: 'PRICE_ADJUSTMENT',
                productSKU: 'PRICE_ADJUSTMENT',
                UUID: lineItem.UUID
            };
        } else {
            // eslint-disable-next-line no-continue
            continue;
        }

        mappedProductLineItems.push(itemObject);
    }
    return mappedProductLineItems;
}
module.exports.MapOrderLineItems = MapOrderLineItems;

/**
 * @param {*} basket *
 * @returns {*} *
 */
function getLineItemsFromBasket(basket) {
    var StringUtils = require('dw/util/StringUtils');
    var allProductLineItems = [];
    var shipments = basket.getShipments();
    // eslint-disable-next-line no-undef
    var locale = request.locale.equals('default') ? 'en-us' : request.locale.replace('_', '-').toLowerCase();
    for (var i = 0; i < shipments.length; i++) {
        var shipment = shipments[i];
        var baskletLineItems = shipment.getAllLineItems();
        for (var j = 0; j < baskletLineItems.length; j++) {
            var lineItem = baskletLineItems[j];
            allProductLineItems.push(lineItem);
        }
    }
    var lineItems = [];
    for (var i = 0; i < allProductLineItems.length; i++) { // eslint-disable-line no-redeclare
        var product = allProductLineItems[i];
        var proratedUnitPrice = 'proratedPrice' in product
            ? (product.proratedPrice / ('quantity' in product ? product.quantity.value : 1))
            : null;
        var taxClassID = 'taxClassID' in product ? product.taxClassID : 'standard';
        var lineItem = { // eslint-disable-line no-redeclare
            taxClassID: taxClassID,
            productCode: 'default',
            productSKU: 'productID' in product ? product.productID : 'ID' in product ? product.ID : product.UUID, // eslint-disable-line no-nested-ternary
            quantity: 'quantity' in product ? product.quantity.value : 1,
            productName: 'productName' in product ? product.productName : 'default',
            unitPrice: StringUtils.formatNumber(product.basePrice.value, '000000.00', locale),
            unitproratedUnitPricePrice: proratedUnitPrice,
            UUID: product.UUID
        };
        lineItems.push(lineItem);
    }
    return lineItems;
}
/**
 * @param {*} basket *
 * @param {*} referenceCode  *
 * @returns {*} *
 */
function buildRequestFromBasket(basket, referenceCode) {
    var errors = require('~/cartridge/scripts/util/errors.js');
    // address1, city, stateCode, postalCode, countryCode.value
    var shippingAddress = mapAddress(basket.defaultShipment.shippingAddress);

    // address1, city, stateCode, postalCode, countryCode.value
    var billingAddress = mapAddress(basket.billingAddress);

    // { productSku, productCode, quantity, productName, unitPrice }[]
    var taxLineItems = MapOrderLineItems(basket.allLineItems, false);

    var nexus = configObject.taxServiceNexusStateList.join(',');
    var noNexus = configObject.taxServiceNoNexusStateList.join(',');

    if (nexus.length > 0 && noNexus.length > 0) {
        throw new errors.MERCHANT_CONFIGURATION_ERROR('Properties Nexus and NoNexus cannot be set together');
    }

    var vatRegistrationNumber = configObject.taxServiceVatRegistrationNumber;
    var requestPayload = {};

    requestPayload.clientReferenceInformation = {
        code: referenceCode,
        partner: {
            developerId: configObject.developerId,
            solutionId: configObject.solutionId
        }
    };

    requestPayload.orderInformation = {
        lineItems: taxLineItems,
        billTo: billingAddress,
        amountDetails: {
            totalAmount: basket.merchandizeTotalPrice.value.toString(),
            currency: basket.currencyCode.toUpperCase()
        },
        shipTo: shippingAddress,
        /* invoiceDetails: {
            invoiceDate:
                today.getFullYear() +
                ('0' + today.getMonth()).slice(-2) +
                ('0' + today.getDate()).slice(-2)
        }, */
        shippingDetails: {
            shipFromLocality: configObject.taxShipFromCity,
            shipFromCountry: configObject.taxShipFromCountryCode,
            shipFromPostalCode: configObject.taxShipFromZipCode,
            shipFromAdministrativeArea: configObject.taxShipFromStateCode
        },
        orderAcceptance: {
            locality: configObject.taxPurchaseOrderAcceptanceCity,
            administrativeArea: configObject.taxPurchaseOrderAcceptanceStateCode,
            postalCode: configObject.taxPurchaseOrderAcceptanceZipCode,
            country: configObject.taxPurchaseOrderAcceptanceCountryCode
        },
        orderOrigin: {
            locality: configObject.taxPurchaseOrderOriginCity,
            administrativeArea: configObject.taxPurchaseOrderOriginStateCode,
            postalCode: configObject.taxPurchaseOrderOriginZipCode,
            country: configObject.taxPurchaseOrderOriginCountryCode
        }
    };

    requestPayload.taxInformation = {
        commitIndicator: true,
        showTaxPerLineItem: 'yes',
        refundIndicator: false
        /* ,
               reportingDate: today.getFullYear() +
                   ('0' + today.getMonth()).slice(-2) +
                   ('0' + today.getDate()).slice(-2) */
    };

    var nexusList = [nexus];
    var noNexusList = [noNexus];

    if (nexus.length > 0) requestPayload.taxInformation.nexus = nexusList;
    else if (noNexus.length > 0) requestPayload.taxInformation.noNexus = noNexusList;

    requestPayload.merchantInformation = {
        vatRegistrationNumber: vatRegistrationNumber
    };

    return requestPayload;
}

module.exports.buildRequestFromBasket = buildRequestFromBasket;
module.exports.getLineItemsFromBasket = getLineItemsFromBasket;

/**
 * @param {*} order *
 * @returns {*} *
 */
function getLineItemsFromOrder(order) {
    var lineItems = order.allLineItems;
    var lineItemsResult = [];
    var maxLength = 20;
    for (var i = 0; i < lineItems.length; i++) {
        var product = lineItems[i];
        var lineItem = {
            productCode: 'default',
            productName: 'productName' in product ? product.productName.substring(0, maxLength) : 'default',
            productSKU: 'productID' in product ? product.productID.substring(0, maxLength) : 'ID' in product ? product.ID.substring(0, maxLength) : product.UUID.substring(0, maxLength), // eslint-disable-line no-nested-ternary
            UUID: product.UUID,
            quantity: 'quantity' in product ? product.quantity.value : 1,
            unitPrice: product.basePrice.value
        };
        lineItemsResult.push(lineItem);
    }
    return lineItemsResult;
}

module.exports.getLineItemsFromOrder = getLineItemsFromOrder;

/**
 * @param {*} formFields *
 * @returns {*} *
 */
function SFCCAddressFormtoProviderAddress(formFields) {
    return {
        firstName: formFields.firstName.value,
        lastName: formFields.lastName.value,
        address1: formFields.address1.value,
        address2: formFields.address2.value,
        administrativeArea: formFields.states ? formFields.states.stateCode.value : '',
        country: formFields.country.value,
        locality: formFields.city.value,
        postalCode: formFields.postalCode.value,
        phoneNumber: formFields.phone.value
    };
}

/**
 * @param {*} billingAddress *
 * @returns {*} *
 */
function SFFCAddressToProviderAddress(billingAddress) {
    if (billingAddress.hasOwnProperty('formType')) { // eslint-disable-line no-prototype-builtins
        return SFCCAddressFormtoProviderAddress(billingAddress);
    }
    return {
        firstName: billingAddress.firstName,
        lastName: billingAddress.lastName,
        address1: billingAddress.address1,
        address2: billingAddress.address2,
        administrativeArea: billingAddress.stateCode ? billingAddress.stateCode : '',
        country: billingAddress.countryCode.value,
        locality: billingAddress.city,
        postalCode: billingAddress.postalCode,
        phoneNumber: billingAddress.phone
    };
}

module.exports.SFFCAddressToProviderAddress = SFFCAddressToProviderAddress;

/**
 * @param {*} tokenInformation *
 * @returns {*} *
 */
function serializeTokenInformation(tokenInformation) {
    return [
        tokenInformation.instrumentIdentifier.id,
        tokenInformation.paymentInstrument.id
    ].join('-');
}

/**
 * @param {*} serializedTokenInformation *
 * @returns {*} *
 */
function deserializeTokenInformation(serializedTokenInformation) {
    var splitArray = serializedTokenInformation.split('-');
    return {
        instrumentIdentifier: {
            id: splitArray ? splitArray[0] : null
        },
        paymentInstrument: {
            id: splitArray ? splitArray[1] : null
        }
    };
}

module.exports.serializeTokenInformation = serializeTokenInformation;
module.exports.deserializeTokenInformation = deserializeTokenInformation;
