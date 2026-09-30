'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var configObject = require('~/cartridge/configuration/index.js');

/**
 * Build the DW_GOOGLE_PAY payment instrument from the completeMandate JWT.
 * Used by the new UC completeMandate flow via PlaceOrderDirect. Authorization
 * is performed client-side by the UC SDK; this hook only creates the
 * instrument and stores the transient token.
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

            var existing = basket.getPaymentInstruments('DW_GOOGLE_PAY');
            collections.forEach(existing, function (item) {
                basket.removePaymentInstrument(item);
            });

            var paymentInstrument = basket.createPaymentInstrument('DW_GOOGLE_PAY', basket.totalGrossPrice);

            if (basket.billingAddress && basket.billingAddress.fullName) {
                paymentInstrument.setCreditCardHolder(basket.billingAddress.fullName);
            }


            var cardDetails = ucPaymentHelper.extractCardDetails(
                paymentInformation && paymentInformation.jwtPayload,
                paymentInformation && paymentInformation.transientToken,
                basket.billingAddress
            );
            ucPaymentHelper.updatePaymentInstrumentCardDetails(paymentInstrument, cardDetails, true);
        });

        return {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: false
        };
    } catch (e) {
        Logger.getLogger('VisaAcceptance', 'PaymentProcessor').error(
            'google_pay_uc.Handle error for basket {0}: {1}', basket.UUID, e.message || e
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
if (configObject.cartridgeEnabled) {
    ProcessorExport.Handle = Handle;
}

module.exports = ProcessorExport;
