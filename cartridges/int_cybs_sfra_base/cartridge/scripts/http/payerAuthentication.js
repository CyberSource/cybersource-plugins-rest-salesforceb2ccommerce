'use strict';

var configObject = require('../../configuration/index');
var URLUtils = require('dw/web/URLUtils');
var cybersourceRestApi = require('../../apiClient/index');
var mapper = require('~/cartridge/scripts/util/mapper.js');
var Logger = require('dw/system/Logger');

/**
 * *
 * @param {*} result *
 */
function setPaymentProcessorDetails(result, paymentInstrument) {
    var OrderMgr = require('dw/order/OrderMgr');
    var PaymentManager = require('dw/order/PaymentMgr');
    var Transaction = require('dw/system/Transaction');
    var error;
    var paymentProcessor = PaymentManager.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor();

    try {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);

            // Set payment details if masked card number exists
            if (!empty(paymentInstrument.maskedCreditCardNumber) && paymentInstrument.maskedCreditCardNumber !== 'undefined') {
                var paymentDetails = paymentInstrument.maskedCreditCardNumber + ', ' + paymentInstrument.creditCardType;
                // Only append expiration if both month and year are present
                if (!empty(paymentInstrument.creditCardExpirationMonth) && !empty(paymentInstrument.creditCardExpirationYear)) {
                    paymentDetails += ', ' + paymentInstrument.creditCardExpirationMonth + '/' + paymentInstrument.creditCardExpirationYear;
                }
                paymentInstrument.paymentTransaction.custom.paymentDetails = paymentDetails;
            }

        });
    } catch (e) {
        error = true; // eslint-disable-line no-unused-vars
    }
}



/**
 * *
 * @param {*} billingDetails *
 * @param {*} referenceInformationCode *
 * @param {*} cardData *
 * @returns {*} *
 */
function paSetup(billingDetails, referenceInformationCode, cardData, order, paymentInstrument) {
    var instance = new cybersourceRestApi.PayerAuthenticationApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';

    var total = order.totalGrossPrice.value;
    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    if (typeof total !== 'undefined') {
        amountDetails.totalAmount = total.toString();
    } else {
        throw new Error();
    }
    amountDetails.currency = order.currencyCode;

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = order.getCustomerEmail();
    billTo.country = order.billingAddress.countryCode.toString().toUpperCase();
    billTo.firstName = order.billingAddress.firstName;
    billTo.lastName = order.billingAddress.lastName;
    billTo.phoneNumber = order.billingAddress.phone;
    billTo.address1 = order.billingAddress.address1;
    billTo.address2 = order.billingAddress.address2;
    billTo.postalCode = order.billingAddress.postalCode;
    billTo.administrativeArea = order.billingAddress.stateCode;
    billTo.locality = order.billingAddress.city;

    var shippingAddress = order.shipments[0].shippingAddress;
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);

    var shipTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationShipTo();
    shipTo.email = order.getCustomerEmail();
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
    orderInformation.billTo = billTo;
    orderInformation.shipTo = shipTo;
    orderInformation.lineItems = lineItems;

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var request = new cybersourceRestApi.CreatePaymentRequest();

    var tokenInformation;
    var card;
    if (cardData.token != null) {
        var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        tokenInformation = mapper.deserializeTokenInformation(cardData.token);
        customer.customerId = tokenInformation.paymentInstrument.id;
        paymentInformation.customer = customer;
        card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
    } else if (cardData.ucJwtToken) { // UC ON
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.ucJwtToken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.jwttoken != null) {
        tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.googlePayFluidData != null) {
        processingInformation.paymentSolution = '012';  //googlepay
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.googlePayFluidData;
        paymentInformation.fluidData = fluidData;
    } else {
        card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        card.expirationMonth = billingDetails.creditCardFields.expirationMonth.value;
        card.expirationYear = billingDetails.creditCardFields.expirationYear.value;
        card.number = billingDetails.creditCardFields.cardNumber.value;
        card.securityCode = billingDetails.creditCardFields.securityCode.value;
        card.type = billingDetails.creditCardFields.cardType.value;
        paymentInformation.card = card;
    }
    if (!paymentInformation.card) {
        paymentInformation.card = {};
    }
    paymentInformation.card.typeSelectionIndicator = '1';


    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.paymentInformation = paymentInformation;
    request.orderInformation = orderInformation;


    var result = '';
    instance.payerAuthSetup(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
        } else {
            throw new Error(data);
        }
    });
    setPaymentProcessorDetails(result, paymentInstrument);
    return result;
}

/**
 * *
 * @param {*} billingDetails *
 * @param {*} shippingAddress *
 * @param {*} referenceInformationCode *
 * @param {*} total *
 * @param {*} currency *
 * @param {*} referenceId *
 * @param {*} cardData *
 * @param {*} lineItems *
 * @returns {*} *
 */
function paEnroll(billingDetails, shippingAddress, referenceInformationCode, total, currency, referenceId, cardData, lineItems, order, isScaFlow, payerauthArgs, paymentInstrument) {
    var tokenHelper = require('~/cartridge/scripts/helpers/tokenHelper.js');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';
    processingInformation.actionList = [];
    processingInformation.actionList.push('CONSUMER_AUTHENTICATION');

    //Capture service call if Payer Authentication is enabled
    if (cardData.ucJwtToken) {
        if (configObject.cardTransactionType.value === 'sale') {
            processingInformation.capture = true;
        }
    }
    else {
        if (paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_GooglePayTransactionType').value === 'sale') {
                processingInformation.capture = true;
            }
        }
        if (paymentInstrument.paymentMethod === 'CREDIT_CARD') {
            if (configObject.cardTransactionType.value === 'sale') {
                processingInformation.capture = true;
            }
        }
    }

    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }
    var scaTokenFlag = false;
    var server = require('server');
    var paymentForm = server.forms.getForm('billing');
    if (paymentForm && paymentForm.creditCardFields && paymentForm.creditCardFields.saveCard && paymentForm.creditCardFields.saveCard.checked && (empty(cardData.token)) && (paymentInstrument.paymentMethod === 'CREDIT_CARD')) {
        processingInformation.actionList.push('TOKEN_CREATE');
        if (configObject.isSCAEnabled) {
            scaTokenFlag = true;
        }
        //@ts-ignore
        if (session.getCustomer().getProfile().custom.customerID != null) {
            processingInformation.actionTokenTypes = [
                'paymentInstrument',
                'instrumentIdentifier'
            ];
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
    if (typeof total !== 'undefined') {
        amountDetails.totalAmount = total.toString();
    } else {
        throw new Error();
    }
    amountDetails.currency = currency;

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = order.getCustomerEmail();
    billTo.country = order.billingAddress.countryCode.toString().toUpperCase();
    billTo.firstName = order.billingAddress.firstName;
    billTo.lastName = order.billingAddress.lastName;
    billTo.phoneNumber = order.billingAddress.phone;
    billTo.address1 = order.billingAddress.address1;
    billTo.address2 = order.billingAddress.address2;
    billTo.postalCode = order.billingAddress.postalCode;
    billTo.administrativeArea = order.billingAddress.stateCode;
    billTo.locality = order.billingAddress.city;

    var shipTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationShipTo();
    shipTo.email = order.getCustomerEmail();
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
    orderInformation.billTo = billTo;
    orderInformation.shipTo = shipTo;
    orderInformation.lineItems = lineItems;

    var consumerAuthenticationInformation = new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();
    var threeDSMode = get3DSMode();
    var cardType = getCardType(paymentInstrument);

    if (isScaFlow === true || scaTokenFlag === true) {
        consumerAuthenticationInformation.challengeCode = '04';
    }

    if (('DATA_ONLY_YES' === threeDSMode.value || 'DATA_ONLY_NO' === threeDSMode.value) && ('VISA' === cardType || 'MASTERCARD' === cardType || 'MAESTRO' === cardType)) {
        consumerAuthenticationInformation.challengeCode = '06';
    }

    consumerAuthenticationInformation.referenceId = referenceId;
    consumerAuthenticationInformation.returnUrl = URLUtils.https('PayerAuthentication-PayerAuthValidation').toString();

    // Set deviceChannel from browser fields if available, otherwise default to 'Browser'
    if (payerauthArgs && payerauthArgs.parsedBrowserfields && payerauthArgs.parsedBrowserfields.deviceChannel) {
        consumerAuthenticationInformation.deviceChannel = payerauthArgs.parsedBrowserfields.deviceChannel;
    }

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var request = new cybersourceRestApi.CreatePaymentRequest();



    var SecureRandom = require('dw/crypto/SecureRandom');
    SecureRandom = new SecureRandom();

    // eslint-disable-next-line no-undef
    if (!session.privacy.key || !session.privacy.iv) {
        var key = SecureRandom.nextBytes(32);
        var iv = SecureRandom.nextBytes(16);
        // eslint-disable-next-line no-undef
        key = dw.crypto.Encoding.toBase64(key);
        // eslint-disable-next-line no-undef
        iv = dw.crypto.Encoding.toBase64(iv);
        // eslint-disable-next-line no-undef
        session.privacy.key = key;
        // eslint-disable-next-line no-undef
        session.privacy.iv = iv;
    }

    var deviceInformation = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();

    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        deviceInformation.fingerprintSessionId = session.privacy.dfID;
    }
    // Populate device information from browser fields collected on client side
    if (payerauthArgs && payerauthArgs.parsedBrowserfields) {
        var browserData = payerauthArgs.parsedBrowserfields;
        deviceInformation.httpBrowserColorDepth = browserData.httpBrowserColorDepth ? browserData.httpBrowserColorDepth.toString() : undefined;
        deviceInformation.httpBrowserJavaEnabled = browserData.httpBrowserJavaEnabled;
        deviceInformation.httpBrowserJavaScriptEnabled = browserData.httpBrowserJavaScriptEnabled;
        deviceInformation.httpBrowserLanguage = browserData.httpBrowserLanguage;
        deviceInformation.httpBrowserScreenHeight = browserData.httpBrowserScreenHeight ? browserData.httpBrowserScreenHeight.toString() : undefined;
        deviceInformation.httpBrowserScreenWidth = browserData.httpBrowserScreenWidth ? browserData.httpBrowserScreenWidth.toString() : undefined;
        deviceInformation.httpBrowserTimeDifference = browserData.httpBrowserTimeDifference ? browserData.httpBrowserTimeDifference.toString() : undefined;
        deviceInformation.userAgentBrowserValue = browserData.httpUserAgent;
        deviceInformation.httpAcceptContent = browserData.httpAcceptContent;
        deviceInformation.ipAddress = browserData.ipAddress;
    }

    request.deviceInformation = deviceInformation;

    var tokenInformation;
    var card;
    if (cardData.token != null) {
        var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        tokenInformation = mapper.deserializeTokenInformation(cardData.token);
        customer.customerId = tokenInformation.paymentInstrument.id;
        paymentInformation.customer = customer;
        card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
    } else if (cardData.ucJwtToken) { // UC ON
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.ucJwtToken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.jwttoken != null) {
        tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.googlePayFluidData != null) {
        processingInformation.paymentSolution = '012';  //googlepay
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.googlePayFluidData;
        paymentInformation.fluidData = fluidData;
    } else {
        card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        card.expirationMonth = billingDetails.creditCardFields.expirationMonth.value;
        card.expirationYear = billingDetails.creditCardFields.expirationYear.value;
        card.number = billingDetails.creditCardFields.cardNumber.value;
        card.securityCode = billingDetails.creditCardFields.securityCode.value;
        paymentInformation.card = card;
    }
    if (!paymentInformation.card) {
        paymentInformation.card = {};
    }

    if (session.getCustomer().isAuthenticated() && session.getCustomer().getProfile().custom.customerID) {
        var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        customer.id = session.getCustomer().getProfile().custom.customerID;
        paymentInformation.customer = customer;
    }

    paymentInformation.card.typeSelectionIndicator = '1';
    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;
    request.paymentInformation = paymentInformation;
    request.consumerAuthenticationInformation = consumerAuthenticationInformation;

    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
        } else {
            throw new Error(data);
        }
    });
    if (scaTokenFlag === true) { // This flag indicates that the SCA condition for tokenized card flow, so we don't have to retrigger the transaction again.
        result.scaConditionMetForTokenFlow = true;
    }
    if (result.riskInformation != null) {
        if (result.riskInformation.profile.action === 'PAYERAUTH_INVOKE' || result.riskInformation.profile.action === 'PAYERAUTH_EXTERNAL') {
            session.privacy.requestId = result.id;
        }
    }
    if (paymentForm && paymentForm.creditCardFields && paymentForm.creditCardFields.saveCard && paymentForm.creditCardFields.saveCard.checked && (empty(cardData.token)) && (paymentInstrument.paymentMethod === 'CREDIT_CARD')) {
        if (result.tokenInformation) {
            tokenHelper.TokenizeCard(result);
        }
        else {
            Logger.error('Tokenization failed during Payer Authentication enrollment. Order ID: {0}', order.orderNo);
        }
    }
    setPaymentProcessorDetails(result, paymentInstrument);
    return result;
}
/**
 * *
 * @param {*} billingDetails *
 * @param {*} referenceInformationCode *
 * @param {*} total *
 * @param {*} currency *
 * @param {*} transactionId *
 * @param {*} cardData *
 * @param {*} lineItems *
 * @returns {*} *
 */
function paConsumerAuthenticate(billingDetails, referenceInformationCode, total, currency, transactionId, cardData, lineItems, order, paymentInstrument) {
    var tokenHelper = require('~/cartridge/scripts/helpers/tokenHelper.js');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;
    clientReferenceInformation.pausedRequestId = session.privacy.requestId;
    session.privacy.requestId = '';

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';
    processingInformation.actionList = [];
    processingInformation.actionList.push('VALIDATE_CONSUMER_AUTHENTICATION');
    var server = require('server');
    var paymentForm = server.forms.getForm('billing');
    if (paymentForm && paymentForm.creditCardFields && paymentForm.creditCardFields.saveCard && paymentForm.creditCardFields.saveCard.checked && (empty(cardData.token)) && (paymentInstrument.paymentMethod === 'CREDIT_CARD')) {
        processingInformation.actionList.push('TOKEN_CREATE');
        if (session.getCustomer().getProfile().custom.customerID != null) {
            processingInformation.actionTokenTypes = [
                'paymentInstrument',
                'instrumentIdentifier'
            ];
        } else {
            processingInformation.actionTokenTypes = [
                'customer',
                'shippingAddress',
                'paymentInstrument',
                'instrumentIdentifier'
            ];
        }
    }

    //Capture service call if Payer Authentication is enabled
    if (cardData.ucJwtToken) {
        if (configObject.cardTransactionType.value === 'sale') {
            processingInformation.capture = true;
        }
    }
    else {
        if (paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_GooglePayTransactionType').value === 'sale') {
                processingInformation.capture = true;
            }
        }
        if (paymentInstrument.paymentMethod === 'CREDIT_CARD') {
            if (configObject.cardTransactionType.value === 'sale') {
                processingInformation.capture = true;
            }
        }
    }

    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency;

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email = order.getCustomerEmail();
    billTo.country = order.billingAddress.countryCode.toString().toUpperCase();
    billTo.firstName = order.billingAddress.firstName;
    billTo.lastName = order.billingAddress.lastName;
    billTo.phoneNumber = order.billingAddress.phone;
    billTo.address1 = order.billingAddress.address1;
    billTo.address2 = order.billingAddress.address2;
    billTo.postalCode = order.billingAddress.postalCode;
    billTo.administrativeArea = order.billingAddress.stateCode;
    billTo.locality = order.billingAddress.city;

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.billTo = billTo;
    orderInformation.lineItems = lineItems;
    var consumerAuthenticationInformation = new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();
    consumerAuthenticationInformation.authenticationTransactionId = transactionId;

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var request = new cybersourceRestApi.CreatePaymentRequest();

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;

    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        request.deviceInformation = deviceSessionId;
    }

    if (cardData.token != null) {
        /* eslint-disable block-scoped-var */
        var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        var tokenInformation = mapper.deserializeTokenInformation(cardData.token);
        customer.customerId = tokenInformation.paymentInstrument.id;
        paymentInformation.customer = customer;
        var card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
    } else if (cardData.ucJwtToken) { // UC ON
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.ucJwtToken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.jwttoken != null) {
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.googlePayFluidData != null) {
        processingInformation.paymentSolution = '012';  //googlepay
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.googlePayFluidData;
        paymentInformation.fluidData = fluidData;
    } else {
        var card = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard(); // eslint-disable-line no-redeclare
        card.expirationMonth = billingDetails.creditCardFields.expirationMonth.value;
        card.expirationYear = billingDetails.creditCardFields.expirationYear.value;
        card.number = billingDetails.creditCardFields.cardNumber.value;
        card.securityCode = billingDetails.creditCardFields.securityCode.value;
        paymentInformation.card = card;
    }

    if (session.getCustomer().isAuthenticated() && session.getCustomer().getProfile().custom.customerID) {
        var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();
        customer.id = session.getCustomer().getProfile().custom.customerID;
        paymentInformation.customer = customer;
    }
    request.clientReferenceInformation = clientReferenceInformation;
    request.processingInformation = processingInformation;
    request.orderInformation = orderInformation;
    request.paymentInformation = paymentInformation;

    request.consumerAuthenticationInformation = consumerAuthenticationInformation;

    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
        } else {
            try {
                var parsedData = JSON.parse(data);
                var reasonCodeObject = parsedData;
                if (parsedData.errorInformation != null) {
                    reasonCodeObject = parsedData.errorInformation.details.filter(function (e) { return e.field === 'reasonCode'; }).pop();
                }
                result = {
                    status: reasonCodeObject.reason
                };
            } catch (e) {
                throw new Error(data);
            }
        }
    });
    setPaymentProcessorDetails(result, paymentInstrument);
    if (paymentForm && paymentForm.creditCardFields && paymentForm.creditCardFields.saveCard && paymentForm.creditCardFields.saveCard.checked && (empty(cardData.token)) && (paymentInstrument.paymentMethod === 'CREDIT_CARD')) {
        if (result.tokenInformation) {
            tokenHelper.TokenizeCard(result);
        }
        else {
            Logger.error('Tokenization failed during Payer Authentication Validation. Order ID: {0}', order.orderNo);
        }
    }
    return result;
}

/**
 * Get the 3DS Mode configuration from Business Manager
 * @returns {string} - Returns the configured 3DS mode: 'Yes', 'No', 'DataOnlyYes', or 'DataOnlyNo'
 */
function get3DSMode() {
    var Site = require('dw/system/Site');
    var currentSite = Site.getCurrent();
    var threeDSMode = currentSite.getCustomPreferenceValue('Cybersource_PayerAuthEnabled');
    return threeDSMode;
}

/**
 * Get card type from payment instrument or billing details
 * @param {Object} paymentInstrument - The payment instrument containing creditCardType
 * @returns {string} - Returns the card type in uppercase without spaces (e.g., 'VISA', 'MASTERCARD', 'MAESTRO', 'AMEX', etc.)
 */
function getCardType(paymentInstrument) {
    var cardType = '';

    try {
        if (paymentInstrument.creditCardType !== null && typeof paymentInstrument.creditCardType !== 'undefined') {
            // Remove spaces and convert to uppercase
            cardType = paymentInstrument.creditCardType.replace(/\s+/g, '').toUpperCase();
            return cardType;
        }
    } catch (e) {
        var Logger = require('dw/system/Logger');
        Logger.error('Error getting card type: {0}', e.message);
        cardType = '';
    }
    return cardType;
}


if (configObject.cartridgeEnabled) {
    module.exports = {
        paSetup: paSetup,
        paEnroll: paEnroll,
        paConsumerAuthenticate: paConsumerAuthenticate,
        get3DSMode: get3DSMode,
        getCardType: getCardType
    };
}
