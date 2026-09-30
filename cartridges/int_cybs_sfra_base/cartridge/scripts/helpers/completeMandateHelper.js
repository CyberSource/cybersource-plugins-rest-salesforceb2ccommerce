'use strict';

var Logger = require('dw/system/Logger');
var logger = Logger.getLogger('VisaAcceptance', 'CompleteMandateHelper');

/**
 * Map Visa Acceptance card type code to readable name
 * Handles both numeric codes ('001') and string names ('VISA')
 * @param {string} cardTypeCode - Visa Acceptance card type code (e.g., '001' for Visa) or name (e.g., 'VISA')
 * @returns {string} - Readable card type name
 */
function mapCardType(cardTypeCode) {
    if (!cardTypeCode) return '';
    
    // Map for numeric codes
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
        '040': 'UATP',
        '044': 'Korean Card',
        '054': 'Elo',
        '046': 'JCrew',
        '065': 'Korean Card',
        '068': 'PayPak',
        '070': 'EFTPOS',
        '067': 'Meeza',
        '060': 'Mada',
        '058': 'Carnet',
        '081': 'Jaywan'
    };
    
    // If it's a numeric code, return the mapped name
    if (cardTypeMap[cardTypeCode]) {
        return cardTypeMap[cardTypeCode];
    }
    
    // If it's already a string name (e.g., 'VISA', 'MASTERCARD'), normalize it
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

/**
 * Detect payment method from completeMandate JWT paymentSolution
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {string} - Payment method ID (CREDIT_CARD, DW_GOOGLE_PAY, DW_APPLE_PAY, CLICK_TO_PAY)
 */
function detectPaymentMethod(jwtPayload) {
    var processingInfo = jwtPayload.details && jwtPayload.details.processingInformation;
    var paymentSolution = processingInfo && processingInfo.paymentSolution;

    if (paymentSolution === '012') {
        return 'DW_GOOGLE_PAY';
    } else if (paymentSolution === '001') {
        return 'DW_APPLE_PAY';
    } else if (paymentSolution === '027') {
        return 'CLICK_TO_PAY';
    }
    return 'CREDIT_CARD';
}

/**
 * Extract card details from completeMandate JWT and transient token
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @param {string} transientToken - Transient token from SDK
 * @param {Object} billingAddress - Optional billing address object with firstName/lastName
 * @returns {Object} - Card details object with cardTypeCode, cardTypeName, maskedNumber, expirationMonth, expirationYear, cardHolderName
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

    // Get card type from completeMandate JWT (details.paymentInformation)
    if (jwtPayload.details && jwtPayload.details.paymentInformation) {
        var paymentInfoJwt = jwtPayload.details.paymentInformation;
        
        // Try to get card type - check multiple locations
        if (paymentInfoJwt.card && paymentInfoJwt.card.type) {
            cardDetails.cardTypeCode = paymentInfoJwt.card.type;
        }
        if (!cardDetails.cardTypeCode && paymentInfoJwt.tokenizedCard && paymentInfoJwt.tokenizedCard.type) {
            cardDetails.cardTypeCode = paymentInfoJwt.tokenizedCard.type;
        }
        
        // Get expiration from tokenizedCard if available
        if (paymentInfoJwt.tokenizedCard) {
            cardDetails.expirationMonth = paymentInfoJwt.tokenizedCard.expirationMonth || '';
            cardDetails.expirationYear = paymentInfoJwt.tokenizedCard.expirationYear || '';
        }
        // Fallback to card object for expiration
        if ((!cardDetails.expirationMonth || !cardDetails.expirationYear) && paymentInfoJwt.card) {
            cardDetails.expirationMonth = cardDetails.expirationMonth || paymentInfoJwt.card.expirationMonth || '';
            cardDetails.expirationYear = cardDetails.expirationYear || paymentInfoJwt.card.expirationYear || '';
        }
    }

    // Get details from transient token (content.paymentInformation)
    if (transientToken) {
        var transientPayload = decodeJwtPayload(transientToken);
        if (transientPayload && transientPayload.content && transientPayload.content.paymentInformation) {
            var transientPaymentInfo = transientPayload.content.paymentInformation;

            // Get masked card number
            // For Google Pay / Apple Pay: check tokenizedCard first
            if (transientPaymentInfo.tokenizedCard && transientPaymentInfo.tokenizedCard.number) {
                var tokenizedNum = transientPaymentInfo.tokenizedCard.number;
                cardDetails.maskedNumber = tokenizedNum.maskedValue || tokenizedNum || '';
            }
            // For regular cards: check card
            if (!cardDetails.maskedNumber && transientPaymentInfo.card && transientPaymentInfo.card.number) {
                var cardNum = transientPaymentInfo.card.number;
                cardDetails.maskedNumber = cardNum.maskedValue || cardNum || '';
            }
            
            // Get expiration from transient token if not found in JWT
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
            
            // Fallback: use card type from transient if not found in completeMandate
            if (!cardDetails.cardTypeCode && transientPaymentInfo.card && transientPaymentInfo.card.type) {
                cardDetails.cardTypeCode = transientPaymentInfo.card.type.value || transientPaymentInfo.card.type || '';
            }
            if (!cardDetails.cardTypeCode && transientPaymentInfo.tokenizedCard && transientPaymentInfo.tokenizedCard.type) {
                cardDetails.cardTypeCode = transientPaymentInfo.tokenizedCard.type.value || transientPaymentInfo.tokenizedCard.type || '';
            }
        }
    }

    // Map card type code to readable name
    cardDetails.cardTypeName = mapCardType(cardDetails.cardTypeCode);

    return cardDetails;
}

/**
 * Build payment details string for display
 * @param {Object} cardDetails - Card details object from extractCardDetails
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
 * For digital wallets (Google Pay, Apple Pay), always set card details since they don't have them initially
 * For regular credit cards, only update if the value is missing
 * @param {dw.order.PaymentInstrument} paymentInstrument - Payment instrument to update
 * @param {Object} cardDetails - Card details object from extractCardDetails
 * @param {boolean} isDigitalWallet - Whether payment is from Google Pay or Apple Pay
 */
function updatePaymentInstrumentCardDetails(paymentInstrument, cardDetails, isDigitalWallet) {
    // Set cardholder name if available and missing
    if (cardDetails.cardHolderName && (isDigitalWallet || !paymentInstrument.creditCardHolder)) {
        paymentInstrument.setCreditCardHolder(cardDetails.cardHolderName);
    }
    // For digital wallets, always set (they start with no card details)
    // For regular cards, set if missing
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

/**
 * Safely set custom attribute on payment transaction if it exists
 * @param {dw.order.PaymentTransaction} paymentTransaction - Payment transaction
 * @param {string} attributeName - Custom attribute name
 * @param {*} value - Value to set
 * @returns {boolean} - True if attribute was set, false otherwise
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
 * Check if authorization status is valid for order placement
 * @param {string} status - Authorization status from completeMandate JWT
 * @returns {boolean} - True if status is valid
 */
function isValidAuthorizationStatus(status) {
    var validStatuses = ['AUTHORIZED', 'AUTHORIZED_PENDING_REVIEW'];
    return validStatuses.indexOf(status) !== -1;
}

/**
 * Get error message based on authorization status
 * @param {string} status - Authorization status from completeMandate JWT
 * @returns {string} - Resource message key
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
// Capture Context Helper Functions
// ============================================================================

/**
 * Build billTo object from basket billing address
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object|null} - billTo object or null if no billing address
 */
function buildBillToAddress(basket) {
    var billingAddress = basket.billingAddress;
    if (!billingAddress) return null;

    return {
        firstName: billingAddress.firstName || '',
        lastName: billingAddress.lastName || '',
        email: basket.customerEmail || '',
        phoneNumber: billingAddress.phone || '',
        address1: billingAddress.address1 || '',
        address2: billingAddress.address2 || '',
        locality: billingAddress.city || '',
        administrativeArea: billingAddress.stateCode || '',
        postalCode: billingAddress.postalCode || '',
        country: billingAddress.countryCode ? billingAddress.countryCode.value.toUpperCase() : ''
    };
}

/**
 * Build shipTo object from basket shipping address
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Object|null} - shipTo object or null if no shipping address
 */
function buildShipToAddress(basket) {
    var defaultShipment = basket.defaultShipment;
    var shippingAddress = defaultShipment ? defaultShipment.shippingAddress : null;
    if (!shippingAddress) return null;

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
 * Build line items array from basket for capture context
 * @param {dw.order.Basket} basket - Current basket
 * @returns {Array} - Array of line item objects
 */
function buildLineItems(basket) {
    var lineItems = [];
    var allLineItems = basket.allLineItems;

    if (!allLineItems) return lineItems;

    for (var i = 0; i < allLineItems.length; i++) {
        var lineItem = allLineItems[i];
        var itemObject = null;

        // Product Line Items
        if (lineItem instanceof dw.order.ProductLineItem) {
            itemObject = {
                productName: lineItem.productName || '',
                quantity: lineItem.quantityValue,
                unitPrice: lineItem.basePrice.value.toString(),
                totalAmount: lineItem.adjustedGrossPrice.value.toString(),
                taxAmount: (lineItem.adjustedTax.value > 0 ? lineItem.adjustedTax.value : 0).toString(),
                productCode: 'default',
                productSku: lineItem.productID || ''
            };

            // Handle discounts/prorated prices
            if (lineItem.proratedPrice && lineItem.proratedPrice.value > 0) {
                itemObject.unitPrice = (lineItem.proratedPrice.value / lineItem.quantityValue).toString();
                itemObject.totalAmount = lineItem.proratedPrice.value.toString();
            }
        }
        // Gift Certificate Line Items
        else if (lineItem instanceof dw.order.GiftCertificateLineItem) {
            itemObject = {
                productName: 'GIFT_CERTIFICATE',
                quantity: 1,
                unitPrice: lineItem.adjustedPrice.value.toString(),
                totalAmount: lineItem.adjustedGrossPrice.value.toString(),
                taxAmount: '0',
                productCode: 'GIFT_CERTIFICATE',
                productSku: 'GIFT_CERTIFICATE'
            };
        }
        // Shipping Line Items
        else if (lineItem instanceof dw.order.ShippingLineItem) {
            if (lineItem.adjustedPrice.value === 0) {
                continue; // Skip free shipping
            }
            itemObject = {
                productName: lineItem.ID || 'SHIPPING',
                quantity: 1,
                unitPrice: lineItem.adjustedPrice.value.toString(),
                totalAmount: lineItem.adjustedGrossPrice.value.toString(),
                productCode: 'SHIPPING',
                productSku: lineItem.ID || 'SHIPPING'
            };
            if (lineItem.adjustedTax && lineItem.adjustedTax.value > 0) {
                itemObject.taxAmount = lineItem.adjustedTax.value.toString();
            }
        }
        // Product Shipping Line Items (surcharges)
        else if (lineItem instanceof dw.order.ProductShippingLineItem) {
            itemObject = {
                productName: 'SHIPPING_SURCHARGE',
                quantity: 1,
                unitPrice: lineItem.adjustedPrice.value.toString(),
                totalAmount: lineItem.adjustedGrossPrice.value.toString(),
                taxAmount: lineItem.adjustedTax ? lineItem.adjustedTax.value.toString() : '0',
                productCode: 'SHIPPING_SURCHARGE',
                productSku: 'SHIPPING_SURCHARGE'
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
 * @param {Object} configObject - Configuration object from BM
 * @param {boolean} isTokenizationEnabled - Whether tokenization is enabled
 * @param {boolean} isRegisteredCustomer - Whether customer is registered
 * @param {dw.customer.Customer} customer - Customer object
 * @returns {Object} - completeMandate object
 */
function buildCompleteMandate(configObject, isTokenizationEnabled, isRegisteredCustomer, customer) {
    var completeMandate = {};

    // UC v1 (ISV Phase 1): completeMandate.type is managed via EBC and must NOT be sent
    // from the capture-context request. Read it back from the capture-context response if needed.

    // Decision Manager: Enable based on BM configuration
    completeMandate.decisionManager = !!configObject.fmeDmEnabled;

    // Consumer Authentication (3DS/Payer Auth): Enable based on BM configuration
    // payerAuthenticationEnabled can be: 'Yes', 'No', 'DATA_ONLY_YES', 'DATA_ONLY_NO'
    var payerAuthSetting = (configObject.payerAuthenticationEnabled || '').toString().toUpperCase();
    if (payerAuthSetting === 'YES' || payerAuthSetting === 'DATA_ONLY_YES' || payerAuthSetting === 'DATA_ONLY_NO') {
        completeMandate.consumerAuthentication = '3DS';
    } else {
        completeMandate.consumerAuthentication = 'NONE';
    }

    // TMS Tokenization: Enable based on BM configuration and customer status
    if (isTokenizationEnabled && isRegisteredCustomer) {
        completeMandate.tms = {
            tokenCreate: true,
            tokenTypes: ['paymentInstrument', 'instrumentIdentifier']
        };

        // If customer doesn't have a TMS customer ID yet, include 'customer' token type
        var customerProfile = customer.getProfile();
        if (customerProfile && !customerProfile.custom.customerID) {
            completeMandate.tms.tokenTypes.push('customer');
        }
    }

    return completeMandate;
}

/**
 * Check if user opted to save card in UC completeMandate response
 * The presence of tokenInformation in the response indicates user checked "Save Payment Information"
 * (when captureMandate.requestSaveCredentials = true, token is only created if user checks the box)
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {boolean} - True if tokenInformation exists (meaning user opted to save)
 */
function didUserRequestSaveCard(jwtPayload) {
    // If tokenInformation exists in response, it means:
    // 1. tokenCreate was enabled, AND
    // 2. If requestSaveCredentials was true, user checked the "Save Card" checkbox
    // Either way, we should save the token to wallet
    return !!(jwtPayload.details && jwtPayload.details.tokenInformation);
}

/**
 * Extract token information from completeMandate JWT response
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @returns {Object|null} - Token information object or null if not present
 */
function extractTokenInformation(jwtPayload) {
    if (!jwtPayload.details || !jwtPayload.details.tokenInformation) {
        return null;
    }
    return jwtPayload.details.tokenInformation;
}

/**
 * Save TMS token to customer wallet from completeMandate response
 * @param {Object} jwtPayload - Decoded completeMandate JWT payload
 * @param {Object} cardDetails - Card details object from extractCardDetails
 * @param {dw.customer.Customer} customer - Customer object
 * @returns {boolean} - True if token was saved successfully
 */
function saveTokenToWallet(jwtPayload, cardDetails, customer) {
    // Check if user opted to save card
    if (!didUserRequestSaveCard(jwtPayload)) {
        logger.debug('saveTokenToWallet: User did not opt to save card');
        return false;
    }

    // Check if customer is authenticated
    if (!customer || !customer.isAuthenticated() || !customer.getProfile()) {
        logger.debug('saveTokenToWallet: Customer not authenticated');
        return false;
    }

    // Extract token information from JWT
    var tokenInfo = extractTokenInformation(jwtPayload);
    if (!tokenInfo) {
        logger.debug('saveTokenToWallet: No token information in JWT response');
        return false;
    }

    // Validate required token fields
    if (!tokenInfo.paymentInstrument || !tokenInfo.paymentInstrument.id ||
        !tokenInfo.instrumentIdentifier || !tokenInfo.instrumentIdentifier.id) {
        logger.warn('saveTokenToWallet: Missing required token fields');
        return false;
    }

    var Transaction = require('dw/system/Transaction');
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
    var mapper = require('~/cartridge/scripts/util/mapper.js');

    try {
        var profile = customer.getProfile();
        var customerObj = CustomerMgr.getCustomerByCustomerNumber(profile.customerNo);


        var wallet = customerObj.profile.wallet;
        var paymentInstruments = wallet.getPaymentInstruments().toArray();

        // Build serialized token string (same format as mapper.serializeTokenInformation)
        var serializedToken;
        if (tokenInfo.customer && tokenInfo.customer.id) {
            serializedToken = [
                tokenInfo.instrumentIdentifier.id,
                tokenInfo.paymentInstrument.id,
                'flex',
                tokenInfo.customer.id
            ].join('-');

            // Store TMS customer ID in profile for future transactions
            Transaction.wrap(function () {
                if (!profile.custom.customerID) {
                    profile.custom.customerID = tokenInfo.customer.id;
                }
            });
        } else {
            serializedToken = [
                tokenInfo.instrumentIdentifier.id,
                tokenInfo.paymentInstrument.id,
                'flex'
            ].join('-');
        }

        // Check for duplicate - if found, update expiry details instead of creating new
        var instrumentIdentifierId = tokenInfo.instrumentIdentifier.id;
        var existingPI = null;
        
        for (var i = 0; i < paymentInstruments.length; i++) {
            var pi = paymentInstruments[i];
            var existingToken = pi.creditCardToken;
            // Check if the instrument identifier matches (first part of token)
            if (existingToken && existingToken.indexOf(instrumentIdentifierId) === 0) {
                existingPI = pi;
                break;
            }
        }

        if (existingPI) {
            // Update existing card's expiry details and token
            Transaction.wrap(function () {
                if (cardDetails.expirationMonth) {
                    existingPI.setCreditCardExpirationMonth(parseInt(cardDetails.expirationMonth, 10));
                }
                if (cardDetails.expirationYear) {
                    existingPI.setCreditCardExpirationYear(parseInt(cardDetails.expirationYear, 10));
                }
                // Update the token with new payment instrument ID (expiry changes create new PI in TMS)
                existingPI.setCreditCardToken(serializedToken);
                
                logger.info('saveTokenToWallet: Updated existing card expiry. InstrumentIdentifier: {0}',
                    instrumentIdentifierId);
            });
            return true;
        }

        // Create new payment instrument in wallet
        Transaction.wrap(function () {
            var newPI = wallet.createPaymentInstrument(dwOrderPaymentInstrument.METHOD_CREDIT_CARD);

            // Set cardholder name
            if (cardDetails.cardHolderName) {
                newPI.setCreditCardHolder(cardDetails.cardHolderName);
            }

            // Set card details
            if (cardDetails.cardTypeName) {
                newPI.setCreditCardType(cardDetails.cardTypeName);
            }
            if (cardDetails.maskedNumber) {
                newPI.setCreditCardNumber(cardDetails.maskedNumber);
            }
            if (cardDetails.expirationMonth) {
                newPI.setCreditCardExpirationMonth(parseInt(cardDetails.expirationMonth, 10));
            }
            if (cardDetails.expirationYear) {
                newPI.setCreditCardExpirationYear(parseInt(cardDetails.expirationYear, 10));
            }

            // Set token
            newPI.setCreditCardToken(serializedToken);

            logger.info('saveTokenToWallet: Token saved successfully. InstrumentIdentifier: {0}',
                tokenInfo.instrumentIdentifier.id);
        });

        return true;
    } catch (e) {
        logger.error('saveTokenToWallet: Error saving token - {0}', e.message || e);
        return false;
    }
}

/**
 * Build orderInformation object for capture context
 * @param {dw.order.Basket} basket - Current basket
 * @param {boolean} isMiniCart - Whether this is minicart flow
 * @returns {Object} - orderInformation object
 */
function buildOrderInformation(basket, isMiniCart) {
    var orderInformation = {
        amountDetails: {
            // Use totalGrossPrice which includes the default tax already calculated in basket
            // For minicart/cart: this uses SFCC's default tax (not Visa Acceptance tax)
            totalAmount: basket.totalGrossPrice.value.toString(),
            currency: basket.currencyCode
        }
    };

    // For checkout: Add billing and shipping addresses (already available from previous steps)
    if (!isMiniCart) {
        // Add billing address
        var billTo = buildBillToAddress(basket);
        if (billTo) {
            orderInformation.billTo = billTo;
        }

        // Add shipping address
        var shipTo = buildShipToAddress(basket);
        if (shipTo) {
            orderInformation.shipTo = shipTo;
        }
    }
    // For minicart/cart: addresses will be captured by UC widget via captureMandate
    // (billingType: 'FULL', requestShipping: true)

    // Add line items for both checkout and minicart/cart flows
    var lineItems = buildLineItems(basket);
    if (lineItems.length > 0) {
        orderInformation.lineItems = lineItems;
    }

    return orderInformation;
}

/**
 * Set default shipping method on basket if not present
 * Used for minicart/cart flows where shipping method may not be selected yet
 * @param {dw.order.Basket} basket - Current basket
 * @param {Object} Transaction - DW Transaction object
 */
function setDefaultShippingMethod(basket, Transaction) {
    var ShippingMgr = require('dw/order/ShippingMgr');
    var shipment = basket.getDefaultShipment();
    
    if (!shipment.shippingMethod) {
        var defaultMethod = ShippingMgr.getDefaultShippingMethod();
        if (defaultMethod) {
            Transaction.wrap(function () {
                shipment.setShippingMethod(defaultMethod);
            });
            logger.info('setDefaultShippingMethod: Default shipping method set: {0}', defaultMethod.ID);
        }
    }
}

module.exports = {
    // PlaceOrderDirect helpers
    mapCardType: mapCardType,
    decodeJwtPayload: decodeJwtPayload,
    detectPaymentMethod: detectPaymentMethod,
    extractCardDetails: extractCardDetails,
    buildPaymentDetailsString: buildPaymentDetailsString,
    updatePaymentInstrumentCardDetails: updatePaymentInstrumentCardDetails,
    setTransactionCustomAttribute: setTransactionCustomAttribute,
    isValidAuthorizationStatus: isValidAuthorizationStatus,
    getAuthorizationErrorMessage: getAuthorizationErrorMessage,
    // Token saving helpers
    didUserRequestSaveCard: didUserRequestSaveCard,
    extractTokenInformation: extractTokenInformation,
    saveTokenToWallet: saveTokenToWallet,
    // Capture Context helpers
    buildBillToAddress: buildBillToAddress,
    buildShipToAddress: buildShipToAddress,
    buildLineItems: buildLineItems,
    buildCompleteMandate: buildCompleteMandate,
    buildOrderInformation: buildOrderInformation,
    // Minicart/Cart flow helpers
    setDefaultShippingMethod: setDefaultShippingMethod
};
