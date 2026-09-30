'use strict';

/**
 * Early Payer Authentication setup.
 *
 * Runs Payer Auth Setup and hands the browser what it needs for Device Data Collection as soon
 * as the shopper has finished entering card details, instead of after the Place Order click.
 * Enrollment and validation are unchanged and still run at order time from
 * PayerAuthentication-PayerAuthEnroll / -PayerAuthValidation.
 *
 * The setup referenceId is parked in session.privacy because at card-entry time there is nothing
 * else to hang it on: the basket has no payment instrument yet (SFRA creates one when the billing
 * form is submitted, which happens AFTER this runs) and there is no order.
 *
 * Every skip path returns { applicable: false } and logs a distinct reason at warn level. A
 * silently skipped setup must never look the same as a request that never arrived.
 */

var server = require('server');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var array = require('*/cartridge/scripts/util/array');
var configObject = require('*/cartridge/configuration/index');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');
var payerAuthentication = require('~/cartridge/scripts/http/payerAuthentication');

var LOG_CATEGORY = 'PayerAuthEarlySetup';

/**
 * Session keys holding the early setup state. Deliberately small: the DDC access token and URL
 * are NOT stored, because once DDC has run at card-entry time the order-time path only needs the
 * referenceId and the collected browser fields.
 */
var SESSION_KEYS = [
    'cybsEarlyPaReferenceId',
    'cybsEarlyPaBrowserFields',
    'cybsEarlyPaGeneration',
    'cybsEarlyPaSetupTime'
];

/**
 * @returns {dw.system.Log} the module logger
 */
function logger() {
    return require('dw/system/Logger').getLogger('VisaAcceptance', LOG_CATEGORY);
}

/**
 * Drops all early setup state. Called when the shopper changes card, switches payment method,
 * or starts a fresh setup - a stale referenceId must never survive into a later enrollment.
 */
function clearEarlyState() {
    for (var i = 0; i < SESSION_KEYS.length; i += 1) {
        session.privacy[SESSION_KEYS[i]] = '';
    }
}

/**
 * Reserves the SFCC order number that the eventual order will be created with, so that setup,
 * enrollment and the order itself all carry the same clientReferenceInformation.code.
 *
 * Without this, setup (which runs before any order exists) would have to invent a reference and
 * enrollment would send the real order number, leaving the two calls uncorrelated.
 *
 * Reused for the life of the checkout rather than reserved per attempt: the shopper may edit the
 * card or switch saved cards several times, and each of those should not burn a number from the
 * sequence. checkoutHelpers.createOrder consumes it and clears it.
 *
 * @returns {string} the reserved order number
 */
function reserveOrderNo() {
    if (session.privacy.cybsEarlyPaOrderNo) {
        return session.privacy.cybsEarlyPaOrderNo;
    }
    var OrderMgr = require('dw/order/OrderMgr');
    var Transaction = require('dw/system/Transaction');
    var reserved = '';
    Transaction.wrap(function () {
        reserved = OrderMgr.createOrderNo();
    });
    session.privacy.cybsEarlyPaOrderNo = reserved;
    return reserved;
}

/**
 * Silent, non-blocking no-op. The client treats this as "nothing to do" and leaves the checkout
 * flow completely untouched, so the existing order-time setup still runs as the fallback.
 * @param {Object} res - response
 * @param {string} reason - why setup was skipped, logged at warn
 */
function skip(res, reason) {
    logger().warn('{0}: skipped - {1}', LOG_CATEGORY, reason);
    secureResponseHelper.secureJsonResponse(res, { applicable: false });
}

/**
 * Blocking failure. The client shows errorMessage and stops the shopper advancing.
 * @param {Object} res - response
 * @param {string} reason - internal reason, logged at warn
 */
function fail(res, reason) {
    var Resource = require('dw/web/Resource');
    logger().warn('{0}: failed - {1}', LOG_CATEGORY, reason);
    secureResponseHelper.secureJsonResponse(res, {
        error: true,
        errorMessage: Resource.msg('error.earlySetup.failed', 'error', null)
    });
}

/**
 * Reads a POSTed form value as a trimmed string.
 * @param {Object} req - request
 * @param {string} name - field name
 * @returns {string} the value, or '' when absent
 */
function formValue(req, name) {
    var raw = req.form ? req.form[name] : null;
    return raw ? String(raw).trim() : '';
}

/**
 * Resolves the shopper's own wallet instrument for a UUID. Callers pass only the session
 * customer's own instruments, so an unknown or foreign UUID yields null and no call is made.
 * @param {Array} walletPaymentInstruments - req.currentCustomer.wallet.paymentInstruments
 * @param {string} uuid - client-supplied wallet UUID
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
 * Resolves the raw (writable, untruncated) CustomerPaymentInstrument for a UUID. The request
 * wrapper on req.currentCustomer does not expose creditCardToken, so the persistent customer
 * has to be re-read to get at it.
 * @param {Object} req - request
 * @param {string} uuid - wallet UUID, already ownership-checked
 * @returns {dw.customer.CustomerPaymentInstrument|null} the raw instrument, or null
 */
function getRawWalletInstrument(req, uuid) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    if (!req.currentCustomer.profile || !req.currentCustomer.profile.customerNo) {
        return null;
    }
    var customer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
    if (!customer || !customer.getProfile()) {
        return null;
    }
    var rawPIs = customer.getProfile().getWallet().getPaymentInstruments('CREDIT_CARD').toArray();
    return array.find(rawPIs, function (pi) {
        return pi.UUID === uuid;
    }) || null;
}

/**
 * PayerAuthEarlySetup-PayerAuthSetupData : runs Payer Auth Setup at card-entry time.
 *
 * POST { cardNumber, cardType, expirationMonth, expirationYear } for a new card, or
 * POST { storedPaymentUUID } for a saved card - the wallet token is resolved server-side so no
 * PAN is ever posted for a saved card. No security code is accepted or sent in either case.
 *
 * Responds with exactly one of:
 *   { applicable: false }                            - silent no-op, checkout unaffected
 *   { error: true, errorMessage }                    - shown to the shopper and blocking
 *   { applicable: true, ddcUrl, jwtToken, generation } - run DDC with these
 */
server.post('PayerAuthSetupData', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');

    // Read the run counter BEFORE clearing, so it keeps climbing across attempts. Resetting it
    // to 0 here would make every run generation "1" and let device data from a superseded run
    // pass the freshness check in SaveDeviceData.
    var previousGeneration = parseInt(session.privacy.cybsEarlyPaGeneration, 10) || 0;

    // A new attempt always invalidates whatever the previous one left behind.
    clearEarlyState();

    var basket = BasketMgr.getCurrentBasket();
    if (!basket) {
        skip(res, 'no current basket');
        return next();
    }

    // paSetup builds billTo/shipTo from the container's addresses. Before the billing form is
    // submitted a basket can legitimately have neither (shopper still on shipping, or no default
    // address), which would otherwise throw inside the setup call.
    var hasShipping = basket.shipments && basket.shipments.length > 0 && basket.shipments[0].shippingAddress;
    if (!basket.billingAddress && !hasShipping) {
        skip(res, 'basket has neither a billing nor a shipping address yet');
        return next();
    }

    var storedPaymentUUID = formValue(req, 'storedPaymentUUID');
    var cardData;
    var cardType;

    if (storedPaymentUUID) {
        // ---- saved / stored card branch -------------------------------------------------
        if (!req.currentCustomer.raw || !req.currentCustomer.raw.authenticated || !req.currentCustomer.profile) {
            skip(res, 'stored card requested by a shopper who is not logged in');
            return next();
        }

        // Only ever look inside the logged-in shopper's own wallet.
        if (!findOwnInstrument(req.currentCustomer.wallet.paymentInstruments, storedPaymentUUID)) {
            skip(res, 'stored card UUID does not belong to the current customer');
            return next();
        }

        var rawPI = getRawWalletInstrument(req, storedPaymentUUID);
        if (!rawPI) {
            skip(res, 'stored card UUID not found in the persistent wallet');
            return next();
        }

        // eCheck instruments are saved under METHOD_CREDIT_CARD with creditCardType 'eCheck',
        // so they show up in the same saved-card list. Payer auth does not apply to them.
        if (rawPI.creditCardType === 'eCheck') {
            skip(res, 'stored instrument is an eCheck, payer auth does not apply');
            return next();
        }

        if (!rawPI.creditCardToken) {
            skip(res, 'stored card has no Visa Acceptance token, early setup is not possible for it');
            return next();
        }

        cardType = rawPI.creditCardType;
        // Setup authenticates against the wallet token. No security code: this cartridge renders
        // no CVV field for saved cards, and setup does not need one.
        cardData = { token: rawPI.creditCardToken };
    } else {
        // ---- new card branch ------------------------------------------------------------
        // cleave formats the displayed number with spaces, so normalise to digits here rather
        // than trusting the client to have done it.
        var cardNumber = formValue(req, 'cardNumber').replace(/\D/g, '');
        var expirationMonth = formValue(req, 'expirationMonth').replace(/\D/g, '');
        var expirationYear = formValue(req, 'expirationYear').replace(/\D/g, '');
        cardType = formValue(req, 'cardType');

        if (!cardNumber || !expirationMonth || !expirationYear || !cardType) {
            skip(res, 'incomplete card details posted');
            return next();
        }

        cardData = {
            number: cardNumber,
            expirationMonth: expirationMonth,
            expirationYear: expirationYear,
            type: cardType
        };
    }

    // Shares the order-time Authorize hook's 3DS mode / card type decision, so early setup can
    // never fire for a card the order-time flow would not have run payer auth for. Adds the
    // Unified Checkout exclusion on top.
    if (!payerAuthentication.isEarlyPayerAuthApplicable(cardType)) {
        skip(res, 'payer auth does not apply for card type "' + cardType + '" under the configured 3DS mode');
        return next();
    }

    try {
        var generation = String(previousGeneration + 1);

        // No order exists yet, so the basket stands in for it - paSetup only reads LineItemCtnr
        // members. The merchant reference, however, is the order number the order will actually
        // be created with, reserved up front, so setup and enrollment correlate.
        var referenceCode = reserveOrderNo();
        var setupResponse = payerAuthentication.paSetup(null, referenceCode, cardData, basket, null);

        var consumerAuth = setupResponse ? setupResponse.consumerAuthenticationInformation : null;
        if (!consumerAuth || !consumerAuth.referenceId) {
            fail(res, 'setup response carried no referenceId');
            return next();
        }

        session.privacy.cybsEarlyPaReferenceId = consumerAuth.referenceId;
        session.privacy.cybsEarlyPaGeneration = generation;
        session.privacy.cybsEarlyPaSetupTime = String(new Date().getTime());

        secureResponseHelper.secureJsonResponse(res, {
            applicable: true,
            ddcUrl: consumerAuth.deviceDataCollectionUrl,
            jwtToken: consumerAuth.accessToken,
            generation: generation
        });
    } catch (e) {
        clearEarlyState();
        fail(res, 'setup call threw: ' + (e.message || e));
    }

    return next();
});

/**
 * PayerAuthEarlySetup-SaveDeviceData : stores the browser fields gathered alongside DDC.
 *
 * POST { browserfields, generation }. These are posted in parallel with the DDC iframe, not
 * chained behind it, so they are available to enrollment even when DDC is slow or never reports
 * back. PayerAuthEnroll reads them from the session when the order-time POST carries none.
 */
server.post('SaveDeviceData', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    if (!session.privacy.cybsEarlyPaReferenceId) {
        skip(res, 'device data posted with no early setup reference in session');
        return next();
    }

    // Late device data from a superseded run (shopper changed card mid-flight) must not overwrite
    // the current one.
    var generation = formValue(req, 'generation');
    if (!generation || generation !== session.privacy.cybsEarlyPaGeneration) {
        skip(res, 'device data generation "' + generation + '" is stale');
        return next();
    }

    var browserFields = formValue(req, 'browserfields');
    if (!browserFields || browserFields.length > 500) {
        skip(res, 'device data missing or larger than the session can hold');
        return next();
    }

    try {
        JSON.parse(browserFields);
    } catch (e) {
        skip(res, 'device data is not parseable JSON');
        return next();
    }

    session.privacy.cybsEarlyPaBrowserFields = browserFields;
    secureResponseHelper.secureJsonResponse(res, { success: true });
    return next();
});

/**
 * PayerAuthEarlySetup-ClearPayerAuthSetup : drops the stored reference.
 *
 * Called when the shopper switches payment method or moves to a different card, so the order-time
 * gate falls through to a normal setup instead of enrolling against a reference that belongs to a
 * card no longer being paid with.
 *
 * POST { keepOrderNo } - pass a truthy value when the shopper is still paying by card and only
 * the card itself changed. The reserved order number stays valid for the checkout in that case,
 * and holding on to it avoids taking another number from the sequence for the replacement setup.
 */
server.post('ClearPayerAuthSetup', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    clearEarlyState();

    var keepOrderNo = formValue(req, 'keepOrderNo');
    if (!keepOrderNo || keepOrderNo === 'false') {
        // The shopper has moved off cards altogether. Leaving this set would hand a number
        // reserved for payer auth to whatever they pay with instead.
        session.privacy.cybsEarlyPaOrderNo = '';
    }

    secureResponseHelper.secureJsonResponse(res, { success: true });
    return next();
});

if (configObject.cartridgeEnabled) {
    module.exports = server.exports();
}
