'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var configObject = require('../configuration/index');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');

var page = module.superModule;
server.extend(page);

var verificationResultEnum = {
    ADDRESS_ACCEPTED: 'ADDRESS_ACCEPTED',
    SELECTION_REQUIRED: 'SELECTION_REQUIRED',
    VERIFICATION_FAILED: 'VERIFICATION_FAILED'
};

/**
 * *
 * @param {*} paymentForm *
 * @returns {*} *
 */
function setDetailsObject(paymentForm) { // eslint-disable-line no-unused-vars
    return {
        name: '',
        cardNumber: '',
        cardType: '',
        expirationMonth: '',
        expirationYear: '',
        paymentForm: ''
    };
}

/**
 * *
 * @param {*} addressFieldsForm *
 * @returns {*} *
 */
function verifyAddess(addressFieldsForm) {
    var addressVerification = require('~/cartridge/scripts/http/addressVerification');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var DAVAddress = mapper.SFFCAddressToProviderAddress(addressFieldsForm);
    var result = {
        status: null,
        standard: null,
        original: DAVAddress
    };
    if (addressFieldsForm.addressAccepted.checked || !configObject.davEnabled) {
        result.status = verificationResultEnum.ADDRESS_ACCEPTED;
    } else {
        var DAVResult = addressVerification.httpVerifyCustomerAddress(DAVAddress);
        if (DAVResult.status === addressVerification.STATUSCODES.COMPLETED) {
            var standardAddress = DAVResult.data.standardAddress;
            var inputEqualsStandardAddress = standardAddress.address1.withApartment === DAVAddress.address1
                && standardAddress.administrativeArea === DAVAddress.administrativeArea
                && standardAddress.country === DAVAddress.country
                && standardAddress.locality === DAVAddress.locality
                && standardAddress.postalCode === DAVAddress.postalCode;
            if (inputEqualsStandardAddress) {
                result.status = verificationResultEnum.ADDRESS_ACCEPTED;
            } else {
                result.status = verificationResultEnum.SELECTION_REQUIRED;
                result.standard = standardAddress;
            }
        } else {
            result.status = verificationResultEnum.VERIFICATION_FAILED;
        }
    }
    return result;
}

if (configObject.tokenizationEnabled && configObject.cartridgeEnabled) {
    // eslint-disable-next-line consistent-return
    server.prepend('SavePayment', csrfProtection.validateAjaxRequest, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
        var redirectURL;
        try {
            var tokenRateLimiterHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper');
            // eslint-disable-next-line no-undef
            var isallowed = tokenRateLimiterHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
            if (isallowed.result) {
                return next();
            }
            if (isallowed.reason.indexOf(tokenRateLimiterHelper.FailureReason.RateLimitExceeded) >= 0) {
                redirectURL = URLUtils.url('Error-ErrorCodeAjaxRedirect',
                    'err', 'unable.to.save.payment.due.to.rate.limiter',
                    'statuscode', 429).toString();
                res.setStatusCode(429);
                res.redirectUrl = redirectURL;
                next();
            }
        } catch (e) {
            redirectURL = URLUtils.url('Error-ErrorCodeAjaxRedirect',
                'err', 'card.not.authorized',
                'statuscode', 400).toString();
            res.setStatusCode(400);
            res.redirectUrl = redirectURL;
            next();
        }
    });

    server.append('SavePayment', csrfProtection.validateAjaxRequest, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
        next();
    });

    server.append('SavePayment', csrfProtection.validateAjaxRequest, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
        var HookMgr = require('dw/system/HookMgr');
        var PaymentMgr = require('dw/order/PaymentMgr');
        var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
        var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');
        this.on('route:BeforeComplete', function (req1, res1) {
            var paymentForm = server.forms.getForm('creditCard');
            var CustomerMgr = require('dw/customer/CustomerMgr');
            var Transaction = require('dw/system/Transaction');
            var Resource = require('dw/web/Resource');
            var formInfo = res1.getViewData();
            var customer = CustomerMgr.getCustomerByCustomerNumber(
                req1.currentCustomer.profile.customerNo
            );
            if (typeof formInfo.fields === 'object'
                && 'dwfrm_creditCard_cardNumber' in formInfo.fields
                && formInfo.fields.dwfrm_creditCard_cardNumber === Resource.msg('error.message.creditnumber.invalid', 'forms', null)
                && /XXX/.test(paymentForm.cardNumber.htmlValue)) {
                var wallet = customer.getProfile().getWallet();
                Transaction.wrap(function () {
                    var paymentInstrument = wallet.createPaymentInstrument(dwOrderPaymentInstrument.METHOD_CREDIT_CARD);
                    paymentInstrument.setCreditCardHolder(paymentForm.cardOwner.value);
                    paymentInstrument.setCreditCardNumber(paymentForm.cardNumber.value);
                    paymentInstrument.setCreditCardType(paymentForm.cardType.value);
                    paymentInstrument.setCreditCardExpirationMonth(paymentForm.expirationMonth.value);
                    paymentInstrument.setCreditCardExpirationYear(paymentForm.expirationYear.value);

                    var processor = PaymentMgr.getPaymentMethod(dwOrderPaymentInstrument.METHOD_CREDIT_CARD).getPaymentProcessor();
                    var token = HookMgr.callHook(
                        'app.payment.processor.' + processor.ID.toLowerCase(),
                        'createToken'
                    );

                    paymentInstrument.setCreditCardToken(token);
                });

                // Send account edited email
                accountHelpers.sendAccountEditedEmail(customer.profile);

                res1.json({
                    success: true,
                    redirectUrl: URLUtils.url('PaymentInstruments-List').toString()
                });

                // Token rate limiter.
                var tokenRateLimiterHelper = require('~/cartridge/scripts/helpers/tokenRateLimiterHelper');
                var paymentInstruments = wallet.getPaymentInstruments().toArray();
                // check duplicate logic here
                // eslint-disable-next-line no-undef
                tokenRateLimiterHelper.checkDuplicateInstrumentIdentifier(paymentInstruments, session.privacy.tokenInformation, customer);

                // eslint-disable-next-line no-undef
                var limiterResult = tokenRateLimiterHelper.IsCustumerAllowedSinglePaymentInstrumentInsertion(customer);
                if (limiterResult.result) {
                    if (limiterResult.resetTimer) {
                        // eslint-disable-next-line no-undef
                        tokenRateLimiterHelper.resetTimer(customer);
                    }

                    if (limiterResult.increaseCounter) {
                        // eslint-disable-next-line no-undef
                        tokenRateLimiterHelper.increaseCounter(customer);
                    }
                }
                // eslint-disable-next-line no-undef
                session.privacy.tokenInformation = '';
                res1.setViewData(setDetailsObject(paymentForm));
            }
        });
        return next();
    });

    server.post('VerifyAddress', csrfProtection.validateAjaxRequest, userLoggedIn.validateLoggedInAjax, function (req, res, next) {
        var addressFieldsForm = server.forms.getForm('creditCard').billToAddressFields;
        var result = verifyAddess(addressFieldsForm);
        res.json(result);
        next();
    });

    server.prepend('DeletePayment', userLoggedIn.validateLoggedInAjax, function (req, res, next) {
        var tokenManagement = require('../scripts/http/tokenManagement');
        var mapper = require('~/cartridge/scripts/util/mapper.js');
        var array = require('*/cartridge/scripts/util/array');
        var UUID = req.querystring.UUID;
        var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
        var paymentToDelete = array.find(paymentInstruments, function (item) {
            return UUID === item.UUID;
        });
        if (paymentToDelete) {
            var paymentToken = paymentToDelete.raw.getCreditCardToken();
            var tokenInformation = mapper.deserializeTokenInformation(paymentToken);
            if (tokenInformation.paymentInstrument.id) {
                // eslint-disable-next-line no-undef
                tokenManagement.httpDeleteCustomerPaymentInstrument(session.getCustomer().getProfile().custom.customerID, tokenInformation.paymentInstrument.id);
            }
        }
        return next();
    });
    server.prepend('List', userLoggedIn.validateLoggedIn, function (req, res, next) {
        var Transaction = require('dw/system/Transaction');
        // eslint-disable-next-line no-undef
        var paymentInstrumentToBeDeleted = session.getCustomer().getProfile().custom.deleteInstrumentId;
        if (paymentInstrumentToBeDeleted.length !== 0) {
            var tokenManagement = require('~/cartridge/scripts/http/tokenManagement.js');
            // eslint-disable-next-line no-undef
            var result = tokenManagement.httpDeleteCustomerPaymentInstrument(session.getCustomer().getProfile().custom.customerID, paymentInstrumentToBeDeleted[0]);
            if (result === true) {
                Transaction.wrap(function () {
                    // eslint-disable-next-line no-undef
                    session.getCustomer().getProfile().custom.deleteInstrumentId = [];
                });
            }
        }
        return next();
    });
}

module.exports = server.exports();
