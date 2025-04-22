'use strict';

var page = module.superModule;
var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');
var payerAuthentication = require('~/cartridge/scripts/http/payerAuthentication');
var configObject = require('~/cartridge/configuration/index');

server.extend(page);
var currentBasket = BasketMgr.getCurrentBasket();
var paymentMethod = currentBasket && currentBasket.paymentInstrument && currentBasket.paymentInstrument.paymentMethod;
var isVisaSRC = paymentMethod && paymentMethod === 'CLICK_TO_PAY';

var isGPay_PayerAuthEnabled = false;
if(!empty(session.privacy.encryptedDataGP) && session.custom.isGpayCardHolderAuthenticated == false && configObject.payerAuthenticationEnabled) {
    isGPay_PayerAuthEnabled = true;
}
// eslint-disable-next-line no-undef
if (((configObject.payerAuthenticationEnabled && empty(session.privacy.encryptedDataGP)) || isGPay_PayerAuthEnabled) && configObject.cartridgeEnabled && !isVisaSRC) {
  
    // eslint-disable-next-line consistent-return
    server.prepend('PlaceOrder', server.middleware.https, function (req, res, next) {

        // eslint-disable-next-line no-shadow
        var URLUtils = require('dw/web/URLUtils');
        if (session.custom.Flag3ds === false) {
            // eslint-disable-next-line no-shadow
            var BasketMgr = require('dw/order/BasketMgr');
            var OrderMgr = require('dw/order/OrderMgr');
            var Resource = require('dw/web/Resource');
            var Transaction = require('dw/system/Transaction');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
            var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
            var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
            var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');
            res.setHttpHeader("Content-Security-Policy", "script-src 'self'");
            // eslint-disable-next-line no-shadow
            var currentBasket = BasketMgr.getCurrentBasket();
            if (!currentBasket) {
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return next();
            }

            var validatedProducts = validationHelpers.validateProducts(currentBasket);
            if (validatedProducts.error) {
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return next();
            }

            if (req.session.privacyCache.get('fraudDetectionStatus')) {
                res.json({
                    error: true,
                    cartError: true,
                    redirectUrl: URLUtils.url('Error-ErrorCode', 'err', '01').toString(),
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });

                return next();
            }

            var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);
            if (validationOrderStatus.error) {
                res.json({
                    error: true,
                    errorMessage: validationOrderStatus.message
                });
                return next();
            }

            // Check to make sure there is a shipping address
            if (currentBasket.defaultShipment.shippingAddress === null) {
                res.json({
                    error: true,
                    errorStage: {
                        stage: 'shipping',
                        step: 'address'
                    },
                    errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null)
                });
                return next();
            }

            // Check to make sure billing address exists
            if (!currentBasket.billingAddress) {
                res.json({
                    error: true,
                    errorStage: {
                        stage: 'payment',
                        step: 'billingAddress'
                    },
                    errorMessage: Resource.msg('error.no.billing.address', 'checkout', null)
                });
                return next();
            }

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });

            // Re-validates existing payment instruments
            var validPayment = COHelpers.validatePayment(req, currentBasket);
            if (validPayment.error) {
                res.json({
                    error: true,
                    errorStage: {
                        stage: 'payment',
                        step: 'paymentInstrument'
                    },
                    errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
                });
                return next();
            }

            // Re-calculate the payments.
            var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
            if (calculatedPaymentTransactionTotal.error) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return next();
            }

            // Creates a new order.
            var order = COHelpers.createOrder(currentBasket);
            if (!order) {
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
                return next();
            }
            // eslint-disable-next-line no-undef
            session.privacy.orderID = order.orderNo;
            // eslint-disable-next-line no-undef
            session.privacy.orderToken = order.orderToken;

            var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
            if (fraudDetectionStatus.status === 'fail') {
                Transaction.wrap(function () {
                    OrderMgr.failOrder(order, true);
                });

                // fraud detection failed
                req.session.privacyCache.set('fraudDetectionStatus', true);

                res.json({
                    error: true,
                    cartError: true,
                    redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });

                return next();
            }

            if (req.currentCustomer.addressBook) {
                // save all used shipping addresses to address book of the logged in customer
                var allAddresses = addressHelpers.gatherShippingAddresses(order);
                allAddresses.forEach(function (address) {
                    if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
                        addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
                    }
                });
            }

            // eslint-disable-next-line no-undef
            session.privacy.localeId = req.locale.id;

            // Reset usingMultiShip after successful Order placement
            req.session.privacyCache.set('usingMultiShipping', false);


        }
        var billingForm = server.forms.getForm('billing');
        var order = getOrder();  
        var paymentInstruments = order.paymentInstruments;
        var paymentInstrument = paymentInstruments[0];
        var card = {
            token: paymentInstrument.creditCardToken,
            jwttoken: billingForm.creditCardFields.flexresponse.value,
            securityCode: billingForm.creditCardFields.securityCode.value,
            fluidData: paymentInstrument.custom.fluidData,
            googlePayFluidData: session.privacy.encryptedDataGP,
            callId: paymentInstrument.custom.callID
        };

        var setupResponse = payerAuthentication.paSetup(billingForm, session.privacy.orderID, card);
        var accessToken = setupResponse.consumerAuthenticationInformation.accessToken;
        session.privacy.deviceDataCollectionUrl = setupResponse.consumerAuthenticationInformation.deviceDataCollectionUrl;
        session.privacy.ReferenceId = setupResponse.consumerAuthenticationInformation.referenceId;

        if (session.custom.Flag3ds === true) {
            res.redirect(URLUtils.https('PayerAuthentication-createDeviceDataCollection', 'accessToken', accessToken).toString());
        }
        else {
        res.json({
            error: false,
            cartError: false,
            createDeviceDataCollection: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.https('PayerAuthentication-createDeviceDataCollection', 'accessToken', accessToken).toString()

        });
    }

        this.emit('route:Complete', req, res);
    });
}

server.append('PlaceOrder', server.middleware.https, function (req, res, next) {
    // eslint-disable-next-line no-undef
    if (session.privacy.AuthorizeErrors) {
        // eslint-disable-next-line no-undef
        var message = session.privacy.AuthorizeErrors;
        try {
            var messageObject = JSON.parse(message);
            if ('message' in messageObject) {
                message = messageObject.message;
            }
            // eslint-disable-next-line no-empty
        } catch (e) { }
        res.json({
            error: true,
            errorMessage: message
        });
        // eslint-disable-next-line no-undef
        delete session.privacy.AuthorizeErrors;
    } else {
        //For Googlepay and Visa Checkeout Redirect to COPlaceOrder-SubmitOrderConformation.
        res.json({
            error: false,
            ID: session.privacy.orderID,
            token: session.privacy.orderToken,
            continueUrl: URLUtils.url('COPlaceOrder-SubmitOrderConformation').toString()
        });
    }

    return next();
});
/**
 * @returns {*} *
 */
function getOrder() {
    var OrderMgr = require('dw/order/OrderMgr');
    // eslint-disable-next-line no-undef
    var orderNo = session.privacy.orderID;
    var order = OrderMgr.getOrder(orderNo);
    return order;
}

/**
 * Send Email Confirmation
 */
function sendConfirmationEmail() {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var order = getOrder();
    if (order.getCustomerEmail()) {
        // eslint-disable-next-line no-undef
        COHelpers.sendConfirmationEmail(order, session.privacy.localeId);
    }
}
server.post('getResponse', server.middleware.https, function (req, res, next) {
    var Transaction = require('dw/system/Transaction');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    // eslint-disable-next-line no-shadow
    var currentBasket = BasketMgr.getCurrentBasket();
    var order = getOrder();
    // eslint-disable-next-line no-undef
    var referenceId = session.privacy.ReferenceId;
    var billingForm = server.forms.getForm('billing');
    var shippingAddress = order.shipments[0].shippingAddress;
    var redirect = false;
    if (order != null) {
        var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
        var totalAmount = order.totalGrossPrice.value;
        var currencyCode = order.currencyCode;
        var paymentInstruments = order.paymentInstruments;
        var paymentInstrument = paymentInstruments[0];
        var card = {
            token: paymentInstrument.creditCardToken,
            jwttoken: billingForm.creditCardFields.flexresponse.value,
            securityCode: billingForm.creditCardFields.securityCode.value,
            fluidData: paymentInstrument.custom.fluidData,
            googlePayFluidData: session.privacy.encryptedDataGP,
            callId: paymentInstrument.custom.callID
        };
    }

    try {

        // eslint-disable-next-line block-scoped-var, no-undef
        var enrollResponse = payerAuthentication.paEnroll(billingForm, shippingAddress, session.privacy.orderID, totalAmount, currencyCode, referenceId, card, lineItems, order);
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
                    res.render('payerAuthentication/postToStepUpUrl', {
                        stepUpUrl: stepUpUrl,
                        jwtToken: jwtToken
                    });
                });
            }
        } else if (enrollResponse.status === 'AUTHORIZED' || enrollResponse.status === 'AUTHORIZED_PENDING_REVIEW') {
            redirect = false;
            var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
            var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
            if (placeOrderResult.error) {
                redirect = true;
                res.json({
                    error: true,
                    errorMessage: Resource.msg('error.technical', 'checkout', null)
                });
            }
            sendConfirmationEmail();
            // eslint-disable-next-line no-undef
            session.privacy.orderID = '';
            // eslint-disable-next-line no-undef
            session.privacy.orderToken = '';
            delete session.privacy.encryptedDataGP;
            delete session.custom.isGpayCardHolderAuthenticated;
        }
        // eslint-disable-next-line
        else if (enrollResponse.errorInformation.reason === 'CUSTOMER_AUTHENTICATION_REQUIRED' && session.custom.Flag3ds === false) {
            session.custom.Flag3ds = true;
            // eslint-disable-next-line no-shadow
            res.render('payerAuthentication/scaRedirect', {
                orderID: order.orderNo,
            });
    
            return next();
        }
        else {
            redirect = true;
            Transaction.wrap(function () {
                OrderMgr.failOrder(order);
            });
            // eslint-disable-next-line no-undef
            session.privacy.orderID = '';
            // eslint-disable-next-line no-undef
            session.privacy.orderToken = '';
            delete session.privacy.encryptedDataGP;
            delete session.custom.isGpayCardHolderAuthenticated;
        }

        res.render('payerAuthentication/checkoutRedirect', {
            redirect: redirect,
            errorMessage: Resource.msg('message.payerAuthError', 'error', null),
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: URLUtils.url('COPlaceOrder-SubmitOrderConformation').toString()
        });
    } catch (e) {
        if (!order) {
            redirect = true;
            res.render('payerAuthentication/checkoutRedirect', {
                redirect: redirect,
                errorMessage: Resource.msg('message.payerAuthError', 'error', null)
            });
        } else {
            Transaction.wrap(function () {
                OrderMgr.failOrder(order);
            });
        }
    }
    return next();
});

server.post('handlingConsumerAuthResponse', server.middleware.https, function (req, res, next) {
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    // eslint-disable-next-line no-shadow
    var currentBasket = BasketMgr.getCurrentBasket();
    var Transaction = require('dw/system/Transaction');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var OrderMgr = require('dw/order/OrderMgr');
    var Resource = require('dw/web/Resource');
    var redirect;

    var billingForm = server.forms.getForm('billing');
    var order = getOrder();
    if (order != null) {
        var totalAmount = order.totalGrossPrice.value;
        var currencyCode = order.currencyCode;
        var paymentInstruments = order.paymentInstruments;
        var paymentInstrument = paymentInstruments[0];
        var card = {
            token: paymentInstrument.creditCardToken,
            jwttoken: billingForm.creditCardFields.flexresponse.value,
            securityCode: billingForm.creditCardFields.securityCode.value,
            fluidData: paymentInstrument.custom.fluidData,
            googlePayFluidData: session.privacy.encryptedDataGP,
            callId: paymentInstrument.custom.callID
        };
    }
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
    // eslint-disable-next-line no-undef, block-scoped-var
    var authenticateResponse = payerAuthentication.paConsumerAuthenticate(billingForm, session.privacy.orderID, totalAmount, currencyCode, session.privacy.transactionId, card, lineItems, order);

    if (authenticateResponse.status === 'AUTHORIZED' || authenticateResponse.status === 'AUTHORIZED_PENDING_REVIEW') {
        var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
        var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
        redirect = false;
        if (placeOrderResult.error) {
            redirect = true;
            res.json({
                error: true,
                errorMessage: Resource.msg('error.technical', 'checkout', null)
            });
        }
        // Sending Email Confirmation
        sendConfirmationEmail();
        // eslint-disable-next-line no-undef
        session.privacy.orderID = '';
        // eslint-disable-next-line no-undef
        session.privacy.orderToken = '';
        delete session.privacy.encryptedDataGP;
        delete session.custom.isGpayCardHolderAuthenticated;
    }
   
    // eslint-disable-next-line
    else if ((authenticateResponse.errorInformation ? authenticateResponse.errorInformation.reason === 'CUSTOMER_AUTHENTICATION_REQUIRED' : false)  && session.custom.Flag3ds === false) {
        session.custom.Flag3ds = true;
        // eslint-disable-next-line no-shadow
        res.render('payerAuthentication/scaRedirect', {
            orderID: order.orderNo,
        });

        return next();
    }

    else {
        redirect = true;
        Transaction.wrap(function () {
            OrderMgr.failOrder(order);
        });
        // eslint-disable-next-line no-undef
        session.privacy.orderID = '';
        // eslint-disable-next-line no-undef
        session.privacy.orderToken = '';
        delete session.privacy.encryptedDataGP;
        delete session.custom.isGpayCardHolderAuthenticated;
    }
    res.render('payerAuthentication/checkoutRedirect', {
        redirect: redirect,
        errorMessage: Resource.msg('message.payerAuthError', 'error', null) + ' ' + authenticateResponse.status,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('COPlaceOrder-SubmitOrderConformation').toString()
    });
    return next();
});

// for Gpay on checkout page
server.post('SubmitPaymentGP', function (req, res, next) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var Encoding = require('dw/crypto/Encoding');
    var paymentForm = server.forms.getForm('billing');
    var billingFormErrors = {};
    var viewData = {};
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    var cart = BasketMgr.getCurrentBasket();
    var Locale = require('dw/util/Locale');
    var OrderModel = require('*/cartridge/models/order');
    var currentLocale = Locale.getLocale(req.locale.id);
    var usingMultiShipping = false;
    var basketModel = new OrderModel(cart, {
        usingMultiShipping: usingMultiShipping,
        countryCode: currentLocale.country,
        containerView: 'basket'
    });

    // eslint-disable-next-line no-undef
    session.privacy.ipAddress = request.httpHeaders['x-is-remote_addr'];
    // eslint-disable-next-line no-undef
    var paymentData = JSON.parse(request.httpParameterMap.googletoken);
    var GPtoken = paymentData.paymentMethodData.tokenizationData.token;
    session.custom.isGpayCardHolderAuthenticated = paymentData.paymentMethodData.info.assuranceDetails.cardHolderAuthenticated;
    // eslint-disable-next-line no-undef
    session.privacy.encryptedDataGP = Encoding.toBase64(new dw.util.Bytes(GPtoken));

    billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
    var contactFieldsErrors = COHelpers.validateBillingForm(paymentForm.contactInfoFields);
    if (Object.keys(billingFormErrors).length) {
        // respond with form data and errors
        res.json({
            form: paymentForm,
            fieldErrors: [billingFormErrors],
            serverErrors: [],
            error: true
        });
    } else if (Object.keys(contactFieldsErrors).length) {
        res.json({
            form: paymentForm,
            fieldErrors: [contactFieldsErrors],
            serverErrors: [],
            error: true
        });
    } else {
        viewData.address = {
            firstName: {
                value: paymentForm.addressFields.firstName.value
            },
            lastName: {
                value: paymentForm.addressFields.lastName.value
            },
            address1: {
                value: paymentForm.addressFields.address1.value
            },
            address2: {
                value: paymentForm.addressFields.address2.value
            },
            city: {
                value: paymentForm.addressFields.city.value
            },
            postalCode: {
                value: paymentForm.addressFields.postalCode.value
            },
            countryCode: {
                value: paymentForm.addressFields.country.value
            }
        };

        if (Object.prototype.hasOwnProperty
            .call(paymentForm.addressFields, 'states')) {
            viewData.address.stateCode = {
                value: paymentForm.addressFields.states.stateCode.value
            };
        }

        viewData.paymentMethod = {
            value: paymentForm.paymentMethod.value,
            htmlName: paymentForm.paymentMethod.value
        };

        viewData.email = {
            value: cart.customerEmail
        };

        viewData.phone = {
            value: paymentForm.contactInfoFields.phone.value
        };

        viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;
        // Code to update card type details on place order page
        var paymentInstrument = null;
        // eslint-disable-next-line no-undef
        if (!empty(cart.getPaymentInstruments())) {
            paymentInstrument = cart.getPaymentInstruments()[0];
        }
        var cardType;
        if (paymentInstrument != null) {
            cardType = paymentInstrument.creditCardType;
        }
        if (paymentInstrument != null && paymentInstrument.paymentMethod === 'DW_GOOGLE_PAY') {
            basketModel.billing.payment.selectedPaymentInstruments[0].type = cardType;
            basketModel.billing.payment.selectedPaymentInstruments[0].maskedCreditCardNumber = paymentInstrument.creditCardNumber;
        }
        viewData.order = basketModel;
        res.setViewData(viewData);
        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            // eslint-disable-next-line no-shadow
            var BasketMgr = require('dw/order/BasketMgr');
            var Resource = require('dw/web/Resource');
            var Transaction = require('dw/system/Transaction');
            // eslint-disable-next-line no-shadow
            var URLUtils = require('dw/web/URLUtils');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            // eslint-disable-next-line no-shadow
            var currentBasket = BasketMgr.getCurrentBasket();
            var billingData = res.getViewData();
            if (!currentBasket) {
                delete billingData.paymentInformation;
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }
            var billingAddress = currentBasket.billingAddress;
            var billingForm = server.forms.getForm('billing');
            billingForm.creditCardFields.cardNumber.htmlValue = '';
            billingForm.creditCardFields.securityCode.htmlValue = '';
            Transaction.wrap(function () {
                if (!billingAddress) {
                    billingAddress = currentBasket.createBillingAddress();
                }
                billingAddress.setFirstName(billingData.address.firstName.value);
                billingAddress.setLastName(billingData.address.lastName.value);
                billingAddress.setAddress1(billingData.address.address1.value);
                billingAddress.setAddress2(billingData.address.address2.value);
                billingAddress.setCity(billingData.address.city.value);
                billingAddress.setPostalCode(billingData.address.postalCode.value);
                if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
                    billingAddress.setStateCode(billingData.address.stateCode.value);
                }
                billingAddress.setCountryCode(billingData.address.countryCode.value);

                if (billingData.storedPaymentUUID) {
                    billingAddress.setPhone(req.currentCustomer.profile.phone);
                    currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
                } else {
                    billingAddress.setPhone(billingData.phone.value);
                    currentBasket.setCustomerEmail(billingData.email.value);
                }
            });
            // Add hook to call google payment
            var mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
            var result = mobileAdaptor.updateBilling(currentBasket, paymentData.paymentMethodData.info, billingData.email.value);
            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });
            // Re-calculate the payments.
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(currentBasket);
            if (calculatedPaymentTransaction.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }
            // return back google
            if (result.success) {
                // eslint-disable-next-line no-undef
                if (request.httpParameterMap.paymentData != null) {
                    res.json({
                        error: false
                    });
                }
            }
        });
    }
    return next();
});

/**
 * *
 * @param {*} cart *
 * @param {*} shippingdetails *
 * @returns {*} *
 */
function shippingUpdate(cart, shippingdetails) {
    var logger = require('dw/system/Logger');
    var mobileAdaptor;
    var shipment = cart.defaultShipment;
    // eslint-disable-next-line no-undef
    if (!empty(shipment.getShippingAddress())) {
        mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
        mobileAdaptor.updateShipping(shippingdetails);
        return {
            success: true
        };
    }
    try {
        mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
        mobileAdaptor.updateShipping(shippingdetails);
        return {
            success: true
        };
    } catch (err) {
        logger.error('Error creating shipment from Google pay address: {0}', err.message);
        return {
            error: true,
            errorMsg: err.message
        };
    }
}

//for Gapy on cart and minicart
// eslint-disable-next-line consistent-return
server.post('GetGooglePayToken', function (req, res, next) {
    var Encoding = require('dw/crypto/Encoding');
    // eslint-disable-next-line no-undef
    var response = JSON.parse(request.httpParameterMap.paymentData);
    var CardHelper = require('../scripts/helpers/CardHelper');
    var Resource = require('dw/web/Resource');
    // eslint-disable-next-line no-shadow
    var BasketMgr = require('dw/order/BasketMgr');
    var cart = BasketMgr.getCurrentBasket();
    var shippingdetails = response.shippingAddress; // add condition for only cart
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    // eslint-disable-next-line no-shadow
    var URLUtils = require('dw/web/URLUtils');
    var mobileAdaptor = require('*/cartridge/scripts/mobilepayments/MobilePaymentsAdapter');
    var Transaction = require('dw/system/Transaction');
    var logger = require('dw/system/Logger');
    // eslint-disable-next-line no-undef
    session.privacy.ipAddress = request.httpHeaders['x-is-remote_addr'];
    var result = mobileAdaptor.updateBilling(cart, response.paymentMethodData.info, response.email);
    if (result.success) {
        result = shippingUpdate(cart, shippingdetails);
        if (result.success) {
            cart = BasketMgr.getCurrentBasket();
            // calculate cart and redirect to summary page
            COHelpers.recalculateBasket(cart);
            var ShippingHelper = require('*/cartridge/scripts/checkout/shippingHelpers');
            Transaction.wrap(function () {
                ShippingHelper.selectShippingMethod(cart.defaultShipment, null);
            });
            var GPtoken = response.paymentMethodData.tokenizationData.token;
            session.custom.isGpayCardHolderAuthenticated = response.paymentMethodData.info.assuranceDetails.cardHolderAuthenticated;
            // eslint-disable-next-line no-undef
            session.privacy.encryptedDataGP = Encoding.toBase64(new dw.util.Bytes(GPtoken));
        } else {
            logger.error('Error in google Checkout payment: problem in billing details');
            Transaction.wrap(function () {
                CardHelper.removeExistingPaymentInstruments(cart);
            });
            COHelpers.recalculateBasket(cart);
            res.json({
                redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', Resource.msg('message.payerAuthError', 'error', null)),
                error: true
            });
            return next();
        }
        // eslint-disable-next-line no-undef
        if (request.httpParameterMap.paymentData != null) {
            res.json({
                status: 'success'
            });
            return next();
        }
    } else {
        logger.error('Error in google Checkout payment: problem in billing details');
        Transaction.wrap(function () {
            CardHelper.removeExistingPaymentInstruments(cart);
        });
        COHelpers.recalculateBasket(cart);
        res.json({
            redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'payerAuthError', 'error').toString(),
            error: true
        });
        return next();
    }
});

module.exports = server.exports();
