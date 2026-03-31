'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');
var configObject = require('~/cartridge/configuration/index');
var payerAuthentication = require('~/cartridge/scripts/http/payerAuthentication');
var CardHelper = require('~/cartridge/scripts/helpers/CardHelper');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

/**
 * @returns {*} *
 */
function getOrder(orderNo) {
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(orderNo);
    return order;
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
            CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
    var order = OrderMgr.getOrder(orderNo);

    if (!order) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }
    var paymentInstrument = CardHelper.getNonGCPaymemtInstument(order);

    var billingForm = server.forms.getForm('billing');
    var card = {
        token: paymentInstrument.creditCardToken,
        jwttoken: billingForm.creditCardFields.flexresponse.value,
        ucJwtToken: paymentInstrument.custom.UCToken,
        securityCode: billingForm.creditCardFields.securityCode.value,
        googlePayFluidData: paymentInstrument.custom.GooglePayEncryptedData
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
            CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
            jwttoken: billingForm.creditCardFields.flexresponse.value,
            ucJwtToken: paymentInstrument.custom.UCToken,
            securityCode: billingForm.creditCardFields.securityCode.value,
            googlePayFluidData: paymentInstrument.custom.GooglePayEncryptedData,
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
                        isScaFlow: isScaFlow
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
                CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
                // Clean up UCToken on enrollment failure
                CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
                // Clean up UCToken on exception
                CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
            jwttoken: billingForm.creditCardFields.flexresponse.value,
            ucJwtToken: paymentInstrument.custom.UCToken,
            securityCode: billingForm.creditCardFields.securityCode.value,
            googlePayFluidData: paymentInstrument.custom.GooglePayEncryptedData,
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
            CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
            // Clean up UCToken before failing order (placeOrder won't be called)
            CardHelper.cleanupPaymentInstrumentCustomAttributes(paymentInstrument);
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
