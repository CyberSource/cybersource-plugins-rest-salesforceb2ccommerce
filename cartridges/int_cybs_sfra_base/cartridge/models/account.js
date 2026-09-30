'use strict';

/**
 * Account model override.
 *
 * Decorates each saved credit card with an `isDefault` flag (read from the
 * CustomerPaymentInstrument custom attribute `custom.isDefault`) and moves the
 * default card to the front of the list. Sorting the default first means the
 * checkout saved-card picker — which pre-selects via `loopState.first` in
 * storedPaymentInstruments.isml — automatically pre-selects the default card,
 * and the My Account list can render a "(Default)" badge / "Make Default" link.
 */

var base = module.superModule;
var Customer = require('dw/customer/Customer');

/**
 * Reads custom.isDefault from a saved-card entry, tolerating the two shapes the
 * SFRA pipeline produces: a raw dw.customer.CustomerPaymentInstrument (when the
 * customer is a global Customer) or a request-wrapped plain object that carries
 * the raw instrument on `.raw`.
 * @param {Object} item - a saved-card entry (raw instrument or request-wrapped)
 * @returns {boolean} true when the card is flagged as default
 */
function readIsDefault(item) {
    var raw = item && item.raw ? item.raw : item;
    try {
        return !!(raw && raw.custom && raw.custom.isDefault);
    } catch (e) {
        return false;
    }
}

/**
 * Builds a UUID -> isDefault lookup from the source instruments the base model
 * was given (these still expose the custom attribute, unlike the mapped output).
 * @param {Array} sourceInstruments - raw or request-wrapped saved cards
 * @returns {Object} map of UUID to boolean default flag
 */
function buildDefaultMap(sourceInstruments) {
    var map = {};
    if (!sourceInstruments) {
        return map;
    }
    for (var i = 0; i < sourceInstruments.length; i++) {
        var item = sourceInstruments[i];
        if (item && item.UUID) {
            map[item.UUID] = readIsDefault(item);
        }
    }
    return map;
}

/**
 * Adds `isDefault` to each entry of an already-built customerPaymentInstruments
 * list and moves the default entry to the front (stable for the remaining cards).
 * @param {Array} paymentInstruments - mapped saved-card view objects
 * @param {Object} defaultMap - UUID -> isDefault lookup
 * @returns {Array} the same list, decorated and sorted default-first
 */
function decorateAndSort(paymentInstruments, defaultMap) {
    if (!paymentInstruments || paymentInstruments.length === 0) {
        return paymentInstruments;
    }
    paymentInstruments.forEach(function (paymentInstrument) {
        paymentInstrument.isDefault = !!defaultMap[paymentInstrument.UUID]; // eslint-disable-line no-param-reassign
    });
    // Move the (single) default card to the front; keep the order of the rest.
    paymentInstruments.sort(function (a, b) {
        return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0);
    });
    return paymentInstruments;
}

/**
 * Resolves the source instruments the base model used to build
 * customerPaymentInstruments, so we can read the custom.isDefault flag.
 * @param {Object} currentCustomer - the (global or request-wrapped) customer
 * @returns {Array|null} the source saved cards, or null when none
 */
function getSourceInstruments(currentCustomer) {
    if (currentCustomer instanceof Customer) {
        return currentCustomer.profile && currentCustomer.profile.wallet
            && currentCustomer.profile.wallet.paymentInstruments
            ? currentCustomer.profile.wallet.paymentInstruments.toArray()
            : null;
    }
    return currentCustomer.wallet && currentCustomer.wallet.paymentInstruments
        ? currentCustomer.wallet.paymentInstruments
        : null;
}

/**
 * Account class — wraps the SFRA base model to decorate saved cards with the
 * default flag and sort the default first.
 * @param {Object} currentCustomer - Current customer
 * @param {Object} addressModel - The current customer's preferred address
 * @param {Object} orderModel - The current customer's order history
 * @constructor
 */
function account(currentCustomer, addressModel, orderModel) {
    base.call(this, currentCustomer, addressModel, orderModel);

    if (this.customerPaymentInstruments) {
        var defaultMap = buildDefaultMap(getSourceInstruments(currentCustomer));
        this.customerPaymentInstruments = decorateAndSort(this.customerPaymentInstruments, defaultMap);
    }
}

/**
 * Static helper used by PaymentInstruments-List. Decorates the base output with
 * `isDefault` (read from the source instruments' custom attribute) and sorts
 * the default card first.
 * @param {Array} userPaymentInstruments - source saved cards (carry .raw / .custom)
 * @returns {Array} decorated, default-first saved-card view objects
 */
account.getCustomerPaymentInstruments = function (userPaymentInstruments) {
    var paymentInstruments = base.getCustomerPaymentInstruments(userPaymentInstruments);
    var defaultMap = buildDefaultMap(userPaymentInstruments);
    return decorateAndSort(paymentInstruments, defaultMap);
};

module.exports = account;
