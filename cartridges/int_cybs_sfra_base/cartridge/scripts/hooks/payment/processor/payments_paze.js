'use strict';

var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var configObject = require('~/cartridge/configuration/index.js');

/**
 * Build the DW_PAZE payment instrument from the completeMandate JWT / transient token.
 *
 * Paze (Early Warning Services' US bank wallet) is a card-backed digital wallet: it
 * returns a network-tokenized card, exactly like Google Pay / Apple Pay. It is therefore
 * handled as a wallet card flow (instrument keyed DW_PAZE, card details extracted with
 * isDigitalWallet=true) rather than a non-card payment bucket.
 *
 * Authorization is performed client-side by the UC SDK; this hook only creates the
 * instrument and stores the card details.
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

            var existing = basket.getPaymentInstruments('DW_PAZE');
            collections.forEach(existing, function (item) {
                basket.removePaymentInstrument(item);
            });

            var paymentInstrument = basket.createPaymentInstrument('DW_PAZE', basket.totalGrossPrice);

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
            'payments_paze.Handle error for basket {0}: {1}', basket.UUID, e.message || e
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