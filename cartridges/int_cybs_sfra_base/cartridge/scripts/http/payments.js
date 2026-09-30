'use strict';

var Cipher = require('dw/crypto/Cipher');
var configObject = require('../../configuration/index');
var MerchantConfig = require('~/cartridge/apiClient/merchantConfig');
var merchantId = new MerchantConfig(configObject).getMerchantID();
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Constants = require('*/cartridge/apiClient/constants');
var errors = require('~/cartridge/scripts/util/errors.js');
/**
 * @param {*} cardData *
 * @param {*} customerEmail *
 * @param {*} referenceInformationCode *
 * @param {*} total *
 * @param {*} currency *
 * @param {*} billingAddress *
 * @param {*} shippingAddress *
 * @param {*} lineItems *
 * @returns {*} *
 */
function httpAuthorizeWithToken(cardData, customerEmail, referenceInformationCode, total, currency, billingAddress, shippingAddress, lineItems, savePayment) {
    /* eslint-disable block-scoped-var */
    /* eslint-disable no-undef */
    var configObject = require('../../configuration/index');
    var padNumber = require('../util/pad');
    var cybersourceRestApi = require('../../apiClient/index');
    var errors = require('~/cartridge/scripts/util/errors.js');
    var mapper = require('~/cartridge/scripts/util/mapper.js');

    var webhookActivationHelper = require('~/cartridge/scripts/helpers/webhookActivationHelper');
    webhookActivationHelper.activateWebhooks();
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;
    // Global `request` is shadowed by the local CreatePaymentRequest below; resolve the
    // shopper IP via ucPaymentHelper so deviceInformation.ipAddress is populated (required
    // by Visa Acceptance whenever deviceInformation is sent).
    deviceSessionId.ipAddress = ucPaymentHelper.getRemoteIpAddress();

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = configObject.CommerceIndicator.value;
    processingInformation.actionList = [];
    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }
    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();

    var server = require('server');
    var paymentForm = server.forms.getForm('billing');
    if (paymentForm && paymentForm.creditCardFields && paymentForm.creditCardFields.saveCard && paymentForm.creditCardFields.saveCard.checked && savePayment) {
        processingInformation.actionList.push('TOKEN_CREATE');
        //@ts-ignore
        if (session.getCustomer().getProfile().custom.customerID != null) {
            processingInformation.actionTokenTypes = [
                'paymentInstrument',
                'instrumentIdentifier'
            ];
            customer.id = session.getCustomer().getProfile().custom.customerID;
            paymentInformation.customer = customer;
        } else {
            processingInformation.actionTokenTypes = [
                'customer',
                'shippingAddress',
                'paymentInstrument',
                'instrumentIdentifier'
            ];
        }
    }
    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency.toUpperCase();
    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = customerEmail;
    billTo.country = billingAddress.countryCode.toString().toUpperCase();
    billTo.firstName = billingAddress.firstName;
    billTo.lastName = billingAddress.lastName;
    billTo.phoneNumber = billingAddress.phone;
    billTo.address1 = billingAddress.address1;
    billTo.postalCode = billingAddress.postalCode;
    billTo.locality = billingAddress.city;
    billTo.administrativeArea = billingAddress.stateCode;
    billTo.address2 = billingAddress.address2;
    billTo.district = billingAddress.stateCode;
    billTo.buildingNumber = billingAddress.suite;

    var shipTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationShipTo();
    shipTo.email = customerEmail;
    shipTo.country = shippingAddress.countryCode.toString().toUpperCase();
    shipTo.firstName = shippingAddress.firstName;
    shipTo.lastName = shippingAddress.lastName;
    shipTo.phoneNumber = shippingAddress.phone;
    shipTo.address1 = shippingAddress.address1;
    shipTo.postalCode = shippingAddress.postalCode;
    shipTo.locality = shippingAddress.city;
    shipTo.administrativeArea = shippingAddress.stateCode;
    shipTo.address2 = shippingAddress.address2;
    shipTo.district = shippingAddress.stateCode;
    shipTo.buildingNumber = shippingAddress.suite;

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.lineItems = lineItems;
    orderInformation.billTo = billTo;
    orderInformation.shipTo = shipTo;


    var request = new cybersourceRestApi.CreatePaymentRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;

    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        request.deviceInformation = deviceSessionId;
    }


    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(referenceInformationCode);

    if (cardData.ucJwtToken) {
        if (configObject.cardTransactionType.value === 'sale') {
            request.processingInformation.capture = true;
        }
    }
    else {
        if (order.paymentInstruments[0].paymentMethod === 'CREDIT_CARD') {
            if (configObject.cardTransactionType.value === 'sale') {
                request.processingInformation.capture = true;
            }
        }
    }

    if (cardData.token) { // Token created in handle function (subscription ON or save CC)
        var tokenInformation = mapper.deserializeTokenInformation(cardData.token);
        customer.customerId = tokenInformation.paymentInstrument.id;
        paymentInformation.customer = customer;
        request.paymentInformation = paymentInformation;
        var card = {};
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
        request.paymentInformation = paymentInformation;
    } else if (cardData.ucJwtToken) { // UC ON
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.ucJwtToken;
        request.tokenInformation = tokenInformation;
    } else { // no stored token: raw card data (default payment form)
        var card = {}; // eslint-disable-line no-redeclare
        card.expirationMonth = padNumber(cardData.expirationMonth, 2, '0');
        card.expirationYear = cardData.expirationYear.toString();
        card.number = cardData.creditcardnumber;
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
        request.paymentInformation = paymentInformation;
    }
    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
            }
            if (data.status === 'AUTHORIZED_RISK_DECLINED') {
                var Logger = require('dw/system/Logger');
                Logger.error('[payments.js] Payment authorized but risk declined. Reversal initiated. Order: {0}, Status: {1}', data.clientReferenceInformation.code, data.status);
                var authReversal = require('./authReversal');
                authReversal.httpAuthReversal(data.id, data.clientReferenceInformation.code, total, currency);
            }
            throw new errors.CARD_NOT_AUTHORIZED_ERROR(JSON.stringify(data)); // eslint-disable-line no-undef
        } else {
            var e = data;
            try {
                e = JSON.parse(data);
                // eslint-disable-next-line no-empty
            } catch (err) { }
            throw e;
        }
    });
    return result;
}

/**
 * @param {*} accounNumber *
 * @param {*} expiryMonth *
 * @param {*} expiryYear *
 * @param {*} securityCode *
 * @param {*} customerEmail *
 * @param {*} referenceInformationCode *
 * @param {*} billingAddress *
 * @param {*} currency *
 * @param {*} skipDMFlag *
 * @returns {*} *
 */
function httpZeroDollarAuth(
    accounNumber, expiryMonth, expiryYear, securityCode,
    customerEmail, referenceInformationCode, billingAddress, currency, skipDMFlag
) {
    var configObject = require('../../configuration/index');
    var padNumber = require('../util/pad');
    var cybersourceRestApi = require('../../apiClient/index');

    var errors = require('~/cartridge/scripts/util/errors');
    var webhookActivationHelper = require('~/cartridge/scripts/helpers/webhookActivationHelper');
    webhookActivationHelper.activateWebhooks();
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;
    // ipAddress is required by Visa Acceptance when deviceInformation is sent; resolve via
    // helper because the local CreatePaymentRequest below shadows the global `request`.
    deviceSessionId.ipAddress = ucPaymentHelper.getRemoteIpAddress();


    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = configObject.CommerceIndicator.value;
    processingInformation.actionList = [];
    if (session.getCustomer().getProfile().custom.customerID != null) {
        processingInformation.actionTokenTypes = [
            'paymentInstrument'
        ];
    } else {
        processingInformation.actionTokenTypes = [
            'customer',
            'shippingAddress',
            'paymentInstrument'
        ];
    }
    processingInformation.actionList.push('TOKEN_CREATE');

    if (skipDMFlag || !configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = '0';
    amountDetails.currency = currency.toUpperCase();

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = customerEmail;
    billTo.country = billingAddress.country.toString().toUpperCase();
    billTo.firstName = billingAddress.firstName;
    billTo.lastName = billingAddress.lastName;
    billTo.phoneNumber = billingAddress.phone;
    billTo.address1 = billingAddress.address1;
    billTo.address2 = billingAddress.address2;
    billTo.postalCode = billingAddress.postalCode;
    billTo.locality = billingAddress.locality;
    billTo.administrativeArea = billingAddress.administrativeArea;
    billTo.district = billingAddress.administrativeArea;
    billTo.buildingNumber = billingAddress.suite;

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.billTo = billTo;

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();

    var card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
    card.expirationMonth = padNumber(expiryMonth, 2, '0');
    card.expirationYear = expiryYear.toString();
    card.number = accounNumber;
    card.securityCode = securityCode;

    paymentInformation.card = card;
    if (session.getCustomer().getProfile().custom.customerID != null) {
        var customerInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        customerInformation.id = session.getCustomer().getProfile().custom.customerID;
        paymentInformation.customer = customerInformation;
    }

    var request = new cybersourceRestApi.CreatePaymentRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;
    request.paymentInformation = paymentInformation;
    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        request.deviceInformation = deviceSessionId;
    }

    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
            }
            if (data.status === 'AUTHORIZED_RISK_DECLINED') {
                var Logger = require('dw/system/Logger');
                Logger.error('[payments.js] Zero dollar auth authorized but risk declined. Reversal initiated. Order: {0}, Status: {1}', data.clientReferenceInformation.code, data.status);
                var authReversal = require('./authReversal');
                authReversal.httpAuthReversal(data.id, data.clientReferenceInformation.code, '0', currency);
            }
            throw new errors.CARD_NOT_AUTHORIZED_ERROR(JSON.stringify(data));
        } else {
            throw new errors.API_CLIENT_ERROR(JSON.stringify(data));
        }
    });
    return result;
}

/**
 * {*} *
 * @param {*} transientToken *
 * @param {*} customerEmail *
 * @param {*} referenceInformationCode *
 * @param {*} billingAddress *
 * @param {*} currency *
 * @returns {*} *
 */
function httpZeroDollarAuthWithTransientToken(
    transientToken,
    customerEmail, referenceInformationCode, billingAddress, currency
) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var errors = require('~/cartridge/scripts/util/errors');
    var webhookActivationHelper = require('~/cartridge/scripts/helpers/webhookActivationHelper');
    webhookActivationHelper.activateWebhooks();

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;


    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = configObject.CommerceIndicator.value;
    processingInformation.actionList = [];

    if (session.getCustomer().getProfile().custom.customerID != null) {
        processingInformation.actionTokenTypes = [
            'paymentInstrument'
        ];
    } else {
        processingInformation.actionTokenTypes = [
            'customer',
            'shippingAddress',
            'paymentInstrument'
        ];
    }
    processingInformation.actionList.push('TOKEN_CREATE');
    processingInformation.actionList.push('DECISION_SKIP');

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = '0';
    amountDetails.currency = currency.toUpperCase();

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = customerEmail;
    billTo.country = billingAddress.countryCode != null ? billingAddress.countryCode.toString().toUpperCase() : billingAddress.country;
    billTo.firstName = billingAddress.firstName;
    billTo.lastName = billingAddress.lastName;
    billTo.phoneNumber = billingAddress.phone || billingAddress.phoneNumber;
    billTo.address1 = billingAddress.address1;
    billTo.postalCode = billingAddress.postalCode;
    billTo.locality = billingAddress.city || billingAddress.locality;
    billTo.administrativeArea = billingAddress.stateCode || billingAddress.administrativeArea;
    billTo.address2 = billingAddress.address2;
    billTo.district = billingAddress.stateCode || billingAddress.administrativeArea;
    billTo.buildingNumber = billingAddress.suite != null ? billingAddress.suite : '';

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.billTo = billTo;

    var paymentTokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
    paymentTokenInformation.transientTokenJwt = transientToken;

    var request = new cybersourceRestApi.CreatePaymentRequest();

    if (session.getCustomer().getProfile().custom.customerID != null) {
        var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
        var customerInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        customerInformation.id = session.getCustomer().getProfile().custom.customerID;
        paymentInformation.customer = customerInformation;
        request.paymentInformation = paymentInformation;
    }

    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;
    request.tokenInformation = paymentTokenInformation;

    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
            }
            if (data.status === 'AUTHORIZED_RISK_DECLINED') {
                var Logger = require('dw/system/Logger');
                Logger.error('[payments.js] Zero dollar auth (transient token) authorized but risk declined. Reversal initiated. Order: {0}, Status: {1}', data.clientReferenceInformation.code, data.status);
                var authReversal = require('./authReversal');
                authReversal.httpAuthReversal(data.id, data.clientReferenceInformation.code, '0', currency);
            }
            throw new errors.CARD_NOT_AUTHORIZED_ERROR(JSON.stringify(data));
        } else {
            throw new Error(new errors.API_CLIENT_ERROR(JSON.stringify(data)));
        }
    });
    return result;
}

/**
 * @param {*} transientToken *
 * @param {*} customerEmail *
 * @param {*} referenceInformationCode *
 * @param {*} total *
 * @param {*} currency *
 * @param {*} billingAddress *
 * @param {*} lineItems *
 * @param {*} shippingAddress - Optional shipping address (required for eCheck) *
 * @param {*} isEcheck - Boolean flag to indicate if this is an eCheck payment *
 * @returns {*} *
 */
function httpAuthorizeWithTransientToken(transientToken, customerEmail, referenceInformationCode, total, currency, billingAddress, lineItems, shippingAddress, isEcheck) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var Logger = require('dw/system/Logger');
    var logger = Logger.getLogger('VisaAcceptance', isEcheck ? 'EcheckAuthorization' : 'CreditCardAuthorization');

    var webhookActivationHelper = require('~/cartridge/scripts/helpers/webhookActivationHelper');
    webhookActivationHelper.activateWebhooks();
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;
    // ipAddress is required by Visa Acceptance when deviceInformation is sent; resolve via
    // helper because the local CreatePaymentRequest below shadows the global `request`.
    deviceSessionId.ipAddress = ucPaymentHelper.getRemoteIpAddress();

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();

    // Set commerce indicator for credit cards only
    if (!isEcheck) {
        processingInformation.commerceIndicator = configObject.CommerceIndicator.value;
    }

    processingInformation.actionList = [];
    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }

    // Add bank transfer options for eCheck
    if (isEcheck) {
        var bankTransferOptions = new cybersourceRestApi.Ptsv2paymentsProcessingInformationBankTransferOptions();
        bankTransferOptions.secCode = 'WEB'; // Standard Entry Class Code for web-initiated transactions
        processingInformation.bankTransferOptions = bankTransferOptions;
    }

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency.toUpperCase();

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = customerEmail;
    billTo.country = billingAddress.countryCode.toString().toUpperCase();
    billTo.firstName = billingAddress.firstName;
    billTo.lastName = billingAddress.lastName;
    billTo.phoneNumber = isEcheck ? formatPhoneNumber(billingAddress.phone) : billingAddress.phone;
    billTo.address1 = billingAddress.address1;
    billTo.postalCode = billingAddress.postalCode;
    billTo.locality = billingAddress.city;
    billTo.administrativeArea = billingAddress.stateCode;
    billTo.address2 = billingAddress.address2;
    billTo.district = billingAddress.stateCode;
    billTo.buildingNumber = billingAddress.suite;

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.lineItems = lineItems;
    orderInformation.billTo = billTo;

    // Add shipping address for eCheck
    if (isEcheck && shippingAddress) {
        var shipTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationShipTo();
        shipTo.email = customerEmail;
        shipTo.country = shippingAddress.countryCode.toString().toUpperCase();
        shipTo.firstName = shippingAddress.firstName;
        shipTo.lastName = shippingAddress.lastName;
        shipTo.phoneNumber = formatPhoneNumber(shippingAddress.phone);
        shipTo.address1 = shippingAddress.address1;
        shipTo.postalCode = shippingAddress.postalCode;
        shipTo.locality = shippingAddress.city;
        shipTo.administrativeArea = shippingAddress.stateCode;
        shipTo.address2 = shippingAddress.address2;
        shipTo.district = shippingAddress.stateCode;
        shipTo.buildingNumber = shippingAddress.suite;
        orderInformation.shipTo = shipTo;
    }

    var paymentTokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
    paymentTokenInformation.transientTokenJwt = transientToken;

    var request = new cybersourceRestApi.CreatePaymentRequest();
    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;
    request.tokenInformation = paymentTokenInformation;

    // Set payment type for eCheck
    if (isEcheck) {
        var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
        var paymentType = new cybersourceRestApi.Ptsv2paymentsPaymentInformationPaymentType();
        paymentType.name = 'CHECK';
        paymentInformation.paymentType = paymentType;
        request.paymentInformation = paymentInformation;
    }

    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        request.deviceInformation = deviceSessionId;
    }

    if (configObject.enableCapture === true) {
        request.processingInformation.capture = true;
    }

    var response = '';
    instance.createPayment(request, function (data, error, responseData) { // eslint-disable-line no-unused-vars
        if (!error) {
            // eCheck payments typically return PENDING status, credit cards return AUTHORIZED
            var validStatuses = isEcheck ?
                ['PENDING', 'AUTHORIZED', 'PENDING_REVIEW'] :
                ['AUTHORIZED', 'AUTHORIZED_PENDING_REVIEW'];

            if (validStatuses.indexOf(data.status) !== -1) {
                response = data;
                return data;
            }
            if (data.status === 'AUTHORIZED_RISK_DECLINED') {
                var authReversal = require('./authReversal');
                authReversal.httpAuthReversal(data.id, data.clientReferenceInformation.code, total, currency);
            }
            throw new errors.CARD_NOT_AUTHORIZED_ERROR(JSON.stringify(data)); // eslint-disable-line no-undef
        } else {
            throw new Error(data);
        }
    });
    return response;
}


/**
 * Generate Unified Checkout capture context
 * @param {boolean} isMiniCart - Whether this is for minicart flow
 * @param {string} selectedPaymentInstrumentId - Optional: specific TMS payment instrument ID to pre-populate UC widget
 *                                               If provided, UC shows only this card's "Pay now" button
 *                                               If null/undefined, UC loads without saved card (fresh entry)
 * @returns {string|Object} JWT capture context string or error object
 */
function generateUcCaptureContext(isMiniCart, selectedPaymentInstrumentId) {
    var Logger = require('dw/system/Logger');
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
    var webhookActivationHelper = require('~/cartridge/scripts/helpers/webhookActivationHelper');

    try {
        // Activate webhooks for the checkout session
        webhookActivationHelper.activateWebhooks();

        var basket = require('dw/order/BasketMgr').getCurrentBasket();
        if (!basket) {
            Logger.error('[payments.js] generateUcCaptureContext - ERROR: basket is null/undefined');
            return { error: true, errorMessage: 'Basket not found' };
        }

        // Reserve an SFCC order number to use as the UC v1 client reference code.
        // Reused on SCA retry / re-renders so capture-context, auth, and the eventual
        // SFCC order all share the same identifier. checkoutHelpers.createOrder picks
        // this up from session.privacy.ucOrderNo and clears it on success.
        var OrderMgr = require('dw/order/OrderMgr');
        var Transaction = require('dw/system/Transaction');
        var reservedOrderNo = session.privacy.ucOrderNo;
        if (!reservedOrderNo) {
            Transaction.wrap(function () {
                reservedOrderNo = OrderMgr.createOrderNo();
            });
            session.privacy.ucOrderNo = reservedOrderNo;
        }

        var configObject = require('../../configuration/index');
        var cybersourceRestApi = require('../../apiClient/index');

        if (!cybersourceRestApi || !cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest) {
            Logger.error('[payments.js] generateUcCaptureContext - ERROR: cybersourceRestApi module not available');
            return { error: true, errorMessage: 'API client module not available' };
        }

        var requestObj = new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();

        // Target Origins
        requestObj.targetOrigins = ['https://' + request.httpHost];

        // Pin the Unified Checkout version when a specific 1.x version is configured in BM
        // (VisaAcceptance_UnifiedCheckout_ClientVersion). Left blank -> omit so UC uses the latest.
        var clientVersion = configObject.unifiedCheckoutClientVersion;
        if (!empty(clientVersion) && String(clientVersion).trim() !== '') {
            requestObj.clientVersion = String(clientVersion).trim();
        }

        // Allowed Card Networks is intentionally NOT sent - it is managed in EBC
        // and must not be included in ISV Phase 1.

        // Allowed Payment Types - split capture-context instances:
        //  - cart / minicart (isMiniCart): express-pay digital wallets ONLY
        //  - checkout page (!isMiniCart): wallets + globally-available methods + APMs
        // Wallets and globally-available methods are always sent; locale/currency-specific
        // APMs are gated by the basket currency. UC/EBC filters further by MID config.
        var allowedPaymentTypes = [];
        var currency = basket && basket.currencyCode ? basket.currencyCode : 'USD';

        // Express-pay digital wallets - work globally, present on both instances.
        allowedPaymentTypes.push('APPLEPAY');
        allowedPaymentTypes.push('GOOGLEPAY');
        allowedPaymentTypes.push('PAZE');
        allowedPaymentTypes.push('PAYPAL');
        allowedPaymentTypes.push('VENMO');

        // Everything below is checkout-only (the full instance). The cart/minicart
        // express instance stays wallets-only, so none of these are added there.
        if (!isMiniCart) {
            // Globally-available non-wallet methods
            allowedPaymentTypes.push('PANENTRY');
            allowedPaymentTypes.push('CLICKTOPAY');
            allowedPaymentTypes.push('CHECK');
        }

        requestObj.allowedPaymentTypes = allowedPaymentTypes;

        // Locale
        var Locale = require('dw/util/Locale');
        var currentLocale = Locale.getLocale(request.locale);
        requestObj.country = currentLocale.country;
        requestObj.locale = currentLocale.ID;

        // Capture Mandate
        var captureMandate = new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
        if (isMiniCart) {
            // Wallet instance: wallets collect billing/contact/shipping natively, so
            // request them all and suppress card-network icons (wallet-only instance).
            captureMandate.billingType = 'FULL';
            captureMandate.requestEmail = true;
            captureMandate.requestPhone = true;
            captureMandate.requestShipping = true;
            captureMandate.showAcceptedNetworkIcons = false;
        } else {
            // Checkout instance: SFRA already collected billing/contact/shipping on the
            // platform page, so UC only needs partial billing and no contact prompts.
            captureMandate.billingType = 'NONE';
            captureMandate.requestEmail = false;
            captureMandate.requestPhone = false;
            captureMandate.requestShipping = false;
        }
        requestObj.captureMandate = captureMandate;

        // Check customer registration status for TMS token display
        var customer = session.getCustomer();
        var customerProfile = customer ? customer.getProfile() : null;
        var isRegisteredCustomer = customer && customer.isRegistered() && customer.isAuthenticated() &&
            customerProfile && !empty(customerProfile.getEmail()) && !empty(customerProfile.getCustomerNo());

        // When the account already owns a TMS customer token, reuse it so the saved card
        // attaches to the existing customer instead of minting a new one (mirrors Non-UC).
        var existingCustomerId = ucPaymentHelper.getExistingTmsCustomerId(customer);

        // Complete Mandate - UC v1: TMS token configuration only.
        // completeMandate.type (transaction type) is EBC-managed and must NOT be
        // sent in ISV Phase 1 - only completeMandate.tms is permitted.
        var completeMandate = {};

        // Add TMS_TOKEN config for saved cards (registered customers only)
        // If selectedPaymentInstrumentId is provided, use ONLY that card (no other payment methods)
        // If null/undefined, show all payment methods (for entering new card)
        if (!isMiniCart && isRegisteredCustomer && customerProfile && selectedPaymentInstrumentId) {

            captureMandate.billingType = 'NONE';

            // Use only the selected payment instrument
            var tmsConfig = {
                paymentInstruments: [{ id: selectedPaymentInstrumentId }]
            };

            // Add TMS_TOKEN to paymentConfigurations. The request model does not
            // initialize paymentConfigurations, so create it before setting TMS_TOKEN
            // (otherwise this dereference throws "Cannot read property TMS_TOKEN from
            // undefined" and the capture context is never generated).
            requestObj.paymentConfigurations = requestObj.paymentConfigurations || {};
            requestObj.paymentConfigurations.TMS_TOKEN = tmsConfig;
            requestObj.captureMandate.showAcceptedNetworkIcons = false;

            // IMPORTANT: For saved card flow, show ONLY the TMS_TOKEN payment method
            // This displays only "Pay now VISA •••• 1111" button - no other payment options
            requestObj.allowedPaymentTypes = ['TMS_TOKEN'];

        } else if (!isMiniCart && isRegisteredCustomer && customerProfile) {
            // No card selected - saving a NEW card during checkout. Enable token creation and,
            // when the account already has a TMS customer, associate the new card with it so all
            // of the account's cards live under one customer (same handling as the save-card flow).
            // NOTE: UC currently appears to ignore this association (suspected gateway bug) and
            // still mints a new customer; the request we send is correct per the capture-context spec.
            completeMandate.tms = {
                tokenTypes: ucPaymentHelper.buildTmsTokenTypes(existingCustomerId)
            };
            if (existingCustomerId) {
                // The request model does not initialize paymentConfigurations; create it
                // before touching TMS_TOKEN so this branch does not throw "Cannot read
                // property TMS_TOKEN from undefined" (which aborts capture-context
                // generation for a registered shopper who already has a TMS customer).
                requestObj.paymentConfigurations = requestObj.paymentConfigurations || {};
                requestObj.paymentConfigurations.TMS_TOKEN = requestObj.paymentConfigurations.TMS_TOKEN || {};
                requestObj.paymentConfigurations.TMS_TOKEN.customer = { id: existingCustomerId };
            }
        }



        // Only send completeMandate when there is a tms block to carry (save-cards
        // enabled for a registered customer). An empty completeMandate is not sent.
        if (completeMandate.tms) {
            requestObj.completeMandate = completeMandate;
        }

        // Transient Token Response Options
        // BIN return mode is driven by BM dropdown VisaAcceptance_UnifiedCheckout_AllowedCardPrefix
        // (None -> includeCardPrefix:false, Six -> omitted, Eight -> includeCardPrefix:true).
        requestObj.transientTokenResponseOptions = ucPaymentHelper.buildTransientTokenResponseOptions(configObject);

        if (!isMiniCart) {
            var shipAddr = basket.defaultShipment ? basket.defaultShipment.shippingAddress : null;
            var shippingCountry = shipAddr && shipAddr.countryCode ? shipAddr.countryCode.value : null;
            if (!empty(shippingCountry)) {
                var billingAddr = basket.billingAddress;
                var billingCountry = billingAddr && billingAddr.countryCode ? billingAddr.countryCode.value : null;
                if (empty(billingCountry)) {
                    require('*/cartridge/scripts/checkout/checkoutHelpers').copyBillingAddressToBasket(shipAddr, basket);
                }
            }
        }

        // Order Information (with addresses and line items)
        requestObj.data = {
            orderInformation: ucPaymentHelper.buildOrderInformation(basket, isMiniCart)
        };

        // Client Reference Information - application + order tracking for Visa Acceptance.
        // code is the reserved SFCC order number (see reservedOrderNo above) so the
        // capture-context, auth, and eventual SFCC order all share one identifier.
        requestObj.data.clientReferenceInformation = {
            code: reservedOrderNo,
            applicationName: Constants.APPLICATION_NAME,
            applicationVersion: Constants.APPLICATION_VERSION,
            partner: {
                solutionId: configObject.solutionId || ''
            }
        };

        // Device Information: Capture context API only supports ipAddress in deviceInformation
        // Full device data (for 3DS) is handled during payment authorization, not capture context
        requestObj.data.deviceInformation = ucPaymentHelper.buildCaptureContextDeviceInformation();

        // Consumer Authentication Information: Add challengeCode for 3DS handling
        // When SCA was required (478 response) on a previous attempt, set challengeCode = '04' to mandate challenge
        var consumerAuthInfo = ucPaymentHelper.buildConsumerAuthenticationInformation();
        if (consumerAuthInfo) {
            requestObj.data.consumerAuthenticationInformation = consumerAuthInfo;
        }

        // Generate Capture Context
        var instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(configObject);
        var response = {};
        instance.generateUnifiedCheckoutCaptureContext(requestObj, function (data, error) {
            if (!error) {
                response = data;
            } else {
                throw new Error(data);
            }
        });
        return response;
    } catch (error) {
        Logger.error('[payments.js] generateUcCaptureContext ERROR - Type: {0}, Message: {1}',
            error.name || 'Unknown',
            error.message || String(error));
        if (error.stack) {
            Logger.error('[payments.js] generateUcCaptureContext Stack: {0}', error.stack);
        }

        return {
            error: true,
            errorMessage: error.message || String(error),
            errorType: error.name || 'UnknownError',
            errorDetails: error.stack || null
        };
    }
}

/**
 * Generate UC Capture Context for Save Card flow (My Account - Add Payment)
 * Uses zero-dollar AUTH to tokenize card without charging
 * UC widget collects billing address (billingType: 'FULL').
 * When a billTo object is supplied, it prefills the widget's billing form.
 *
 * @param {Object} [billTo] - optional UC billTo object to prefill the billing form
 *   (shape from ucPaymentHelper.buildBillToFromCustomerAddress); omitted when absent
 * @returns {Object} Capture context JWT or error object
 */
function generateUcCaptureContextSaveCard(billTo) {
    var Logger = require('dw/system/Logger');
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

    try {
        var configObject = require('../../configuration/index');
        var cybersourceRestApi = require('../../apiClient/index');

        // Reuse the account's existing TMS customer token so this saved card attaches to it.
        var existingCustomerId = ucPaymentHelper.getExistingTmsCustomerId(session.getCustomer());

        if (!cybersourceRestApi || !cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest) {
            Logger.error('[payments.js] generateUcCaptureContextSaveCard - ERROR: cybersourceRestApi module not available');
            return { error: true, errorMessage: 'API client module not available' };
        }

        var requestObj = new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();

        // Target Origins
        requestObj.targetOrigins = ['https://' + request.httpHost];

        // Pin the Unified Checkout version when a specific 1.x version is configured in BM
        // (VisaAcceptance_UnifiedCheckout_ClientVersion). Left blank -> omit so UC uses the latest.
        var clientVersion = configObject.unifiedCheckoutClientVersion;
        if (!empty(clientVersion) && String(clientVersion).trim() !== '') {
            requestObj.clientVersion = String(clientVersion).trim();
        }

        // Allowed Payment Types - PANENTRY for card entry in Save Card flow
        requestObj.allowedPaymentTypes = ['PANENTRY'];

        // Locale
        var Locale = require('dw/util/Locale');
        var currentLocale = Locale.getLocale(request.locale);
        requestObj.country = currentLocale.country;
        requestObj.locale = currentLocale.ID;

        // Button Type - SAVE_CARD for the "Add Payment" flow
        requestObj.buttonType = 'ADD_CARD';

        // Capture Mandate - billingType FULL so UC widget collects billing address
        var captureMandate = new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
        captureMandate.billingType = 'FULL';
        captureMandate.requestEmail = true;
        captureMandate.requestPhone = true;
        captureMandate.requestShipping = false;
        requestObj.captureMandate = captureMandate;

        // Complete Mandate - TMS tokenization for the save-card flow.
        // This is a zero-dollar card-on-file setup (no purchase), so Decision Manager
        // and Payer Authentication are explicitly disabled for this flow:
        //   decisionManager: false       -> skip Decision Manager
        //   consumerAuthentication: NONE -> skip 3DS / Payer Auth
        // completeMandate.type stays EBC-managed and is not sent.
        var completeMandate = {
            decisionManager: false,
            type: "PREFER_AUTH",
            consumerAuthentication: 'NONE',
            tms: {
                tokenTypes: ucPaymentHelper.buildTmsTokenTypes(existingCustomerId)
            }
        };
        requestObj.completeMandate = completeMandate;

        // Associate the newly tokenized card with the EXISTING TMS customer so all of an
        // account's cards live under one customer. Per the authoritative UC v1 capture-context
        // schema: paymentConfigurations.TMS_TOKEN.customer.id = existing customer
        // token - UC then creates
        // the new paymentInstrument/instrumentIdentifier under that customer. When the account has
        // no customer yet (first card), this is skipped and completeMandate.tms mints the customer.
        if (existingCustomerId) {
            requestObj.paymentConfigurations = {
                TMS_TOKEN: { customer: { id: existingCustomerId } }
            };
        }

        // Transient Token Response Options
        // BIN return mode is driven by BM dropdown VisaAcceptance_UnifiedCheckout_AllowedCardPrefix
        // (None -> includeCardPrefix:false, Six -> omitted, Eight -> includeCardPrefix:true).
        requestObj.transientTokenResponseOptions = ucPaymentHelper.buildTransientTokenResponseOptions(configObject);

        // Get site default currency for zero-dollar auth
        var Site = require('dw/system/Site');
        var defaultCurrency = Site.getCurrent().getDefaultCurrency() || 'USD';

        // Order Information with zero amount (billing will be captured by UC widget)
        requestObj.data = {
            orderInformation: {
                amountDetails: {
                    totalAmount: ucPaymentHelper.formatAmount(0, defaultCurrency),
                    currency: defaultCurrency
                }
            },
            clientReferenceInformation: {
                code: session.sessionID ? session.sessionID.substring(0, 6).toUpperCase() : 'SAVECD',
                applicationName: Constants.APPLICATION_NAME,
                applicationVersion: Constants.APPLICATION_VERSION,
                partner: {
                    solutionId: configObject.solutionId || ''
                }
            }
        };

        // Prefill the UC billing form from the customer's default address (when available)
        if (billTo) {
            requestObj.data.orderInformation.billTo = billTo;
        }

        // Device Information
        requestObj.data.deviceInformation = ucPaymentHelper.buildCaptureContextDeviceInformation();

        // Generate Capture Context
        var instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(configObject);
        var response = {};
        instance.generateUnifiedCheckoutCaptureContext(requestObj, function (data, error) {
            if (!error) {
                response = data;
            } else {
                throw new Error(data);
            }
        });

        return response;
    } catch (error) {
        Logger.error('[payments.js] generateUcCaptureContextSaveCard ERROR - Type: {0}, Message: {1}',
            error.name || 'Unknown',
            error.message || String(error));
        if (error.stack) {
            Logger.error('[payments.js] generateUcCaptureContextSaveCard Stack: {0}', error.stack);
        }

        return {
            error: true,
            errorMessage: error.message || String(error),
            errorType: error.name || 'UnknownError',
            errorDetails: error.stack || null
        };
    }
}

// function to decode capture context and validate capture context using the public key
function jwtDecode(jwt) {
    var captureContext = jwt;
    var Encoding = require('dw/crypto/Encoding');
    var Signature = require('dw/crypto/Signature');
    var Bytes = require('dw/util/Bytes');

    var apiSig = new Signature();
    var encodedHeader = captureContext.split('.')[0];
    var encodedPayload = captureContext.split('.')[1];
    var jwtSignature = captureContext.split('.')[2];

    var kid = JSON.parse(Encoding.fromBase64(encodedHeader)).kid;
    var alg = JSON.parse(Encoding.fromBase64(encodedHeader)).alg;
    var decodedPayload = Encoding.fromBase64(encodedPayload).toString();
    var parsedPayload = JSON.parse(decodedPayload);
    var decodedJwt = null;

    // generate public key using the kid from capture context
    var pKid = getPublicKey(kid);

    // Create public key using modulus and exponent value to validate capture context
    var pkey = require('../http/publicKey');

    if (!empty(pKid.n) && !empty(pKid.e)) {
        var RSApublickey = pkey.getRSAPublicKey(pKid.n, pKid.e);
        var JWTAlgoToSFCCMapping = {
            RS256: "SHA256withRSA",
            RS512: "SHA512withRSA",
            RS384: "SHA384withRSA",
        };
        // validate capture context using the generated public key
        var jwtSignatureInBytes = new Encoding.fromBase64(jwtSignature);
        var contentToVerify = encodedHeader + '.' + encodedPayload;
        contentToVerify = new Bytes(contentToVerify);
        var isValid = apiSig.verifyBytesSignature(jwtSignatureInBytes, contentToVerify, new Bytes(RSApublickey), JWTAlgoToSFCCMapping[alg]);
        if (isValid) {
            decodedJwt = parsedPayload;
        }
    }
    return decodedJwt;
}


function getPublicKey(kid) {
    var cybersourceRestApi = require('../../apiClient/index');
    var instance = new cybersourceRestApi.AsymmetricKeyManagementApi(configObject);
    var jwk = '';
    instance.getP12KeyDetails(kid, function (data, error, response) {
        jwk = data;
    })
    return jwk;
}

/**
 * @param {*} customerId *
 * @param {*} paymentInstrumentTokenId *
 * @param {*} expiryMonth *
 * @param {*} expiryYear *
 * @param {*} billingAddress *
 * @param {*} customerEmail *
 * @param {*} instrumentIdentifierId *
 * @returns {*} *
 */
function updateCustomerPaymentInstrument(customerId, paymentInstrumentTokenId, expiryMonth, expiryYear, billingAddress, customerEmail, instrumentIdentifierId) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var padNumber = require('../util/pad');
    var instance = new cybersourceRestApi.CustomerPaymentInstrumentApi(configObject);

    var card = new cybersourceRestApi.Tmsv2customersEmbeddedDefaultPaymentInstrumentCard();
    card.expirationMonth = padNumber(expiryMonth, 2, '0');
    card.expirationYear = expiryYear.toString();

    var billTo = new cybersourceRestApi.Tmsv2customersEmbeddedDefaultPaymentInstrumentBillTo();
    billTo.firstName = billingAddress.firstName;
    billTo.lastName = billingAddress.lastName;
    billTo.address1 = billingAddress.address1;
    billTo.locality = billingAddress.locality;
    billTo.administrativeArea = billingAddress.administrativeArea;
    billTo.postalCode = billingAddress.postalCode;
    billTo.country = billingAddress.country;
    billTo.email = customerEmail;
    billTo.phoneNumber = billingAddress.phoneNumber;

    var instrumentIdentifer = new cybersourceRestApi.Tmsv2customersEmbeddedDefaultPaymentInstrumentInstrumentIdentifier();
    instrumentIdentifer.id = instrumentIdentifierId;

    var request = new cybersourceRestApi.PatchCustomerPaymentInstrumentRequest();
    request.card = card;
    request.billTo = billTo;
    request.instrumentIdentifier = instrumentIdentifer;

    var response = '';
    instance.patchCustomersPaymentInstrument(customerId, paymentInstrumentTokenId, request, configObject.profileId, function (data, error, responseData) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (responseData.status === 'OK') {
                response = data;
                return data;
            }
            throw new errors.CARD_NOT_AUTHORIZED_ERROR(JSON.stringify(data)); // eslint-disable-line no-undef
        } else {
            throw new Error(data);
        }
    });
    return response;
}

function getPaymentDetails(transientToken) {
    var configObject = require('../../configuration/index');
    var cybersourceRestApi = require('../../apiClient/index');
    var errors = require('~/cartridge/scripts/util/errors');
    var instance = new cybersourceRestApi.TransientTokenDataApi(configObject);
    var result = '';
    instance.getTransactionForTransientToken(transientToken, function (data, error) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
            return data;
        } else {
            throw new Error(new errors.API_CLIENT_ERROR(JSON.stringify(data)));
        }
    });
    return result;
}

/**
 * Format phone number for Visa Acceptance - removes +1 prefix if present
 * @param {string} phoneNumber - Raw phone number (may include +1, spaces, dashes, etc.)
 * @returns {string} Formatted phone number (digits only, +1 removed if present)
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';

    var cleaned = phoneNumber.toString().trim();

    // Check if number starts with +1 and remove it
    if (cleaned.indexOf('+1') === 0) {
        cleaned = cleaned.substring(2); // Remove +1 prefix
    }

    // Remove all remaining non-digit characters (spaces, dashes, parentheses, etc.)
    cleaned = cleaned.replace(/\D/g, '');

    return cleaned;
}

/**
 * Decode and validate completeMandate JWT response from UC v1.x SDK
 * This JWT is returned after checkout.complete(token) when authorization was performed by the SDK
 * Uses the same signature validation approach as jwtDecode for v0.x
 * 
 * @param {string} jwt - The JWT string returned from checkout.complete()
 * @returns {Object|null} - Decoded payload with authorization details, or null if validation fails
 * 
 * Expected JWT payload structure:
 * {
 *   "id": "transaction_id",
 *   "status": "AUTHORIZED",
 *   "outcome": "AUTHORIZED",
 *   "message": "Request processed successfully.",
 *   "details": {
 *     "clientReferenceInformation": { "code": "basket_id" },
 *     "orderInformation": { "amountDetails": { "authorizedAmount": "20.99", "currency": "USD" } },
 *     "processorInformation": { "approvalCode": "888888", "responseCode": "100", "transactionId": "..." },
 *     "paymentInformation": { "card": { "type": "001" }, "tokenizedCard": {...} },
 *     "processingInformation": { "paymentSolution": "012" },
 *     "reconciliationId": "...",
 *     "submitTimeUtc": "2026-04-13T06:15:21Z"
 *   },
 *   "metadata": { "ccJti": "...", "ttJti": "..." }
 * }
 */
function decodeCompleteMandateJwt(jwt) {
    var Logger = require('dw/system/Logger');
    var logger = Logger.getLogger('VisaAcceptance', 'CompleteMandateJWT');

    if (!jwt || typeof jwt !== 'string') {
        logger.error('decodeCompleteMandateJwt: Invalid JWT input - null or not a string');
        return null;
    }

    var Encoding = require('dw/crypto/Encoding');
    var Signature = require('dw/crypto/Signature');
    var Bytes = require('dw/util/Bytes');

    var apiSig = new Signature();

    // Split JWT into parts
    var jwtParts = jwt.split('.');
    if (jwtParts.length !== 3) {
        logger.error('decodeCompleteMandateJwt: Invalid JWT format - expected 3 parts, got {0}', jwtParts.length);
        return null;
    }

    var encodedHeader = jwtParts[0];
    var encodedPayload = jwtParts[1];
    var jwtSignature = jwtParts[2];

    try {
        // Decode header to get kid and algorithm
        var decodedHeader = JSON.parse(Encoding.fromBase64(encodedHeader).toString());
        var kid = decodedHeader.kid;
        var alg = decodedHeader.alg;

        if (!kid || !alg) {
            logger.error('decodeCompleteMandateJwt: Missing kid or alg in JWT header');
            return null;
        }

        // Decode payload
        var decodedPayload = Encoding.fromBase64(encodedPayload).toString();
        var parsedPayload = JSON.parse(decodedPayload);

        // Get public key using the kid from JWT header
        var pKid = getPublicKey(kid);

        if (!pKid || empty(pKid.n) || empty(pKid.e)) {
            logger.error('decodeCompleteMandateJwt: Failed to retrieve public key for kid: {0}', kid);
            return null;
        }

        // Create RSA public key using modulus and exponent
        var pkey = require('../http/publicKey');
        var RSApublickey = pkey.getRSAPublicKey(pKid.n, pKid.e);

        // Map JWT algorithms to SFCC crypto algorithms
        var JWTAlgoToSFCCMapping = {
            RS256: 'SHA256withRSA',
            RS512: 'SHA512withRSA',
            RS384: 'SHA384withRSA'
        };

        if (!JWTAlgoToSFCCMapping[alg]) {
            logger.error('decodeCompleteMandateJwt: Unsupported algorithm: {0}', alg);
            return null;
        }

        // Verify signature
        var jwtSignatureInBytes = Encoding.fromBase64(jwtSignature);
        var contentToVerify = encodedHeader + '.' + encodedPayload;
        contentToVerify = new Bytes(contentToVerify);

        var isValid = apiSig.verifyBytesSignature(
            jwtSignatureInBytes,
            contentToVerify,
            new Bytes(RSApublickey),
            JWTAlgoToSFCCMapping[alg]
        );

        if (isValid) {
            return parsedPayload;
        } else {
            logger.error('decodeCompleteMandateJwt: JWT signature validation failed');
            return null;
        }
    } catch (e) {
        logger.error('decodeCompleteMandateJwt: Error decoding/validating JWT: {0}', e.message || e);
        return null;
    }
}

module.exports = {
    httpAuthorizeWithToken: httpAuthorizeWithToken,
    httpAuthorizeWithTransientToken: httpAuthorizeWithTransientToken,
    httpZeroDollarAuth: httpZeroDollarAuth,
    httpZeroDollarAuthWithTransientToken: httpZeroDollarAuthWithTransientToken,
    updateCustomerPaymentInstrument: updateCustomerPaymentInstrument,
    jwtDecode: jwtDecode,
    decodeCompleteMandateJwt: decodeCompleteMandateJwt,
    generateUcCaptureContext: generateUcCaptureContext,
    generateUcCaptureContextSaveCard: generateUcCaptureContextSaveCard,
    getPaymentDetails: getPaymentDetails
};
