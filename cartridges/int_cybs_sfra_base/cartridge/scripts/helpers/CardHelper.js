'use strict';

/**
 * *
 * @param {*} lineItemCtnr *
 * @returns {*} *
 */
function getNonGCPaymemtInstument(lineItemCtnr) {
    var paymentInstruments = lineItemCtnr.getPaymentInstruments();
    if (paymentInstruments.size() > 0) {
        // eslint-disable-next-line no-restricted-syntax
        for (var paymentInstrument in paymentInstruments) {
            // For GC we need to create an array of objects to be passed to PayeezyFacade-PaymentAuthorize.
            if (!'GIFT_CERTIFICATE'.equalsIgnoreCase(paymentInstrument.paymentMethod)) { // eslint-disable-line no-mixed-spaces-and-tabs
                return paymentInstrument; // eslint-disable-line no-mixed-spaces-and-tabs
            }
        }
    }
    return null;
}

// Added for google pay
/**
 * Determines if the basket already contains a payment instrument and removes it from the basket except gift certificate.
 * @param {*} basket  Contains object of basket or order
 */
function removeExistingPaymentInstruments(basket) {
    var ccPaymentInstrs = basket.getPaymentInstruments();

    // get all credit card payment instruments

    var iter = ccPaymentInstrs.iterator();
    var existingPI = null;
    var PaymentInstrument = require('dw/order/PaymentInstrument');

    // remove them
    while (iter.hasNext()) {
        existingPI = iter.next();
        if (existingPI.paymentMethod.equals(PaymentInstrument.METHOD_GIFT_CERTIFICATE)) {
            // eslint-disable-next-line no-continue
            continue;
        } else {
            basket.removePaymentInstrument(existingPI);
        }
    }
}

module.exports = {
    getNonGCPaymemtInstument: getNonGCPaymemtInstument,
    removeExistingPaymentInstruments: removeExistingPaymentInstruments
};
