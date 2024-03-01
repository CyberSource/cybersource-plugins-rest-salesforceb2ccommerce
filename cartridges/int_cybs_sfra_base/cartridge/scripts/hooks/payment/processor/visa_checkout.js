'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var OrderMgr = require('dw/order/OrderMgr');

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
            paymentInstrument.custom.fluidData = vscResponse.encPaymentData;
            paymentInstrument.custom.callID = vscResponse.callid;
            var cardType = vscResponse.partialPaymentInstrument.paymentType.cardBrand;
            cardType = cardType[0].toUpperCase() + cardType.slice(1).toLowerCase();
            paymentInstrument.setCreditCardType(cardType);
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
    var mapper = require('~/cartridge/scripts/util/mapper.js');

    var encPaymentData = paymentInstrument.custom.fluidData;
    var callId = paymentInstrument.custom.callID;
    var customerEmail = order.customerEmail;
    var currencyCode = order.currencyCode.toUpperCase();
    try {
        // process authorization
        var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
        var result = payments.httpAuthorizeWithVisaSrc(encPaymentData, callId, customerEmail, orderNumber, total.value, currencyCode, billingAddress, shippingAddress, lineItems);

        Transaction.wrap(function () {
            /* eslint-disable no-undef */
            /* eslint-disable no-param-reassign */
            session.privacy.orderId = orderNumber;
            session.privacy.orderStatus = result.status;
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);

            if (result.processorInformation) {
                paymentInstrument.paymentTransaction.custom.avscodeRaw = result.processorInformation.avs
                    && result.processorInformation.avs.codeRaw;
                paymentInstrument.paymentTransaction.custom.approvalCode = result.processorInformation.approvalCode;
            }

            if (result.riskInformation) {
                paymentInstrument.paymentTransaction.custom.callId = paymentInstrument.custom.callID;
                paymentInstrument.paymentTransaction.custom.riskScore = result.riskInformation.score
                    && result.riskInformation.score.result;
                paymentInstrument.paymentTransaction.custom.riskScore_factorCodes = result.riskInformation.score
                    && result.riskInformation.score.factorCodes
                    && result.riskInformation.score.factorCodes.join(',');
                paymentInstrument.paymentTransaction.custom.riskScore_modelUsed = result.riskInformation.score
                    && result.riskInformation.score.modelUsed;
                paymentInstrument.paymentTransaction.custom.earlyDecision = result.riskInformation.profile.earlyDecision;
            }

            paymentInstrument.paymentTransaction.custom.requestId = result.id;
            paymentInstrument.paymentTransaction.custom.reconciliationId = result.reconciliationId;
            paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardHolder + ', ' + paymentInstrument.creditCardNumber + ', '
                + paymentInstrument.creditCardType;

            delete paymentInstrument.custom.callID;
            delete paymentInstrument.custom.fluidData;
        });
    } catch (e) {
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
        session.privacy.AuthorizeErrors = JSON.stringify(errorData);
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
