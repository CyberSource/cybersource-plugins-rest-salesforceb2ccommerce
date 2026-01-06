'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var server = require('server');

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information arguments.length
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
    var collections = require('*/cartridge/scripts/util/collections');
    var currentBasket = basket;
    var cardErrors = {};
    var vscResponse = paymentInformation.payload;
    var paymentForm = server.forms.getForm('billing');
    var serverErrors = [];
    try {
        Transaction.wrap(function () {
            currentBasket.removeAllPaymentInstruments();

            var paymentInstruments = currentBasket.getPaymentInstruments(
                'CLICK_TO_PAY'
            );
            collections.forEach(paymentInstruments, function (item) {
                currentBasket.removePaymentInstrument(item);
            });
            var paymentInstrument = currentBasket.createPaymentInstrument(
                'CLICK_TO_PAY', currentBasket.totalGrossPrice
            );
            paymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);
            paymentInstrument.setCreditCardNumber(vscResponse.partialPaymentInstrument.lastFourDigits);
            var cardType = vscResponse.partialPaymentInstrument.paymentType.cardBrand;
            cardType = cardType[0].toUpperCase() + cardType.slice(1).toLowerCase();
            paymentInstrument.setCreditCardType(cardType);
            var paymentInstruments = currentBasket.getPaymentInstruments();
            if (paymentInstruments.length > 0) {
                paymentInstruments[0].custom.UCToken = paymentForm.creditCardFields.ucpaymenttoken.value;
            }
        });

        return {
            fieldErrors: cardErrors,
            serverErrors: serverErrors,
            error: false
        };


    } catch (e) {
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
    var payments = require('../../../http/payments');
    var serverErrors = [];
    var fieldErrors = {};
    var error = false;
    var order = OrderMgr.getOrder(orderNumber);
    var billingAddress = order.billingAddress;
    var shippingAddress = order.shipments[0].shippingAddress;
    var total = order.totalGrossPrice;
    // eslint-disable-next-line no-shadow
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var customerEmail = order.customerEmail;
    var currencyCode = order.currencyCode.toUpperCase();
    var card = {
        ucJwtToken: paymentInstrument.custom.UCToken,
    };

    try {
        // process authorization
        var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
        var result = payments.httpAuthorizeWithToken(card, customerEmail, orderNumber, total.value, currencyCode, billingAddress, shippingAddress, lineItems);

        Transaction.wrap(function () {
            /* eslint-disable no-undef */
            /* eslint-disable no-param-reassign */
            session.privacy.orderId = orderNumber;
            session.privacy.orderStatus = result.status;
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);

            paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardNumber + ', '
                + paymentInstrument.creditCardType;

            delete paymentInstrument.custom.UCToken;
        });

    } catch (e) {
        // Clean up UCToken on authorization failure
        Transaction.wrap(function () {
            if (paymentInstrument.custom.UCToken) {
                paymentInstrument.custom.UCToken = null;
            }
        });
        var errorData = {};
        error = true;
        if (typeof e === 'object' && e !== null) {
            if ('message' in e) {
                errorData.message = e.message;
            }
            if ('details' in e) {
                errorData.details = e.details;
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

var ProcessorExport = {};
var configObject = require('~/cartridge/configuration/index.js');

if (configObject.cartridgeEnabled) {
    ProcessorExport.Authorize = Authorize;
    ProcessorExport.Handle = Handle;
}

module.exports = ProcessorExport;
