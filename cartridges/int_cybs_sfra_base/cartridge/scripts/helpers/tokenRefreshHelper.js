'use strict';

var Transaction = require('dw/system/Transaction');
var tokenManagement = require('~/cartridge/scripts/http/tokenManagement');
var mapper = require('~/cartridge/scripts/util/mapper.js');
var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

/**
 * Pulls a usable {month, year} from a TMS payment-instrument response, defensively.
 * @param {Object} data - the TMS getPaymentInstrument response
 * @returns {{month:number, year:number}|null} parsed expiry, or null if absent/odd
 */
function extractExpiry(data) {
    if (!data || !data.card) {
        return null;
    }
    var month = parseInt(data.card.expirationMonth, 10);
    var year = parseInt(data.card.expirationYear, 10);
    if (isNaN(month) || isNaN(year)) {
        return null;
    }
    return { month: month, year: year };
}

/**
 * Whether the TMS expiry differs from what the wallet currently stores.
 * @param {dw.customer.CustomerPaymentInstrument} paymentInstrument - the stored card
 * @param {{month:number, year:number}} expiry - the TMS expiry
 * @returns {boolean} true when month or year differs
 */
function expiryChanged(paymentInstrument, expiry) {
    return parseInt(paymentInstrument.creditCardExpirationMonth, 10) !== expiry.month
        || parseInt(paymentInstrument.creditCardExpirationYear, 10) !== expiry.year;
}

/**
 * Refreshes one saved card against TMS and applies the wallet change.
 * - updated, expiry changed -> REPLACE the card (create fresh + remove old) with the
 *   new expiry, preserving the token string and default flag; { success: true, replaced: true }
 * - updated, expiry unchanged -> nothing to do; { success: true }
 * - notAvailable -> remove the card from the wallet; { success: false, notAvailable: true }
 * - softFail / odd shape -> leave the card alone; { success: false }
 *
 * SFCC permanently masks a persisted CustomerPaymentInstrument, so its expiry cannot be
 * edited in place ("attributes are already masked permanently"). The changed-expiry path
 * therefore reuses ucPaymentHelper.upsertCreditCard to replace the instrument rather than
 * mutate it. Never throws — callers (and the parallel client) must never be blocked by one card.
 * @param {dw.customer.Wallet} wallet - the writable wallet owning the instrument
 * @param {dw.customer.CustomerPaymentInstrument} paymentInstrument - the raw card
 * @returns {{success:boolean, notAvailable:boolean=, replaced:boolean=}} browser-facing verdict
 */
function refreshInstrument(wallet, paymentInstrument) {
    var rawToken = paymentInstrument.getCreditCardToken();
    if (!rawToken) {
        return { success: false };
    }
    var tokenInfo = mapper.deserializeTokenInformation(rawToken);
    var piTokenId = tokenInfo && tokenInfo.paymentInstrument ? tokenInfo.paymentInstrument.id : null;
    if (!piTokenId) {
        return { success: false };
    }

    var verdict = tokenManagement.httpRetrievePaymentInstrument(piTokenId);

    if (verdict.status === 'notAvailable') {
        Transaction.wrap(function () {
            wallet.removePaymentInstrument(paymentInstrument);
        });
        return { success: false, notAvailable: true };
    }

    if (verdict.status === 'updated') {
        var expiry = extractExpiry(verdict.data);
        if (!expiry) {
            return { success: false };
        }
        if (!expiryChanged(paymentInstrument, expiry)) {
            return { success: true }; // up to date — no mutation, avoids the masking error
        }
        var instrumentIdentifierId = tokenInfo.instrumentIdentifier ? tokenInfo.instrumentIdentifier.id : null;
        if (!instrumentIdentifierId) {
            return { success: false }; // can't safely locate/replace without the identifier
        }
        // Replace (not mutate): a freshly created instrument isn't masked yet, so the new
        // expiry sticks. The original token string (incl. the -flex- marker) is preserved.
        ucPaymentHelper.upsertCreditCard(
            wallet,
            rawToken,
            { expirationMonth: expiry.month, expirationYear: expiry.year },
            instrumentIdentifierId
        );
        return { success: true, replaced: true };
    }

    return { success: false }; // softFail — retain stored details
}

module.exports = {
    refreshInstrument: refreshInstrument
};
