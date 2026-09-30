'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

/**
 * Create the CLICK_TO_PAY payment instrument from the completeMandate JWT.
 * Authorization is performed client-side by the UC SDK; this hook only builds
 * the instrument and stores the transient token for downstream mapping in
 * PlaceOrderDirect.
 *
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentInformation - { jwtPayload, transientToken, paymentMethod, isDigitalWallet, fromUC }
 * @returns {Object} { fieldErrors, serverErrors, error }
 */
function Handle(basket, paymentInformation) {
    var collections = require('*/cartridge/scripts/util/collections');
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
    var serverErrors = [];

    try {
        Transaction.wrap(function () {
            basket.removeAllPaymentInstruments();

            var existing = basket.getPaymentInstruments('CLICK_TO_PAY');
            collections.forEach(existing, function (item) {
                basket.removePaymentInstrument(item);
            });

            var paymentInstrument = basket.createPaymentInstrument('CLICK_TO_PAY', basket.totalGrossPrice);

            if (basket.billingAddress && basket.billingAddress.fullName) {
                paymentInstrument.setCreditCardHolder(basket.billingAddress.fullName);
            }

            var cardDetails = ucPaymentHelper.extractCardDetails(
                paymentInformation && paymentInformation.jwtPayload,
                paymentInformation && paymentInformation.transientToken,
                basket.billingAddress
            );
            ucPaymentHelper.updatePaymentInstrumentCardDetails(paymentInstrument, cardDetails, false);
        });

        return {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: false
        };
    } catch (e) {
        Logger.getLogger('VisaAcceptance', 'PaymentProcessor').error(
            'clickToPay.Handle error for basket {0}: {1}', basket.UUID, e.message || e
        );
        serverErrors.push(Resource.msg('error.payment.not.valid', 'checkout', null));
        return {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: true
        };
    }
}

var ProcessorExport = {};
var configObject = require('~/cartridge/configuration/index.js');

if (configObject.cartridgeEnabled) {
    ProcessorExport.Handle = Handle;
}

module.exports = ProcessorExport;
