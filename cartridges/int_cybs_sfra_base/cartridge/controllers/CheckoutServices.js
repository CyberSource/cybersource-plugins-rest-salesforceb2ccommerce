'use strict';

var page = module.superModule;
var server = require('server');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');
server.extend(page);

// for Gpay on checkout page
server.post('SubmitPaymentGP', function (req, res, next) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var Encoding = require('dw/crypto/Encoding');
    var paymentForm = server.forms.getForm('billing');
    var BasketMgr = require('dw/order/BasketMgr');
    var billingFormErrors = {};
    var viewData = {};
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    var cart = BasketMgr.getCurrentBasket();
    var Locale = require('dw/util/Locale');
    var OrderModel = require('*/cartridge/models/order');
    var Transaction = require('dw/system/Transaction');
    var currentLocale = Locale.getLocale(req.locale.id);
    var usingMultiShipping = false;
    var basketModel = new OrderModel(cart, {
        usingMultiShipping: usingMultiShipping,
        countryCode: currentLocale.country,
        containerView: 'basket'
    });
    // Check if request is from Unified Checkout
    // eslint-disable-next-line no-undef
    var isUnifiedCheckout = request.httpParameterMap.UC && request.httpParameterMap.UC.value === 'true';

    // eslint-disable-next-line no-undef
    var isminicart = request.httpParameterMap.isminicart && request.httpParameterMap.isminicart.value === 'true';
    // eslint-disable-next-line no-undef
    session.privacy.ipAddress = request.httpHeaders['x-is-remote_addr'];
    if (!isUnifiedCheckout) {
        // eslint-disable-next-line no-undef
        var paymentData = JSON.parse(request.httpParameterMap.googletoken);
    } else if (isUnifiedCheckout && isminicart) {
        var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
        var paymentDetails = ucPaymentHelper.processUCToken(paymentForm.creditCardFields.ucpaymenttoken.htmlValue);
        ucPaymentHelper.populateBasketAddresses(cart, paymentDetails, paymentForm);
    }

    billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
    var contactFieldsErrors = COHelpers.validateBillingForm(paymentForm.contactInfoFields);
    if (Object.keys(billingFormErrors).length) {
        // respond with form data and errors
        secureResponseHelper.secureJsonResponse(res, {
            form: paymentForm,
            fieldErrors: [billingFormErrors],
            serverErrors: [],
            error: true
        });
    } else if (Object.keys(contactFieldsErrors).length) {
        secureResponseHelper.secureJsonResponse(res, {
            form: paymentForm,
            fieldErrors: [contactFieldsErrors],
            serverErrors: [],
            error: true
        });
    } else {
        viewData.address = {
            firstName: {
                value: paymentForm.addressFields.firstName.value
            },
            lastName: {
                value: paymentForm.addressFields.lastName.value
            },
            address1: {
                value: paymentForm.addressFields.address1.value
            },
            address2: {
                value: paymentForm.addressFields.address2.value
            },
            city: {
                value: paymentForm.addressFields.city.value
            },
            postalCode: {
                value: paymentForm.addressFields.postalCode.value
            },
            countryCode: {
                value: paymentForm.addressFields.country.value
            }
        };

        if (Object.prototype.hasOwnProperty
            .call(paymentForm.addressFields, 'states')) {
            viewData.address.stateCode = {
                value: paymentForm.addressFields.states.stateCode.value
            };
        }

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };

        viewData.email = {
            value: cart.customerEmail
        };

        viewData.phone = {
            value: paymentForm.contactInfoFields.phone.value
        };

        viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;
        // Code to update card type details on place order page
        var paymentInstrument = null;
        // eslint-disable-next-line no-undef
        if (!empty(cart.getPaymentInstruments())) {
            paymentInstrument = cart.getPaymentInstruments()[0];
        }
        var cardType;
        if (paymentInstrument != null) {
            cardType = paymentInstrument.creditCardType;
        }
        if (paymentInstrument != null && paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            basketModel.billing.payment.selectedPaymentInstruments[0].type = cardType;
            basketModel.billing.payment.selectedPaymentInstruments[0].maskedCreditCardNumber = paymentInstrument.creditCardNumber;
        }
        viewData.order = basketModel;
        res.setViewData(viewData);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            // eslint-disable-next-line no-shadow
            var BasketMgr = require('dw/order/BasketMgr');
            var Resource = require('dw/web/Resource');
            var Transaction = require('dw/system/Transaction');
            // eslint-disable-next-line no-shadow
            var URLUtils = require('dw/web/URLUtils');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            // eslint-disable-next-line no-shadow
            var currentBasket = BasketMgr.getCurrentBasket();
            var billingData = res.getViewData();
            if (!currentBasket) {
                delete billingData.paymentInformation;
                secureResponseHelper.secureJsonResponse(res, {
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }
            var billingAddress = currentBasket.billingAddress;
            var billingForm = server.forms.getForm('billing');
            billingForm.creditCardFields.cardNumber.htmlValue = '';
            billingForm.creditCardFields.securityCode.htmlValue = '';
            Transaction.wrap(function () {
                if (!billingAddress) {
                    billingAddress = currentBasket.createBillingAddress();
                }
                billingAddress.setFirstName(billingData.address.firstName.value);
                billingAddress.setLastName(billingData.address.lastName.value);
                billingAddress.setAddress1(billingData.address.address1.value);
                billingAddress.setAddress2(billingData.address.address2.value);
                billingAddress.setCity(billingData.address.city.value);
                billingAddress.setPostalCode(billingData.address.postalCode.value);
                if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
                    billingAddress.setStateCode(billingData.address.stateCode.value);
                }
                billingAddress.setCountryCode(billingData.address.countryCode.value);

                if (billingData.storedPaymentUUID) {
                    billingAddress.setPhone(req.currentCustomer.profile.phone);
                    currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
                } else {
                    billingAddress.setPhone(billingData.phone.value);
                    currentBasket.setCustomerEmail(billingData.email.value);
                }
            });
            // Add hook to call google payment
            var mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');

            if (isUnifiedCheckout) {
                var result = mobileAdaptor.updateBilling(currentBasket, null, billingData.email.value);
                Transaction.wrap(function () {
                    var paymentInstruments = currentBasket.getPaymentInstruments();
                    if (paymentInstruments.length > 0) {
                        paymentInstruments[0].custom.UCToken = paymentForm.creditCardFields.ucpaymenttoken.value;
                    }
                });
            } else {
                var result = mobileAdaptor.updateBilling(currentBasket, paymentData.paymentMethodData.info, billingData.email.value);
                var GPtoken = paymentData.paymentMethodData.tokenizationData.token;
                Transaction.wrap(function () {
                    var paymentInstruments = currentBasket.getPaymentInstruments();
                    if (paymentInstruments.length > 0) {
                        paymentInstruments[0].custom.GooglePayEncryptedData = Encoding.toBase64(new dw.util.Bytes(GPtoken));
                        paymentInstruments[0].custom.isGooglePaycardHolderAuthenticated = paymentData.paymentMethodData.info.assuranceDetails.cardHolderAuthenticated;;
                    }
                });
            }

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });
            // Re-calculate the payments.
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(currentBasket);
            if (calculatedPaymentTransaction.error) {
                secureResponseHelper.secureJsonResponse(res, {
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }
            // return back google
            if (result.success) {
                // eslint-disable-next-line no-undef
                if (request.httpParameterMap.paymentData != null && !isminicart) {
                    secureResponseHelper.secureJsonResponse(res, {
                        error: false
                    });
                } else if (isminicart) {
                    var AccountModel = require('*/cartridge/models/account');
                    var accountModel = new AccountModel(req.currentCustomer);
                    var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
                        req,
                        accountModel
                    );

                    secureResponseHelper.secureJsonResponse(res, {
                        error: false,
                        order: basketModel,
                        customer: accountModel,
                        renderedPaymentInstruments: renderedStoredPaymentInstrument,
                        form: billingForm,
                        continueUrl: URLUtils.url('Checkout-Begin', 'stage', 'placeOrder').toString()
                    });
                }
            }
        });
    }
    return next();
});

/**
 * *
 * @param {*} cart *
 * @param {*} shippingdetails *
 * @returns {*} *
 */
function shippingUpdate(cart, shippingdetails) {
    var logger = require('dw/system/Logger');
    var mobileAdaptor;
    var shipment = cart.defaultShipment;
    // eslint-disable-next-line no-undef
    if (!empty(shipment.getShippingAddress())) {
        mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
        mobileAdaptor.updateShipping(shippingdetails);
        return {
            success: true
        };
    }
    try {
        mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
        mobileAdaptor.updateShipping(shippingdetails);
        return {
            success: true
        };
    } catch (err) {
        logger.error('Error creating shipment from Google pay address: {0}', err.message);
        return {
            error: true,
            errorMsg: err.message
        };
    }
}

//for Gapy on cart and minicart
// eslint-disable-next-line consistent-return
server.post('GetGooglePayToken', function (req, res, next) {
    var Encoding = require('dw/crypto/Encoding');
    var paymentForm = server.forms.getForm('billing');
    var payments = require('*/cartridge/scripts/http/payments');
    // Check if this is from Unified Checkout
    var isUnifiedCheckout = request.httpParameterMap.UC && request.httpParameterMap.UC.value === 'true';
    var response = '';
    var CardHelper = require('../scripts/helpers/CardHelper');
    var Resource = require('dw/web/Resource');
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    var cart = BasketMgr.getCurrentBasket();
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    // eslint-disable-next-line no-shadow
    var URLUtils = require('dw/web/URLUtils');
    var mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
    var Transaction = require('dw/system/Transaction');
    var logger = require('dw/system/Logger');
    // eslint-disable-next-line no-undef
    session.privacy.ipAddress = request.httpHeaders['x-is-remote_addr'];

    if (isUnifiedCheckout) {
        var transientToken = paymentForm.creditCardFields.ucpaymenttoken.value;
        var paymentDetails = payments.getPaymentDetails(transientToken);
        var orderInformation = paymentDetails.orderInformation;
        var shippingdetails = paymentDetails.orderInformation.shipTo;
        var result = mobileAdaptor.updateBilling(cart, orderInformation.billTo, orderInformation.billTo.email);
        if (result.success) {
            result = shippingUpdate(cart, shippingdetails);
            if (result.success) {
                cart = BasketMgr.getCurrentBasket();
                // calculate cart and redirect to summary page
                COHelpers.recalculateBasket(cart);
                var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
                Transaction.wrap(function () {
                    ShippingHelper.selectShippingMethod(cart.defaultShipment, null);
                });
                // Store UC token info if available from Unified Checkout
                if (isUnifiedCheckout && paymentDetails) {
                    Transaction.wrap(function () {
                        // Get the payment instrument
                        var paymentInstruments = cart.getPaymentInstruments('DW_GOOGLE_PAY');
                        if (paymentInstruments && paymentInstruments.length > 0) {
                            var paymentInstrument = paymentInstruments[0];
                            // Store the transient token as a custom attribute
                            paymentInstrument.custom.UCToken = transientToken;
                        }
                    });
                }
            }
        } else {

            logger.error('Error in google Checkout payment: problem in billing details');
            Transaction.wrap(function () {
                CardHelper.removeExistingPaymentInstruments(cart);
            });
            COHelpers.recalculateBasket(cart);
            secureResponseHelper.secureJsonResponse(res, {
                redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null)),
                error: true
            });
            return next();
        }

    } else {
        response = JSON.parse(request.httpParameterMap.paymentData);
        var shippingdetails = response.shippingAddress; // add condition for only cart
        var result = mobileAdaptor.updateBilling(cart, response.paymentMethodData.info, response.email);
        if (result.success) {
            result = shippingUpdate(cart, shippingdetails);
            if (result.success) {
                cart = BasketMgr.getCurrentBasket();
                // calculate cart and redirect to summary page
                COHelpers.recalculateBasket(cart);
                var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
                Transaction.wrap(function () {
                    ShippingHelper.selectShippingMethod(cart.defaultShipment, null);
                });
                var GPtoken = response.paymentMethodData.tokenizationData.token;
                Transaction.wrap(function () {
                    var paymentInstruments = cart.getPaymentInstruments();
                    if (paymentInstruments.length > 0) {
                        paymentInstruments[0].custom.GooglePayEncryptedData = Encoding.toBase64(new dw.util.Bytes(GPtoken));
                        paymentInstruments[0].custom.isGooglePaycardHolderAuthenticated = response.paymentMethodData.info.assuranceDetails.cardHolderAuthenticated;
                    }
                });
            }
        } else {
            logger.error('Error in google Checkout payment: problem in billing details');
            Transaction.wrap(function () {
                CardHelper.removeExistingPaymentInstruments(cart);
            });
            COHelpers.recalculateBasket(cart);
            secureResponseHelper.secureJsonResponse(res, {
                redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null)),
                error: true
            });
            return next();
        }
    }
    // eslint-disable-next-line no-undef
    if (request.httpParameterMap.paymentData != null) {
        secureResponseHelper.secureJsonResponse(res, {
            status: 'success'
        });
        return next();

    } else {
        logger.error('Error in google Checkout payment: problem in billing details');
        Transaction.wrap(function () {
            CardHelper.removeExistingPaymentInstruments(cart);
        });
        COHelpers.recalculateBasket(cart);
        secureResponseHelper.secureJsonResponse(res, {
            redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', 'error').toString(),
            error: true
        });
        return next();
    }
});

// Returns the current basket total as a plain numeric string for Google Pay
server.get('GetCartTotal', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var cart = BasketMgr.getCurrentBasket();

    if (!cart) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            totalPrice: '0'
        });
        return next();
    }

    var totalGrossPrice = cart.totalGrossPrice;
    var currencyCode = totalGrossPrice.currencyCode;

    var totalPrice = totalGrossPrice.value.toFixed(2);

    secureResponseHelper.secureJsonResponse(res, {
        error: false,
        totalPrice: totalPrice,
        currencyCode: currencyCode
    });

    return next();
});

module.exports = server.exports();
