'use strict';

var Status = require('dw/system/Status');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var Logger = require('dw/system/Logger');
var Bytes = require('dw/util/Bytes');
var Encoding = require('dw/crypto/Encoding');
var Transaction = require('dw/system/Transaction');
var PaymentManager = require('dw/order/PaymentMgr');

// eslint-disable-next-line consistent-return
exports.authorizeOrderPayment = function (order, response) {
    var paymentInstruments = order.getPaymentInstruments(
        PaymentInstrument.METHOD_DW_APPLE_PAY
    ).toArray();

    if (!paymentInstruments.length) {
        Logger.error('Unable to find Apple Pay payment instrument for order.');
        return null;
    }

    var byteData = new Bytes(JSON.stringify(response.payment.token.paymentData), 'utf8');
    var base64Encoded = Encoding.toBase64(byteData);
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var configObject = require('~/cartridge/configuration/index');
    var helpers = require('~/cartridge/scripts/util/helpers');
    var enableCaptureForApplePay = false;

    if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_ApplePayTransactionType').value === 'sale') {
        enableCaptureForApplePay = true;
    }

    var actionList = [];
    if (!configObject.fmeDmEnabled) {
        actionList.push('DECISION_SKIP');
    }

    // Determine billing and shipping info based on Apple Pay origin
    var billTo;
    var shipTo;
    var isCheckoutPage = helpers.getTopWindowRouteAction() === 'Checkout-Begin';

    if (isCheckoutPage) {
        // For checkout page: Use SFCC storefront addresses from the order
        var billingAddress = order.billingAddress;
        var shippingAddress = order.defaultShipment.shippingAddress;
        var customerEmail = order.customerEmail;
        var customerPhone = shippingAddress.phone || billingAddress.phone;

        billTo = {
            firstName: billingAddress.firstName,
            lastName: billingAddress.lastName,
            address1: billingAddress.address1,
            address2: billingAddress.address2 || '',
            locality: billingAddress.city,
            administrativeArea: billingAddress.stateCode,
            postalCode: billingAddress.postalCode,
            country: billingAddress.countryCode.value,
            email: customerEmail,
            phoneNumber: customerPhone
        };

        shipTo = {
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            address1: shippingAddress.address1,
            address2: shippingAddress.address2 || '',
            locality: shippingAddress.city,
            administrativeArea: shippingAddress.stateCode,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.countryCode.value,
            email: customerEmail,
            phoneNumber: shippingAddress.phone
        };
    } else {
        // For minicart: Use addresses from Apple Pay response
        billTo = {
            firstName: response.payment.billingContact.givenName,
            lastName: response.payment.billingContact.familyName,
            address1: response.payment.billingContact.addressLines[0],
            locality: response.payment.billingContact.locality,
            administrativeArea: response.payment.billingContact.administrativeArea,
            postalCode: response.payment.billingContact.postalCode,
            country: response.payment.billingContact.countryCode,
            email: response.payment.shippingContact.emailAddress,
            phoneNumber: response.payment.shippingContact.phoneNumber
        };

        shipTo = {
            firstName: response.payment.shippingContact.givenName,
            lastName: response.payment.shippingContact.familyName,
            address1: response.payment.shippingContact.addressLines[0],
            locality: response.payment.shippingContact.locality,
            administrativeArea: response.payment.shippingContact.administrativeArea,
            postalCode: response.payment.shippingContact.postalCode,
            country: response.payment.shippingContact.countryCode,
            email: response.payment.shippingContact.emailAddress,
            phoneNumber: response.payment.shippingContact.phoneNumber
        };
    }

    var restRequest = {
        clientReferenceInformation: {
            code: order.currentOrderNo,
            partner: {
                developerId: configObject.developerId,
                solutionId: configObject.solutionId
            }
        },
        processingInformation: {
            paymentSolution: '001',
            capture: enableCaptureForApplePay,
            actionList: actionList
        },
        paymentInformation: {
            fluidData: {
                value: base64Encoded
            }
        },
        orderInformation: {
            amountDetails: {
                totalAmount: order.totalGrossPrice.value,
                currency: order.currencyCode
            },
            billTo: billTo,
            shipTo: shipTo,
            lineItems: mapper.MapOrderLineItems(order.allLineItems, true)
        }
    };

    var result = '';
    var paymentError = null;
    var ApplePayHookResult = require('dw/extensions/applepay/ApplePayHookResult');
    var cybersourceRestApi = require('~/cartridge/apiClient/index');
    var instance = new cybersourceRestApi.PaymentsApi(configObject);
    // eslint-disable-next-line no-undef
    session.privacy.orderPaymentSuccessful = false;

    // eslint-disable-next-line no-shadow
    instance.createPayment(restRequest, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status !== 'AUTHORIZED' && data.status !== 'AUTHORIZED_PENDING_REVIEW') {
                if (data.status === 'AUTHORIZED_RISK_DECLINED') {
                    var authReversal = require('~/cartridge/scripts/http/authReversal');
                    authReversal.httpAuthReversal(data.id, data.clientReferenceInformation.code, order.totalGrossPrice.value, order.currencyCode);
                    Logger.error('Apple Pay payment authorized but risk declined. Reversal initiated. Status: {0}, Data: {1}', data.status, JSON.stringify(data));
                }
                else {
                    Logger.error('Apple Pay payment not authorized. Status: {0}, Data: {1}', data.status, JSON.stringify(data));
                }
                paymentError = new Status(Status.ERROR);
                paymentError.addDetail(ApplePayHookResult.STATUS_REASON_DETAIL_KEY, ApplePayHookResult.REASON_FAILURE);
            } else {

                result = data;
                // eslint-disable-next-line no-undef
                session.privacy.orderPaymentSuccessful = true;
            }
        } else {
            Logger.error('Apple Pay payment error: {0}, Data: {1}', JSON.stringify(error), JSON.stringify(data));
            paymentError = new Status(Status.ERROR);
            paymentError.addDetail(ApplePayHookResult.STATUS_REASON_DETAIL_KEY, ApplePayHookResult.REASON_FAILURE);
        }
    });

    if (paymentError) {
        return paymentError;
    }

    if (result) {
        var paymentInstrument = paymentInstruments.length > 0 ? paymentInstruments[0] : null;
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(PaymentManager.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor());
            session.privacy.orderStatus = result.status; // eslint-disable-line no-undef
            paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardNumber + ', '
                + paymentInstrument.creditCardType + ', ' + paymentInstrument.creditCardExpirationMonth + '/' + paymentInstrument.creditCardExpirationYear;
        });
        return new Status(Status.OK);
    }
};

exports.cancel = function (basket) { // eslint-disable-line no-unused-vars
    // eslint-disable-next-line no-shadow
    var Status = require('dw/system/Status');
    var ApplePayHookResult = require('dw/extensions/applepay/ApplePayHookResult');
    var response = new ApplePayHookResult(Status(Status.OK), null);
    return response;
};

exports.placeOrder = function (order) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var email = order.getCustomerEmail();
    if (email) {
        // eslint-disable-next-line no-undef
        COHelpers.sendConfirmationEmail(order, request.locale);
    }
    var URLUtils = require('dw/web/URLUtils');
    var ApplePayHookResult = require('dw/extensions/applepay/ApplePayHookResult');
    var response = new ApplePayHookResult(Status(Status.OK), URLUtils.url('COPlaceOrder-Submit', 'order_id', order.currentOrderNo));
    return response;
};

exports.failOrder = function (order, status) {
    var URLUtils = require('dw/web/URLUtils');
    var Resource = require('dw/web/Resource');
    var ApplePayHookResult = require('dw/extensions/applepay/ApplePayHookResult');
    var OrderMgr = require('dw/order/OrderMgr');
    var helpers = require('~/cartridge/scripts/util/helpers');

    // Fail the order
    Transaction.wrap(function () {
        OrderMgr.failOrder(order, true);
    });

    // Create redirect URL with error only if top window route is Checkout-Begin for checkout page apple pay flow.
    var redirectUrl = null;
    if (helpers.getTopWindowRouteAction() === 'Checkout-Begin') {
        redirectUrl = URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null));
    }

    var response = new ApplePayHookResult(status, redirectUrl);
    return response;
};

exports.getRequest = function (basket, request) {
    session.privacy.applepaysession = 'yes';   // eslint-disable-line

    var helpers = require('~/cartridge/scripts/util/helpers');

    // Check if Apple Pay is initiated from checkout page
    if (helpers.getTopWindowRouteAction() === 'Checkout-Begin') {
        // For checkout page: Don't require addresses in Apple Pay popup
        // The addresses will be fetched from SFCC storefront instead
        request.requiredShippingContactFields = [];
        request.requiredBillingContactFields = [];
    }
    // For minicart: Leave default behavior (addresses shown in Apple Pay popup)

};

