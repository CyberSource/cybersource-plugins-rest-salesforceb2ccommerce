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

        var token = currentBasket.paymentInstruments[0].creditCardToken;

        storedPaymentInstrument.setCreditCardToken(token);

        return storedPaymentInstrument;
    });
}
/**
 * Attempts to place the order
 * @param {dw.order.Order} order - The order object to be placed
 * @param {Object} fraudDetectionStatus - an Object returned by the fraud detection hook
 * @returns {Object} an error object
 */
function placeOrder(order, fraudDetectionStatus) {
    var result = { error: false };
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

var overrides = {};
if (configObject.cartridgeEnabled) {
    overrides = {
        validateShippingForm: validateShippingForm,
        savePaymentInstrumentToWallet: savePaymentInstrumentToWallet,
        placeOrder: placeOrder
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
