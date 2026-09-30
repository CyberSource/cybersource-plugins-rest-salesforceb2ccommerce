'use strict';
/**
 * Helper functions for Unified Checkout payment processing
 */

var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var logger = Logger.getLogger('VisaAcceptance', 'UCPaymentHelper');

// ============================================================================
// Token Processing Functions
// ============================================================================

/**
 * Process UC payment token and populate basket with billing/shipping addresses
 * @param {string} token - UC JWT token
 * @returns {Object} Payment details from UC API
 */
function processUCToken(token) {
    var payments = require('~/cartridge/scripts/http/payments.js');

    if (!token) {
        throw new Error('UC payment token is required');
    }

    var paymentDetails;
    try {
        paymentDetails = payments.getPaymentDetails(token);
    } catch (e) {
        var errorMsg = (e instanceof Error) ? e.message : String(e);
        throw new Error('Failed to retrieve payment details from Unified Checkout: ' + errorMsg);
    }

    return paymentDetails;
}

/**
 * Populate basket addresses from UC payment details
 * Only populates if addresses are empty (minicart flow)
 * Normal checkout flow already has addresses populated before form processor
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentDetails - Payment details from UC API
 * @param {Object} paymentForm - Payment form object
 */
function populateBasketAddresses(basket, paymentDetails, paymentForm) {
    var shipment = basket.getDefaultShipment();
    var isEmailRequired = empty(basket.getCustomerEmail()) || empty(basket.customerEmail) || basket.getCustomerEmail() === 'undefined' || basket.customerEmail === 'undefined';

    Transaction.wrap(function () {
        var shippingAddress = shipment.createShippingAddress();

        var shipTo = paymentDetails.orderInformation.shipTo;
        shippingAddress.setFirstName(shipTo.firstName);
        shippingAddress.setLastName(shipTo.lastName);
        shippingAddress.setAddress1(shipTo.address1);
        if (!empty(shipTo.address2)) {
            shippingAddress.setAddress2(shipTo.address2);
        }
        shippingAddress.setCity(shipTo.locality);
        shippingAddress.setPostalCode(shipTo.postalCode);
        shippingAddress.setCountryCode(shipTo.country);
        shippingAddress.setStateCode(shipTo.administrativeArea);
        if (shipTo.phoneNumber) {
            shippingAddress.setPhone(shipTo.phoneNumber);
        }

        // Populate billing address
        var billingAddress = basket.createBillingAddress();
        var billTo = paymentDetails.orderInformation.billTo;
        billingAddress.setFirstName(billTo.firstName);
        billingAddress.setLastName(billTo.lastName);
        billingAddress.setAddress1(billTo.address1);
        if (!empty(billTo.address2)) {
            billingAddress.setAddress2(billTo.address2);
        }
        billingAddress.setCity(billTo.locality);
        billingAddress.setPostalCode(billTo.postalCode);
        billingAddress.setCountryCode(billTo.country);
        billingAddress.setStateCode(billTo.administrativeArea);
        billingAddress.setPhone(billTo.phoneNumber);
        if (isEmailRequired) {
            basket.setCustomerEmail(billTo.email);
        }
        // If shipping phone is empty, copy billing phone to shipping
        if (empty(shipTo.phoneNumber)) {
            if (billTo.phoneNumber) {
                shippingAddress.setPhone(billTo.phoneNumber);
            }
        }
        // Always update paymentForm billing fields if provided
        if (paymentForm && paymentForm.addressFields) {
            paymentForm.addressFields.firstName.value = billTo.firstName;
            paymentForm.addressFields.lastName.value = billTo.lastName;
            paymentForm.addressFields.address1.value = billTo.address1;
            if (!empty(billTo.address2)) {
                paymentForm.addressFields.address2.value = billTo.address2;
            }
            paymentForm.addressFields.city.value = billTo.locality;
            paymentForm.addressFields.postalCode.value = billTo.postalCode;
            paymentForm.addressFields.country.value = billTo.country;
            if (paymentForm.addressFields.states && billTo.administrativeArea) {
                paymentForm.addressFields.states.stateCode.value = billTo.administrativeArea;
            }
            if (paymentForm.contactInfoFields && billTo.phoneNumber) {
                paymentForm.contactInfoFields.phone.value = billTo.phoneNumber;
            }
        }
    });
}

/**
 * Update viewData object from populated payment form
 * @param {Object} paymentForm - Payment form object (already populated)
 * @param {Object} viewData - Existing viewData object to update
 * @returns {Object} Updated viewData object
 */
function updateViewDataFromForm(paymentForm, viewData) {
    var updatedViewData = viewData || {};

    if (paymentForm && paymentForm.addressFields) {
        updatedViewData.address = {
            firstName: { value: paymentForm.addressFields.firstName.value },
            lastName: { value: paymentForm.addressFields.lastName.value },
            address1: { value: paymentForm.addressFields.address1.value },
            address2: { value: paymentForm.addressFields.address2.value },
            city: { value: paymentForm.addressFields.city.value },
            postalCode: { value: paymentForm.addressFields.postalCode.value },
            countryCode: { value: paymentForm.addressFields.country.value }
        };

        if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
            updatedViewData.address.stateCode = { value: paymentForm.addressFields.states.stateCode.value };
        }
    }

    if (paymentForm && paymentForm.contactInfoFields) {
        updatedViewData.phone = { value: paymentForm.contactInfoFields.phone.value };
    }

    return updatedViewData;
}

/**
 * Populate basket addresses from getPaymentDetails API response
 * Simplified version for PlaceOrderDirect flow (no paymentForm needed)
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} paymentDetails - Payment details from getPaymentDetails API
 * @param {Object} TransactionObj - DW Transaction object
 */
function populateBasketAddressesFromPaymentDetails(basket, paymentDetails, TransactionObj) {
    if (!paymentDetails || !paymentDetails.orderInformation) {
        logger.warn('populateBasketAddressesFromPaymentDetails: No orderInformation in paymentDetails');
        return;
    }

    var orderInfo = paymentDetails.orderInformation;
    var shipment = basket.getDefaultShipment();

    TransactionObj.wrap(function () {
        // Populate shipping address from shipTo, falling back to billTo when the
        // response carries no shipTo. E-wallet flows differ in what they return:
        // Venmo sends shipTo but no billTo, PayPal sends billTo but no shipTo. This
        // mirrors the billTo->shipTo fallback below so a shippable address is created
        // in both cases. NOTE: SFRA requires shippingAddress.address1 to be non-empty
        // (ensureValidShipments); if the wallet's address omits the street, the
        // shipment is still invalid and the source address must be completed upstream.
        var shipTo = orderInfo.shipTo || orderInfo.billTo;
        if (shipTo && !shipment.shippingAddress) {
            var shippingAddress = shipment.createShippingAddress();

            if (shipTo.firstName) shippingAddress.setFirstName(shipTo.firstName);
            if (shipTo.lastName) shippingAddress.setLastName(shipTo.lastName);
            if (shipTo.address1) shippingAddress.setAddress1(shipTo.address1);
            if (shipTo.address2) shippingAddress.setAddress2(shipTo.address2);
            if (shipTo.locality) shippingAddress.setCity(shipTo.locality);
            if (shipTo.postalCode) shippingAddress.setPostalCode(shipTo.postalCode);
            if (shipTo.country) shippingAddress.setCountryCode(shipTo.country);
            if (shipTo.administrativeArea) shippingAddress.setStateCode(shipTo.administrativeArea);
            if (shipTo.phoneNumber) shippingAddress.setPhone(shipTo.phoneNumber);
        }

        // Populate billing address from billTo, falling back to shipTo when the
        // response carries no billTo. E-wallet flows (e.g. Venmo/EWALLET) return a
        // shipping address from the wallet but no separate billing address, so the
        // wallet's shipTo is treated as the payer-of-record for billing. Without this
        // fallback the later "billing address exists" check fails with
        // error.no.billing.address for those payment types.
        var billTo = orderInfo.billTo || orderInfo.shipTo;
        if (billTo && !basket.billingAddress) {
            var billingAddress = basket.createBillingAddress();

            if (billTo.firstName) billingAddress.setFirstName(billTo.firstName);
            if (billTo.lastName) billingAddress.setLastName(billTo.lastName);
            if (billTo.address1) billingAddress.setAddress1(billTo.address1);
            if (billTo.address2) billingAddress.setAddress2(billTo.address2);
            if (billTo.locality) billingAddress.setCity(billTo.locality);
            if (billTo.postalCode) billingAddress.setPostalCode(billTo.postalCode);
            if (billTo.country) billingAddress.setCountryCode(billTo.country);
            if (billTo.administrativeArea) billingAddress.setStateCode(billTo.administrativeArea);
            if (billTo.phoneNumber) billingAddress.setPhone(billTo.phoneNumber);

            if (billTo.email && !basket.customerEmail) {
                basket.setCustomerEmail(billTo.email);
            }
        }

        // Venmo/e-wallet getPaymentDetails responses carry neither phoneNumber nor
        // email, so the billing address and basket email above stay empty for the
        // minicart flow. Fall back to the logged-in customer's profile so the order
        // confirmation shows the shopper's real phone/email. Guests have no profile,
        // so these remain empty and are suppressed at render time.
        var customer = basket.getCustomer();
        var profile = (customer && customer.profile) || null;
        if (profile) {
            var billingAddr = basket.billingAddress;
            if (billingAddr && !billingAddr.phone && profile.phoneHome) {
                billingAddr.setPhone(profile.phoneHome);
            }
            if (!basket.customerEmail && profile.email) {
                basket.setCustomerEmail(profile.email);
            }
        }

        // If shipping phone is empty but a phone is now available (billing or profile),
        // copy it so the shipment carries a contact number too.
        var shippingAddr = shipment.shippingAddress;
        var fallbackPhone = (billTo && billTo.phoneNumber) || (profile && profile.phoneHome) || '';
        if (shippingAddr && !shippingAddr.phone && fallbackPhone) {
            shippingAddr.setPhone(fallbackPhone);
        }
    });
}

/**
 * Make the transient-token amountDetails the source of truth for the order's tax/total.
 *
 * The UC widget authorizes the merchant-facing total it computed from the capture-context
 * request (including tax), and echoes it back in the transient token under
 * orderInformation.amountDetails. When SFCC's tax service computes a different value (e.g. a
 * sandbox with no tax provider), the storefront's Order-Confirm Total would not match what was
 * actually charged. This helper distributes the token's taxAmount across the basket's product
 * line items as a per-line tax RATE (SFCC's updateTax interprets its argument as a rate, not a
 * dollar amount), then recomputes basket aggregates via updateTotals() — which, unlike
 * calculateTotals, does NOT re-fire the dw.order.calculateTax hook (calculateAdjustments.js)
 * that would otherwise wipe these per-line values.
 *
 * @param {dw.order.Basket} basket - current basket
 * @param {Object} paymentDetails - decoded response from payments.getPaymentDetails
 * @param {Object} TransactionObj - dw/system/Transaction
 * @returns {boolean} - true if the override was applied, false on any no-op/guard
 */
function applyAmountDetailsFromPaymentDetails(basket, paymentDetails, TransactionObj) {
    if (!paymentDetails || !paymentDetails.orderInformation || !paymentDetails.orderInformation.amountDetails) {
        return false;
    }
    var amountDetails = paymentDetails.orderInformation.amountDetails;
    var tokenTaxAmount = parseFloat(amountDetails.taxAmount);
    var tokenTotalAmount = parseFloat(amountDetails.totalAmount);
    if (isNaN(tokenTaxAmount) || isNaN(tokenTotalAmount)) {
        return false;
    }

    // No churn if the storefront tax already matches the token (within a cent).
    var currentTax = basket.totalTax && basket.totalTax.available ? basket.totalTax.value : 0;
    if (Math.abs(currentTax - tokenTaxAmount) < 0.01) {
        return false;
    }

    var productLineItems = basket.getAllProductLineItems();
    if (!productLineItems || productLineItems.length === 0) {
        logger.warn('applyAmountDetailsFromPaymentDetails: basket has no product line items; cannot distribute tax');
        return false;
    }
    var pliArray = productLineItems.toArray();
    var Money = require('dw/value/Money');
    var currencyCode = basket.currencyCode;

    // Proportional weight base: sum of product-line gross prices.
    var totalGross = 0;
    for (var g = 0; g < pliArray.length; g++) {
        var grossMoney = pliArray[g].adjustedGrossPrice;
        if (grossMoney && grossMoney.available) {
            totalGross += grossMoney.value;
        }
    }
    if (totalGross <= 0) {
        return false;
    }

    TransactionObj.wrap(function () {
        var distributed = 0;
        var largestLine = null;
        var largestGross = -1;
        var largestLineShare = 0;
        var largestLineNet = 0;

        for (var i = 0; i < pliArray.length; i++) {
            var pli = pliArray[i];
            var lineGross = (pli.adjustedGrossPrice && pli.adjustedGrossPrice.available) ? pli.adjustedGrossPrice.value : 0;
            var lineNet = (pli.adjustedNetPrice && pli.adjustedNetPrice.available) ? pli.adjustedNetPrice.value : 0;

            // Per-line dollar share of the token tax, proportional to gross, rounded to cents.
            var share = Math.round((tokenTaxAmount * (lineGross / totalGross)) * 100) / 100;

            // Use the two-arg updateTax(rate, taxBasis) so we supply the basis explicitly:
            // tax = rate * basis = share, regardless of the site's net/gross taxation policy or
            // the "tax on adjusted price" preference (which otherwise make the one-arg basis
            // system-determined and not equal to adjustedNetPrice).
            var rate = lineNet > 0 ? (share / lineNet) : 0;
            pli.updateTax(rate, new Money(lineNet, currencyCode));
            distributed += share;

            if (lineGross > largestGross) {
                largestGross = lineGross;
                largestLine = pli;
                largestLineShare = share;
                largestLineNet = lineNet;
            }
        }

        // Reconcile rounding pennies on the largest line — again via the two-arg form with an
        // explicit basis so the corrected tax equals correctedShare exactly.
        var penny = Math.round((tokenTaxAmount - distributed) * 100) / 100;
        if (penny !== 0 && largestLine && largestLineNet > 0) {
            var correctedShare = largestLineShare + penny;
            largestLine.updateTax(correctedShare / largestLineNet, new Money(largestLineNet, currencyCode));
        }

        // Recompute basket aggregates from line-item state WITHOUT re-firing the calculate hooks.
        basket.updateTotals();
    });

    return true;
}

// ============================================================================
// Card Type Mapping Functions
// ============================================================================

/**
 * Map Visa Acceptance card type code to readable name
 * @param {string} cardTypeCode - Visa Acceptance card type code (e.g., '001' for Visa)
 * @returns {string} - Readable card type name
 */
function mapCardType(cardTypeCode) {
    if (!cardTypeCode) return '';

    var cardTypeMap = {
        '001': 'Visa',
        '002': 'Master Card',
        '003': 'Amex',
        '004': 'Discover',
        '005': 'DinersClub',
        '006': 'Carte Blanche',
        '007': 'JCB',
        '042': 'Maestro',
        '062': 'China UnionPay',
        '036': 'CartesBancaires',
        '054': 'Elo',
        '040': 'UATP',
        '044': 'Korean Card',
        '046': 'JCrew',
        '070': 'EFTPOS',
        '067': 'Meeza',
        '060': 'Mada',
        '058': 'Carnet',
        '065': 'Korean Card',
        '068': 'PayPak',
        '081': 'Jaywan'
    };

    if (cardTypeMap[cardTypeCode]) {
        return cardTypeMap[cardTypeCode];
    }

    var upperCode = cardTypeCode.toString().toUpperCase();
    var nameMap = {
        'VISA': 'Visa',
        'MASTERCARD': 'Master Card',
        'MASTER CARD': 'Master Card',
        'AMEX': 'Amex',
        'AMERICAN EXPRESS': 'Amex',
        'DISCOVER': 'Discover',
        'JCB': 'JCB',
        'DINERS': 'DinersClub',
        'DINERSCLUB': 'DinersClub',
        'MAESTRO': 'Maestro',
        'UNIONPAY': 'China UnionPay',
        'CUP': 'China UnionPay',
        'CARTESBANCAIRES': 'CartesBancaires',
        'CARTES BANCAIRES': 'CartesBancaires',
        'ELO': 'Elo',
        'EFTPOS': 'EFTPOS',
        'JCREW': 'JCrew',
        'CARNET': 'Carnet',
        'MADA': 'Mada',
        'MEEZA': 'Meeza',
        'JAYWAN': 'Jaywan',
        'UATP': 'UATP',
        'PAYPAK': 'PayPak',
        'KCP': 'Korean Card',
        'KSCP': 'Korean Card'
    };

    return nameMap[upperCode] || cardTypeCode;
}

// ============================================================================
// JWT Decoding Functions
// ============================================================================

/**
 * Decode JWT payload (base64url decode)
 * @param {string} token - JWT token string
 * @returns {Object|null} - Decoded payload or null if invalid
 */
function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        var StringUtils = require('dw/util/StringUtils');
        var jsonPayload = decodeURIComponent(
            StringUtils.decodeBase64(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        logger.warn('Failed to decode JWT payload: {0}', e.message);
        return null;
    }
}

// ============================================================================
// Payment Method Detection Functions
// ============================================================================

var UC_PAYMENT_TYPE_TO_METHOD = {
    PANENTRY: 'CREDIT_CARD',
    CHECK: 'BANK_TRANSFER',
    PAYPAL: 'PAYPAL',
    VENMO: 'VENMO',
    PAZE: 'DW_PAZE',
    // Wallet safety-net (primary path is the auth-JWT paymentSolution code).
    APPLEPAY: 'DW_APPLE_PAY',
    GOOGLEPAY: 'DW_GOOGLE_PAY',
    CLICKTOPAY: 'CLICK_TO_PAY'
};

/**
 * Resolve the SFCC payment method for an owned UC payment type (alternate payment
 * methods, eCheck, PayPal, Venmo) from the transient token's metadata.paymentType.
 *
 * Returns null - so the caller defers to the result-JWT detection - when there is no
 * transient token, no paymentType, or the paymentType is not one we own (card / Google
 * Pay / Apple Pay / Click to Pay / PAN entry / Paze: different owners, unchanged).
 *
 * @param {string} transientToken - Transient token JWT from the SDK
 * @returns {string|null} - Logical payment method, or null to defer to result-JWT logic
 */
function resolveMethodFromTransient(transientToken) {
    if (!transientToken) {
        return null;
    }
    var payload = decodeJwtPayload(transientToken);
    var paymentType = payload && payload.metadata && payload.metadata.paymentType;
    if (!paymentType) {
        return null;
    }
    return UC_PAYMENT_TYPE_TO_METHOD[paymentType.toString().toUpperCase()] || null;
}

/**
 * Detect payment method from completeMandate JWT.
 *
 *
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @param {string} [transientToken] - Transient token JWT from the SDK; the primary signal
 *        for eCheck / PayPal / Venmo.
 * @returns {string} - Payment method ID
 */
function detectPaymentMethod(jwtPayload, transientToken) {
    var details = jwtPayload && jwtPayload.details;
    var paymentInfo = details && details.paymentInformation;

    if (paymentInfo && paymentInfo.bank) {
        return 'BANK_TRANSFER';
    }

    // Alternate payment methods carry details.paymentInformation.paymentType.
    var altMethod = resolveMethodFromTransient(transientToken);
    if (altMethod) {
        return altMethod;
    }

    var apm = getApmDescriptor(jwtPayload);
    if (apm && (apm.name || '').toLowerCase() === 'ewallet') {
        var methodLower = (apm.method || '').toLowerCase();
        if (methodLower === 'paypal') return 'PAYPAL';
        if (methodLower === 'venmo') return 'VENMO';
    }


    var processingInfo = details && details.processingInformation;
    var paymentSolution = processingInfo && processingInfo.paymentSolution;

    if (paymentSolution === '012') {
        return 'DW_GOOGLE_PAY';
    } else if (paymentSolution === '001') {
        return 'DW_APPLE_PAY';
    } else if (paymentSolution === '027') {
        return 'CLICK_TO_PAY';
    }


    // Card present (PAN entry / tokenized saved card / wallet-backed card).
    if (paymentInfo && (paymentInfo.card || paymentInfo.tokenizedCard)) {
        return 'CREDIT_CARD';
    }

    return 'CREDIT_CARD';
}


/**
 * Extract the eWallet descriptor from a completeMandate JWT.
 *
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {Object|null} - { name, method } both strings, or null for a card/wallet
 */
function getApmDescriptor(jwtPayload) {
    var details = jwtPayload && jwtPayload.details;
    var paymentInfo = details && details.paymentInformation;

    var paymentType = paymentInfo && paymentInfo.paymentType;
    if (paymentType) {
        var name = paymentType.name || '';
        var method = '';
        if (paymentType.method) {
            method = (typeof paymentType.method === 'string') ? paymentType.method : (paymentType.method.name || '');
        }
        if (name || method) {
            return { name: name, method: method };
        }
    }

    return null;
}

/**
 * Resolve a customer-facing display name for an eWallet payment method
 *
 * @param {Object} apmDescriptor - { name, method } from getApmDescriptor
 * @returns {string} - Display name (e.g. 'PayPal')
 */
function getApmDisplayName(apmDescriptor) {
    var displayNames = {
        PAZE: 'Paze',
        PAYPAL: 'PayPal',
        VENMO: 'Venmo'
    };
    if (!apmDescriptor) {
        return 'Alternate Payment';
    }
    var code = (apmDescriptor.method || '').toString().toUpperCase();
    if (displayNames[code]) {
        return displayNames[code];
    }
    return apmDescriptor.name || apmDescriptor.method || 'Alternate Payment';
}


// Logical method key (returned by detectPaymentMethod) -> processor ID used in
// the hook name 'app.payment.processor.<id>'. The processor IDs below match
// the hook entries registered in int_cybs_sfra_base/hooks.json. Authoritative
// source for routing is the JWT, not the BM PaymentMethod -> PaymentProcessor
// binding.
var METHOD_TO_PROCESSOR_ID = {
    CREDIT_CARD: 'payments_credit',
    BANK_TRANSFER: 'bank_transfer',
    DW_APPLE_PAY: 'payments_applepay',
    DW_GOOGLE_PAY: 'payments_googlepay',
    DW_PAZE: 'payments_paze',
    CLICK_TO_PAY: 'payments_click_to_pay',
    PAYPAL: 'payments_paypal',
    VENMO: 'payments_venmo'
};

/**
 * Resolve the processor hook key for a given logical payment method key.
 * @param {string} paymentMethodKey - Logical key from detectPaymentMethod (e.g. 'CREDIT_CARD', 'PAYPAL')
 * @returns {string|null} - Lower-cased processor ID for use in 'app.payment.processor.<id>', or null if unmapped
 */
function getProcessorIdForMethod(paymentMethodKey) {
    return METHOD_TO_PROCESSOR_ID[paymentMethodKey] || null;
}

/**
 * Extract bank details from a getPaymentDetails API response.
 * @param {Object} paymentDetails - Response from payments.getPaymentDetails(transientToken)
 * @param {Object} [billingAddress] - Optional billing address for accountHolder fallback
 * @returns {Object} - { routingNumber, accountNumber, accountHolder }
 */
function extractBankDetails(paymentDetails, billingAddress) {
    var bank = paymentDetails && paymentDetails.paymentInformation && paymentDetails.paymentInformation.bank;
    var routingNumber = bank && bank.routingNumber ? bank.routingNumber : '';
    var accountNumber = bank && bank.account && bank.account.number ? bank.account.number : '';
    var accountHolder = '';
    if (billingAddress && billingAddress.fullName) {
        accountHolder = billingAddress.fullName;
    }
    return {
        routingNumber: routingNumber,
        accountNumber: accountNumber,
        accountHolder: accountHolder
    };
}

/**
 * Extract eCheck bank details from the UC transient token.
 * Source: content.paymentInformation.bank.{account.{number,type,maskedValue}, routingNumber}.
 *
 * Visa Acceptance transient tokens use any of three shapes per field:
 *   - bare string ("121000358")
 *   - wrapped scalar ({ value: "121000358" } or { maskedValue: "xxxxxx1234" })
 *   - empty placeholder object ({}) when the field is declared in schema but unfilled
 * coerceTokenString flattens all three into a plain string or '' so downstream code is
 * safe to call .slice / .length on.
 */
function coerceTokenString(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
        if (typeof raw.value === 'string') return raw.value;
        if (typeof raw.maskedValue === 'string') return raw.maskedValue;
    }
    return '';
}

function extractBankDetailsFromTransient(transientToken, billingAddress) {
    var details = {
        routingNumber: '',
        maskedAccount: '',
        last4: '',
        accountHolder: ''
    };

    if (billingAddress) {
        var firstName = billingAddress.firstName || '';
        var lastName = billingAddress.lastName || '';
        if (firstName || lastName) {
            details.accountHolder = (firstName + ' ' + lastName).trim();
        }
    }

    if (!transientToken) {
        return details;
    }

    var payload = decodeJwtPayload(transientToken);
    var bank = payload && payload.content && payload.content.paymentInformation && payload.content.paymentInformation.bank;
    if (!bank) {
        return details;
    }

    details.routingNumber = coerceTokenString(bank.routingNumber);

    if (bank.account) {
        // Prefer maskedValue; fall back to number (may itself be masked, e.g. "xxxxxx1234").
        details.maskedAccount = coerceTokenString(bank.account.maskedValue)
            || coerceTokenString(bank.account.number);
        if (details.maskedAccount.length >= 4) {
            details.last4 = details.maskedAccount.slice(-4);
        }
    }

    return details;
}

/**
 * Resolve eCheck bank display details (routing number, masked account, last-4,
 * account holder) from the most reliable source available. Degrades gracefully
 * and NEVER throws, so it can't block order placement or the wallet save.
 *
 * Source precedence:
 *   1. Local decode of the UC transient token (billing name + any populated bank fields).
 *   2. TransientTokenData API (getPaymentDetails). Works for the NON-tokenized eCheck
 *      flow, where the transient token is still retrievable.
 *   3. TMS v1 payment-instrument retrieve, keyed by tokenInformation.paymentInstrument.id
 *      from the auth JWT. This is the fallback for the TOKENIZED (save-card) flow, where
 *      tokenization consumes the transient token and getTransactionForTransientToken
 *      returns 410 Gone. Bank fields live under _embedded.instrumentIdentifier.bankAccount;
 *      billTo carries the account holder name.
 *
 * @param {string} transientToken - UC transient token JWT from the SDK
 * @param {Object} jwtPayload - decoded completeMandate auth response (carries paymentInstrument.id)
 * @param {Object} billingAddress - order/basket billing address (fallback account holder)
 * @returns {{routingNumber:string, maskedAccount:string, last4:string, accountHolder:string}}
 */
function getEcheckBankDetails(transientToken, jwtPayload, billingAddress) {
    // 1. Local transient-token decode (also seeds accountHolder from the billing address;
    //    the bank fields here are usually schema placeholders).
    var details = extractBankDetailsFromTransient(transientToken, billingAddress);

    // 2. TransientTokenData API — the primary source and the ONLY call made for the
    //    non-tokenized eCheck flow. Track whether it actually failed (throws 410 in the
    //    tokenized flow) so we fall back to TMS only then, never on a successful lookup.
    var transientFailed = false;
    if (transientToken) {
        try {
            var payments = require('~/cartridge/scripts/http/payments');
            var pd = payments.getPaymentDetails(transientToken);
            var pdBank = pd && pd.paymentInformation && pd.paymentInformation.bank;
            if (pdBank) {
                if (!details.routingNumber) {
                    details.routingNumber = coerceTokenString(pdBank.routingNumber);
                }
                if (!details.last4 && pdBank.account) {
                    var pdNum = coerceTokenString(pdBank.account.maskedValue)
                        || coerceTokenString(pdBank.account.number);
                    if (pdNum) {
                        details.maskedAccount = pdNum;
                        if (pdNum.length >= 4) { details.last4 = pdNum.slice(-4); }
                    }
                }
            }
        } catch (e) {
            // Expected 410 for the tokenized flow — fall back to the TMS retrieve below.
            transientFailed = true;
            logger.warn('getEcheckBankDetails: transient getPaymentDetails failed: {0}', e.message || e);
        }
    }

    // 3. TMS v1 payment-instrument retrieve — used ONLY when the transient API failed and
    //    the auth JWT gave us a paymentInstrument id to key on (the tokenized save-card flow).
    var piId = jwtPayload && jwtPayload.details && jwtPayload.details.tokenInformation
        && jwtPayload.details.tokenInformation.paymentInstrument
        && jwtPayload.details.tokenInformation.paymentInstrument.id;
    if (transientFailed && piId) {
        try {
            var tokenManagement = require('~/cartridge/scripts/http/tokenManagement');
            var verdict = tokenManagement.httpRetrievePaymentInstrument(piId);
            if (verdict && verdict.status === 'updated' && verdict.data) {
                var iiBank = verdict.data._embedded
                    && verdict.data._embedded.instrumentIdentifier
                    && verdict.data._embedded.instrumentIdentifier.bankAccount;
                if (iiBank) {
                    if (!details.routingNumber) {
                        details.routingNumber = coerceTokenString(iiBank.routingNumber);
                    }
                    var tmsNum = coerceTokenString(iiBank.number);
                    if (!details.maskedAccount && tmsNum) {
                        details.maskedAccount = tmsNum;
                        var tail = tmsNum.slice(-4);
                        // TMS fully masks the account ("XXXX") for tokenized instruments;
                        // only treat the tail as a real last-4 when it contains a digit.
                        if (/\d/.test(tail)) { details.last4 = tail; }
                    }
                }
                if (!details.accountHolder && verdict.data.billTo) {
                    var bt = verdict.data.billTo;
                    var name = ((bt.firstName || '') + ' ' + (bt.lastName || '')).trim();
                    if (name) { details.accountHolder = name; }
                }
            }
        } catch (e) {
            logger.warn('getEcheckBankDetails: TMS retrieve failed: {0}', e.message || e);
        }
    }

    return details;
}

/**
 * Build the storefront payment-summary string for an eCheck order.
 * Shows the full routing number and the last-4 of the account, masked.
 */
function buildEcheckPaymentDetailsString(bankDetails) {
    if (!bankDetails) return '';
    if (bankDetails.routingNumber && bankDetails.last4) {
        return 'Routing: ' + bankDetails.routingNumber + ' · ••••' + bankDetails.last4;
    }
    if (bankDetails.last4) {
        return 'eCheck ••••' + bankDetails.last4;
    }
    if (bankDetails.routingNumber) {
        return 'Routing: ' + bankDetails.routingNumber;
    }
    return 'eCheck';
}

// ============================================================================
// Card Details Extraction Functions
// ============================================================================

/**
 * Extract card details from completeMandate JWT and transient token
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @param {string} transientToken - Transient token from SDK
 * @param {Object} billingAddress - Optional billing address object
 * @returns {Object} - Card details object
 */
function extractCardDetails(jwtPayload, transientToken, billingAddress) {
    var cardDetails = {
        cardTypeCode: '',
        cardTypeName: '',
        maskedNumber: '',
        expirationMonth: '',
        expirationYear: '',
        cardHolderName: ''
    };

    // Get cardholder name from billing address if provided
    if (billingAddress) {
        var firstName = billingAddress.firstName || '';
        var lastName = billingAddress.lastName || '';
        if (firstName || lastName) {
            cardDetails.cardHolderName = (firstName + ' ' + lastName).trim();
        }
    }

    // Get card type from completeMandate JWT
    if (jwtPayload.details && jwtPayload.details.paymentInformation) {
        var paymentInfoJwt = jwtPayload.details.paymentInformation;

        if (paymentInfoJwt.card && paymentInfoJwt.card.type) {
            cardDetails.cardTypeCode = paymentInfoJwt.card.type;
        }
        if (!cardDetails.cardTypeCode && paymentInfoJwt.tokenizedCard && paymentInfoJwt.tokenizedCard.type) {
            cardDetails.cardTypeCode = paymentInfoJwt.tokenizedCard.type;
        }

        if (paymentInfoJwt.tokenizedCard) {
            cardDetails.expirationMonth = paymentInfoJwt.tokenizedCard.expirationMonth || '';
            cardDetails.expirationYear = paymentInfoJwt.tokenizedCard.expirationYear || '';
        }
        if ((!cardDetails.expirationMonth || !cardDetails.expirationYear) && paymentInfoJwt.card) {
            cardDetails.expirationMonth = cardDetails.expirationMonth || paymentInfoJwt.card.expirationMonth || '';
            cardDetails.expirationYear = cardDetails.expirationYear || paymentInfoJwt.card.expirationYear || '';
        }
    }

    // Get details from transient token
    if (transientToken) {
        var transientPayload = decodeJwtPayload(transientToken);
        if (transientPayload && transientPayload.content && transientPayload.content.paymentInformation) {
            var transientPaymentInfo = transientPayload.content.paymentInformation;

            if (transientPaymentInfo.tokenizedCard && transientPaymentInfo.tokenizedCard.number) {
                var tokenizedNum = transientPaymentInfo.tokenizedCard.number;
                cardDetails.maskedNumber = tokenizedNum.maskedValue || tokenizedNum || '';
            }
            if (!cardDetails.maskedNumber && transientPaymentInfo.card && transientPaymentInfo.card.number) {
                var cardNum = transientPaymentInfo.card.number;
                cardDetails.maskedNumber = cardNum.maskedValue || cardNum || '';
            }

            if (!cardDetails.expirationMonth || !cardDetails.expirationYear) {
                if (transientPaymentInfo.card) {
                    var expMonth = transientPaymentInfo.card.expirationMonth;
                    var expYear = transientPaymentInfo.card.expirationYear;
                    cardDetails.expirationMonth = cardDetails.expirationMonth || (expMonth ? expMonth.value || expMonth : '');
                    cardDetails.expirationYear = cardDetails.expirationYear || (expYear ? expYear.value || expYear : '');
                }
                if (transientPaymentInfo.tokenizedCard) {
                    var tokExpMonth = transientPaymentInfo.tokenizedCard.expirationMonth;
                    var tokExpYear = transientPaymentInfo.tokenizedCard.expirationYear;
                    cardDetails.expirationMonth = cardDetails.expirationMonth || (tokExpMonth ? tokExpMonth.value || tokExpMonth : '');
                    cardDetails.expirationYear = cardDetails.expirationYear || (tokExpYear ? tokExpYear.value || tokExpYear : '');
                }
            }

            if (!cardDetails.cardTypeCode && transientPaymentInfo.card && transientPaymentInfo.card.type) {
                cardDetails.cardTypeCode = transientPaymentInfo.card.type.value || transientPaymentInfo.card.type || '';
            }
            if (!cardDetails.cardTypeCode && transientPaymentInfo.tokenizedCard && transientPaymentInfo.tokenizedCard.type) {
                cardDetails.cardTypeCode = transientPaymentInfo.tokenizedCard.type.value || transientPaymentInfo.tokenizedCard.type || '';
            }
        }
    }

    cardDetails.cardTypeName = mapCardType(cardDetails.cardTypeCode);
    return cardDetails;
}

/**
 * Build payment details string for display
 * @param {Object} cardDetails - Card details object
 * @returns {string} - Formatted payment details string
 */
function buildPaymentDetailsString(cardDetails) {
    if (cardDetails.maskedNumber && cardDetails.cardTypeName) {
        return cardDetails.maskedNumber + ', ' + cardDetails.cardTypeName;
    } else if (cardDetails.maskedNumber) {
        return cardDetails.maskedNumber;
    } else if (cardDetails.cardTypeName) {
        return cardDetails.cardTypeName;
    }
    return '';
}

/**
 * Update payment instrument with card details
 * @param {dw.order.PaymentInstrument} paymentInstrument - Payment instrument to update
 * @param {Object} cardDetails - Card details object
 * @param {boolean} isDigitalWallet - Whether payment is from Google Pay or Apple Pay
 */
function updatePaymentInstrumentCardDetails(paymentInstrument, cardDetails, isDigitalWallet) {
    if (cardDetails.cardHolderName && (isDigitalWallet || !paymentInstrument.creditCardHolder)) {
        paymentInstrument.setCreditCardHolder(cardDetails.cardHolderName);
    }
    if (cardDetails.maskedNumber && (isDigitalWallet || !paymentInstrument.creditCardNumber)) {
        paymentInstrument.setCreditCardNumber(cardDetails.maskedNumber);
    }
    if (cardDetails.cardTypeName && (isDigitalWallet || !paymentInstrument.creditCardType)) {
        paymentInstrument.setCreditCardType(cardDetails.cardTypeName);
    }
    if (cardDetails.expirationMonth && (isDigitalWallet || !paymentInstrument.creditCardExpirationMonth)) {
        paymentInstrument.setCreditCardExpirationMonth(parseInt(cardDetails.expirationMonth, 10));
    }
    if (cardDetails.expirationYear && (isDigitalWallet || !paymentInstrument.creditCardExpirationYear)) {
        paymentInstrument.setCreditCardExpirationYear(parseInt(cardDetails.expirationYear, 10));
    }
}

// ============================================================================
// Transaction Custom Attribute Functions
// ============================================================================

/**
 * Safely set custom attribute on payment transaction
 * @param {dw.order.PaymentTransaction} paymentTransaction - Payment transaction
 * @param {string} attributeName - Custom attribute name
 * @param {*} value - Value to set
 * @returns {boolean} - True if attribute was set
 */
function setTransactionCustomAttribute(paymentTransaction, attributeName, value) {
    if (!value) return false;
    try {
        if (attributeName in paymentTransaction.custom) {
            paymentTransaction.custom[attributeName] = value;
            return true;
        }
    } catch (e) {
        logger.debug('Custom attribute {0} not available on PaymentTransaction', attributeName);
    }
    return false;
}


/**
 * Safely set a custom attribute on a payment instrument. Mirrors
 * setTransactionCustomAttribute - no-ops (without throwing) when the attribute is not
 * defined in the system-object metadata, so alternate-payment-method recording does
 * not fail an order in an environment where the metadata has not been imported yet.
 *
 * @param {dw.order.PaymentInstrument} paymentInstrument - Payment instrument
 * @param {string} attributeName - Custom attribute name
 * @param {*} value - Value to set
 * @returns {boolean} - True if attribute was set
 */
function setInstrumentCustomAttribute(paymentInstrument, attributeName, value) {
    if (!value) return false;
    try {
        if (attributeName in paymentInstrument.custom) {
            paymentInstrument.custom[attributeName] = value;
            return true;
        }
    } catch (e) {
        logger.debug('Custom attribute {0} not available on PaymentInstrument', attributeName);
    }
    return false;
}


// ============================================================================
// Authorization Status Functions
// ============================================================================

/**
 * Check if authorization/capture status is valid for order placement
 * Handles both AUTH and CAPTURE (sale) transaction types
 *
 * PENDING is also the normal terminal state for asynchronous/redirect alternate
 * payment methods (PPRO bank transfers, some BNPL). The order is placed but left
 * NOTCONFIRMED and reconciled later by the webhook (WebhookNotification) when the
 * provider settles - SFCC has no request-time async to poll status here.
 *
 * @param {string} status - Status from completeMandate JWT
 * @returns {boolean} - True if status is valid for order placement
 */
function isValidAuthorizationStatus(status) {
    var validStatuses = [
        // AUTH statuses
        'AUTHORIZED',
        'AUTHORIZED_PENDING_REVIEW',
        'PENDING_REVIEW',
        // CAPTURE (sale) statuses
        'CAPTURED',
        'PARTIAL_CAPTURED',
        'PENDING',
        'COMPLETED',
        'SETTLED',
        'SETTLE_INITIATED'

    ];
    return validStatuses.indexOf(status) !== -1;
}

/**
 * Get error message based on authorization status
 * @param {string} status - Authorization status
 * @returns {string} - Error message
 */
function getAuthorizationErrorMessage(status) {
    var Resource = require('dw/web/Resource');
    if (status === 'DECLINED') {
        return Resource.msg('error.payment.declined', 'error', null);
    } else if (status === 'AUTHORIZED_RISK_DECLINED') {
        return Resource.msg('error.payment.risk.declined', 'error', null);
    }
    return Resource.msg('message.error.card.not.authorized', 'error', null);
}

// ============================================================================
// Capture Context Builder Functions
// ============================================================================

/**
 * Build billTo object from basket billing address
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object|null} - billTo object or null
 */
function buildBillToAddress(basket) {
    var billingAddress = basket.billingAddress;
    if (!billingAddress) return null;

    // UC v1 (ISV Phase 1): match the canonical billTo shape from Dan's reference payload —
    // firstName, lastName, email, address1, address2, locality, administrativeArea, postalCode,
    // country, phoneNumber, phoneType.
    var billTo = {
        firstName: billingAddress.firstName || '',
        lastName: billingAddress.lastName || '',
        address1: billingAddress.address1 || '',
        locality: billingAddress.city || '',
        administrativeArea: billingAddress.stateCode || '',
        postalCode: billingAddress.postalCode || '',
        country: billingAddress.countryCode ? billingAddress.countryCode.value.toUpperCase() : ''
    };
    if (basket.customerEmail) {
        billTo.email = basket.customerEmail;
    }
    if (billingAddress.address2) {
        billTo.address2 = billingAddress.address2;
    }
    if (billingAddress.phone) {
        billTo.phoneNumber = billingAddress.phone;
    }
    return billTo;
}

/**
 * Build a UC billTo object from a customer Address Book entry.
 * Used by the My Account save-card flow to prefill the Unified Checkout billing form.
 * @param {dw.customer.CustomerAddress} customerAddress - source address (preferred or first)
 * @param {string} email - customer profile email
 * @returns {Object|null} billTo object, or null when no address
 */
function buildBillToFromCustomerAddress(customerAddress, email) {
    if (!customerAddress) return null;

    return {
        firstName: customerAddress.firstName || '',
        lastName: customerAddress.lastName || '',
        email: email || '',
        address1: customerAddress.address1 || '',
        address2: customerAddress.address2 || '',
        locality: customerAddress.city || '',
        administrativeArea: customerAddress.stateCode || '',
        postalCode: customerAddress.postalCode || '',
        country: customerAddress.countryCode && customerAddress.countryCode.value
            ? customerAddress.countryCode.value.toUpperCase() : '',
        phoneNumber: customerAddress.phone || ''
    };
}

/**
 * Build a cardholder display name ("First Last") from a billTo object.
 * Tolerates a missing/partial billTo so callers can pass any of the UC billTo
 * sources (completeMandate JWT, transient-token transaction) directly.
 * @param {Object} billTo - billTo object with firstName/lastName (may be null/partial)
 * @returns {string} trimmed "First Last", or '' when no name is present
 */
function buildCardHolderName(billTo) {
    if (!billTo) return '';
    var firstName = billTo.firstName || '';
    var lastName = billTo.lastName || '';
    return (firstName + ' ' + lastName).trim();
}

/**
 * Map a UC billTo object to the plain address shape expected by SFRA's
 * addressHelpers (updateAddressFields / checkIfAddressStored / generateAddressName).
 * Translates UC field names: locality -> city, administrativeArea -> states.stateCode,
 * phoneNumber -> phone.
 * @param {Object} billTo - UC billTo (firstName, lastName, address1, address2, locality,
 *   administrativeArea, postalCode, country, phoneNumber); may be null/partial
 * @returns {Object|null} SFCC-shaped address object, or null when billTo is missing
 */
function mapUcBillToToSfccAddress(billTo) {
    if (!billTo) return null;
    return {
        firstName: billTo.firstName || '',
        lastName: billTo.lastName || '',
        address1: billTo.address1 || '',
        address2: billTo.address2 || '',
        city: billTo.locality || '',
        postalCode: billTo.postalCode || '',
        phone: billTo.phoneNumber || '',
        country: billTo.country || '',
        states: { stateCode: billTo.administrativeArea || '' }
    };
}

/**
 * Build shipTo object from basket shipping address
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object|null} - shipTo object or null
 */
function buildShipToAddress(basket) {
    var defaultShipment = basket.defaultShipment;
    var shippingAddress = defaultShipment ? defaultShipment.shippingAddress : null;
    if (!shippingAddress) return null;

    // UC v1 (ISV Phase 1): match Dan's reference payload — shipTo carries the address and
    // recipient name only. No phoneNumber, no email.
    return {
        firstName: shippingAddress.firstName || '',
        lastName: shippingAddress.lastName || '',
        address1: shippingAddress.address1 || '',
        address2: shippingAddress.address2 || '',
        locality: shippingAddress.city || '',
        administrativeArea: shippingAddress.stateCode || '',
        postalCode: shippingAddress.postalCode || '',
        country: shippingAddress.countryCode ? shippingAddress.countryCode.value.toUpperCase() : ''
    };
}

/**
 * Get the number of decimal places for a currency from BM configuration
 * Uses SFCC Currency API which reads from BM > Merchant Tools > Ordering > Currencies
 * @param {string} currencyCode - ISO 4217 currency code
 * @returns {number} - Number of decimal places (0, 2, or 3)
 */
function getCurrencyDecimalPlaces(currencyCode) {
    if (!currencyCode) return 2;

    var Currency = require('dw/util/Currency');

    try {
        var currency = Currency.getCurrency(currencyCode);
        if (currency) {
            return currency.getDefaultFractionDigits();
        }
    } catch (e) {
        logger.warn('getCurrencyDecimalPlaces: Error getting currency {0} - {1}', currencyCode, e.message);
    }

    // Default fallback if currency not found in BM
    return 2;
}

/**
 * Format amount with proper decimal places for currency
 * Uses BM currency configuration for decimal places (ISO 4217 compliant)
 * @param {number} amount - Amount value
 * @param {string} [currencyCode] - ISO 4217 currency code (defaults to 2 decimals if not provided)
 * @returns {string} - Formatted amount string
 */
function formatAmount(amount, currencyCode) {
    var decimals = getCurrencyDecimalPlaces(currencyCode);

    if (amount === null || amount === undefined) {
        return decimals === 0 ? '0' : Number(0).toFixed(decimals);
    }

    return decimals === 0 ? String(Math.round(Number(amount))) : Number(amount).toFixed(decimals);
}

/**
 * Sum the absolute discount from a collection of price adjustments (coupons/promotions).
 * @param {dw.util.Collection} priceAdjustments - adjustments on a line item or the basket
 * @returns {number} total discount amount (positive), 0 when none
 */
function sumPriceAdjustments(priceAdjustments) {
    var total = 0;
    if (!priceAdjustments) return total;
    var it = priceAdjustments.iterator();
    while (it.hasNext()) {
        total += Math.abs(it.next().price.value);
    }
    return total;
}

/**
 * Build line items array from basket for capture context
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Array} - Array of line item objects
 */
function buildLineItems(basket) {
    var lineItems = [];
    var allLineItems = basket.allLineItems;
    var currencyCode = basket.currencyCode;

    if (!allLineItems) return lineItems;

    for (var i = 0; i < allLineItems.length; i++) {
        var lineItem = allLineItems[i];
        var itemObject = null;

        // All line amounts are NET (tax-exclusive). Tax is sent separately in taxAmount.
        // amountDetails.totalAmount is the GROSS basket total, so:
        //   sum(line totalAmount) + sum(line taxAmount) === amountDetails.totalAmount.
        // Sending a gross (tax-inclusive) totalAmount here while ALSO sending taxAmount
        // double-counts tax, the totals stop reconciling, and wallets/APMs (PayPal, Venmo,
        // Google Pay) silently refuse to render. Only a zero-tax basket happened to work.
        if (lineItem instanceof dw.order.ProductLineItem) {
            // UC v1 (ISV Phase 1): canonical line-item shape. typeOfSupply '00' = goods.
            var product = lineItem.product;
            var productDescription = (product && product.shortDescription && product.shortDescription.markup) || lineItem.productName || '';
            // lineItems[].productDescription is capped at 30 chars in the UC v1 spec.
            productDescription = productDescription.substring(0, 30);
            itemObject = {
                productSku: lineItem.productID || '',
                productName: lineItem.productName || '',
                productDescription: productDescription,
                quantity: lineItem.quantityValue,
                unitPrice: formatAmount(lineItem.basePrice.value, currencyCode),
                totalAmount: formatAmount(lineItem.basePrice.value * lineItem.quantityValue, currencyCode),
                typeOfSupply: '00',
                taxAmount: formatAmount(lineItem.adjustedTax.value > 0 ? lineItem.adjustedTax.value / lineItem.quantityValue : 0, currencyCode)
            };

            // Product-level coupon applied to THIS line -> discountAmount. totalAmount stays
            // the list price (basePrice x qty); discountAmount carries the reduction.
            var productDiscount = sumPriceAdjustments(lineItem.priceAdjustments);
            if (productDiscount > 0) {
                itemObject.discountAmount = formatAmount(productDiscount, currencyCode);
            }
        } else if (lineItem instanceof dw.order.GiftCertificateLineItem) {
            // typeOfSupply '00' = goods.
            itemObject = {
                productSku: 'GIFT_CERTIFICATE',
                productName: 'GIFT_CERTIFICATE',
                productDescription: 'GIFT_CERTIFICATE',
                quantity: 1,
                unitPrice: formatAmount(lineItem.adjustedPrice.value, currencyCode),
                totalAmount: formatAmount(lineItem.adjustedPrice.value, currencyCode),
                typeOfSupply: '00',
                taxAmount: formatAmount(0, currencyCode)
            };
        } else if (lineItem instanceof dw.order.ShippingLineItem) {
            // Use the list (pre-discount) shipping price; a shipping-method coupon rides in
            // discountAmount. When no discount applies, basePrice === adjustedPrice. Skip a
            // line that costs nothing before any discount.
            if (lineItem.basePrice.value === 0) {
                continue;
            }
            // typeOfSupply '01' = shipping/services.
            itemObject = {
                productSku: lineItem.ID || 'SHIPPING',
                productName: lineItem.ID || 'SHIPPING',
                productDescription: 'SHIPPING',
                quantity: 1,
                unitPrice: formatAmount(lineItem.basePrice.value, currencyCode),
                totalAmount: formatAmount(lineItem.basePrice.value, currencyCode),
                typeOfSupply: '01',
                taxAmount: formatAmount(lineItem.adjustedTax ? lineItem.adjustedTax.value : 0, currencyCode)
            };
            // ShippingLineItem exposes no priceAdjustments collection; the shipping-method
            // discount is the reduction from the list (base) price to the adjusted price.
            var shippingDiscount = lineItem.basePrice.value - lineItem.adjustedPrice.value;
            if (shippingDiscount > 0) {
                itemObject.discountAmount = formatAmount(shippingDiscount, currencyCode);
            }
        } else if (lineItem instanceof dw.order.ProductShippingLineItem) {
            // typeOfSupply '01' = shipping/services.
            itemObject = {
                productSku: 'SHIPPING_SURCHARGE',
                productName: 'SHIPPING_SURCHARGE',
                productDescription: 'SHIPPING_SURCHARGE',
                quantity: 1,
                unitPrice: formatAmount(lineItem.adjustedPrice.value, currencyCode),
                totalAmount: formatAmount(lineItem.adjustedPrice.value, currencyCode),
                typeOfSupply: '01',
                taxAmount: formatAmount(lineItem.adjustedTax ? lineItem.adjustedTax.value : 0, currencyCode)
            };
        }

        if (itemObject) {
            lineItems.push(itemObject);
        }
    }

    return lineItems;
}

/**
 * Build completeMandate object based on configuration
 * 
 * UC v1: Only TMS tokenTypes configuration is passed.
 * Other configuration (type, decisionManager, tms.tokenCreate, consumerAuthentication)
 * is managed via EBC (Enterprise Business Center) and should NOT be overridden.
 * 
 * Available tokenTypes:
 * - customer: Creates a TMS customer token
 * - paymentInstrument: Creates a payment instrument token
 * - instrumentIdentifier: Creates an instrument identifier token
 * - shippingAddress: Creates a shipping address token
 * 
 * @param {Object} configObject - Configuration object from BM (unused in UC v1)
 * @param {boolean} isTokenizationEnabled - Whether tokenization is enabled (unused in UC v1)
 * @param {boolean} isRegisteredCustomer - Whether customer is registered (unused in UC v1)
 * @param {dw.customer.Customer} customer - Customer object (unused in UC v1)
 * @returns {Object} - completeMandate object with TMS tokenTypes
 */
function buildCompleteMandate(configObject, isTokenizationEnabled, isRegisteredCustomer, customer) {
    // UC v1: Return completeMandate with TMS tokenTypes
    // tokenTypes specifies which tokens to create when cardholder opts to save card
    return {
        tms: {
            tokenTypes: ['customer', 'paymentInstrument', 'instrumentIdentifier']
        }
    };
}

/**
 * Build transientTokenResponseOptions for the UC capture context, honoring the
 * VisaAcceptance_UnifiedCheckout_AllowedCardPrefix preference (BIN return mode):
 *   'Six'   -> field omitted entirely    (Visa Acceptance defaults to a 6-digit BIN)
 *   'Eight' -> includeCardPrefix: true   (8-digit BIN)
 *   unselected (null/empty) -> includeCardPrefix: false (no BIN in the transient token)
 * Any other or legacy value (including a leftover boolean from the old toggle) is
 * treated as the unselected case.
 * @param {Object} configObject - resolved configuration (configuration/index)
 * @returns {Object} - transientTokenResponseOptions object for the capture-context request
 */
function buildTransientTokenResponseOptions(configObject) {
    var rawMode = configObject && configObject.unifiedCheckoutAllowedCardPrefix;
    // getCustomPreferenceValue returns a Java-backed value (typeof "object"), which is never
    // strictly equal to a native JS string literal. Coerce to a native string before comparing,
    // guarding null/undefined/empty so we don't produce the literal "null"/"undefined".
    var mode = (rawMode === null || rawMode === undefined || rawMode === '') ? '' : String(rawMode);
    if (mode === 'Six') {
        // Omit includeCardPrefix so Visa Acceptance returns the default 6-digit BIN.
        return {};
    }
    if (mode === 'Eight') {
        return { includeCardPrefix: true };
    }
    // Unselected (null/empty) and any unexpected/legacy value: suppress the BIN.
    return { includeCardPrefix: false };
}

/**
 * Build orderInformation object for capture context
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object} - orderInformation object
 */
function buildOrderInformation(basket) {
    var currencyCode = basket.currencyCode;
    // UC v1 (ISV Phase 1): mirror canonical amountDetails — totalAmount, currency, taxAmount.
    var totalTax = basket.totalTax && basket.totalTax.value > 0 ? basket.totalTax.value : 0;
    var orderInformation = {
        amountDetails: {
            totalAmount: formatAmount(basket.totalGrossPrice.value, currencyCode),
            currency: currencyCode,
            taxAmount: formatAmount(totalTax, currencyCode)
        }
    };

    // Order-level coupon (whole-basket discount) -> top-level discountAmount.
    var orderDiscount = sumPriceAdjustments(basket.priceAdjustments);
    if (orderDiscount > 0) {
        orderInformation.amountDetails.discountAmount = formatAmount(orderDiscount, currencyCode);
    }

    // Populate billTo/shipTo whenever the basket has them, for both checkout and
    // Express Pay flows, so the capture-context mirrors the data Visa Acceptance needs to
    // render APMs and wallets. The build helpers return null when no address exists.
    var billTo = buildBillToAddress(basket);
    if (billTo) {
        orderInformation.billTo = billTo;
    }

    var shipTo = buildShipToAddress(basket);
    if (shipTo) {
        orderInformation.shipTo = shipTo;
    }

    var lineItems = buildLineItems(basket);
    if (lineItems.length > 0) {
        orderInformation.lineItems = lineItems;
    }

    return orderInformation;
}

// ============================================================================
// TMS Token Saving Functions
// ============================================================================

/**
 * Resolve the existing Visa Acceptance TMS customer token id stored on the customer's
 * profile (Profile.custom.customerID). This is the id used to attach newly-saved
 * cards to a single customer instead of minting a new customer per card.
 * @param {dw.customer.Customer} customer - customer object
 * @returns {string|null} the stored customerID, or null when absent / not resolvable
 */
function getExistingTmsCustomerId(customer) {
    if (!customer || typeof customer.getProfile !== 'function') {
        return null;
    }
    var profile = customer.getProfile();
    if (!profile || !profile.custom || !profile.custom.customerID) {
        return null;
    }
    return profile.custom.customerID;
}

/**
 * Build the completeMandate.tms.tokenTypes array for a UC capture context.
 * When the account already has a TMS customer token, the 'customer' type is
 * omitted so Visa Acceptance attaches the new instrument under the existing customer
 * (mirrors the Non-UC actionTokenTypes behavior). When there is no customer yet
 * (first saved card), 'customer' is requested so Visa Acceptance mints one.
 * @param {string|null} existingCustomerId - stored Profile.custom.customerID, or null
 * @returns {string[]} tokenTypes array
 */
function buildTmsTokenTypes(existingCustomerId) {
    if (existingCustomerId) {
        return ['paymentInstrument', 'instrumentIdentifier'];
    }
    return ['customer', 'paymentInstrument', 'instrumentIdentifier'];
}

/**
 * Build the serialized wallet token string stored in CustomerPaymentInstrument.creditCardToken.
 * Format: "<instrumentIdentifierId>-<paymentInstrumentId>-flex[-<customerId>]".
 * The '-flex-' marker is intentional and shared with Unified Checkout (do not strip it).
 * @param {string} instrumentIdentifierId - Visa Acceptance instrumentIdentifier id
 * @param {string} paymentInstrumentId - Visa Acceptance paymentInstrument id
 * @param {string|null} customerId - TMS customer id to append, or falsy to omit
 * @returns {string} serialized token
 */
function buildSerializedToken(instrumentIdentifierId, paymentInstrumentId, customerId) {
    var segments = [instrumentIdentifierId, paymentInstrumentId, 'flex'];
    if (customerId) {
        segments.push(customerId);
    }
    return segments.join('-');
}

/**
 * Determine whether the consumer explicitly opted in to saving the card, based on the
 * Unified Checkout transient token. The SDK records the "save card" checkbox state at
 * metadata.consumerPreference.saveCard. Only an explicit boolean true counts as opt-in;
 * a missing/undecodable token, a missing consumerPreference, or saveCard === false all
 * mean "do not save".
 *
 * @param {string} transientToken - Transient token JWT from the SDK
 * @returns {boolean} - True only when metadata.consumerPreference.saveCard === true
 */
function didConsumerOptToSaveCard(transientToken) {
    if (!transientToken) {
        return false;
    }
    var payload = decodeJwtPayload(transientToken);
    return !!(payload && payload.metadata && payload.metadata.consumerPreference &&
        payload.metadata.consumerPreference.saveCard === true);
}

/**
 * Check if user opted to save card in UC completeMandate response
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {boolean} - True if tokenInformation exists
 */
function didUserRequestSaveCard(jwtPayload) {
    return !!(jwtPayload.details && jwtPayload.details.tokenInformation);
}

/**
 * Extract token information from completeMandate JWT response
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {Object|null} - Token information object or null
 */
function extractTokenInformation(jwtPayload) {
    if (!jwtPayload.details || !jwtPayload.details.tokenInformation) {
        return null;
    }
    return jwtPayload.details.tokenInformation;
}

/**
 * Find an existing saved credit card that belongs to the given Visa Acceptance
 * instrumentIdentifier. The serialized token always begins with the
 * instrumentIdentifier id ("<iid>-<piid>-flex[-<customerId>]"), so a card matches
 * when the FIRST hyphen-separated segment of its token equals that id. Using the
 * exact segment (rather than a string prefix) avoids false matches between ids where
 * one is a prefix of another.
 * @param {dw.customer.Wallet} wallet - customer wallet
 * @param {string} instrumentIdentifierId - Visa Acceptance instrumentIdentifier id
 * @returns {dw.customer.CustomerPaymentInstrument|null} matching card or null
 */
function findCreditCardByInstrumentIdentifier(wallet, instrumentIdentifierId) {
    if (!wallet || !instrumentIdentifierId) {
        return null;
    }
    var paymentInstruments = wallet.getPaymentInstruments().toArray();
    for (var i = 0; i < paymentInstruments.length; i++) {
        var pi = paymentInstruments[i];
        var existingToken = pi.creditCardToken;
        if (existingToken && existingToken.split('-')[0] === instrumentIdentifierId) {
            return pi;
        }
    }
    return null;
}

/**
 * Saves a tokenized credit card to the wallet, de-duplicating by instrumentIdentifier.
 *
 * SFCC permanently masks a persisted CustomerPaymentInstrument; once masked, its card
 * setters throw "Payment Instrument Info attributes are already masked permanently". So
 * when a card with the same instrumentIdentifier already exists we REPLACE it (create a
 * fresh instrument, then remove the old one) inside a single transaction — rather than
 * mutating the masked record — carrying over any missing details and the default
 * (custom.isDefault) flag.
 *
 * @param {dw.customer.Wallet} wallet - customer wallet
 * @param {string} serializedToken - serialized TMS token to store
 * @param {Object} cardDetails - { cardHolderName, cardTypeName, maskedNumber, expirationMonth, expirationYear, echeckRoutingNumber }
 * @param {string} instrumentIdentifierId - Visa Acceptance instrumentIdentifier id
 * @returns {Object} { uuid: <saved card UUID>, replacedExisting: <boolean> }
 */
function upsertCreditCard(wallet, serializedToken, cardDetails, instrumentIdentifierId) {
    var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
    var details = cardDetails || {};
    var existingPI = findCreditCardByInstrumentIdentifier(wallet, instrumentIdentifierId);

    var wasDefault = false;
    var holder = details.cardHolderName;
    var type = details.cardTypeName;
    var masked = details.maskedNumber;
    var expMonth = details.expirationMonth;
    var expYear = details.expirationYear;
    // eCheck-only: routing number lives on a custom attribute so the wallet selector
    // can render it without polluting creditCardNumber. Carry over from existing PI
    // when replacing (same masked-instrument-safe pattern used for the card fields).
    var routingNumber = details.echeckRoutingNumber || '';

    if (existingPI) {
        // Getters are safe on a masked instrument; carry over anything the new details
        // don't provide so the replacement record stays complete.
        try {
            wasDefault = !!(existingPI.custom && existingPI.custom.isDefault);
        } catch (e) {
            wasDefault = false;
        }
        holder = holder || existingPI.creditCardHolder;
        type = type || existingPI.creditCardType;
        masked = masked || existingPI.maskedCreditCardNumber;
        expMonth = expMonth || existingPI.creditCardExpirationMonth;
        expYear = expYear || existingPI.creditCardExpirationYear;
        if (!routingNumber) {
            try {
                routingNumber = (existingPI.custom && existingPI.custom.echeckRoutingNumber) || '';
            } catch (e) {
                routingNumber = '';
            }
        }
    }

    var savedUUID = null;
    Transaction.wrap(function () {
        var newPI = wallet.createPaymentInstrument(dwOrderPaymentInstrument.METHOD_CREDIT_CARD);
        if (holder) { newPI.setCreditCardHolder(holder); }
        if (type) { newPI.setCreditCardType(type); }
        if (masked) { newPI.setCreditCardNumber(masked); }
        if (expMonth) { newPI.setCreditCardExpirationMonth(parseInt(expMonth, 10)); }
        if (expYear) { newPI.setCreditCardExpirationYear(parseInt(expYear, 10)); }
        newPI.setCreditCardToken(serializedToken);
        if (wasDefault) {
            newPI.custom.isDefault = true;
        }
        // echeckRoutingNumber is a custom attribute on CustomerPaymentInstrument. Write it
        // directly (works once the metadata is imported) and catch the "Unknown dynamic
        // property" throw when it isn't, so a missing attribute can never abort the whole
        // wallet save. Avoid the `in` guard here: it can report false for a defined-but-unset
        // attribute on a freshly created instrument, which would silently skip the write.
        if (routingNumber) {
            try {
                newPI.custom.echeckRoutingNumber = routingNumber;
            } catch (e) {
                logger.warn('upsertCreditCard: echeckRoutingNumber not writable (is the metadata imported?): {0}', e.message || e);
            }
        }
        if (existingPI) {
            wallet.removePaymentInstrument(existingPI);
        }
        savedUUID = newPI.UUID;
    });

    return { uuid: savedUUID, replacedExisting: !!existingPI };
}

/**
 * Save TMS token to customer wallet from completeMandate response
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @param {Object} cardDetails - Card details object
 * @param {dw.customer.Customer} customer - Customer object
 * @param {string} transientToken - Transient token JWT from the SDK (carries the
 *   consumer's saveCard preference); the card is saved only when the consumer opted in
 * @returns {boolean} - True if token was saved successfully
 */
function saveTokenToWallet(jwtPayload, cardDetails, customer, transientToken) {
    if (!didConsumerOptToSaveCard(transientToken)) {
        return false;
    }

    if (!didUserRequestSaveCard(jwtPayload)) {
        return false;
    }

    if (!customer || !customer.isAuthenticated() || !customer.getProfile()) {
        return false;
    }

    var tokenInfo = extractTokenInformation(jwtPayload);
    if (!tokenInfo) {
        return false;
    }

    if (!tokenInfo.paymentInstrument || !tokenInfo.paymentInstrument.id ||
        !tokenInfo.instrumentIdentifier || !tokenInfo.instrumentIdentifier.id) {
        logger.warn('saveTokenToWallet: Missing required token fields');
        return false;
    }

    var CustomerMgr = require('dw/customer/CustomerMgr');

    try {
        var profile = customer.getProfile();
        var customerObj = CustomerMgr.getCustomerByCustomerNumber(profile.customerNo);


        var wallet = customerObj.profile.wallet;

        // Prefer the customer id the response echoes; otherwise fall back to the id already
        // stored on the profile. Subsequent saves omit the 'customer' token type, so the
        // response may not echo customer.id, but the card still belongs to the stored customer.
        var responseCustomerId = (tokenInfo.customer && tokenInfo.customer.id) ? tokenInfo.customer.id : null;
        var effectiveCustomerId = responseCustomerId || profile.custom.customerID || null;

        var serializedToken = buildSerializedToken(
            tokenInfo.instrumentIdentifier.id,
            tokenInfo.paymentInstrument.id,
            effectiveCustomerId
        );

        // First card on the account: persist the freshly-minted customer id for future saves.
        if (responseCustomerId && !profile.custom.customerID) {
            Transaction.wrap(function () {
                profile.custom.customerID = responseCustomerId;
            });
        }

        var upsertResult = upsertCreditCard(wallet, serializedToken, cardDetails, tokenInfo.instrumentIdentifier.id);

        return true;
    } catch (e) {
        logger.error('saveTokenToWallet: Error saving token - {0}', e.message || e);
        return false;
    }
}

// ============================================================================
// Shipping Method Helper Functions
// ============================================================================

/**
 * Set default shipping method on basket if not present
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} TransactionObj - DW Transaction object
 */
function setDefaultShippingMethod(basket, TransactionObj) {
    var ShippingMgr = require('dw/order/ShippingMgr');
    var shipment = basket.getDefaultShipment();

    if (!shipment.shippingMethod) {
        var defaultMethod = ShippingMgr.getDefaultShippingMethod();
        if (defaultMethod) {
            TransactionObj.wrap(function () {
                shipment.setShippingMethod(defaultMethod);
            });
        }
    }
}

/**
 * Build deviceInformation object for Capture Context API
 * Per Visa Acceptance documentation, the capture context deviceInformation only supports ipAddress.
 * Other device fields (httpAcceptContent, userAgentBrowserValue, deviceChannel, etc.) are meant
 * for 3DS payer authentication during payment authorization, not capture context generation.
 * 
 * @returns {Object} - deviceInformation object with ipAddress only
 */
function buildCaptureContextDeviceInformation() {
    return {
        ipAddress: request.httpRemoteAddress
    };
}

/**
 * Return the shopper's remote IP address from the SFCC global request.
 *
 * Resolved here (a scope with no local `request`) on purpose: the http/*.js payment
 * functions declare a local `var request = new ...CreatePaymentRequest()`, which shadows
 * the SFCC global `request` for the whole function. Reading `request.httpRemoteAddress`
 * there yields undefined (or crashes before assignment), so callers that need the IP for
 * deviceInformation.ipAddress must go through this helper instead.
 *
 * @returns {string} the shopper's remote IP address
 */
function getRemoteIpAddress() {
    return request.httpRemoteAddress;
}

/**
 * Build consumerAuthenticationInformation object for Capture Context API
 * 
 * Handles SCA (Strong Customer Authentication) challenge code behavior:
 * - When an SCA-required outcome (e.g., response 478) occurred previously,
 *   challengeCode = '04' is included to mandate challenge on retry
 * - Otherwise the field is omitted
 *
 * Not gated on VisaAcceptance_PayerAuthEnabled: that preference belongs to the
 * Salesforce Default (non-UC) card flow. UC's 3DS is configured in EBC, and the
 * scaRequired flag is only ever set by the UC PlaceOrderDirect decline path, so the
 * gateway having asked for SCA is the signal.
 *
 * @returns {Object|null} - consumerAuthenticationInformation object or null if no SCA retry is pending
 */
function buildConsumerAuthenticationInformation() {
    // Only return challengeCode if SCA was required (session flag set by failed auth)
    if (session.privacy.scaRequired) {
        var consumerAuthInfo = { challengeCode: '04' };
        logger.info('buildConsumerAuthenticationInformation: SCA required flag detected, setting challengeCode=04');
        // Clear the flag after using it (one-time use per retry)
        session.privacy.scaRequired = false;
        return consumerAuthInfo;
    }
    // Otherwise, omit the field entirely
    return null;
}

/**
 * Check if SCA was required (without clearing the flag)
 * @returns {boolean} - True if SCA was required on previous attempt
 */
function isSCARequired() {
    return !!session.privacy.scaRequired;
}

/**
 * Get SCA error message for cardholder display
 * @returns {string} - Localized error message for SCA requirement
 */
function getSCAErrorMessage() {
    var Resource = require('dw/web/Resource');
    return Resource.msg('error.sca.required', 'error',
        'Your card issuer requires an extra security check to approve this payment. Please try again and follow the verification steps.');
}

/**
 * Build DDC backup device information for Payer Authentication
 * These fields are collected server-side as backup for 3DS device data collection
 * Required fields per specification:
 * - IP address
 * - Browser navigator.javaEnabled
 * - Accept header
 * - Browser language (IETF BCP47)
 * - Screen colour depth, height, width
 * - Browser time difference
 * - User-Agent header
 * - Transaction channel
 * - Browser ability to execute JavaScript
 * 
 * NOTE: These fields are for payment authorization requests, NOT capture context.
 * For capture context, use buildCaptureContextDeviceInformation() which only includes ipAddress.
 * 
 * @param {Object} configObject - Configuration object from BM
 * @param {Object} browserData - Optional browser data collected from client
 * @returns {Object|null} - deviceInformation object or null if payer auth is disabled
 */
function buildDdcBackupDeviceInformation(configObject, browserData) {
    var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

    // Check if payer authentication is enabled
    var payerAuthSetting = (configObject.payerAuthenticationEnabled || '').toString().toUpperCase();
    if (payerAuthSetting !== 'YES' && payerAuthSetting !== 'DATA_ONLY_YES' && payerAuthSetting !== 'DATA_ONLY_NO') {
        return null;
    }

    var deviceInformation = {};

    // Server-side collected fields
    deviceInformation.ipAddress = request.httpRemoteAddress;
    deviceInformation.httpAcceptContent = secureResponseHelper.sanitizeHttpHeader(request.httpHeaders.get('accept'));
    deviceInformation.userAgentBrowserValue = secureResponseHelper.sanitizeHttpHeader(request.httpHeaders.get('user-agent'));
    deviceInformation.deviceChannel = 'Browser';

    // Client-side collected fields (if provided)
    if (browserData) {
        if (browserData.httpBrowserJavaEnabled !== undefined) {
            deviceInformation.httpBrowserJavaEnabled = browserData.httpBrowserJavaEnabled;
        }
        if (browserData.httpBrowserLanguage) {
            deviceInformation.httpBrowserLanguage = browserData.httpBrowserLanguage;
        }
        if (browserData.httpBrowserColorDepth) {
            deviceInformation.httpBrowserColorDepth = String(browserData.httpBrowserColorDepth);
        }
        if (browserData.httpBrowserScreenHeight) {
            deviceInformation.httpBrowserScreenHeight = String(browserData.httpBrowserScreenHeight);
        }
        if (browserData.httpBrowserScreenWidth) {
            deviceInformation.httpBrowserScreenWidth = String(browserData.httpBrowserScreenWidth);
        }
        if (browserData.httpBrowserTimeDifference !== undefined) {
            deviceInformation.httpBrowserTimeDifference = String(browserData.httpBrowserTimeDifference);
        }
        if (browserData.httpBrowserJavaScriptEnabled !== undefined) {
            deviceInformation.httpBrowserJavaScriptEnabled = browserData.httpBrowserJavaScriptEnabled;
        }
    }

    return deviceInformation;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
    // Token processing
    processUCToken: processUCToken,
    populateBasketAddresses: populateBasketAddresses,
    updateViewDataFromForm: updateViewDataFromForm,
    populateBasketAddressesFromPaymentDetails: populateBasketAddressesFromPaymentDetails,
    applyAmountDetailsFromPaymentDetails: applyAmountDetailsFromPaymentDetails,

    // Card type mapping
    mapCardType: mapCardType,

    // JWT decoding
    decodeJwtPayload: decodeJwtPayload,

    // Payment method detection
    detectPaymentMethod: detectPaymentMethod,

    getApmDescriptor: getApmDescriptor,
    getApmDisplayName: getApmDisplayName,

    getProcessorIdForMethod: getProcessorIdForMethod,
    extractBankDetails: extractBankDetails,
    extractBankDetailsFromTransient: extractBankDetailsFromTransient,
    getEcheckBankDetails: getEcheckBankDetails,
    buildEcheckPaymentDetailsString: buildEcheckPaymentDetailsString,

    // Card details extraction
    extractCardDetails: extractCardDetails,
    buildPaymentDetailsString: buildPaymentDetailsString,
    updatePaymentInstrumentCardDetails: updatePaymentInstrumentCardDetails,

    // Transaction custom attributes
    setTransactionCustomAttribute: setTransactionCustomAttribute,

    setInstrumentCustomAttribute: setInstrumentCustomAttribute,


    // Authorization status
    isValidAuthorizationStatus: isValidAuthorizationStatus,
    getAuthorizationErrorMessage: getAuthorizationErrorMessage,

    // Capture context builders
    buildBillToAddress: buildBillToAddress,
    buildShipToAddress: buildShipToAddress,
    buildLineItems: buildLineItems,
    buildCompleteMandate: buildCompleteMandate,
    buildTransientTokenResponseOptions: buildTransientTokenResponseOptions,
    buildOrderInformation: buildOrderInformation,
    buildBillToFromCustomerAddress: buildBillToFromCustomerAddress,
    buildCardHolderName: buildCardHolderName,
    mapUcBillToToSfccAddress: mapUcBillToToSfccAddress,
    buildCaptureContextDeviceInformation: buildCaptureContextDeviceInformation,
    getRemoteIpAddress: getRemoteIpAddress,
    buildConsumerAuthenticationInformation: buildConsumerAuthenticationInformation,
    buildDdcBackupDeviceInformation: buildDdcBackupDeviceInformation,

    // SCA (Strong Customer Authentication) handling
    isSCARequired: isSCARequired,
    getSCAErrorMessage: getSCAErrorMessage,

    // Currency formatting
    getCurrencyDecimalPlaces: getCurrencyDecimalPlaces,
    formatAmount: formatAmount,

    // TMS token saving
    getExistingTmsCustomerId: getExistingTmsCustomerId,
    buildTmsTokenTypes: buildTmsTokenTypes,
    buildSerializedToken: buildSerializedToken,
    didConsumerOptToSaveCard: didConsumerOptToSaveCard,
    didUserRequestSaveCard: didUserRequestSaveCard,
    extractTokenInformation: extractTokenInformation,
    findCreditCardByInstrumentIdentifier: findCreditCardByInstrumentIdentifier,
    upsertCreditCard: upsertCreditCard,
    saveTokenToWallet: saveTokenToWallet,

    // Shipping method
    setDefaultShippingMethod: setDefaultShippingMethod
};
