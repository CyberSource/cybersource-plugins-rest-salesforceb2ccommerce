/* eslint-disable no-plusplus */

'use strict';

var COHelpers = require('app_storefront_base/cartridge/scripts/checkout/checkoutHelpers');
var Cookie = require('dw/web/Cookie');
var Resource = require('dw/web/Resource');

var davCookieName = 'davCheck';
var Transaction = require('dw/system/Transaction');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var OrderMgr = require('dw/order/OrderMgr');
var Order = require('dw/order/Order');
var Status = require('dw/system/Status');
var configObject = require('../../configuration/index');
var DAV = require('../http/addressVerification');
var CardHelper = require('../helpers/CardHelper');

// Overrides
/**
 * *
 * @param {*} timeout *
 */
function setAvsCookie(timeout) {
    // eslint-disable-next-line no-param-reassign
    timeout = (timeout === undefined) ? 60 : timeout;
    var davCheckCookie = new Cookie(davCookieName, 1);
    // to account for abandoned carts
    davCheckCookie.setMaxAge(timeout);
    davCheckCookie.setHttpOnly(true);
    // eslint-disable-next-line no-undef
    response.addHttpCookie(davCheckCookie);
}

/**
 * *
 */
function unsetAvsCookie() {
    setAvsCookie(0);
}

/**
 * *
 * @returns {*} *
 */
function isAvsCookieSet() {
    // eslint-disable-next-line no-undef
    var cookies = request.getHttpCookies();
    for (var i = 0; i < cookies.cookieCount; i++) {
        if (cookies[i].name === davCookieName) {
            return true;
        }
    }
    return false;
}

/**
 * *
 * @param {*} billTo *
 * @param {*} AvsStandard *
 * @returns {*} *
 */
function isAddressFormEqualToAvsStandard(billTo, AvsStandard) {
    if (billTo == null || AvsStandard == null) {
        return false;
    }
    return billTo.address1 === AvsStandard.address1.withApartment
        && billTo.administrativeArea === AvsStandard.administrativeArea
        && billTo.country === AvsStandard.country
        && billTo.locality === AvsStandard.locality
        && billTo.postalCode === AvsStandard.postalCode;
}

/**
 * *
 * @param {*} billingData *
 * @param {*} currentBasket *
 * @param {*} customer *
 * @returns {*} *
 */
function savePaymentInstrumentToWallet(billingData, currentBasket, customer) {
    var wallet = customer.getProfile().getWallet();
    var server = require('server');
    var billingForm = server.forms.getForm('billing');

    var transientToken = billingForm.creditCardFields.ucpaymenttoken.value;
    if (transientToken) {
        var payments = require("~/cartridge/scripts/http/payments");
        var paymentDetails = payments.getPaymentDetails(transientToken);
    }

    var token = currentBasket.paymentInstruments[0].creditCardToken;

    // Determine payment method - check if UC token exists
    var isUCPayment = !empty(transientToken);
    var isFlexPayment = !isUCPayment && billingData.paymentInformation;
    if (isUCPayment) {
        return Transaction.wrap(function () {
            var paymentInstrument = wallet.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);
            paymentInstrument.setCreditCardHolder(paymentDetails.orderInformation.billTo.firstName + " " + paymentDetails.orderInformation.billTo.lastName);
            paymentInstrument.setCreditCardNumber(billingData.paymentInformation.cardNumber.value);
            paymentInstrument.setCreditCardType(billingData.paymentInformation.cardType.value);
            paymentInstrument.setCreditCardExpirationMonth(
                parseInt(billingData.paymentInformation.expirationMonth.value, 10)
            );
            paymentInstrument.setCreditCardExpirationYear(
                parseInt(billingData.paymentInformation.expirationYear.value, 10)
            );
            paymentInstrument.setCreditCardToken(token);
            return paymentInstrument;
        });

    } else if (isFlexPayment) {
        return Transaction.wrap(function () {
            var storedPaymentInstrument = wallet.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);

            storedPaymentInstrument.setCreditCardHolder(
                currentBasket.billingAddress.fullName
            );
            storedPaymentInstrument.setCreditCardNumber(
                billingData.paymentInformation.cardNumber.value
            );
            storedPaymentInstrument.setCreditCardType(
                billingData.paymentInformation.cardType.value
            );
            storedPaymentInstrument.setCreditCardExpirationMonth(
                billingData.paymentInformation.expirationMonth.value
            );
            storedPaymentInstrument.setCreditCardExpirationYear(
                billingData.paymentInformation.expirationYear.value
            );

            storedPaymentInstrument.setCreditCardToken(token);

            return storedPaymentInstrument;
        });
    }
}
/**
 * Attempts to place the order
 * @param {dw.order.Order} order - The order object to be placed
 * @param {Object} fraudDetectionStatus - an Object returned by the fraud detection hook
 * @returns {Object} an error object
 */
function placeOrder(order, fraudDetectionStatus) {
    var result = { error: false };
    Transaction.wrap(function () {
        // Clean up UCToken from all payment instruments
        var paymentInstruments = order.getPaymentInstruments();
        if (paymentInstruments && paymentInstruments.length > 0) {
            for (var i = 0; i < paymentInstruments.length; i++) {
                var paymentInstrument = paymentInstruments[i];
                CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
            }
        }
    });
    try {
        Transaction.begin();
        if (fraudDetectionStatus.status === 'review') {
            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
            Transaction.commit();
            return result;
        }

        var placeOrderStatus = OrderMgr.placeOrder(order);
        if (placeOrderStatus === Status.ERROR) {
            throw new Error();
        }

        if (fraudDetectionStatus.status === 'flag') {
            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_NOTCONFIRMED);
        } else {
            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
        }

        order.setExportStatus(Order.EXPORT_STATUS_READY);
        Transaction.commit();
    } catch (e) {
        Transaction.wrap(function () { OrderMgr.failOrder(order, true); });
        result.error = true;
    }

    return result;
}

/**
 * *
 * @param {*} form *
 * @returns {*} *
 */
function validateShippingForm(form) {
    var errors = COHelpers.validateFields(form);
    if (configObject.davEnabled) {
        if (Object.keys(errors).length > 0) {
            unsetAvsCookie();
        } else if (!isAvsCookieSet()) {
            setAvsCookie();
            var billTo = {
                address1: form.address1.value,
                address2: form.address2.value,
                administrativeArea: form.states && form.states.stateCode.value,
                country: form.country.value,
                locality: form.city.value,
                postalCode: form.postalCode.value
            };

            var davReponse = DAV.httpVerifyCustomerAddress(
                billTo
            );
            if (davReponse.data && davReponse.data.standardAddress) {
                var standardaddress = davReponse.data.standardAddress;
                if (isAddressFormEqualToAvsStandard(billTo, standardaddress)) {
                    unsetAvsCookie();
                    return errors;
                }
            }
            davReponse.davCookieName = davCookieName;
            davReponse.resources = {
                modalheader: Resource.msg('dav.modalheader', 'payments', null),
                originaladdress: Resource.msg('dav.originaladdress', 'payments', null),
                useoriginaladdress: Resource.msg('dav.useoriginaladdress', 'payments', null),
                standardaddress: Resource.msg('dav.standardaddress', 'payments', null),
                usestandardaddress: Resource.msg('dav.usestandardaddress', 'payments', null),
                address1: Resource.msg('dav.address1', 'payments', null),
                address2: Resource.msg('dav.address2', 'payments', null),
                state: Resource.msg('dav.state', 'payments', null),
                city: Resource.msg('dav.city', 'payments', null),
                postalcode: Resource.msg('dav.postalcode', 'payments', null),
                country: Resource.msg('dav.country', 'payments', null),
                tryagain: Resource.msg('dav.tryagain', 'payments', null),
                invalidAddress: Resource.msg('dav.invalidAddress', 'payments', null)
            };
            errors.dav = davReponse;
        } else {
            unsetAvsCookie();
        }
    }
    return errors;
}

/**
 * handles the payment authorization for each payment instrument
 * @param {dw.order.Order} order - the order object
 * @param {string} orderNumber - The order number for the order
 * @returns {Object} an error object
 */
function handlePayments(order, orderNumber) {
    var PaymentMgr = require('dw/order/PaymentMgr');
    var HookMgr = require('dw/system/HookMgr');
    var result = {};

    if (order.totalNetPrice !== 0.00) {
        var paymentInstruments = order.paymentInstruments;

        if (paymentInstruments.length === 0) {
            Transaction.wrap(function () { OrderMgr.failOrder(order, true); });
            result.error = true;
        }

        if (!result.error) {
            for (var i = 0; i < paymentInstruments.length; i++) {
                var paymentInstrument = paymentInstruments[i];
                var paymentProcessor = PaymentMgr
                    .getPaymentMethod(paymentInstrument.paymentMethod)
                    .paymentProcessor;
                var authorizationResult;
                if (paymentProcessor === null) {
                    Transaction.begin();
                    paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
                    Transaction.commit();
                } else {
                    if (HookMgr.hasHook('app.payment.processor.'
                            + paymentProcessor.ID.toLowerCase())) {
                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
                            'Authorize',
                            orderNumber,
                            paymentInstrument,
                            paymentProcessor
                        );
                    } else {
                        authorizationResult = HookMgr.callHook(
                            'app.payment.processor.default',
                            'Authorize'
                        );
                    }

                    if (authorizationResult.error) {
                        Transaction.wrap(function () { OrderMgr.failOrder(order, true); });
                        result.error = true;
                        break;
                    }
                    result = authorizationResult;
                }
            }
        }
    }

    return result;
}

var overrides = {};
if (configObject.cartridgeEnabled) {
    overrides = {
        validateShippingForm: validateShippingForm,
        savePaymentInstrumentToWallet: savePaymentInstrumentToWallet,
        placeOrder: placeOrder,
        handlePayments: handlePayments
    };
}

// Register overrides
var COHelpersOverride = {};
var keys = Object.keys(COHelpers);
var overrideKey = Object.keys(overrides);
for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        COHelpersOverride[key] = overrides[key];
    } else {
        COHelpersOverride[key] = COHelpers[key];
    }
}

module.exports = COHelpersOverride;
