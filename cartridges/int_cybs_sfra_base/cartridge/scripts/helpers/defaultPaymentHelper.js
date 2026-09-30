'use strict';

/**
 * Default Saved Card helper.
 *
 * SFCC has no native concept of a "default" payment instrument (unlike addresses,
 * which expose AddressBook.preferredAddress). We persist the default flag in the
 * custom boolean attribute `custom.isDefault` on CustomerPaymentInstrument and use
 * the functions below to keep exactly one credit card flagged as the default.
 */

var Transaction = require('dw/system/Transaction');
var PaymentInstrument = require('dw/order/PaymentInstrument');

/**
 * Returns the customer's saved credit-card payment instruments as an array.
 * @param {dw.customer.Wallet} wallet - the customer's wallet
 * @returns {Array<dw.customer.CustomerPaymentInstrument>} credit-card instruments (insertion order)
 */
function getCreditCardInstruments(wallet) {
    if (!wallet) {
        return [];
    }
    return wallet.getPaymentInstruments(PaymentInstrument.METHOD_CREDIT_CARD).toArray();
}

/**
 * Reads the default flag from a saved card, tolerating an unset attribute.
 * @param {dw.customer.CustomerPaymentInstrument} paymentInstrument - the saved card
 * @returns {boolean} true when this card is flagged as the default
 */
function isDefault(paymentInstrument) {
    try {
        return !!(paymentInstrument && paymentInstrument.custom && paymentInstrument.custom.isDefault);
    } catch (e) {
        return false;
    }
}

/**
 * Marks the card matching the given UUID as the default and clears the flag on every
 * other saved card, guaranteeing exactly one default. No-op if the UUID is not found.
 * @param {dw.customer.Wallet} wallet - the customer's wallet
 * @param {string} uuid - UUID of the card to make default
 * @returns {boolean} true if a matching card was found and set as default
 */
function setDefaultByUUID(wallet, uuid) {
    var cards = getCreditCardInstruments(wallet);
    if (cards.length === 0 || !uuid) {
        return false;
    }
    var found = false;
    Transaction.wrap(function () {
        cards.forEach(function (paymentInstrument) {
            var match = paymentInstrument.UUID === uuid;
            paymentInstrument.custom.isDefault = match;
            if (match) {
                found = true;
            }
        });
    });
    return found;
}

/**
 * Returns the UUID of the default saved card. Falls back to the first saved card
 * when none is flagged (e.g. customers who saved cards before this feature existed).
 * @param {dw.customer.Wallet} wallet - the customer's wallet
 * @returns {string|null} the default card's UUID, or null when there are no saved cards
 */
function getDefaultUUID(wallet) {
    var cards = getCreditCardInstruments(wallet);
    if (cards.length === 0) {
        return null;
    }
    for (var i = 0; i < cards.length; i++) {
        if (isDefault(cards[i])) {
            return cards[i].UUID;
        }
    }
    return cards[0].UUID;
}

/**
 * Guarantees exactly one default among the saved cards:
 *  - if no card is flagged but cards exist, promotes the first card;
 *  - if multiple cards are flagged, keeps the first flagged one and clears the rest.
 * Does nothing when there are no saved cards or the invariant already holds.
 * @param {dw.customer.Wallet} wallet - the customer's wallet
 * @returns {void}
 */
function ensureSingleDefault(wallet) {
    var cards = getCreditCardInstruments(wallet);
    if (cards.length === 0) {
        return;
    }
    var flagged = cards.filter(function (paymentInstrument) {
        return isDefault(paymentInstrument);
    });
    if (flagged.length === 1) {
        return;
    }
    var keepUUID = flagged.length > 0 ? flagged[0].UUID : cards[0].UUID;
    Transaction.wrap(function () {
        cards.forEach(function (paymentInstrument) {
            paymentInstrument.custom.isDefault = paymentInstrument.UUID === keepUUID;
        });
    });
}

module.exports = {
    getCreditCardInstruments: getCreditCardInstruments,
    isDefault: isDefault,
    setDefaultByUUID: setDefaultByUUID,
    getDefaultUUID: getDefaultUUID,
    ensureSingleDefault: ensureSingleDefault
};
