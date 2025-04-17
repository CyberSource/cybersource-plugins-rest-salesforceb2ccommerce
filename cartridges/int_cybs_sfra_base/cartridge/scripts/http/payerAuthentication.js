'use strict';

var Cipher = require('dw/crypto/Cipher');
var configObject = require('../../configuration/index');
var URLUtils = require('dw/web/URLUtils');
var cybersourceRestApi = require('../../apiClient/index');
var mapper = require('~/cartridge/scripts/util/mapper.js');

/**
 * *
 * @param {*} result *
 */
function setPaymentProcessorDetails(result) {
    var OrderMgr = require('dw/order/OrderMgr');
    var PaymentManager = require('dw/order/PaymentMgr');
    var Transaction = require('dw/system/Transaction');
    // eslint-disable-next-line no-undef
    var orderNo = session.privacy.orderID;
    var order = OrderMgr.getOrder(orderNo);
    var paymentInstruments = order.paymentInstruments;
    var paymentInstrument = paymentInstruments[0];
    var error;
    var paymentProcessor = PaymentManager.getPaymentMethod(paymentInstrument.paymentMethod).getPaymentProcessor();

    try {
        Transaction.wrap(function () {
            paymentInstrument.paymentTransaction.setTransactionID(result.id);
            paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
            paymentInstrument.paymentTransaction.custom.requestId = result.id;
            paymentInstrument.paymentTransaction.custom.reconciliationId = result.reconciliationId;
            paymentInstrument.paymentTransaction.custom.paymentDetails = paymentInstrument.creditCardHolder + ', ' + paymentInstrument.maskedCreditCardNumber
                + ', ' + paymentInstrument.creditCardType + ', ' + paymentInstrument.creditCardExpirationMonth + '/' + paymentInstrument.creditCardExpirationYear;
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
function paSetup(billingDetails, referenceInformationCode, cardData) {
    var instance = new cybersourceRestApi.PayerAuthenticationApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';

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
    } else if (cardData.jwttoken != null) {
        tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.fluidData != null) {
        processingInformation.commerceIndicator = 'internet';
        processingInformation.visaCheckoutId = cardData.callId;
        processingInformation.paymentSolution = 'visacheckout';
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.fluidData;
        fluidData.key = configObject.visaSRCKey;
        paymentInformation.fluidData = fluidData;
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


    var result = '';
    instance.payerAuthSetup(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
        } else {
            throw new Error(data);
        }
    });
    setPaymentProcessorDetails(result);
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
function paEnroll(billingDetails, shippingAddress, referenceInformationCode, total, currency, referenceId, cardData, lineItems, order) {
    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';
    processingInformation.actionList = [];
    processingInformation.actionList.push('CONSUMER_AUTHENTICATION');

    //Capture service call if Payer Authentication is enabled
    if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_CardTransactionType').value === 'sale') {
        processingInformation.capture = true;
    }

    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
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
    consumerAuthenticationInformation.referenceId = referenceId;
    consumerAuthenticationInformation.returnUrl = URLUtils.https('CheckoutServices-handlingConsumerAuthResponse').toString();

    if (session.custom.Flag3ds === true || session.custom.scaTokenFlag === true) {   
        session.custom.Flag3ds = true;
        consumerAuthenticationInformation.challengeCode = '04';
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

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;

    if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
        request.deviceInformation = deviceSessionId;
    }

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
    } else if (cardData.jwttoken != null) {
        tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation();
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.fluidData != null) {
        processingInformation.commerceIndicator = 'internet';
        processingInformation.visaCheckoutId = cardData.callId;
        processingInformation.paymentSolution = 'visacheckout';
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.fluidData;
        fluidData.key = configObject.visaSRCKey;
        paymentInformation.fluidData = fluidData;
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
    if (result.riskInformation != null) {
        if (result.riskInformation.profile.action === 'PAYERAUTH_INVOKE' || result.riskInformation.profile.action === 'PAYERAUTH_EXTERNAL') {
            session.privacy.requestId = result.id;
        }
    }
    setPaymentProcessorDetails(result);
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
function paConsumerAuthenticate(billingDetails, referenceInformationCode, total, currency, transactionId, cardData, lineItems, order) {
    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;
    clientReferenceInformation.pausedRequestId = session.privacy.requestId;
    session.privacy.requestId = '';

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';
    processingInformation.actionList = [];
    processingInformation.actionList.push('VALIDATE_CONSUMER_AUTHENTICATION');

    //Capture service call if Payer Authentication is enabled
    if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_CardTransactionType').value === 'sale') {
        processingInformation.capture = true;
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
    } else if (cardData.jwttoken != null) {
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.fluidData != null) {
        processingInformation.commerceIndicator = 'internet';
        processingInformation.visaCheckoutId = cardData.callId;
        processingInformation.paymentSolution = 'visacheckout';
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.fluidData;
        fluidData.key = configObject.visaSRCKey;
        paymentInformation.fluidData = fluidData;
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
                if(parsedData.errorInformation != null){
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
    setPaymentProcessorDetails(result);
    return result;
}

if (configObject.cartridgeEnabled) {
    module.exports = {
        paSetup: paSetup,
        paEnroll: paEnroll,
        paConsumerAuthenticate: paConsumerAuthenticate
    };
}
