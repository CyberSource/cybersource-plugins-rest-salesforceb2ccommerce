'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');
var configObject = require('~/cartridge/configuration/index');
var payerAuthentication = require('~/cartridge/scripts/http/payerAuthentication');
var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

/**
 * How long an early (card-entry time) setup reference stays usable. Past this the order-time
 * setup runs normally, so an idling shopper gets a clean fallback instead of an enrollment
 * failure on a reference the authentication provider has already aged out.
 */
var EARLY_SETUP_MAX_AGE_MS = 900000; // 15 minutes

/**
 * postMessage type the return interstitial sends to the parent window to say the 3DS challenge is
 * finished. Defined once and handed to both templates so the sender and the listener cannot drift.
 */
var PAYER_AUTH_COMPLETE_MESSAGE = 'visaacceptance:payerauth-complete';

/**
 * Session keys written by the PayerAuthEarlySetup controller. Cleared once enrollment has
 * consumed them so a second order attempt cannot reuse a spent reference.
 */
var EARLY_SESSION_KEYS = [
    'cybsEarlyPaReferenceId',
    'cybsEarlyPaBrowserFields',
    'cybsEarlyPaGeneration',
    'cybsEarlyPaSetupTime'
];

/**
 * Drops all early Payer Auth setup state from the session.
 */
function clearEarlyPayerAuthState() {
    for (var i = 0; i < EARLY_SESSION_KEYS.length; i += 1) {
        session.privacy[EARLY_SESSION_KEYS[i]] = '';
    }
}

/**
 * Retrieves an order only if it belongs to the current session.
 * Validates that the requested orderNo matches the session-stored order
 * set during checkout in postAuthorizationHandling.
 * @param {string} orderNo - The order number to retrieve
 * @returns {dw.order.Order|null} The order if valid, null otherwise
 */
function getOrder(orderNo) {
    var OrderMgr = require('dw/order/OrderMgr');
    // eslint-disable-next-line no-undef
    if (!orderNo || orderNo !== session.privacy.currentOrderNo) {
        return null;
    }
    return OrderMgr.getOrder(orderNo);
}

/**
 * Handle successful order placement with complete flow
 * Includes fraud detection check, order placement, address saving, email confirmation
 * @param {Object} params - Parameters object
 * @param {dw.order.Order} params.order - The order object
 * @param {dw.order.Basket} params.currentBasket - The current basket
 * @param {Object} params.req - The request object
 * @param {Object} params.res - The response object
 * @param {dw.order.PaymentInstrument} params.paymentInstrument - The payment instrument
 * @returns {Object} Result object with error flag and redirect status
 */
function handleOrderPlacement(params) {
    var Transaction = require('dw/system/Transaction');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');

    var order = params.order;
    var currentBasket = params.currentBasket;
    var req = params.req;
    var res = params.res;
    var paymentInstrument = params.paymentInstrument;

    var result = {
        error: false,
        redirect: false
    };

    // Fraud detection check
    var fraudDetectionStatus = hooksHelper(
        'app.fraud.detection',
        'fraudDetection',
        currentBasket,
        require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection
    );

    if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });

        // fraud detection failed
        req.session.privacyCache.set('fraudDetectionStatus', true);
        result.error = true;
        result.redirect = true;
        res.redirect(URLUtils.https('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode));
        return result;
    }

    // Place the order
    var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
    if (placeOrderResult.error) {
        result.error = true;
        result.redirect = true;
        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null)));
        return result;
    }

    // Save shipping addresses to address book of the logged in customer
    if (req.currentCustomer.addressBook) {
        var allAddresses = addressHelpers.gatherShippingAddresses(order);
        allAddresses.forEach(function (address) {
            if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
                addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
            }
        });
    }

    // Send confirmation email
    if (order.getCustomerEmail()) {
        COHelpers.sendConfirmationEmail(order, req.locale.id);
    }

    // Reset usingMultiShip after successful Order placement
    req.session.privacyCache.set('usingMultiShipping', false);

    // Clear session privacy data
    // eslint-disable-next-line no-undef
    session.privacy.orderStatus = '';
    // eslint-disable-next-line no-undef
    session.privacy.currentOrderNo = '';

    return result;
}

/**
 * PayerAuthentication-PayerAuthSetup : Performs payer authentication setup and device data collection
 * This route handles the 3DS payer authentication setup flow
 */
server.post('PayerAuthSetup', server.middleware.https, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var Transaction = require('dw/system/Transaction');
    var isScaFlow = false;

    if (req.form.isScaFlow && req.form.isScaFlow === 'true') {
        isScaFlow = true;
    }

    // eslint-disable-next-line no-undef
    var orderNo = req.form.orderID;
    var order = getOrder(orderNo);

    if (!order) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }

    // Early setup gate. When PayerAuthEarlySetup-PayerAuthSetupData already ran setup and DDC at
    // card-entry time, reuse that referenceId and go straight to enrollment instead of paying for
    // a second setup call and a second device data collection round trip.
    //
    // Deliberately NOT taken when isScaFlow: an SCA retrigger must always get a fresh setup.
    // Also not taken once the reference is older than EARLY_SETUP_MAX_AGE_MS, so an idling
    // shopper falls back to the normal order-time setup rather than failing enrollment on an
    // expired reference.
    var earlyReferenceId = session.privacy.cybsEarlyPaReferenceId;
    var earlySetupTime = Number(session.privacy.cybsEarlyPaSetupTime) || 0;
    var earlyAge = new Date().getTime() - earlySetupTime;

    if (!isScaFlow && earlyReferenceId && earlyAge < EARLY_SETUP_MAX_AGE_MS) {
        require('dw/system/Logger').getLogger('VisaAcceptance', 'PayerAuthentication')
            .warn('PayerAuthSetup: reusing early setup reference, skipping setup and DDC. Order: {0}', orderNo);

        secureResponseHelper.secureRender(res, 'payerAuthentication/earlyPayerAuthEnroll', {
            action: URLUtils.url('PayerAuthentication-PayerAuthEnroll'),
            orderNo: orderNo,
            referenceId: earlyReferenceId,
            isScaFlow: isScaFlow
        });
        return next();
    }

    if (earlyReferenceId) {
        require('dw/system/Logger').getLogger('VisaAcceptance', 'PayerAuthentication')
            .warn('PayerAuthSetup: ignoring early setup reference ({0}), running order-time setup. Order: {1}',
                isScaFlow ? 'SCA retrigger needs a fresh setup' : 'reference is stale', orderNo);
    }

    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);

    var billingForm = server.forms.getForm('billing');
    var card = {
        token: paymentInstrument.creditCardToken,
        securityCode: billingForm.creditCardFields.securityCode.value
    };

    try {
        // Perform payer authentication setup
        var setupResponse = payerAuthentication.paSetup(billingForm, orderNo, card, order, paymentInstrument);

        var accessToken = setupResponse.consumerAuthenticationInformation.accessToken;
        var deviceDataCollectionUrl = setupResponse.consumerAuthenticationInformation.deviceDataCollectionUrl;
        var referenceId = setupResponse.consumerAuthenticationInformation.referenceId;

        var action = URLUtils.url('PayerAuthentication-PayerAuthEnroll');

        // Render device data collection page
        secureResponseHelper.secureRender(res, 'payerAuthentication/deviceDataCollection', {
            jwtToken: accessToken,
            action: action,
            orderNo: orderNo,
            deviceDataUrl: deviceDataCollectionUrl,
            referenceId: referenceId,
            isScaFlow: isScaFlow
        });
    } catch (e) {
        // Fail the order and clean up
        Transaction.wrap(function () {
            OrderMgr.failOrder(order, true);
        });

        res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null)));
    }

    return next();
});

/**
 * PayerAuthentication-PayerAuthEnroll : Handles the response from device data collection and performs enrollment
 */
server.post('PayerAuthEnroll', server.middleware.https, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var isScaFlow = false;

    // eslint-disable-next-line no-shadow
    var currentBasket = BasketMgr.getCurrentBasket();
    var orderNo = req.form.orderID;
    var order = getOrder(orderNo);

    if (req.form.isScaFlow && req.form.isScaFlow === 'true') {
        isScaFlow = true;
    }

    var payerauthArgs = {};
    // Handle browser fields if submitted
    if (request.httpParameterMap.browserfields.submitted) {
        var browserfields = request.httpParameterMap.browserfields.value;
        if (browserfields) {
            var parsedBrowserfields = JSON.parse(browserfields);
            // Add server-side data that cannot be collected from browser
            parsedBrowserfields.ipAddress = request.httpRemoteAddress;
            parsedBrowserfields.httpAcceptContent = secureResponseHelper.sanitizeHttpHeader(request.httpHeaders.get('accept'));

            payerauthArgs.parsedBrowserfields = parsedBrowserfields;
        }
    }

    // When setup ran early, the browser fields were collected and POSTed at card-entry time
    // rather than by the DDC page, so they arrive from the session instead of this request.
    if (!payerauthArgs.parsedBrowserfields && session.privacy.cybsEarlyPaBrowserFields) {
        try {
            var earlyBrowserfields = JSON.parse(session.privacy.cybsEarlyPaBrowserFields);
            earlyBrowserfields.ipAddress = request.httpRemoteAddress;
            earlyBrowserfields.httpAcceptContent = secureResponseHelper.sanitizeHttpHeader(request.httpHeaders.get('accept'));
            payerauthArgs.parsedBrowserfields = earlyBrowserfields;
        } catch (eBrowserfields) {
            require('dw/system/Logger').getLogger('VisaAcceptance', 'PayerAuthentication')
                .warn('PayerAuthEnroll: could not parse early browser fields, enrolling without them: {0}',
                    eBrowserfields.message || eBrowserfields);
        }
    }

    // The reference is single-use: whatever happens to this enrollment, a later order attempt
    // must run its own setup rather than replaying this one.
    clearEarlyPayerAuthState();

    var referenceId = req.form.referenceId;
    var billingForm = server.forms.getForm('billing');
    var shippingAddress = null;
    var redirect = false;
    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);

    if (order != null) {
        shippingAddress = order.shipments[0].shippingAddress;
        var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
        var totalAmount = order.totalGrossPrice.value;
        var currencyCode = order.currencyCode;
        var card = {
            token: paymentInstrument.creditCardToken,
            securityCode: billingForm.creditCardFields.securityCode.value
        };
    }

    try {

        // eslint-disable-next-line block-scoped-var, no-undef
        var enrollResponse = payerAuthentication.paEnroll(billingForm, shippingAddress, orderNo, totalAmount, currencyCode, referenceId, card, lineItems, order, isScaFlow, payerauthArgs, paymentInstrument);

        if (enrollResponse.scaConditionMetForTokenFlow) { // This flag indicates that the SCA condition for tokenized card flow, so we don't have to retrigger the transaction again.
            isScaFlow = true;
        }

        if (enrollResponse.status === 'PENDING_AUTHENTICATION' && enrollResponse.errorInformation.reason === 'CONSUMER_AUTHENTICATION_REQUIRED') {

            if (enrollResponse.consumerAuthenticationInformation.acsUrl
                && enrollResponse.consumerAuthenticationInformation.stepUpUrl
                && enrollResponse.consumerAuthenticationInformation.pareq
                && enrollResponse.consumerAuthenticationInformation.authenticationTransactionId) {

                var jwtToken = enrollResponse.consumerAuthenticationInformation.accessToken;
                var stepUpUrl = enrollResponse.consumerAuthenticationInformation.stepUpUrl;
                // eslint-disable-next-line no-undef
                session.privacy.transactionId = enrollResponse.consumerAuthenticationInformation.authenticationTransactionId;

                // eslint-disable-next-line no-shadow
                this.on('route:BeforeComplete', function (req, res) {
                    secureResponseHelper.secureRender(res, 'payerAuthentication/postToStepUpUrl', {
                        stepUpUrl: stepUpUrl,
                        jwtToken: jwtToken,
                        orderNo: orderNo,
                        isScaFlow: isScaFlow,
                        completeMessageType: PAYER_AUTH_COMPLETE_MESSAGE
                    });
                });
            }
        } else if (enrollResponse.status === 'AUTHORIZED' || enrollResponse.status === 'AUTHORIZED_PENDING_REVIEW') {
            // eslint-disable-next-line no-undef
            session.privacy.orderStatus = enrollResponse.status;

            var placeOrderParams = {
                order: order,
                currentBasket: currentBasket,
                req: req,
                res: res,
                paymentInstrument: paymentInstrument
            };

            var orderPlacementResult = handleOrderPlacement(placeOrderParams);
            redirect = orderPlacementResult.redirect;

            if (orderPlacementResult.error) {
                return next();
            }
        }
        else if (enrollResponse.status === 'AUTHORIZED_RISK_DECLINED') {
            var Logger = require('dw/system/Logger');
            Logger.error('[PayerAuthentication.js] Enrollment authorized but risk declined. Reversal initiated. Order: {0}, Status: {1}', orderNo, enrollResponse.status);
            var authReversal = require('~/cartridge/scripts/http/authReversal');
            authReversal.httpAuthReversal(enrollResponse.id, enrollResponse.clientReferenceInformation.code, totalAmount, currencyCode);
            redirect = true;
            Transaction.wrap(function () {
                OrderMgr.failOrder(order);
            });
        }
        // Only retrigger SCA if this is not already an SCA retrigger attempt
        else if (enrollResponse.errorInformation.reason === 'CUSTOMER_AUTHENTICATION_REQUIRED' && !isScaFlow) {
            // eslint-disable-next-line no-shadow
            secureResponseHelper.secureRender(res, 'payerAuthentication/scaRedirect', {
                orderID: order.orderNo,
                isScaFlow: true
            });

            return next();
        }
        else {
            redirect = true;
            Transaction.wrap(function () {
                OrderMgr.failOrder(order);
            });
        }

        secureResponseHelper.secureRender(res, 'payerAuthentication/checkoutRedirect', {
            redirect: redirect,
            errorMessage: Resource.msg('message.payerAuthError', 'error', null),
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: URLUtils.url('COPlaceOrder-SubmitOrderConformation').toString()
        });
    } catch (e) {
        if (!order) {
            redirect = true;
            secureResponseHelper.secureRender(res, 'payerAuthentication/checkoutRedirect', {
                redirect: redirect,
                errorMessage: Resource.msg('message.payerAuthError', 'error', null)
            });
        } else {
            Transaction.wrap(function () {
                OrderMgr.failOrder(order);
            });
            redirect = true;
            secureResponseHelper.secureRender(res, 'payerAuthentication/checkoutRedirect', {
                redirect: redirect,
                errorMessage: Resource.msg('message.payerAuthError', 'error', null)
            });
        }
    }
    return next();
});

/**
 * PayerAuthentication-PayerAuthReturn : thin interstitial the ACS returns to after the challenge.
 *
 * Does no payment work at all. Its only jobs are to tell the parent window that the challenge is
 * over - the parent cannot see inside the issuer's iframe, so this same-origin page is the first
 * reliable signal it gets - and then to hand the ACS's POST straight on to PayerAuthValidation.
 *
 * Why this exists: pointing the returnUrl directly at PayerAuthValidation means the browser only
 * learns the challenge finished AFTER validation, order placement and email have all run, which is
 * far too late to put a spinner up. Splitting the return into a cheap page first makes the timing
 * exact instead of inferred from iframe load counts.
 *
 * The body is forwarded generically rather than by naming fields: which parameters an ACS echoes
 * back varies, and PayerAuthValidation reads MD and TransactionId off the request itself.
 */
server.post('PayerAuthReturn', server.middleware.https, function (req, res, next) {
    // Conservative allowlist for parameter names, so nothing odd reaches an HTML attribute.
    var SAFE_PARAM_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

    var forwardedParams = [];
    // eslint-disable-next-line no-undef
    var parameterMap = request.httpParameterMap;
    var parameterNames = parameterMap.getParameterNames().toArray();

    for (var i = 0; i < parameterNames.length; i += 1) {
        var name = String(parameterNames[i]);
        if (SAFE_PARAM_NAME.test(name)) {
            forwardedParams.push({
                name: name,
                value: parameterMap.get(name).stringValue || ''
            });
        } else {
            require('dw/system/Logger').getLogger('VisaAcceptance', 'PayerAuthentication')
                .warn('PayerAuthReturn: dropped a returned parameter whose name is not forwardable');
        }
    }

    // Carry any querystring the returnUrl was built with onto the forwarding action, so params
    // added to the returnUrl later keep working without touching this code.
    var action = URLUtils.https('PayerAuthentication-PayerAuthValidation').toString();
    // eslint-disable-next-line no-undef
    var queryString = request.httpQueryString;
    if (queryString && /^[A-Za-z0-9_.\-=&%+]{1,512}$/.test(queryString)) {
        action += (action.indexOf('?') > -1 ? '&' : '?') + queryString;
    }

    secureResponseHelper.secureRender(res, 'payerAuthentication/payerAuthReturn', {
        action: action,
        forwardedParams: forwardedParams,
        completeMessageType: PAYER_AUTH_COMPLETE_MESSAGE
    });
    return next();
});

/**
 * PayerAuthentication-PayerAuthValidation : Handles consumer authentication response after step-up
 */
server.post('PayerAuthValidation', server.middleware.https, function (req, res, next) {
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    // eslint-disable-next-line no-shadow
    var currentBasket = BasketMgr.getCurrentBasket();
    var Transaction = require('dw/system/Transaction');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var redirect;

    var billingForm = server.forms.getForm('billing');
    // eslint-disable-next-line no-undef
    var mdValue = request.httpParameterMap.MD.stringValue;
    var transactionId = request.httpParameterMap.TransactionId.stringValue;

    // Parse MD field: ACS echoes back all MD values as comma-separated (e.g., 'orderNo,SCA')
    var isScaFlow = false;
    var orderNo = mdValue;
    if (mdValue && mdValue.indexOf(',SCA') > -1) {
        orderNo = mdValue.split(',')[0];
        isScaFlow = true;
    }
    var order = getOrder(orderNo);

    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);
    if (order != null) {
        var totalAmount = order.totalGrossPrice.value;
        var currencyCode = order.currencyCode;
        var card = {
            token: paymentInstrument.creditCardToken,
            securityCode: billingForm.creditCardFields.securityCode.value
        };
    }
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
    // eslint-disable-next-line no-undef, block-scoped-var
    var authenticateResponse = payerAuthentication.paConsumerAuthenticate(billingForm, orderNo, totalAmount, currencyCode, transactionId, card, lineItems, order, paymentInstrument);

    if (authenticateResponse.status === 'AUTHORIZED' || authenticateResponse.status === 'AUTHORIZED_PENDING_REVIEW') {
        // eslint-disable-next-line no-undef
        session.privacy.orderStatus = authenticateResponse.status;

        var placeOrderParams = {
            order: order,
            currentBasket: currentBasket,
            req: req,
            res: res,
            paymentInstrument: paymentInstrument
        };

        var orderPlacementResult = handleOrderPlacement(placeOrderParams);
        redirect = orderPlacementResult.redirect;

        if (orderPlacementResult.error) {
            return next();
        }
    }

    else if (authenticateResponse.status === 'AUTHORIZED_RISK_DECLINED') {
        var Logger = require('dw/system/Logger');
        Logger.error('[PayerAuthentication.js] Authentication authorized but risk declined. Reversal initiated. Order: {0}, Status: {1}', orderNo, authenticateResponse.status);
        var authReversal = require('~/cartridge/scripts/http/authReversal');
        authReversal.httpAuthReversal(authenticateResponse.id, authenticateResponse.clientReferenceInformation.code, totalAmount, currencyCode);
        redirect = true;
        Transaction.wrap(function () {
            OrderMgr.failOrder(order);
        });
    }

    // Only retrigger SCA if this is not already an SCA retrigger attempt
    else if ((authenticateResponse.errorInformation ? authenticateResponse.errorInformation.reason === 'CUSTOMER_AUTHENTICATION_REQUIRED' : false) && !isScaFlow) {
        // eslint-disable-next-line no-shadow
        secureResponseHelper.secureRender(res, 'payerAuthentication/scaRedirect', {
            orderID: order.orderNo,
            isScaFlow: true
        });

        return next();
    }

    else {
        redirect = true;
        Transaction.wrap(function () {
            // Fail the order
            OrderMgr.failOrder(order);
        });
    }
    secureResponseHelper.secureRender(res, 'payerAuthentication/checkoutRedirect', {
        redirect: redirect,
        errorMessage: Resource.msg('message.payerAuthError', 'error', null) + ' ' + authenticateResponse.status,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('COPlaceOrder-SubmitOrderConformation').toString()
    });
    return next();
});

/*
 * Module exports
 */
if (configObject.cartridgeEnabled) {
    module.exports = server.exports();
} 