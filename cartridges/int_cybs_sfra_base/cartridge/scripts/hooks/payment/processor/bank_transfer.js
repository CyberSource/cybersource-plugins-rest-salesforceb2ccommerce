/* eslint-disable no-plusplus */ 

"use strict";

var baseBasicCreditHook = require("app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit");
var PaymentInstrument = require("dw/order/PaymentInstrument");
var Resource = require("dw/web/Resource");
var Transaction = require("dw/system/Transaction");
var OrderMgr = require("dw/order/OrderMgr");
//var server = require("server");

// Constants for session.privacy character limit
var MAX_SESSION_PRIVACY_LENGTH = 1999;

/**
 * Stores transient token in session, splitting if it exceeds 2000 char limit
 * SFCC session.privacy variables have a 2000 character limit.
 * This function splits large tokens to avoid the limit.
 * @param {string} transientToken - The transient token to store
 */
function storeTransientToken(transientToken) {
    // eslint-disable-next-line no-undef
    if (transientToken.length > MAX_SESSION_PRIVACY_LENGTH) {
        // Split the token into two parts to avoid 2000 char limit
        // eslint-disable-next-line no-undef
        session.privacy.echeckTransientToken = transientToken.substring(0, MAX_SESSION_PRIVACY_LENGTH);
        // eslint-disable-next-line no-undef
        session.privacy.echeckTransientToken2 = transientToken.substring(MAX_SESSION_PRIVACY_LENGTH);
    } else {
        // eslint-disable-next-line no-undef
        session.privacy.echeckTransientToken = transientToken;
        // eslint-disable-next-line no-undef
        session.privacy.echeckTransientToken2 = null;
    }
}

/**
 * Retrieves and concatenates transient token from session
 * Handles both single and split token scenarios
 * @returns {string|null} The complete transient token or null if not found
 */
function getTransientToken() {
    // eslint-disable-next-line no-undef
    var token = session.privacy.echeckTransientToken;
    
    if (!token) {
        return null;
    }
    
    // Check if there's a second part to concatenate
    // eslint-disable-next-line no-undef
    if (session.privacy.echeckTransientToken2) {
        // eslint-disable-next-line no-undef
        token = token + session.privacy.echeckTransientToken2;
    }
    
    return token;
}

/**
 * Clears transient token from session (both parts if split)
 */
function clearTransientToken() {
    // eslint-disable-next-line no-undef
    delete session.privacy.echeckTransientToken;
    // eslint-disable-next-line no-undef
    delete session.privacy.echeckTransientToken2;
}


/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation) {
  //var configObject = require("~/cartridge/configuration/index.js");
  var collections = require("*/cartridge/scripts/util/collections");
  var Logger = require("dw/system/Logger");
  var logger = Logger.getLogger("Cybersource", "PaymentProcessor");
  var payments = require("../../../http/payments");
  var currentBasket = basket;
  var cardErrors = {};
  var serverErrors = [];
  //var email = basket.customerEmail;

  // Check if this is a BANK_TRANSFER (eCheck) payment
  var isBankTransfer =
    paymentInformation.ucPaymentMethod &&
    paymentInformation.ucPaymentMethod.value === "BANK_TRANSFER";

  // For eCheck/Bank Transfer - get transient token
  var transientToken = paymentInformation.ucPaymentToken.value;

  // Fallback to base implementation for traditional payment processing
  if (!isBankTransfer) {
    //@ts-ignore
    var baseResult = baseBasicCreditHook.Handle(basket, paymentInformation);
    if (baseResult.error) {
      return baseResult;
    }
  }
  // Validate transient token before transaction
  if (!transientToken) {
    logger.error(
      "No transient token found for BANK_TRANSFER payment for basket: {0}",
      basket.UUID
    );
    serverErrors.push(
      Resource.msg("error.payment.token.missing", "error", null)
    );
    return {
      fieldErrors: cardErrors,
      serverErrors: serverErrors,
      error: true,
    };
  }

  try {
    Transaction.wrap(function () {
      // Clear existing payment instruments
      currentBasket.removeAllPaymentInstruments();
      var paymentInstruments = currentBasket.getPaymentInstruments(
        PaymentInstrument.METHOD_BANK_TRANSFER
      );

      collections.forEach(paymentInstruments, function (item) {
        currentBasket.removePaymentInstrument(item);
      });

      // Handle eCheck/Bank Transfer payment
      var paymentInstrument = currentBasket.createPaymentInstrument(
        PaymentInstrument.METHOD_BANK_TRANSFER,
        currentBasket.totalGrossPrice
      );

      // Store the transient token in session for later use in Authorize
      // Using helper function to handle tokens exceeding 2000 char limit
      storeTransientToken(transientToken);

      // Decode and store bank details in payment instrument
      var paymentDetails = payments.getPaymentDetails(transientToken);
      //@ts-ignore
      var routingNumber = paymentDetails.paymentInformation.bank.routingNumber;
      //@ts-ignore
      var accountNumber = paymentDetails.paymentInformation.bank.account.number;
      
      // Set bank details on payment instrument
      paymentInstrument.setBankRoutingNumber(routingNumber);
      paymentInstrument.setBankAccountNumber(accountNumber);
      //@ts-ignore
      paymentInstrument.setBankAccountHolder(currentBasket.billingAddress.fullName);
    });
    
    return {
      fieldErrors: cardErrors,
      serverErrors: serverErrors,
      error: false,
    };
  } catch (e) {
    logger.error(
      "Payment processing error for basket {0}: {1}",
      basket.UUID,
      e
    );
    serverErrors.push(
      Resource.msg("error.payment.not.valid", "checkout", null)
    );
    return {
      fieldErrors: [],
      serverErrors: serverErrors,
      error: true,
    };
  }
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor) {
    var payments = require("../../../http/payments");
  var serverErrors = [];
  var fieldErrors = {};
  var error = false;
  //@ts-ignore
  var order = OrderMgr.getOrder(orderNumber);
  var billingAddress = order.billingAddress;
  var shippingAddress = order.shipments[0].shippingAddress;
  var total = order.totalGrossPrice;
  //var paymentForm = server.forms.getForm("billing");
  // eslint-disable-next-line no-shadow
  var mapper = require("~/cartridge/scripts/util/mapper.js");
  var Logger = require("dw/system/Logger");
  var logger = Logger.getLogger("Cybersource", "PaymentAuthorization");

  var customerEmail = order.customerEmail;
  var currencyCode = order.currencyCode.toUpperCase();

  try {
    var lineItems = mapper.MapOrderLineItems(order.allLineItems, true);
    var result;

    // Process eCheck authorization

    // Get transient token from session (handles split tokens)
    var transientToken = getTransientToken();

    if (!transientToken) {
      logger.error(
        "eCheck transient token not found in session for order: {0}",
        orderNumber
      );
      throw new Error("eCheck payment token is missing");
    }

    // Call eCheck authorization
    //@ts-ignore
    result = payments.httpAuthorizeWithTransientToken(transientToken,customerEmail,orderNumber,total.value,currencyCode,billingAddress,lineItems,shippingAddress,true);

    // Clear transient token from session after use (clears both parts if split)
    clearTransientToken();

    Transaction.wrap(function () {
      // eslint-disable-next-line no-undef
      session.privacy.orderStatus = result.status;
      //@ts-ignore
      paymentInstrument.paymentTransaction.setTransactionID(result.id);
      //@ts-ignore
      paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);
      // eCheck payment details
      //@ts-ignore
      paymentInstrument.paymentTransaction.custom.paymentDetails =
        "eCheck - Account:" +
        paymentInstrument.bankAccountNumber.substring(
          paymentInstrument.bankAccountNumber.length - 4
        ) +
        ", Holder: " +
        paymentInstrument.bankAccountHolder;
    });
  } catch (e) {
    error = true;
    var errorData = {};
    if (typeof e === "object" && e !== null) {
      if ("message" in e) {
        errorData.message = e.message;
      }
      if ("details" in e) {
        errorData.details = e.details;
      }
    }
    serverErrors.push(Resource.msg("error.technical", "checkout", null));
    logger.error('Authorization error for order {0}: {1}', orderNumber, JSON.stringify(errorData));
  }
  return {
    fieldErrors: fieldErrors,
    serverErrors: serverErrors,
    error: error,
  };
}

var overrides = {};
var configObject = require("~/cartridge/configuration/index.js");

if (configObject.cartridgeEnabled) {
  overrides.Authorize = Authorize;
  overrides.Handle = Handle;
}
// Register overrides
var CreditProcessorExport = {};
var keys = Object.keys(baseBasicCreditHook);
var overrideKey = Object.keys(overrides);
for (var i = 0; i < keys.length; i++) {
  var key = keys[i];
  if (overrideKey.indexOf(key) >= 0) {
    CreditProcessorExport[key] = overrides[key];
  } else {
    CreditProcessorExport[key] = baseBasicCreditHook[key];
  }
}

module.exports = CreditProcessorExport;
 