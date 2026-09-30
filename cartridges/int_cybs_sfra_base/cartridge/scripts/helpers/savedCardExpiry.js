'use strict';

/**
 * A card is valid through the end of its expiry month and expires at the start of
 * the following month. Wallet stores a 1-based integer month, so new Date(year, month, 1)
 * is the first instant of the following month — the expiry boundary.
 * @param {number|string} month - expiry month, 1-12 (or null/empty if unknown)
 * @param {number|string} year - expiry year (or null/empty if unknown)
 * @param {Date} now - the current time
 * @returns {boolean} true when the card is expired; false when valid or unknown
 */
function isExpired(month, year, now) {
    var m = parseInt(month, 10);
    var y = parseInt(year, 10);
    if (isNaN(m) || isNaN(y)) {
        return false; // unknown expiry — include and let TMS decide
    }
    var expiryBoundary = new Date(y, m, 1);
    return now >= expiryBoundary;
}

/**
 * Filters a saved-card view list to those not expired as of `now`.
 * @param {Array} cards - saved-card view objects (creditCardExpirationMonth/Year)
 * @param {Date} now - the current time
 * @returns {Array} the non-expired cards (empty array if input is falsy)
 */
function filterValid(cards, now) {
    if (!cards) {
        return [];
    }
    return cards.filter(function (card) {
        return !isExpired(card.creditCardExpirationMonth, card.creditCardExpirationYear, now);
    });
}

module.exports = {
    isExpired: isExpired,
    filterValid: filterValid
};
