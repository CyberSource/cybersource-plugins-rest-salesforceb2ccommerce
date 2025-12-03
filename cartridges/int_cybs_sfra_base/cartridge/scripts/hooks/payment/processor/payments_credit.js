/* eslint-disable no-plusplus */

'use strict';

var baseBasicCreditHook = require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var server = require('server');
var collections = require('*/cartridge/scripts/util/collections');
var payments = require('../../../http/payments');
var mapper = require('~/cartridge/scripts/util/mapper.js');

/**
 * Creates a token.
 * @param {string} accounNumber accounNumber
 * @param {string} expiryMonth expiryMonth
 * @param {string} expiryYear expiryYear
 * @param {string} securityCode securityCode
 * @param {string} email email
 * @param {string} address address
 * @param {string} referenceCode referenceCode
 * @param {boolean} skipDMFlag skipDMFlag
 * @param {boolean} skipFlexCheck skipFlexCheck
 * @returns {string} token
 */
function createToken(
    accounNumber,
    expiryMonth,
    expiryYear,
    securityCode,
    email,
    address,
    referenceCode,
    skipDMFlag,
    skipFlexCheck
) {
    /* eslint-disable no-param-reassign */
    var configObject = require('~/cartridge/configuration/index.js');
    // eslint-disable-next-line no-shadow
    var server = require('server');
    if (configObject.tokenizationEnabled) {
        var tokenManagement = require('~/cartridge/scripts/http/tokenManagement.js');

        var token = '';
        var argvLength = arguments.length;
        if (argvLength === 0) {
            var paymentForm = server.forms.getForm('creditCard');
            accounNumber = paymentForm.cardNumber.value;
            expiryMonth = paymentForm.expirationMonth.value;
            expiryYear = paymentForm.expirationYear.value;
            securityCode = paymentForm.securityCode.value;
            address = paymentForm.billToAddressFields;
            referenceCode = '';
            // eslint-disable-next-line no-undef
            if (session.isCustomerAuthenticated()) {
                // eslint-disable-next-line no-undef
                email = session.getCustomer().getProfile().email;
            } else {
                throw new Error('Error in conversion detail report : service unavailable');
            }
        }
        try { // eslint-disable-line no-useless-catch
            if (address) {
                address = mapper.SFFCAddressToProviderAddress(address);
            }
            var tokenInformation;
            var billingForm;
            if (skipFlexCheck !== undefined) {
                if (!configObject.flexMicroformEnabled) {
                    tokenInformation = tokenManagement.httpCreateToken(accounNumber, expiryMonth, expiryYear, securityCode, email, address, referenceCode, skipDMFlag);
                } else {
                    billingForm = server.forms.getForm('billing');
                    tokenInformation = tokenManagement.httpFlexCreateToken(
                        billingForm.creditCardFields.flexresponse.value,
                        email,
                        address,
                        referenceCode
                    );
                }
            } else {
                billingForm = server.forms.getForm('billing');
                tokenInformation = tokenManagement.httpFlexCreateToken(
                    billingForm.creditCardFields.flexresponse.value,
                    email,
                    address,
                    referenceCode
                );
            }

            if (tokenInformation.customer != null && tokenInformation.customer.id != null) {
                // eslint-disable-next-line no-undef
                session.privacy.tokenInformation = [
                    tokenInformation.instrumentIdentifier.id,
                    tokenInformation.paymentInstrument.id,
                    skipFlexCheck,
                    tokenInformation.customer.id
                ].join('-');
            } else {
                // eslint-disable-next-line no-undef
                session.privacy.tokenInformation = [
                    tokenInformation.instrumentIdentifier.id,
                    tokenInformation.paymentInstrument.id,
                    skipFlexCheck
                ].join('-');
            }

            token = mapper.serializeTokenInformation(tokenInformation);
        } catch (e) {
            throw e;
        }
    } else {
        // eslint-disable-next-line block-scoped-var
        token = baseBasicCreditHook.createToken();
    }
    // eslint-disable-next-line block-scoped-var
    return token;
}

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var configObject = require('~/cartridge/configuration/index.js');
    var Logger = require('dw/system/Logger');
    var logger = Logger.getLogger('Cybersource', 'PaymentProcessor');

    var currentBasket = basket;
    var cardErrors = {};
    var serverErrors = [];
    var cardNumber = paymentInformation.cardNumber.value;
    var cardSecurityCode = (configObject.flexMicroformEnabled || configObject.unifiedCheckoutEnabled) ? '' : paymentInformation.securityCode.value;
    var expirationMonth = paymentInformation.expirationMonth.value;
    var expirationYear = paymentInformation.expirationYear.value;
    var email = basket.customerEmail;
    var cardType = paymentInformation.cardType.value;

    // Fallback to base implementation for traditional payment processing
    if (!configObject.flexMicroformEnabled && !configObject.unifiedCheckoutEnabled) {
        var baseResult = baseBasicCreditHook.Handle(basket, paymentInformation);
        if (baseResult.error) {
            return baseResult;
        }
    }
    try {
        Transaction.wrap(function () {
            var paymentForm = server.forms.getForm('billing');

            // Clear existing payment instruments
            currentBasket.removeAllPaymentInstruments();

            var paymentInstruments = currentBasket.getPaymentInstruments(
                PaymentInstrument.METHOD_CREDIT_CARD
            );

            collections.forEach(paymentInstruments, function (item) {
                currentBasket.removePaymentInstrument(item);
            });

            var paymentInstrument = currentBasket.createPaymentInstrument(
                PaymentInstrument.METHOD_CREDIT_CARD, currentBasket.totalGrossPrice
            );

            paymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);
            paymentInstrument.setCreditCardNumber(cardNumber);
            paymentInstrument.setCreditCardType(cardType);
            paymentInstrument.setCreditCardExpirationMonth(expirationMonth);
            paymentInstrument.setCreditCardExpirationYear(expirationYear);

            if (configObject.unifiedCheckoutEnabled) {
                paymentInstrument.custom.UCToken = paymentForm.creditCardFields.ucpaymenttoken.value;
            }
            // Handle tokenization for registered users who choose to save card

            if (basket.customer.registered && configObject.tokenizationEnabled && paymentForm.creditCardFields.saveCard.checked) {
                var token;
                var tokenManagement = require('~/cartridge/scripts/http/tokenManagement.js');
                var billingForm = server.forms.getForm('billing');
                //var token1 = billingForm.creditCardFields.ucpaymenttoken.value;
                if (require('*/cartridge/configuration/index').unifiedCheckoutEnabled && paymentForm.creditCardFields.ucpaymenttoken.value) {
                    // UC Microform token processing
                    logger.info('Processing UC payment token for basket: {0}', basket.UUID);

                    if (paymentInformation.creditCardToken != null) {
                        token = paymentInformation.creditCardToken;
                    } else {
                        var ucResponse = tokenManagement.httpUCCreateToken(
                            paymentForm.creditCardFields.ucpaymenttoken.value,
                            email,
                            basket.billingAddress,
                            basket.UUID
                        );

                        if (ucResponse.success) {
                            // Store session information for UC tokens
                            if (ucResponse.result.customer && ucResponse.result.customer.id) {
                                // eslint-disable-next-line no-undef
                                session.privacy.tokenInformation = [
                                    ucResponse.result.instrumentIdentifier.id,
                                    ucResponse.result.paymentInstrument.id,
                                    'false',
                                    ucResponse.result.customer.id,
                                    'UC'
                                ].join('-');
                            } else {
                                // eslint-disable-next-line no-undef
                                session.privacy.tokenInformation = [
                                    ucResponse.result.instrumentIdentifier.id,
                                    ucResponse.result.paymentInstrument.id,
                                    'false',
                                    'UC'
                                ].join('-');
                            }

                            token = mapper.serializeTokenInformation(ucResponse.result);
                            logger.info('UC token created and serialized for basket: {0}', basket.UUID);
                        } else {
                            logger.error('UC token creation failed: {0}', ucResponse.error);
                            throw new Error('UC tokenization failed: ' + ucResponse.error);
                        }
                    }

                    paymentInstrument.setCreditCardToken(token);
                } else if (!configObject.flexMicroformEnabled) {
                    // Traditional tokenization
                    token = paymentInformation.creditCardToken
                        ? paymentInformation.creditCardToken
                        : createToken(
                            cardNumber,
                            expirationMonth,
                            expirationYear,
                            cardSecurityCode,
                            email,
                            basket.billingAddress,
                            basket.UUID,
                            true,
                            false
                        );
                    paymentInstrument.setCreditCardToken(token);
                } else {
                    // Flex Microform token processing

                    if (paymentInformation.creditCardToken != null) {
                        token = paymentInformation.creditCardToken;
                    } else {
                        var flexInfo = tokenManagement.httpFlexCreateToken(paymentForm.creditCardFields.flexresponse.value, email, basket.billingAddress, basket.UUID);
                        if (flexInfo.customer != null && flexInfo.customer.id != null) {
                            // eslint-disable-next-line no-undef
                            session.privacy.tokenInformation = [
                                flexInfo.instrumentIdentifier.id,
                                flexInfo.paymentInstrument.id,
                                false,
                                flexInfo.customer.id
                            ].join('-');
                        } else {
                            // eslint-disable-next-line no-undef
                            session.privacy.tokenInformation = [
                                flexInfo.instrumentIdentifier.id,
                                flexInfo.paymentInstrument.id,
                                false
                            ].join('-');
                        }
                        token = mapper.serializeTokenInformation(flexInfo);
                    }
                    paymentInstrument.setCreditCardToken(
                        token
                    );
                }
            }
            // }
        });
        return {
            fieldErrors: cardErrors,
            serverErrors: serverErrors,
            error: false
        };
    } catch (e) {
        logger.error('Payment processing error for basket {0}: {1}', basket.UUID, e.message);
        serverErrors.push(
            Resource.msg('error.payment.not.valid', 'checkout', null)
        );
        return {
            fieldErrors: [],
            serverErrors: serverErrors,
            error: true
        };
    }
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;
    var order = OrderMgr.getOrder(orderNumber);
    var billingAddress = order.billingAddress;
    var shippingAddress = order.shipments[0].shippingAddress;
    var total = order.totalGrossPrice;
    var paymentForm = server.forms.getForm('billing');
    // eslint-disable-next-line no-shadow
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var card = {
        token: paymentInstrument.creditCardToken,
        jwttoken: paymentForm.creditCardFields.flexresponse.value,
        ucJwtToken: paymentInstrument.custom.UCToken,
        creditcardnumber: paymentInstrument.creditCardNumber,
        securityCode: paymentForm.creditCardFields.securityCode.htmlValue,
        expirationMonth: paymentInstrument.creditCardExpirationMonth,
        expirationYear: paymentInstrument.creditCardExpirationYear,
        cardType: paymentInstrument.creditCardType ? paymentInstrument.creditCardType.toLowerCase() : null,
        // eslint-disable-next-line no-undef
        gPayToken: paymentInstrument.custom.GooglePayEncryptedData,

    };
    // eslint-disable-next-line no-undef
    var customerEmail = order.customerEmail;
    var currencyCode = order.currencyCode.toUpperCase();
    try {
        // process authorization
        var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
        var result = payments.httpAuthorizeWithToken(card, customerEmail, orderNumber, total.value, currencyCode, billingAddress, shippingAddress, lineItems);

        Transaction.wrap(function () {
            // eslint-disable-next-line no-undef
            session.privacy.orderId = orderNumber;
            // eslint-disable-next-line no-undef
            session.privacy.orderStatus = result.status;
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            if (!empty(card.gPayToken)) {
                paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.maskedCreditCardNumber + ', '
                    + paymentInstrument.creditCardType + ', ' + paymentInstrument.creditCardExpirationMonth + '/' + paymentInstrument.creditCardExpirationYear;
            } else if (paymentInstrument.custom.UCToken !== null && paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            } else {
                paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardNumber + ', ' + paymentInstrument.creditCardType;
            }

            delete paymentInstrument.custom.UCToken;
        });
    } catch (e) {
        error = true;
        var errorData = {};

        // Extract CyberSource response data from declined payment error
        var cybersourceResponseData = null;

        if (typeof e === 'object' && e !== null) {
            // Primary check: CARD_NOT_AUTHORIZED_ERROR with messageText (JSON string)
            if (e.type === 'CARD_NOT_AUTHORIZED_ERROR' && e.messageText) {
                try {
                    cybersourceResponseData = JSON.parse(e.messageText);
                    // Set transaction details if we found CyberSource response data
                    if (cybersourceResponseData && cybersourceResponseData.id) {
                        Transaction.wrap(function () {
                            // Set transaction ID and processor even for declined payments
                            session.privacy.orderId = orderNumber;
                            // eslint-disable-next-line no-undef
                            session.privacy.orderStatus = cybersourceResponseData.status;
                            paymentInstrument.paymentTransaction.setTransactionID(cybersourceResponseData.id);
                            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
                            if (!empty(card.gPayToken)) {
                                paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardHolder + ', ' + paymentInstrument.maskedCreditCardNumber + ', '
                                    + paymentInstrument.creditCardType + ', ' + paymentInstrument.creditCardExpirationMonth + '/' + paymentInstrument.creditCardExpirationYear;
                            } else if (paymentInstrument.custom.UCToken !== null && paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
                            } else {
                                paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardNumber + ', ' + paymentInstrument.creditCardType;
                            }

                            delete paymentInstrument.custom.UCToken;
                        });
                    }
                    errorData.message = cybersourceResponseData.errorInformation.message; // Store original for debugging
                } catch (parseError) {
                    // If parsing fails, store the raw messageText for debugging
                    errorData.message = e.messageText;
                }
            }

        }
        serverErrors.push(
            Resource.msg('error.technical', 'checkout', null)
        );
        Logger.getLogger('Cybersource', 'PaymentAuthorization').error('Authorization error for order {0}: {1}', orderNumber, JSON.stringify(errorData));
    }
    return {
        fieldErrors: fieldErrors,
        serverErrors: serverErrors,
        error: error
    };
}

var overrides = {};
var configObject = require('~/cartridge/configuration/index.js');

if (configObject.cartridgeEnabled) {
    overrides.createToken = createToken;
    overrides.Authorize = Authorize;
    overrides.Handle = Handle;
}
// Register overrides
var CreditProcessorExport = {};
var keys = Object.keys(baseBasicCreditHook);
var overrideKey = Object.keys(overrides);
for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        CreditProcessorExport[key] = overrides[key];
    } else {
        CreditProcessorExport[key] = baseBasicCreditHook[key];
    }
}

module.exports = CreditProcessorExport;
