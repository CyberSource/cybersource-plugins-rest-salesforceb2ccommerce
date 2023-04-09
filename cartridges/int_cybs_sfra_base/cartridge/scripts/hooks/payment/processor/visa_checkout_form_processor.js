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
    if (!paymentForm.creditCardFields.cardNumber.value) {
        return {
            error: false,
            viewData: viewFormData
        };
    }
    try {
        var viewData = viewFormData;
        var payload = JSON.parse(paymentForm.creditCardFields.cardNumber.value);
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };
        viewData.paymentInformation = {
            cardNumber: {
                value: paymentForm.creditCardFields.cardNumber.value,
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

/**
 * Save the credit card information to login account if save card option is selected
 * @param {Object} req - The request object
 * @param {dw.order.Basket} basket - The current basket
 * @param {Object} billingData - payment information
 * @returns {JSON} Payment Info
 */
function savePaymentInformation(req, basket, billingData) {
    if (!billingData.storedPaymentUUID
        && req.currentCustomer.raw.authenticated
        && req.currentCustomer.raw.registered
        && billingData.saveCard
        && (billingData.paymentMethod.value === 'CREDIT_CARD')
    ) {
        var TRLHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper.js');
        var CustomerMgr = require('dw/customer/CustomerMgr');

        var customer = CustomerMgr.getCustomerByCustomerNumber(
            req.currentCustomer.profile.customerNo
        );

        var address = billingData.address;
        var isallowed = TRLHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer, address);
        if (isallowed.result) {
            var BaseCreditFormProcessor = require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit_form_processor.js');
            var resultSave = BaseCreditFormProcessor.savePaymentInformation(req, basket, billingData);
            var tokenRateLimiterHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper');
            var limiterResult = tokenRateLimiterHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
            if (limiterResult.result) {
                if (limiterResult.resetTimer) {
                    tokenRateLimiterHelper.resetTimer(customer);
                }

                if (limiterResult.increaseCounter) {
                    tokenRateLimiterHelper.increaseCounter(customer);
                }
            }

            return resultSave;
        }
    }
    return null;
}

var CreditFormProcessorExport = {};
if (configObject.cartridgeEnabled) {
    CreditFormProcessorExport.processForm = processForm;
    CreditFormProcessorExport.savePaymentInformation = savePaymentInformation;
}

module.exports = CreditFormProcessorExport;
