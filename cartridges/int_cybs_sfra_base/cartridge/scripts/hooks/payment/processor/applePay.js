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
    var enableCaptureForApplePay = false;

    if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_ApplePayTransactionType').value === 'sale' ){
        enableCaptureForApplePay = true;
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
            capture: enableCaptureForApplePay
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
            billTo: {
                firstName: response.payment.billingContact.givenName,
                lastName: response.payment.billingContact.familyName,
                address1: response.payment.billingContact.addressLines[0],
                locality: response.payment.billingContact.locality,
                administrativeArea: response.payment.billingContact.administrativeArea,
                postalCode: response.payment.billingContact.postalCode,
                country: response.payment.billingContact.countryCode,
                email: response.payment.shippingContact.emailAddress,
                phoneNumber: response.payment.shippingContact.phoneNumber
            },
            shipTo: {
                firstName: response.payment.shippingContact.givenName,
                lastName: response.payment.shippingContact.familyName,
                address1: response.payment.shippingContact.addressLines[0],
                locality: response.payment.shippingContact.locality,
                administrativeArea: response.payment.shippingContact.administrativeArea,
                postalCode: response.payment.shippingContact.postalCode,
                country: response.payment.shippingContact.countryCode,
                email: response.payment.shippingContact.emailAddress,
                phoneNumber: response.payment.shippingContact.phoneNumber
            },
            lineItems: mapper.MapOrderLineItems(order.allLineItems, true)
        }
    };

    var result = '';
    var cybersourceRestApi = require('~/cartridge/apiClient/index');
    var instance = new cybersourceRestApi.PaymentsApi(configObject);
    // eslint-disable-next-line no-undef
    session.privacy.orderPaymentSuccessful = false;

    // eslint-disable-next-line no-shadow
    instance.createPayment(restRequest, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status !== 'AUTHORIZED' && data.status !== 'AUTHORIZED_PENDING_REVIEW') {
                throw JSON.stringify(data);
            }
            result = data;
            // eslint-disable-next-line no-undef
            session.privacy.orderPaymentSuccessful = true;
        } else {
            throw JSON.stringify(data);
        }
    });

    if (result) {
        var paymentInstrument = paymentInstruments.length > 0 ? paymentInstruments[0] : null;
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(PaymentManager.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor());
            paymentInstrument.paymentTransaction.custom.requestId = result.id;
            paymentInstrument.paymentTransaction.custom.reconciliationId = result.reconciliationId;
            // eslint-disable-next-line no-undef
            session.privacy.orderId = order.currentOrderNo;
            session.privacy.orderStatus = result.status; // eslint-disable-line no-undef
            paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardHolder + ', ' + paymentInstrument.creditCardNumber + ', '
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

exports.getRequest = function () {
    session.privacy.applepaysession = 'yes';   // eslint-disable-line
};
