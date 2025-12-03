/* eslint-disable no-plusplus */

'use strict';

var BaseCreditFormProcessor = require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit_form_processor.js');
var configObject = require('~/cartridge/configuration/index.js');
var server = require('server');

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var array = require('*/cartridge/scripts/util/array');
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
        viewData = ucPaymentHelper.updateViewDataFromForm(paymentForm, viewFormData);
    }
    var viewData = viewFormData;
    if (paymentForm.creditCardFields.flexresponse.value) {
        var correctCardType = '';
        switch (paymentForm.creditCardFields.cardType.value) { // eslint-disable-line default-case
            case 'visa':
                correctCardType = 'Visa';
                break;
            case 'mastercard':
                correctCardType = 'Master Card';
                break;
            case 'amex':
                correctCardType = 'Amex';
                break;
            case 'discover':
                correctCardType = 'Discover';
                break;
            case 'dinersclub':
                correctCardType = 'DinersClub';
                break;
            case 'maestro':
                correctCardType = 'Maestro';
                break;
            case 'jcb':
                correctCardType = 'JCB';
                break;
            case "cartesbancaires":
                correctCardType = "CartesBancaires";
                break;
            case "elo":
                correctCardType = "Elo";
                break;
            case "cup":
                correctCardType = "China UnionPay";
                break;
            case "jcrew":
                correctCardType = "JCrew";
                break;
            case 'meeza':
                correctCardType = 'Meeza';
                break;
            case 'carnet':
                correctCardType = 'Carnet';
                break;
            case 'mada':
                correctCardType = 'Mada';
                break;
            case 'eftpos':
                correctCardType = 'EFTPOS';
                break;
        }
        // eslint-disable-next-line no-param-reassign
        paymentForm.creditCardFields.cardType.value = correctCardType;
        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };
        viewData.paymentInformation = {
            cardType: {
                value: paymentForm.creditCardFields.cardType.value,
                htmlName: paymentForm.creditCardFields.cardType.htmlName
            },
            cardNumber: {
                value: paymentForm.creditCardFields.cardNumber.value,
                htmlName: paymentForm.creditCardFields.cardNumber.htmlName
            },
            expirationMonth: {
                value: parseInt(
                    paymentForm.creditCardFields.expirationMonth.selectedOption,
                    10
                ),
                htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
            },
            expirationYear: {
                value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
                htmlName: paymentForm.creditCardFields.expirationYear.htmlName
            }
        };
        viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;

        return {
            error: false,
            viewData: viewData
        };
    }
    var creditCardErrors = {};

    if (!req.form.storedPaymentUUID) {
        // verify credit card form data
        if (!configObject.flexMicroformEnabled && !configObject.unifiedCheckoutEnabled) {
            creditCardErrors = COHelpers.validateCreditCard(paymentForm);
        }
    }

    if (Object.keys(creditCardErrors).length) {
        return {
            fieldErrors: creditCardErrors,
            error: true
        };
    }

    viewData.paymentMethod = {
        value: paymentForm.paymentMethod.value,
        htmlName: paymentForm.paymentMethod.value
    };

    viewData.paymentInformation = {
        cardType: {
            value: paymentForm.creditCardFields.cardType.value,
            htmlName: paymentForm.creditCardFields.cardType.htmlName
        },
        cardNumber: {
            value: paymentForm.creditCardFields.cardNumber.value,
            htmlName: paymentForm.creditCardFields.cardNumber.htmlName
        },
        securityCode: {
            value: paymentForm.creditCardFields.securityCode.value,
            htmlName: paymentForm.creditCardFields.securityCode.htmlName
        },
        expirationMonth: {
            value: parseInt(
                paymentForm.creditCardFields.expirationMonth.selectedOption,
                10
            ),
            htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
        },
        expirationYear: {
            value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
            htmlName: paymentForm.creditCardFields.expirationYear.htmlName
        }
    };

    if (req.form.storedPaymentUUID) {
        viewData.storedPaymentUUID = req.form.storedPaymentUUID;
        // SFRA sometimes sends 'undefined' as a string
        if (req.form.storedPaymentUUID === 'undefined' || !req.form.storedPaymentUUID) {
            viewData.storedPaymentUUID = null;
        } else {
            viewData.storedPaymentUUID = req.form.storedPaymentUUID;
        }
    }

    viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;

    // process payment information
    if (viewData.storedPaymentUUID
        && req.currentCustomer.raw.authenticated
        && req.currentCustomer.raw.registered
    ) {
        var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
        var paymentInstrument = array.find(paymentInstruments, function (item) {
            return viewData.storedPaymentUUID === item.UUID;
        });

        viewData.paymentInformation.cardNumber.value = paymentInstrument.creditCardNumber;
        viewData.paymentInformation.cardType.value = paymentInstrument.creditCardType;
        viewData.paymentInformation.securityCode.value = req.form.securityCode;
        viewData.paymentInformation.expirationMonth.value = paymentInstrument.creditCardExpirationMonth;
        viewData.paymentInformation.expirationYear.value = paymentInstrument.creditCardExpirationYear;
        viewData.paymentInformation.creditCardToken = paymentInstrument.raw.creditCardToken;
    }

    return {
        error: false,
        viewData: viewData
    };
}

/**
 * Save the credit card information to login account if save card option is selected
 * @param {Object} req - The request object
 * @param {dw.order.Basket} basket - The current basket
 * @param {Object} billingData - payment information
 * @returns {JSON} Payment Info
 */
function savePaymentInformation(req, basket, billingData) {

    var billingForm = server.forms.getForm('billing');
    var payments = require('~/cartridge/scripts/http/payments');

    // Check if UC token exists before attempting to decode
    var saveCardUC = false;
    var ucTokenValue = billingForm.creditCardFields.ucpaymenttoken.value;

    if (ucTokenValue && ucTokenValue !== '' && ucTokenValue !== 'undefined') {
        try {
            var decodedToken = payments.jwtDecode(ucTokenValue);
            if (decodedToken && decodedToken.metadata && decodedToken.metadata.consumerPreference) {
                saveCardUC = decodedToken.metadata.consumerPreference.saveCard || false;
            }
        } catch (error) {
            // Log error but don't break the flow for saved card payments
            var Logger = require('dw/system/Logger').getLogger('cybersource', 'payments');
            var errorMessage = (error instanceof Error) ? error.message : 'Unknown error decoding UC token';
            Logger.error('Error decoding UC token in savePaymentInformation: {0}', errorMessage);
            saveCardUC = false;
        }
    }

    // Handle both Flex and UC save card scenarios
    var shouldSaveCard = false;

    if (billingData.saveCard && !configObject.unifiedCheckoutEnabled) {
        shouldSaveCard = true;
    }
    // Check for UC save card
    if (configObject.unifiedCheckoutEnabled && configObject.tokenizationEnabled && saveCardUC) {
        billingData.saveCard = true;
        shouldSaveCard = true;
    }

    if (!billingData.storedPaymentUUID
        && req.currentCustomer.raw.authenticated
        && req.currentCustomer.raw.registered
        && shouldSaveCard
        && (billingData.paymentMethod.value === 'CREDIT_CARD')
    ) {
        var TRLHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper.js');
        var CustomerMgr = require('dw/customer/CustomerMgr');

        var customer = CustomerMgr.getCustomerByCustomerNumber(
            req.currentCustomer.profile.customerNo
        );

        var isallowed = TRLHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
        if (isallowed.result) {
            // Check for duplicate  instrument
            var wallet = customer.profile.wallet;
            var paymentInstruments = wallet.getPaymentInstruments().toArray();
            // eslint-disable-next-line no-undef

            var mapper = require('~/cartridge/scripts/util/mapper.js');
            var token = mapper.deserializeTokenInformation(session.privacy.tokenInformation);
            var serializedToken = mapper.serializeTokenInformation(token);
            var duplicateExists;
            if (saveCardUC) {
                duplicateExists =
                    TRLHelper.checkDuplicateInstrumentIdentifier(
                        //@ts-ignore
                        paymentInstruments,
                        session.privacy.tokenInformation,
                        customer,
                        saveCardUC
                    );
            } else {
                duplicateExists =
                    TRLHelper.checkDuplicateInstrumentIdentifier(
                        //@ts-ignore
                        paymentInstruments,
                        session.privacy.tokenInformation,
                        customer,
                        saveCardUC
                    );
            }
            //var duplicateExists = TRLHelper.checkDuplicateInstrumentIdentifier(paymentInstruments, session.privacy.tokenInformation, customer);
            if (!duplicateExists) {
                // eslint-disable-next-line no-shadow
                var BaseCreditFormProcessor = require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit_form_processor.js');
                var resultSave = BaseCreditFormProcessor.savePaymentInformation(req, basket, billingData);
            }
            var limiterResult = TRLHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
            if (limiterResult.result) {
                if (limiterResult.resetTimer) {
                    TRLHelper.resetTimer(customer);
                }

                if (limiterResult.increaseCounter) {
                    TRLHelper.increaseCounter(customer);
                }
            }

            // eslint-disable-next-line block-scoped-var
            return resultSave;
        }
    }
    return null;
}

var overrides = {};
if (configObject.cartridgeEnabled) {
    if (configObject.flexMicroformEnabled || configObject.unifiedCheckoutEnabled) {
        overrides.processForm = processForm;
    }
    overrides.savePaymentInformation = savePaymentInformation;
}

// Register overrides
var CreditFormProcessorExport = {};
var keys = Object.keys(BaseCreditFormProcessor);
var overrideKey = Object.keys(overrides);
for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        CreditFormProcessorExport[key] = overrides[key];
    } else {
        CreditFormProcessorExport[key] = BaseCreditFormProcessor[key];
    }
}

module.exports = CreditFormProcessorExport;
