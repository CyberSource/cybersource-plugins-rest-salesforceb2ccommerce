'use strict';

var server = require('server');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');
var array = require('*/cartridge/scripts/util/array');
var configObject = require('*/cartridge/configuration/index');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

/**
 * Finds a request-wrapped payment instrument by UUID within the given list.
 * Used as the IDOR guard: callers pass ONLY the session customer's own wallet
 * instruments, so a foreign/unknown UUID yields null (no TMS call made).
 * @param {Array} walletPaymentInstruments - req.currentCustomer.wallet.paymentInstruments
 * @param {string} uuid - the client-supplied wallet UUID
 * @returns {Object|null} the matching instrument, or null
 */
function findOwnInstrument(walletPaymentInstruments, uuid) {
    if (!walletPaymentInstruments || !uuid) {
        return null;
    }
    var found = array.find(walletPaymentInstruments, function (item) {
        return item.UUID === uuid;
    });
    return found || null;
}

/**
 * SavedCardRefresh-Refresh : refresh ONE saved card from TMS.
 * POST { piUuid }. Resolves the UUID in the session customer's own wallet, then
 * updates/removes it per the TMS verdict. 404/410 from TMS surface as
 * { success:false, notAvailable:true } with HTTP 200 — never a 500.
 */
server.post('Refresh', server.middleware.https, csrfProtection.validateAjaxRequest, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var tokenRefreshHelper = require('~/cartridge/scripts/helpers/tokenRefreshHelper');

    // Gated by the VisaAcceptance_NetworkToken preference; no-op when disabled.
    if (!configObject.networkTokenizationEnabled) {
        secureResponseHelper.secureJsonResponse(res, { success: false });
        return next();
    }

    // eslint-disable-next-line no-undef
    var piUuid = (request.httpParameterMap.piUuid && request.httpParameterMap.piUuid.stringValue) || req.querystring.piUuid;

    // IDOR guard: only ever look inside the logged-in customer's own wallet.
    var owned = findOwnInstrument(req.currentCustomer.wallet.paymentInstruments, piUuid);
    if (!owned) {
        secureResponseHelper.secureJsonResponse(res, { success: false, notAvailable: true });
        return next();
    }

    // Resolve a writable instrument from the persistent customer + wallet.
    var customer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
    var wallet = customer.getProfile().getWallet();
    var rawPIs = wallet.getPaymentInstruments('CREDIT_CARD').toArray();
    var rawPI = array.find(rawPIs, function (pi) { return pi.UUID === piUuid; });

    if (!rawPI) {
        secureResponseHelper.secureJsonResponse(res, { success: false, notAvailable: true });
        return next();
    }

    var result;
    try {
        result = tokenRefreshHelper.refreshInstrument(wallet, rawPI);
    } catch (e) {
        // A single card must never break the checkout flow.
        var Logger = require('dw/system/Logger');
        Logger.getLogger('VisaAcceptance', 'SavedCardRefresh').error('Refresh failed for piUuid={0}: {1}', piUuid, e.message || e);
        result = { success: false };
    }
    secureResponseHelper.secureJsonResponse(res, result);
    return next();
});

/**
 * SavedCardRefresh-List : re-render the saved-card picker partial with refreshed,
 * expiry-filtered cards. GET, returns HTML for the client to swap into .cybs-saved-cards.
 */
server.get('List', server.middleware.https, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
    var AccountModel = require('*/cartridge/models/account');
    var renderTemplateHelper = require('*/cartridge/scripts/renderTemplateHelper');
    var savedCardExpiry = require('~/cartridge/scripts/helpers/savedCardExpiry');

    // Gated by the VisaAcceptance_NetworkToken preference; no-op when disabled.
    if (!configObject.networkTokenizationEnabled) {
        secureResponseHelper.secureJsonResponse(res, { success: false });
        return next();
    }

    var cards = AccountModel.getCustomerPaymentInstruments(req.currentCustomer.wallet.paymentInstruments);
    var validCards = savedCardExpiry.filterValid(cards, new Date());

    var html = renderTemplateHelper.getRenderedHtml(
        { customer: { customerPaymentInstruments: validCards, registeredUser: true } },
        'checkout/billing/storedPaymentInstrumentsList'
    );
    secureResponseHelper.secureJsonResponse(res, { success: true, html: html, count: validCards.length });
    return next();
});

module.exports = server.exports();
module.exports.findOwnInstrument = findOwnInstrument;
