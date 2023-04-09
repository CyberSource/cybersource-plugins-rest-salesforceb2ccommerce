/* eslint-disable no-plusplus */

'use strict';

/**
 * Controller that performs Mobile Payment authorization.
 *
 * @module controllers/MobilePaymentsAdapter
 */

/**
 * Update billing details in cart object
 * @param {*} Basket *
 * @param {*} GPCheckoutPaymentData *
 * @param {*} email *
 * @returns {*} *
 */
function updateBilling(Basket, GPCheckoutPaymentData, email) {
    var CommonHelper = require('../helpers/CardHelper');
    var Transaction = require('dw/system/Transaction');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var BasketMgr = require('dw/order/BasketMgr');
    var result = {};
    var PaymentInstrumentUtils = require('../util/paymentInstrumentUtils');
    var logger = require('dw/system/Logger');

    try {
        if (PaymentMgr.getPaymentMethod('DW_GOOGLE_PAY').isActive()) {
            var basket = BasketMgr.getCurrentOrNewBasket();
            // Retrieve the inputs
            // eslint-disable-next-line no-undef
            if (!empty(Basket)) {
                Transaction.wrap(function () {
                    CommonHelper.removeExistingPaymentInstruments(basket);
                });
                PaymentInstrumentUtils.updatePaymentInstrumentGP(Basket, GPCheckoutPaymentData, email);
                result.success = true;
            } else {
                // if basket/basketUUID/encryptedPaymentData/encryptedPaymentWrappedKey/callId is empty
                // or basketUUID not equal to signature
                logger.error('basket is empty');
                result.error = true;
            }
        } else {
            // if payment method not Visa
            logger.error('payment method not Visa');
            result.error = true;
        }
    } catch (err) {
        logger.error('Error creating Google Checkout payment instrument: {0}', err.message);
        result.error = true;
    }
    return result;
}

/**
 * Create or update basket BillingAddress Google Checkout decrypted payment data from cybersource
 * @param {dw.order.OrderAddress}  lineItemCtnrAddress  Contains an address
 * @param {Object} billingInfo Contains billing info
 * @returns {Object} Returns an object
 */
function createLineItemCtnrBillingAddress(lineItemCtnrAddress, billingInfo) {
    lineItemCtnrAddress.setAddress1(billingInfo.address1);
    // eslint-disable-next-line no-undef
    if (!empty(billingInfo.address2)) {
        lineItemCtnrAddress.setAddress2(billingInfo.address2);
    }
    lineItemCtnrAddress.setCity(billingInfo.locality);
    // eslint-disable-next-line no-undef
    if (!empty(billingInfo.administrativeArea)) {
        lineItemCtnrAddress.setStateCode(billingInfo.administrativeArea);
    }
    lineItemCtnrAddress.setPostalCode(billingInfo.postalCode);
    lineItemCtnrAddress.setCountryCode(billingInfo.countryCode);
    // eslint-disable-next-line no-undef
    if (!empty(billingInfo.phoneNumber)) {
        lineItemCtnrAddress.setPhone(billingInfo.phoneNumber);
    }
    // eslint-disable-next-line no-undef
    if (!empty(billingInfo.companyName)) {
        lineItemCtnrAddress.setCompanyName(billingInfo.companyName);
    }
    lineItemCtnrAddress.setFirstName(billingInfo.name.split(' ')[0]);
    var lastName = billingInfo.name.indexOf(' ') >= 0 ? billingInfo.name.substring(billingInfo.name.indexOf(' ')) : '';
    lineItemCtnrAddress.setLastName(lastName);
    return {
        success: true,
        lineItemCtnrAddress: lineItemCtnrAddress
    };
}

/**
 * @param {*} lineItemCtnrAddress *
 * @param {*} decryptedData *
 * @returns {*} *
 */
function createLineItemCtnrShippingAddress(lineItemCtnrAddress, decryptedData) {
    // validate the lineItemCtnrAddress exists
    if (decryptedData.shipTo === null) {
        throw new Error('Shipping Address not available');
    }
    lineItemCtnrAddress.setAddress1(decryptedData.address1);
    // eslint-disable-next-line no-undef
    if (!empty(decryptedData.address2)) {
        lineItemCtnrAddress.setAddress2(decryptedData.address2);
    }
    lineItemCtnrAddress.setCity(decryptedData.locality);
    lineItemCtnrAddress.setStateCode(decryptedData.administrativeArea);
    lineItemCtnrAddress.setPostalCode(decryptedData.postalCode);
    lineItemCtnrAddress.setCountryCode(decryptedData.countryCode);
    // eslint-disable-next-line no-undef
    if (!empty(decryptedData.phoneNumber)) {
        lineItemCtnrAddress.setPhone(decryptedData.phoneNumber);
    }
    var name = decryptedData.name;
    var firstName;
    var lastName = ' ';
    if (name.indexOf(' ') >= 0) {
        var nameString = name.split(' ');
        firstName = nameString[0];
        for (var index = 1; index < nameString.length; index++) {
            lastName = lastName + nameString[index] + ' ';
        }
    } else {
        firstName = name;
    }
    lineItemCtnrAddress.setFirstName(firstName);
    lineItemCtnrAddress.setLastName(lastName);
    return {
        success: true,
        lineItemCtnrAddress: lineItemCtnrAddress
    };
}

/**
 * Update shipping details in cart object
 * @param {*} shippingDetails *
 * @returns {*} *
 */
function updateShipping(shippingDetails) {
    var BasketMgr = require('dw/order/BasketMgr');
    var ShippingMgr = require('dw/order/ShippingMgr');
    var basket = BasketMgr.getCurrentOrNewBasket();
    var shipment = basket.defaultShipment;
    var shippingAddress = {};
    var Transaction = require('dw/system/Transaction');
    var logger = require('dw/system/Logger');
    // eslint-disable-next-line no-undef
    if (!empty(shipment.getShippingAddress())) {
        // eslint-disable-next-line consistent-return
        Transaction.wrap(function () {
            // Replace the shipping address
            shippingAddress = shipment.getShippingAddress();
            // Populate the shipping address from the visa object
            shippingAddress = createLineItemCtnrShippingAddress(shippingAddress, shippingDetails);
            if (!shippingAddress.success) {
                return shippingAddress;
            }
        });
        return {
            success: true
        };
    }
    try {
        // eslint-disable-next-line consistent-return
        Transaction.wrap(function () {
            // Create the shipping address
            shippingAddress = shipment.createShippingAddress();
            // Populate the shipping address from the visa object
            shippingAddress = createLineItemCtnrShippingAddress(shippingAddress, shippingDetails);
            if (!shippingAddress.success) {
                return shippingAddress;
            }
            // Set shipping method to default if not already set
            if (shipment.shippingMethod === null) {
                shipment.setShippingMethod(ShippingMgr.getDefaultShippingMethod());
            }
        });
        return {
            success: true
        };
    } catch (err) {
        logger.error('Error creating shipment from Google Pay address: {0}', err.message);
        return {
            error: true,
            errorMsg: 'PrepareShipments failed'
        };
    }
}

// Module.exports
module.exports = {
    updateBilling: updateBilling,
    createLineItemCtnrBillingAddress: createLineItemCtnrBillingAddress,
    updateShipping: updateShipping
};
