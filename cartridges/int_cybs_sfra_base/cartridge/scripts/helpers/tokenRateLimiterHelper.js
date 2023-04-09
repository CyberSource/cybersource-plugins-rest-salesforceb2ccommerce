/* eslint-disable no-plusplus */

'use strict';

var Transaction = require('dw/system/Transaction');
var configObject = require('../../configuration/index');

var CounterStartTimeKey = 'savedCCRateLookBack';
var PaymentsInsertedKey = 'savedCCRateCount';

var FailureReason = {
    RateLimitExceeded: 'RateLimitExceeded',
    DuplicatePayment: 'DuplicatePayment'
};

/**
 * @param {*} ExtensibleObject *
 * @param {*} propertyKey *
 * @param {*} value *
 */
function UpdateCustomParamenter(ExtensibleObject, propertyKey, value) {
    Transaction.wrap(function () {
        // eslint-disable-next-line no-param-reassign
        ExtensibleObject.custom[propertyKey] = value;
    });
}

/**
 * @param {*} customer *
 * @returns {*} *
 */
function IsCustumerAllowedSinglePaymentInstrumentInsertion(customer) {
    var userRateLimitExceeded = false;
    var rateLimiterResult = null;
    var serviceEnabled = configObject.tokenizationLimitSavedCardEnabled;
    if (serviceEnabled) {
        // eslint-disable-next-line no-use-before-define
        rateLimiterResult = IsUserRateLimitExceeded(customer);
        userRateLimitExceeded = rateLimiterResult.limitExceeded;
    }
    var result = {
        result: !userRateLimitExceeded,
        reason: [],
        resetTimer: (rateLimiterResult) ? rateLimiterResult.resetTimer : false,
        increaseCounter: (rateLimiterResult) ? rateLimiterResult.increaseCounter : false
    };

    if (userRateLimitExceeded) result.reason.push(FailureReason.RateLimitExceeded);

    return result;
}

/**
 * Checks if payment instrument timeout has passed.
 * @param {dw.customer} customer customer
 * @returns {boolean} true or false
 */
function IsUserRateLimitExceeded(customer) {
    var customerProfile = customer.getProfile();
    // eslint-disable-next-line no-shadow
    var resetTimer = false;
    // eslint-disable-next-line no-shadow
    var increaseCounter = false;
    /**
     * If property doesn't exist in custumer profile, initialize it.
     */
    if (!customerProfile.custom.hasOwnProperty(CounterStartTimeKey)) { // eslint-disable-line no-prototype-builtins
        UpdateCustomParamenter(customerProfile, CounterStartTimeKey, new Date());
    }

    /**
     * If property doesn't exist in custumer profile, initialize it.
     */
    if (!customerProfile.custom.hasOwnProperty(PaymentsInsertedKey)) { // eslint-disable-line no-prototype-builtins
        UpdateCustomParamenter(customerProfile, PaymentsInsertedKey, 0);
    }

    var insertionAllowed = false;

    /**
     * If enough time has passed, reset timer and counter
     * insertion is allowed
     */
    var counterResetMinutes = configObject.tokenizationResetIntervalInHours * 60;
    var lastResetDate = customerProfile.custom[CounterStartTimeKey];
    var lowerBoundEpochMs = Date.now() - (counterResetMinutes * 60000);
    var lowerBound = new Date(lowerBoundEpochMs);
    if (lowerBound >= lastResetDate) {
        insertionAllowed = true;
        resetTimer = true;
    }

    /**
     * If max amount of allowed insertion within the specified time frame is not yet reached
     * insertion is allowed
     */
    var allowedPaymentInstruments = configObject.tokenizationPaymentInstrumentAllowedInInterval;
    var paymentInstrumentsInsertedInTimeFrame = +customerProfile.custom[PaymentsInsertedKey];
    if (paymentInstrumentsInsertedInTimeFrame < allowedPaymentInstruments) {
        insertionAllowed = true;
    }
    /**
     * If insertion is allowed increase the payment instrument insertion counter
     */
    if (insertionAllowed) {
        increaseCounter = true;
    }

    return {
        limitExceeded: !insertionAllowed,
        increaseCounter: increaseCounter,
        resetTimer: resetTimer
    };
}

/**
 * @param {*} customer *
 */
function increaseCounter(customer) {
    var customerProfile = customer.getProfile();
    var paymentInstrumentsInsertedInTimeFrame = +customerProfile.custom[PaymentsInsertedKey];
    UpdateCustomParamenter(customerProfile, PaymentsInsertedKey, paymentInstrumentsInsertedInTimeFrame + 1);
}

/**
 * *
 * @param {*} customer *
 */
function resetTimer(customer) {
    var customerProfile = customer.getProfile();
    UpdateCustomParamenter(customerProfile, CounterStartTimeKey, new Date());
    UpdateCustomParamenter(customerProfile, PaymentsInsertedKey, 0);
}

/**
 * @param {*} customer *
 * @param {*} newPaymentInstrumentId *
 * @param {*} paymentInstruments *
 * @param {*} oldPaymentInstrumentId *
 * @param {*} skipFlexCheck *
 */
function deleteInstrumentFromWallet(customer, newPaymentInstrumentId, paymentInstruments, oldPaymentInstrumentId, skipFlexCheck) {
    // eslint-disable-next-line no-shadow
    var Transaction = require('dw/system/Transaction');
    var wallet = customer.profile.wallet;
    var array = require('*/cartridge/scripts/util/array');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var server = require('server');

    // new payment instrument To Be Deleted
    var paymentToDelete = array.find(paymentInstruments, function (item) {
        var token = item.creditCardToken;
        var tokenInfo = mapper.deserializeTokenInformation(token);
        return newPaymentInstrumentId === tokenInfo.paymentInstrument.id;
    });
    // old payment instrument to be updated
    var paymentToUpdate = array.find(paymentInstruments, function (item) {
        var token = item.creditCardToken;
        var tokenInfo = mapper.deserializeTokenInformation(token);
        return oldPaymentInstrumentId === tokenInfo.paymentInstrument.id;
    });
    var oldToken = paymentToUpdate.getCreditCardToken();
    if (paymentToUpdate) {
        try {
            var name;
            var cardNumber;
            var cardType;
            var expirationMonth;
            var expirationYear;
            // Checking for my account flow or checkout flow
            if (skipFlexCheck !== undefined && skipFlexCheck !== '') {
                var billingForm = server.forms.getForm('billing');
                name = billingForm.creditCardFields.cardOwner.value;
                cardNumber = billingForm.creditCardFields.cardNumber.value;
                cardType = billingForm.creditCardFields.cardType.value;
                expirationMonth = billingForm.creditCardFields.expirationMonth.value;
                expirationYear = billingForm.creditCardFields.expirationYear.value;
            } else {
                var paymentForm = server.forms.getForm('creditCard');
                name = paymentForm.cardOwner.value;
                cardNumber = paymentForm.cardNumber.value;
                cardType = paymentForm.cardType.value;
                expirationMonth = paymentForm.expirationMonth.value;
                expirationYear = paymentForm.expirationYear.value;
            }
            var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
            Transaction.wrap(function () {
                var paymentInstrument = wallet.createPaymentInstrument(dwOrderPaymentInstrument.METHOD_CREDIT_CARD);
                paymentInstrument.setCreditCardHolder(name);
                paymentInstrument.setCreditCardNumber(cardNumber);
                paymentInstrument.setCreditCardType(cardType);
                paymentInstrument.setCreditCardExpirationMonth(expirationMonth);
                paymentInstrument.setCreditCardExpirationYear(expirationYear);
                paymentInstrument.setCreditCardToken(oldToken);
            });
        } catch (e) {
            error = true; // eslint-disable-line no-undef
        }
    }
    try {
        Transaction.wrap(function () {
            if (paymentToDelete !== undefined) {
                wallet.removePaymentInstrument(paymentToDelete);
            }
            if (paymentToUpdate !== undefined) {
                wallet.removePaymentInstrument(paymentToUpdate);
            }
        });
    } catch (e) {
        error = true; // eslint-disable-line no-undef
    }
}

/**
 * @param {string} paymentInstruments Array of paymentInstruments present in wallet
 * @param {string} tokenInfo  new token information
 * @param {string} customer logged in customer
 * @returns {boolean} duplicateExists
 */
function checkDuplicateInstrumentIdentifier(paymentInstruments, tokenInfo, customer) {
    var duplicateExists = false;
    var server = require('server');
    var mapper = require('~/cartridge/scripts/util/mapper.js');
    var tokenManagement = require('~/cartridge/scripts/http/tokenManagement.js');
    // eslint-disable-next-line no-shadow
    var Transaction = require('dw/system/Transaction');
    var result;
    var splitTokenInfo = tokenInfo.split('-');
    var instrumentIdentifierId = splitTokenInfo[0];
    var newPaymentInstrumentId = splitTokenInfo[1];
    var skipFlexCheck = splitTokenInfo[2];
    if (splitTokenInfo[3] != null) {
        var customerId = splitTokenInfo[3];
    }
    if (customer.profile.custom.customerID == null) {
        try {
            Transaction.wrap(function () {
                // eslint-disable-next-line no-param-reassign, block-scoped-var
                customer.profile.custom.customerID = customerId;
            });
        } catch (e) {
            error = true; // eslint-disable-line no-undef
        }
    }
    for (var i = 0; i < paymentInstruments.length; i++) {
        var PI = paymentInstruments[i];
        var PIToken = PI.getCreditCardToken();
        if (PIToken != null) {
            var PITokenInformation = mapper.deserializeTokenInformation(PIToken);
            if (instrumentIdentifierId === PITokenInformation.instrumentIdentifier.id) {
                if (newPaymentInstrumentId !== PITokenInformation.paymentInstrument.id) {
                    duplicateExists = true;
                    var oldPaymentInstrumentId = PITokenInformation.paymentInstrument.id;
                    // eslint-disable-next-line no-undef
                    var email = session.getCustomer().getProfile().email;
                    var expiryMonth;
                    var expiryYear;
                    var address;
                    if (skipFlexCheck !== undefined && skipFlexCheck !== '') {
                        var billingForm = server.forms.getForm('billing');
                        expiryMonth = billingForm.creditCardFields.expirationMonth.value;
                        expiryYear = billingForm.creditCardFields.expirationYear.value;
                        address = mapper.SFFCAddressToProviderAddress(billingForm.addressFields);
                    } else {
                        var paymentForm = server.forms.getForm('creditCard');
                        expiryMonth = paymentForm.expirationMonth.value;
                        expiryYear = paymentForm.expirationYear.value;
                        address = mapper.SFFCAddressToProviderAddress(paymentForm.billToAddressFields);
                    }
                    // patch call to cybersource
                    result = tokenManagement.httpUpdateCustomerPaymentInstrument(customer.profile.custom.customerID, oldPaymentInstrumentId, expiryMonth, expiryYear, address, email, instrumentIdentifierId);
                    break;
                }
            }
        } else {
            // eslint-disable-next-line no-continue
            continue;
        }
    }
    if (result === true) {
        // delete PI from wallet
        // eslint-disable-next-line block-scoped-var
        deleteInstrumentFromWallet(customer, newPaymentInstrumentId, paymentInstruments, oldPaymentInstrumentId, skipFlexCheck); // send old payment instrument id here too
        // Adding payment instument to be deleted from cybersource in custom attribute
        var paymentIns = [newPaymentInstrumentId];
        try {
            Transaction.wrap(function () {
                // eslint-disable-next-line no-param-reassign
                customer.profile.custom.deleteInstrumentId = paymentIns;
            });
        } catch (e) {
            error = true; // eslint-disable-line no-undef
        }
    }
    return duplicateExists;
}
module.exports = {
    IsCustumerAllowedSinglePaymentInstrumentInsertion: IsCustumerAllowedSinglePaymentInstrumentInsertion,
    IsUserRateLimitExceeded: IsUserRateLimitExceeded,
    FailureReason: FailureReason,
    increaseCounter: increaseCounter,
    resetTimer: resetTimer,
    checkDuplicateInstrumentIdentifier: checkDuplicateInstrumentIdentifier
};
