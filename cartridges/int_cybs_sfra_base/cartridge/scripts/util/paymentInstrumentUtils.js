/* eslint-disable no-param-reassign */

'use strict';

var Transaction = require('dw/system/Transaction');
/**
 * Update the order payment instrument when card capture response arrived.
 * @param {Object} paymentInstrument PI detail
 * @param {Object} order Order detail
 * @param {Object} responseObject response object
 */
function UpdatePaymentTransactionCardCapture(paymentInstrument, order, responseObject) {
    Transaction.wrap(function () {
        if (responseObject.status === 'PENDING') {
            // eslint-disable-next-line no-param-reassign
            paymentInstrument.paymentTransaction.custom.AmountPaid = Number(responseObject.orderInformation.amountDetails.totalAmount.toString());
            // eslint-disable-next-line no-param-reassign
            order.paymentStatus = 2;
        }
    });
}
/**
 *
 * @param {Object} paymentInstrument paymentInstrument
 * @param {Object} order order
 * @param {Object} responseObject responseObject
 */
function UpdatePaymentTransactionCardauthReversal(paymentInstrument, order, responseObject) {
    Transaction.wrap(function () {
        if (responseObject.status === 'REVERSED') {
            order.paymentStatus = 0;
        }
    });
}

/**
 *
 * @param {*} cart cart
 * @param {*} cardInfo *
 * @param {*} email *
 */
function updatePaymentInstrumentGP(cart, cardInfo, email) {
    // Retrieve the inputs

    // eslint-disable-next-line consistent-return
    Transaction.wrap(function () {
        var instrument = cart.createPaymentInstrument('DW_GOOGLE_PAY', cart.totalGrossPrice);
        // Validate our payment instrument was previously properly created
        if (instrument === null || instrument.paymentMethod !== 'DW_GOOGLE_PAY') {
            throw new Error('Invalid payment instrument for Google Pay Checkout');
        }
        var cardType;
        switch (cardInfo.cardNetwork) {
            case 'VISA':
                cardType = 'Visa';
                break;
            case 'MASTERCARD':
                cardType = 'MasterCard';
                break;
            case 'AMEX':
                cardType = 'Amex';
                break;
            case 'DISCOVER':
                cardType = 'Discover';
                break;
            default:
                cardType = '';
        }
        // eslint-disable-next-line no-undef
        session.forms.billing.creditCardFields.cardType.value = cardType;
        // Populate payment instrument values
        instrument.setCreditCardType(cardType);
        instrument.setCreditCardNumber('************' + cardInfo.cardDetails);

        // Populate the billing address
        var MobilePaymentHelper = require('../mobilepayments/MobilePaymentsAdapter');
        var billingAddress = cart.billingAddress;

        if (billingAddress == null) {
            billingAddress = cart.createBillingAddress();
            billingAddress = MobilePaymentHelper.createLineItemCtnrBillingAddress(billingAddress, cardInfo.billingAddress);
            if (!billingAddress.success) {
                return billingAddress;
            }
        }
        // set the email
        cart.customerEmail = email;
    });
}

module.exports = {
    UpdatePaymentTransactionCardCapture: UpdatePaymentTransactionCardCapture,
    UpdatePaymentTransactionCardauthReversal: UpdatePaymentTransactionCardauthReversal,
    updatePaymentInstrumentGP: updatePaymentInstrumentGP
};
