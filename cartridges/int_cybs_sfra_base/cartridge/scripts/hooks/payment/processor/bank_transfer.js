'use strict';

var PaymentInstrument = require('dw/order/PaymentInstrument');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

/**
 * Create the BANK_TRANSFER (eCheck) payment instrument from the completeMandate
 * flow. Bank routing/account details are resolved once by PlaceOrderDirect
 * (ucPaymentHelper.getEcheckBankDetails) and passed in via paymentInformation.bankDetails.
 *
 * These details are display-only: authorization is performed client-side by the UC SDK,
 * so this hook only builds the instrument and MUST NOT fail the order when bank enrichment
 * is missing (e.g. the tokenized flow where the transient token has been consumed).
 *
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentInformation - { jwtPayload, transientToken, paymentMethod, bankDetails, fromUC }
 * @returns {Object} { fieldErrors, serverErrors, error }
 */
function Handle(basket, paymentInformation) {
    var collections = require('*/cartridge/scripts/util/collections');
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
    var logger = Logger.getLogger('VisaAcceptance', 'PaymentProcessor');
    var serverErrors = [];

    // Prefer the bank details the caller already resolved; fall back to a local
    // transient-token decode for legacy callers. Never fetch or throw here — a missing
    // routing/account is display-only and must not block the order.
    var bankDetails = (paymentInformation && paymentInformation.bankDetails)
        || ucPaymentHelper.extractBankDetailsFromTransient(
            paymentInformation && paymentInformation.transientToken,
            basket.billingAddress
        );

    try {
        Transaction.wrap(function () {
            basket.removeAllPaymentInstruments();

            var existing = basket.getPaymentInstruments(PaymentInstrument.METHOD_BANK_TRANSFER);
            collections.forEach(existing, function (item) {
                basket.removePaymentInstrument(item);
            });

            var paymentInstrument = basket.createPaymentInstrument(
                PaymentInstrument.METHOD_BANK_TRANSFER,
                basket.totalGrossPrice
            );

            if (bankDetails.routingNumber) {
                paymentInstrument.setBankRoutingNumber(bankDetails.routingNumber);
            }
            if (bankDetails.maskedAccount) {
                paymentInstrument.setBankAccountNumber(bankDetails.maskedAccount);
            }
            if (bankDetails.accountHolder) {
                paymentInstrument.setBankAccountHolder(bankDetails.accountHolder);
            }

        });

        return {
            fieldErrors: {},
            serverErrors: serverErrors,
            error: false
        };
    } catch (e) {
        logger.error('bank_transfer.Handle error for basket {0}: {1}', basket.UUID, e.message || e);
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
