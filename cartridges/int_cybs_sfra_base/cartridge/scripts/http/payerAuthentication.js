'use strict';

var Cipher = require('dw/crypto/Cipher');
var configObject = require('../../configuration/index');

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
    if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_CreditCardTransactionType').value === 'sale' ) {
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
    billTo.country = billingDetails.addressFields.country.htmlValue;
    billTo.firstName = billingDetails.addressFields.firstName.htmlValue;
    billTo.lastName = billingDetails.addressFields.lastName.htmlValue;
    billTo.phoneNumber = billingDetails.contactInfoFields.phone.htmlValue;
    billTo.address1 = billingDetails.addressFields.address1.htmlValue;
    billTo.postalCode = billingDetails.addressFields.postalCode.htmlValue;
    billTo.administrativeArea = billingDetails.addressFields.states && billingDetails.addressFields.states.stateCode.htmlValue;
    billTo.locality = billingDetails.addressFields.city.htmlValue;

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

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var request = new cybersourceRestApi.CreatePaymentRequest();

    Cipher = new Cipher();
    // eslint-disable-next-line no-undef
    var encryptedSessionID = Cipher.encrypt(session.sessionID, session.privacy.key, 'AES/CBC/PKCS5Padding', session.privacy.iv, 0);

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = encryptedSessionID;

    if (configObject.deviceFingerprintEnabled) {
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

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = 'internet';
    processingInformation.actionList = [];
    processingInformation.actionList.push('VALIDATE_CONSUMER_AUTHENTICATION');

    //Capture service call if Payer Authentication is enabled
    if (configObject.enableCapture === true) {
        processingInformation.capture = true;
    }

    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }

    var amountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
    amountDetails.totalAmount = total.toString();
    amountDetails.currency = currency;

    var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
    billTo.email =  order.getCustomerEmail();
    billTo.country = billingDetails.addressFields.country.htmlValue;
    billTo.firstName = billingDetails.addressFields.firstName.htmlValue;
    billTo.lastName = billingDetails.addressFields.lastName.htmlValue;
    billTo.phoneNumber = billingDetails.contactInfoFields.phone.htmlValue;
    billTo.address1 = billingDetails.addressFields.address1.htmlValue;
    billTo.postalCode = billingDetails.addressFields.postalCode.htmlValue;
    billTo.administrativeArea = billingDetails.addressFields.states
        && billingDetails.addressFields.states.stateCode.htmlValue;
    billTo.locality = billingDetails.addressFields.city.htmlValue;

    var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
    orderInformation.amountDetails = amountDetails;
    orderInformation.billTo = billTo;
    orderInformation.lineItems = lineItems;
    var consumerAuthenticationInformation = new cybersourceRestApi.Ptsv2paymentsConsumerAuthenticationInformation();
    consumerAuthenticationInformation.authenticationTransactionId = transactionId;

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
    var request = new cybersourceRestApi.CreatePaymentRequest();
    if (session.custom.SCA === true) {
        Cipher = new Cipher();
        // eslint-disable-next-line no-undef
        var encryptedSessionID = Cipher.encrypt(session.sessionID, session.privacy.key, 'AES/CBC/PKCS5Padding', session.privacy.iv, 0);
        var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
        deviceSessionId.fingerprintSessionId = encryptedSessionID;

        if (configObject.deviceFingerprintEnabled) {
            request.deviceInformation = deviceSessionId;
        }
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
    if (session.custom.SCA === false) {
        request.consumerAuthenticationInformation.challendeCode = '04';
    }
    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            result = data;
        } else {
            try {
                var parsedData = JSON.parse(data);
                var reasonCodeObject = parsedData.errorInformation.details.filter(function (e) { return e.field === 'reasonCode'; }).pop();
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
        paEnroll: paEnroll,
        paConsumerAuthenticate: paConsumerAuthenticate
    };
}
