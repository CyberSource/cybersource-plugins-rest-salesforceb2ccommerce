'use strict';


var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

/**
 * Create the PAYPAL payment instrument for a Unified Checkout PayPal eWallet
 * payment.
 *
 * Authorization is performed client-side by the UC SDK (the result JWT is already
 * authorized or PENDING when PlaceOrderDirect calls this hook), so this hook only
 * builds the payment instrument. The scheme descriptor and transaction references
 * (apmPaymentType / apmMethod / apmMandateType, transaction id, etc.) are recorded
 * by CheckoutServices-PlaceOrderDirect after the order is created.
 *
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentInformation - { jwtPayload, transientToken, paymentMethod, fromUC }
 * @returns {Object} { fieldErrors, serverErrors, error }
 */
function Handle(basket, paymentInformation) {
    var collections = require('*/cartridge/scripts/util/collections');
    var logger = Logger.getLogger('VisaAcceptance', 'PaymentProcessor');
    var serverErrors = [];
    var PAYPAL = 'PAYPAL';

    try {
        Transaction.wrap(function () {
            // Remove any prior instruments (e.g. left over from an SCA/retry) so the
            // basket does not accumulate stacked instruments.
            basket.removeAllPaymentInstruments();

            var existing = basket.getPaymentInstruments(PAYPAL);
            collections.forEach(existing, function (item) {
                basket.removePaymentInstrument(item);
            });

            var paymentInstrument = basket.createPaymentInstrument(
                PAYPAL,
                basket.totalGrossPrice
            );
        });

        return {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: false
        };
    } catch (e) {
        logger.error('payments_paypal.Handle error for basket {0}: {1}', basket.UUID, e.message || e);
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
