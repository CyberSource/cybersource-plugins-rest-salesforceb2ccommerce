'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var collections = require('*/cartridge/scripts/util/collections');

/**
 * Creates an array of objects containing applicable payment methods
 * @param {dw.util.ArrayList<dw.order.dw.order.PaymentMethod>} paymentMethods - An ArrayList of
 *      applicable payment methods that the user could use for the current basket.
 * @returns {Array} of object that contain information about the applicable payment methods for the
 *      current cart
 */
function applicablePaymentMethods(paymentMethods) {
    return collections.map(paymentMethods, function (method) {
        return {
            ID: method.ID,
            name: method.name
        };
    });
}

/**
 * Creates an array of objects containing applicable credit cards
 * @param {dw.util.Collection<dw.order.PaymentCard>} paymentCards - An ArrayList of applicable
 *      payment cards that the user could use for the current basket.
 * @returns {Array} Array of objects that contain information about applicable payment cards for
 *      current basket.
 */
function applicablePaymentCards(paymentCards) {
    return collections.map(paymentCards, function (card) {
        return {
            cardType: card.cardType,
            name: card.name
        };
    });
}

/**
 * Creates an array of objects containing selected payment information
 * @param {dw.util.ArrayList<dw.order.PaymentInstrument>} selectedPaymentInstruments - ArrayList
 *      of payment instruments that the user is using to pay for the current basket
 * @returns {Array} Array of objects that contain information about the selected payment instruments
 */
function getSelectedPaymentInstruments(selectedPaymentInstruments) {
    return collections.map(selectedPaymentInstruments, function (paymentInstrument) {
        var results = {
            paymentMethod: paymentInstrument.paymentMethod,
            amount: paymentInstrument.paymentTransaction.amount.value
        };
        if (paymentInstrument.paymentMethod === 'CREDIT_CARD') {
            results.lastFour = paymentInstrument.creditCardNumberLastDigits;
            results.owner = paymentInstrument.creditCardHolder;
            results.type = paymentInstrument.creditCardType;
            // UC's transient token does not always carry the masked PAN
            // (notably for Google Pay UC). When it is missing, suppress both
            // the masked number AND the expiry on the storefront's
            // Order-Confirm page so it never renders "null" or an orphan
            // "Ending {month}/{year}" line for a card we have no number for.
            // The expiry is still set on the underlying paymentInstrument and
            // is available to BM, the confirmation email, and order history.
            var ccMasked = paymentInstrument.maskedCreditCardNumber;
            results.maskedCreditCardNumber = ccMasked || '';
            results.expirationMonth = ccMasked ? paymentInstrument.creditCardExpirationMonth : '';
            results.expirationYear = ccMasked ? paymentInstrument.creditCardExpirationYear : '';
        } else if (paymentInstrument.paymentMethod === 'GIFT_CERTIFICATE') {
            results.giftCertificateCode = paymentInstrument.giftCertificateCode;
            results.maskedGiftCertificateCode = paymentInstrument.maskedGiftCertificateCode;
        } else if (paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            results.type = paymentInstrument.creditCardType;
            // Same guard as CREDIT_CARD above. Google Pay UC frequently has no
            // masked PAN in the transient token; surface '' for both the PAN
            // and expiry so the Order-Confirm template prints neither "null"
            // nor an orphan "Ending {month}/{year}" line.
            var gpMasked = paymentInstrument.maskedCreditCardNumber;
            results.maskedCreditCardNumber = gpMasked || '';
            results.expirationMonth = gpMasked ? paymentInstrument.creditCardExpirationMonth : '';
            results.expirationYear = gpMasked ? paymentInstrument.creditCardExpirationYear : '';
        } else if (paymentInstrument.paymentMethod === 'BANK_TRANSFER') {
            // Bank Transfer / eCheck details
            results.bankAccountHolder = paymentInstrument.bankAccountHolder;
            results.bankAccountNumber = paymentInstrument.bankAccountNumber;
            results.bankRoutingNumber = paymentInstrument.bankRoutingNumber;

        } else if (paymentInstrument.paymentMethod === 'PAYPAL'
            || paymentInstrument.paymentMethod === 'VENMO') {
            if ('apmPaymentType' in paymentInstrument.custom) {
                results.apmPaymentType = paymentInstrument.custom.apmPaymentType;
            }
            if ('apmMethod' in paymentInstrument.custom) {
                results.apmMethod = paymentInstrument.custom.apmMethod;
            }
            results.paymentDetails = paymentInstrument.paymentTransaction.custom.paymentDetails;
        }

        return results;
    });
}

/**
 * Payment class that represents payment information for the current basket
 * @param {dw.order.Basket} currentBasket - the target Basket object
 * @param {dw.customer.Customer} currentCustomer - the associated Customer object
 * @param {string} countryCode - the associated Site countryCode
 * @constructor
 */
function Payment(currentBasket, currentCustomer, countryCode) {
    var paymentAmount = currentBasket.totalGrossPrice;
    var paymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount.value
    );
    var paymentCards = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
        .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);
    var paymentInstruments = currentBasket.paymentInstruments;
    this.applicablePaymentMethods = paymentMethods ? applicablePaymentMethods(paymentMethods) : null;

    this.applicablePaymentCards = paymentCards ? applicablePaymentCards(paymentCards) : null;

    this.selectedPaymentInstruments = paymentInstruments
        ? getSelectedPaymentInstruments(paymentInstruments) : null;
}

module.exports = Payment;
