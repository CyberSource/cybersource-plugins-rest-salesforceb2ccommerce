/* eslint-disable no-plusplus */

"use strict";

var BaseCreditFormProcessor = require("app_storefront_base/cartridge/scripts/hooks/payment/processor/default_form_processor.js");
var configObject = require("~/cartridge/configuration/index.js");

/**
 * Verifies the required information for billing form is provided.
 * @param {Object} req - The request object
 * @param {Object} paymentForm - the payment form
 * @param {Object} viewFormData - object contains billing form data
 * @returns {Object} an object that has error information or payment information
 */
function processForm(req, paymentForm, viewFormData) {
  var Resource = require("dw/web/Resource");
  var Logger = require("dw/system/Logger");
  var viewData = viewFormData;
  var fieldErrors = {};
  var serverErrors = [];

  try {
    // Validate that creditCardFields exists
    if (!paymentForm.creditCardFields) {
      serverErrors.push(Resource.msg("uc.error.general", "payments", null));
      return {
        error: true,
        fieldErrors: fieldErrors,
        serverErrors: serverErrors
      };
    }

    // Validate required fields
    if (!paymentForm.creditCardFields.ucpaymenttoken || 
        !paymentForm.creditCardFields.ucpaymenttoken.htmlValue) {
      fieldErrors.ucPaymentToken = Resource.msg("uc.error.general", "payments", null);
    }

    if (!paymentForm.creditCardFields.ucpaymentmethod || 
        !paymentForm.creditCardFields.ucpaymentmethod.htmlValue) {
      fieldErrors.ucPaymentMethod = Resource.msg("uc.error.general", "payments", null);
    }

    // Return error if validation fails
    if (Object.keys(fieldErrors).length > 0) {
      return {
        error: true,
        fieldErrors: fieldErrors,
        serverErrors: serverErrors
      };
    }

    // Handle UC eCheck/Bank Transfer payment
    viewData.paymentMethod = {
      value: paymentForm.paymentMethod.htmlValue,
      htmlName: paymentForm.paymentMethod.htmlName
    };

    viewData.paymentInformation = {
      ucPaymentMethod: {
        value: paymentForm.creditCardFields.ucpaymentmethod.htmlValue || "BANK_TRANSFER",
        htmlName: paymentForm.creditCardFields.ucpaymentmethod.htmlName
      },
      ucPaymentToken: {
        value: paymentForm.creditCardFields.ucpaymenttoken.htmlValue,
        htmlName: paymentForm.creditCardFields.ucpaymenttoken.htmlName
      }
    };

    // eCheck doesn't support save card
    viewData.saveCard = false;

    return {
      error: false,
      viewData: viewData
    };
  } catch (e) {
    var logger = Logger.getLogger("Cybersource", "BankTransferFormProcessor");
    var errorMessage = (e instanceof Error) ? e.message : String(e);
    logger.error("Unexpected error in processForm for bank transfer: {0}", errorMessage);
    
    return {
      error: true,
      fieldErrors: {},
      serverErrors: [Resource.msg("uc.error.general", "payments", null)]
    };
  }
}

function savePaymentInformation() {
  // No implementation needed for Bank Transfer/eCheck
  // Payment instruments are not saved to wallet for eCheck
}

var overrides = {};
if (configObject.cartridgeEnabled && configObject.unifiedCheckoutEnabled) {
  overrides.processForm = processForm;
  overrides.savePaymentInformation = savePaymentInformation;
}

// Register overrides
var CreditFormProcessorExport = {};
var keys = Object.keys(BaseCreditFormProcessor);
var overrideKey = Object.keys(overrides);
for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (overrideKey.indexOf(key) >= 0) {
        CreditFormProcessorExport[key] = overrides[key];
    } else {
        CreditFormProcessorExport[key] = BaseCreditFormProcessor[key];
    }
}

module.exports = CreditFormProcessorExport;
