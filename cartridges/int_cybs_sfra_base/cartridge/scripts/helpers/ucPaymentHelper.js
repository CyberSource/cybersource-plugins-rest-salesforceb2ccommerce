'use strict';

/**
 * Helper functions for Unified Checkout payment processing
 * Shared between Click to Pay (visa_checkout) and Google Pay (payments_credit)
 */

var Transaction = require('dw/system/Transaction');

/**
 * Process UC payment token and populate basket with billing/shipping addresses
 * @param {string} token - UC JWT token
 * @returns {Object} Payment details from UC API
 */
function processUCToken(token) {
    var payments = require('~/cartridge/scripts/http/payments.js');

    if (!token) {
        throw new Error('UC payment token is required');
    }

    var paymentDetails;
    try {
        paymentDetails = payments.getPaymentDetails(token);
        //paymentCredentials = payments.getPaymentCredentials(token);
    } catch (e) {
        var errorMsg = (e instanceof Error) ? e.message : String(e);
        throw new Error('Failed to retrieve payment details from Unified Checkout: ' + errorMsg);
    }

    return paymentDetails;
}

/**
 * Populate basket addresses from UC payment details
 * Only populates if addresses are empty (minicart flow)
 * Normal checkout flow already has addresses populated before form processor
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentDetails - Payment details from UC API
 */
function populateBasketAddresses(basket, paymentDetails, paymentForm) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

    var shipment = basket.getDefaultShipment();
    var shippingAddress = shipment.getShippingAddress();
    var billingAddress = basket.getBillingAddress();
    var isEmailRequired = empty(basket.getCustomerEmail()) || empty(basket.customerEmail) || basket.getCustomerEmail() === 'undefined' || basket.customerEmail === 'undefined';

    Transaction.wrap(function () {
        shippingAddress = shipment.createShippingAddress();

        var shipTo = paymentDetails.orderInformation.shipTo;
        shippingAddress.setFirstName(shipTo.firstName);
        shippingAddress.setLastName(shipTo.lastName);
        shippingAddress.setAddress1(shipTo.address1);
        if (!empty(shipTo.address2)) {
            shippingAddress.setAddress2(shipTo.address2);
        }
        shippingAddress.setCity(shipTo.locality);
        shippingAddress.setPostalCode(shipTo.postalCode);
        shippingAddress.setCountryCode(shipTo.country);
        shippingAddress.setStateCode(shipTo.administrativeArea);
        if (shipTo.phoneNumber) {
            shippingAddress.setPhone(shipTo.phoneNumber);
        }
        // Do NOT update paymentForm with shipping address here

        // Populate billing address
        billingAddress = basket.createBillingAddress();
        var billTo = paymentDetails.orderInformation.billTo;
        billingAddress.setFirstName(billTo.firstName);
        billingAddress.setLastName(billTo.lastName);
        billingAddress.setAddress1(billTo.address1);
        if (!empty(billTo.address2)) {
            billingAddress.setAddress2(billTo.address2);
        }
        billingAddress.setCity(billTo.locality);
        billingAddress.setPostalCode(billTo.postalCode);
        billingAddress.setCountryCode(billTo.country);
        billingAddress.setStateCode(billTo.administrativeArea);
        billingAddress.setPhone(billTo.phoneNumber);
        if (isEmailRequired) {
            basket.setCustomerEmail(billTo.email);
        }
        // If shipping phone is empty, copy billing phone to shipping
        if (empty(shipTo.phoneNumber)) {
            if (billTo.phoneNumber) {
                shippingAddress.setPhone(billTo.phoneNumber);
            }
        }
        // Always update paymentForm billing fields if provided
        if (paymentForm && paymentForm.addressFields) {
            paymentForm.addressFields.firstName.value = billTo.firstName;
            paymentForm.addressFields.lastName.value = billTo.lastName;
            paymentForm.addressFields.address1.value = billTo.address1;
            if (!empty(billTo.address2)) {
                paymentForm.addressFields.address2.value = billTo.address2;
            }
            paymentForm.addressFields.city.value = billTo.locality;
            paymentForm.addressFields.postalCode.value = billTo.postalCode;
            paymentForm.addressFields.country.value = billTo.country;
            if (paymentForm.addressFields.states && billTo.administrativeArea) {
                paymentForm.addressFields.states.stateCode.value = billTo.administrativeArea;
            }
            if (paymentForm.contactInfoFields && billTo.phoneNumber) {
                paymentForm.contactInfoFields.phone.value = billTo.phoneNumber;
            }
            //}
        }
    });

    // Recalculate the basket 
    COHelpers.recalculateBasket(basket);
}

/**
 * Update viewData object from populated payment form
 * This ensures viewData reflects the UC payment details after form population
 * @param {Object} paymentForm - Payment form object (already populated)
 * @param {Object} viewData - Existing viewData object to update
 * @returns {Object} Updated viewData object
 */
function updateViewDataFromForm(paymentForm, viewData) {
    var updatedViewData = viewData || {};

    // Update address fields from the populated form
    if (paymentForm && paymentForm.addressFields) {
        updatedViewData.address = {
            firstName: { value: paymentForm.addressFields.firstName.value },
            lastName: { value: paymentForm.addressFields.lastName.value },
            address1: { value: paymentForm.addressFields.address1.value },
            address2: { value: paymentForm.addressFields.address2.value },
            city: { value: paymentForm.addressFields.city.value },
            postalCode: { value: paymentForm.addressFields.postalCode.value },
            countryCode: { value: paymentForm.addressFields.country.value }
        };

        if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
            updatedViewData.address.stateCode = { value: paymentForm.addressFields.states.stateCode.value };
        }
    }

    // Update contact info from the populated form
    if (paymentForm && paymentForm.contactInfoFields) {
        updatedViewData.phone = { value: paymentForm.contactInfoFields.phone.value };
    }

    return updatedViewData;
}

module.exports = {
    processUCToken: processUCToken,
    populateBasketAddresses: populateBasketAddresses,
    updateViewDataFromForm: updateViewDataFromForm
};
