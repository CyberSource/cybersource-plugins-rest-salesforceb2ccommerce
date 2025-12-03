'use strict';

var configObject = require('~/cartridge/configuration/index.js');

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var isCartPage = req.httpParameterMap && req.httpParameterMap.isCart && req.httpParameterMap.isCart.value === 'true';
    var isminicart = req.httpParameterMap && req.httpParameterMap.UC && req.httpParameterMap.UC.value === 'true';
    if (isCartPage || isminicart) {
        // Get current basket
        var BasketMgr = require('dw/order/BasketMgr');
        var basket = BasketMgr.getCurrentBasket();
        var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
        var paymentDetails = ucPaymentHelper.processUCToken(paymentForm.creditCardFields.ucpaymenttoken.htmlValue);
        //@ts-ignore
        ucPaymentHelper.populateBasketAddresses(basket, paymentDetails, paymentForm);
   
        // Update viewData from the populated form
        viewFormData = ucPaymentHelper.updateViewDataFromForm(paymentForm, viewFormData);
    }

    if (!paymentForm.creditCardFields.cardNumber.value) {
        return {
            error: false,
            viewData: viewFormData
        };
    }
    try {
        var viewData = viewFormData;
        // Create a structured payload that matches what apple_pay_uc.js expects
        var cardNumber = paymentForm.creditCardFields.cardNumber.value;
        var payload = {
            partialPaymentInstrument: {
                lastFourDigits: cardNumber,
                paymentType: {
                    cardBrand: paymentForm.creditCardFields.cardType.value
                }
            },
            encPaymentData: paymentForm.creditCardFields.ucpaymenttoken.value ?
                paymentForm.creditCardFields.ucpaymenttoken.value : ''
        };

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };
        viewData.paymentInformation = {
            cardNumber: {
                value: cardNumber,
                htmlName: paymentForm.creditCardFields.cardNumber.htmlName
            },
            payload: payload
        };
        return {
            error: false,
            viewData: viewData
        };
    } catch (e) {
        return {
            error: false,
            viewData: viewFormData
        };
    }
}

var ApplePayUCFormProcessorExport = {};
if (configObject.cartridgeEnabled) {
    ApplePayUCFormProcessorExport.processForm = processForm;
}

module.exports = ApplePayUCFormProcessorExport;
