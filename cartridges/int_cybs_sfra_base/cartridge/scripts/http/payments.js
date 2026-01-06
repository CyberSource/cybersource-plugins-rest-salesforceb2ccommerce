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
function httpAuthorizeWithToken(cardData, customerEmail, referenceInformationCode, total, currency, billingAddress, shippingAddress, lineItems) {
    /* eslint-disable block-scoped-var */
    /* eslint-disable no-undef */
    var configObject = require('../../configuration/index');
    var padNumber = require('../util/pad');
    var cybersourceRestApi = require('../../apiClient/index');
    var errors = require('~/cartridge/scripts/util/errors.js');
    var mapper = require('~/cartridge/scripts/util/mapper.js');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;
    // eslint-disable-next-line no-undef
    deviceSessionId.ipAddress = session.privacy.ipAddress;

    var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
    processingInformation.commerceIndicator = configObject.CommerceIndicator.value;
    processingInformation.actionList = [];
    if (!configObject.fmeDmEnabled) {
        processingInformation.actionList.push('DECISION_SKIP');
    }
    if (cardData.gPayToken) {
        processingInformation.paymentSolution = '012';
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

    var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();

    var customer = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCustomer();

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
        if (order.paymentInstruments[0].paymentMethod === 'DW_GOOGLE_PAY') {
            if (dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_GooglePayTransactionType').value === 'sale') {
                request.processingInformation.capture = true;
            }
        }
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
    } else if (cardData.jwttoken) { // subscription OFF and Flex ON
        var tokenInformation = new cybersourceRestApi.Ptsv2paymentsTokenInformation(); // eslint-disable-line no-redeclare
        tokenInformation.transientTokenJwt = cardData.jwttoken;
        request.tokenInformation = tokenInformation;
    } else if (cardData.gPayToken) {
        var fluidData = new cybersourceRestApi.Ptsv2paymentsPaymentInformationFluidData();
        fluidData.value = cardData.gPayToken;
        paymentInformation.fluidData = fluidData;
        request.paymentInformation = paymentInformation;
    } else { // subscription OFF and Flex OFF
        var card = {}; // eslint-disable-line no-redeclare
        card.expirationMonth = padNumber(cardData.expirationMonth, 2, '0');
        card.expirationYear = cardData.expirationYear.toString();
        card.number = cardData.creditcardnumber;
        card.securityCode = cardData.securityCode;
        paymentInformation.card = card;
        request.paymentInformation = paymentInformation;
    }
    session.privacy.ipAddress = '';
    var result = '';
    instance.createPayment(request, function (data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
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
    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;


    var scaEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_IsSCAEnabled');

    if (scaEnabled === true) {
        session.custom.scaTokenFlag = true;
    }

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
            if (configObject.networkTokenizationEnabled && data.processorInformation.paymentAccountReferenceNumber) {
                var networkTokenSubscription = require('./networkTokenSubscription');
                networkTokenSubscription.createNetworkTokenSubscription();
            }
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
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
    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var scaEnabled = dw.system.Site.getCurrent().getCustomPreferenceValue('Cybersource_IsSCAEnabled');

    if (scaEnabled === true) {
        session.custom.scaTokenFlag = true;
    }


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
            if (configObject.networkTokenizationEnabled && data.processorInformation.paymentAccountReferenceNumber) {
                var networkTokenSubscription = require('./networkTokenSubscription');
                networkTokenSubscription.createNetworkTokenSubscription();
            }
            if (data.status === 'AUTHORIZED' || data.status === 'AUTHORIZED_PENDING_REVIEW') {
                result = data;
                return data;
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
    var logger = Logger.getLogger('Cybersource', isEcheck ? 'EcheckAuthorization' : 'CreditCardAuthorization');

    var instance = new cybersourceRestApi.PaymentsApi(configObject);

    var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
    clientReferenceInformation.code = referenceInformationCode;

    var deviceSessionId = new cybersourceRestApi.Ptsv2paymentsDeviceInformation();
    deviceSessionId.fingerprintSessionId = session.privacy.dfID;

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

    logger.debug('{0} Authorization Request for order {1}', isEcheck ? 'eCheck' : 'Credit Card', referenceInformationCode);

    var response = '';
    instance.createPayment(request, function (data, error, responseData) { // eslint-disable-line no-unused-vars
        if (!error) {
            // eCheck payments typically return PENDING status, credit cards return AUTHORIZED
            var validStatuses = isEcheck ?
                ['PENDING', 'AUTHORIZED', 'PENDING_REVIEW'] :
                ['AUTHORIZED', 'AUTHORIZED_PENDING_REVIEW'];

            if (validStatuses.indexOf(data.status) !== -1) {
                logger.info('{0} authorization successful for order {1}, status: {2}, ID: {3}',
                    isEcheck ? 'eCheck' : 'Credit Card', referenceInformationCode, data.status, data.id);
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


function generateUcCaptureContext(isMiniCart) {
    try {
        var basket = require('dw/order/BasketMgr').getCurrentBasket();
        var configObject = require('../../configuration/index');
        var cybersourceRestApi = require('../../apiClient/index');
        var requestObj = new cybersourceRestApi.GenerateUnifiedCheckoutCaptureContextRequest();

        requestObj.clientVersion = Constants.UC_CLIENT_VERSION;

        var targetOrigins = new Array();
        targetOrigins.push('https://' + request.httpHost);
        requestObj.targetOrigins = targetOrigins;


        var allowedCardNetworks = new Array();

        var allowedCNetworks = configObject.allowedCardNetworks;
        if (empty(allowedCNetworks)) {
            allowedCardNetworks.push('VISA');
        } else {
            for (let i = 0; allowedCNetworks[i] != null; i++) {
                allowedCardNetworks.push(allowedCNetworks[i].value);
            }
        }

        requestObj.allowedCardNetworks = allowedCardNetworks;


        var allowedPaymentTypes = new Array();

        var allowedPaymentTypesConfig = configObject.digitalPaymentMethods;
        if (!empty(allowedPaymentTypesConfig)) {
            for (let i = 0; allowedPaymentTypesConfig[i] != null; i++) {
                allowedPaymentTypes.push(allowedPaymentTypesConfig[i].value);
            }
        }

        if (!isMiniCart) {
            allowedPaymentTypes.push('PANENTRY');
        }

        if (!isMiniCart && configObject.eCheckEnabledForUnifiedCheckout) {
            allowedPaymentTypes.push('CHECK');
        }

        requestObj.allowedPaymentTypes = allowedPaymentTypes;

        var Locale = require('dw/util/Locale');
        var currentLocale = Locale.getLocale(request.locale);

        requestObj.country = currentLocale.country;
        requestObj.locale = currentLocale.ID;
        var captureMandate = new cybersourceRestApi.Upv1capturecontextsCaptureMandate();
        captureMandate.billingType = isMiniCart ? 'FULL' : 'NONE';
        captureMandate.requestEmail = isMiniCart ? true : false;
        captureMandate.requestPhone = isMiniCart ? true : false;
        captureMandate.requestShipping = isMiniCart ? true : false;

        var customer = session.getCustomer();
        var customerProfile = customer ? customer.getProfile() : null;
        var isRegisteredCustomer = false;
        if (customer && customer.isRegistered() && customer.isAuthenticated() && customerProfile) {
            // Additional validation - ensure customer has a valid profile
            isRegisteredCustomer = !empty(customerProfile.getEmail()) &&
                !empty(customerProfile.getCustomerNo());

        }
        // Check if tokenization is enabled in Business Manager configuration
        var isTokenizationEnabled = configObject.tokenizationEnabled;
        // Set requestSaveCard based on comprehensive customer validation and tokenization configuration
        captureMandate.requestSaveCard = isMiniCart ? false : (isRegisteredCustomer && isTokenizationEnabled);

        captureMandate.showAcceptedNetworkIcons = isMiniCart ? false : true;
        requestObj.captureMandate = captureMandate;

        var orderInformation = new cybersourceRestApi.Upv1capturecontextsOrderInformation();
        var orderInformationAmountDetails = new cybersourceRestApi.Upv1capturecontextsOrderInformationAmountDetails();
        orderInformationAmountDetails.totalAmount = basket.totalGrossPrice.value.toString();
        orderInformationAmountDetails.currency = basket.currencyCode;
        orderInformation.amountDetails = orderInformationAmountDetails;

        // Create billTo object
        var billTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
        // Get billing address from basket
        var billingAddress = basket.billingAddress;
        if (billingAddress && !isMiniCart && !empty(billingAddress.firstName) && !empty(billingAddress.lastName)) {
            // Populate billing address fields
            billTo.firstName = billingAddress.firstName;
            billTo.lastName = billingAddress.lastName;
            billTo.email = basket.customerEmail;
            // Add to orderInformation
            orderInformation.billTo = billTo;
        }
        requestObj.orderInformation = orderInformation;

        var transientTokenResponseOptions = {
            includeCardPrefix: false
        };
        requestObj.transientTokenResponseOptions = transientTokenResponseOptions;

        var instance = new cybersourceRestApi.UnifiedCheckoutCaptureContextApi(configObject); //, apiClient);
        var response = {};
        instance.generateUnifiedCheckoutCaptureContext(requestObj, function (data, error, result) {
            if (!error) {
                response = data;
            } else {
                throw new Error(data);
            }
        });
        return response;
    }
    catch (error) {
        // console.log('\nException on calling the API : ' + error);
    }
}

/**
 * @returns {*} *
 */
function createFlexKey() { // eslint-disable-line no-unused-vars
    var configObject = require('../../configuration/index');

    var cybersourceRestApi = require('../../apiClient/index');

    var keyGenerationApi = new cybersourceRestApi.KeyGenerationApi(configObject);
    var allowedCNetworks = configObject.allowedCardNetworks;
    var list = [];
    if (empty(allowedCNetworks)) {
        list.push('VISA');
    } else {
        for (let i = 0; allowedCNetworks[i] != null; i++) {
            list.push(allowedCNetworks[i].value);
        }
    }

    var publicKeyRequest = {
        'targetOrigins': [
            Constants.PROXY_PREFIX + '://' + request.httpHost
        ],
        'allowedCardNetworks': list,
        'clientVersion': Constants.CLIENT_VERSION,
        'transientTokenResponseOptions': {
            'includeCardPrefix': false
        }
    };
    var opts = {};
    opts.format = 'JWT';

    var response = {};
    keyGenerationApi.generatePublicKey(opts.format, publicKeyRequest, function (data, error, result) { // eslint-disable-line no-unused-vars
        if (!error) {
            response = data;
        } else {
            throw new Error(data);
        }
    });
    return response;
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
 * Format phone number for CyberSource - removes +1 prefix if present
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

module.exports = {
    httpAuthorizeWithToken: httpAuthorizeWithToken,
    httpAuthorizeWithTransientToken: httpAuthorizeWithTransientToken,
    createFlexKey: createFlexKey,
    httpZeroDollarAuth: httpZeroDollarAuth,
    httpZeroDollarAuthWithTransientToken: httpZeroDollarAuthWithTransientToken,
    updateCustomerPaymentInstrument: updateCustomerPaymentInstrument,
    jwtDecode: jwtDecode,
    generateUcCaptureContext: generateUcCaptureContext,
    getPaymentDetails: getPaymentDetails
};
