'use strict';

var server = require('server');
var configObject = require('../configuration/index');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

if (configObject.cartridgeEnabled) {
    /**
     * Helper function to handle UC token creation and rendering
     * @param {boolean} isMiniCart - Flag to indicate if this is for mini cart
     * @param {string} selectedPaymentInstrumentId - Optional: specific TMS payment instrument ID
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    function handleUCTokenCreation(isMiniCart, selectedPaymentInstrumentId, res, next) {
        var uc = require('~/cartridge/scripts/http/payments');
        var UcCaptureContext = uc.generateUcCaptureContext(isMiniCart, selectedPaymentInstrumentId);
        
        // Check if generateUcCaptureContext returned an error object
        if (!UcCaptureContext || typeof UcCaptureContext !== 'string' || UcCaptureContext.error) {
            var Logger = require('dw/system/Logger');
            var errorMsg = UcCaptureContext && UcCaptureContext.errorMessage
                ? UcCaptureContext.errorMessage
                : 'Failed to generate capture context';
            Logger.error('[SecureAcceptance.js] handleUCTokenCreation ERROR: {0}', errorMsg);
            // Do NOT return the raw error to the browser. This action is consumed via a
            // server-side <isinclude url> (and client AJAX with dataType:'html'), so
            // res.json() would inline the gateway response verbatim into the storefront.
            // Render the UC template with a null capture context instead: checkout then
            // shows a generic message and the minicart shows nothing.
            secureResponseHelper.secureRender(res, 'unifiedCheckout', {
                UcCaptureContext: null,
                isMiniCart: isMiniCart,
                serverError: true
            });
            next();
            return;
        }
        
        var parsedPayload = uc.jwtDecode(UcCaptureContext);
        
        if (parsedPayload != null) {
            var clientLibrary = parsedPayload.ctx[0].data.clientLibrary;
            var clientLibraryIntegrity = parsedPayload.ctx[0].data.clientLibraryIntegrity;
            secureResponseHelper.secureRender(res, 'unifiedCheckout', {
                UcCaptureContext: UcCaptureContext,
                clientLibrary: clientLibrary,
                clientLibraryIntegrity: clientLibraryIntegrity
            });
            next();
        }
    }

    server.get('CreateUCToken', server.middleware.https, function (req, res, next) {
        handleUCTokenCreation(false, null, res, next);
    });

    server.get('CreateUCTokenMiniCart', server.middleware.https, function (req, res, next) {
        handleUCTokenCreation(true, null, res, next);
    });

    /**
     * CreateUCTokenWithCard - Generate capture context with a specific saved card
     * Used when customer selects a saved card from dropdown
     * UC widget will show "Pay now" button pre-populated with this card
     * @param {string} piId - Payment Instrument ID (TMS paymentInstrumentId)
     */
    server.get('CreateUCTokenWithCard', server.middleware.https, function (req, res, next) {
        var selectedPaymentInstrumentId = req.querystring.piId || null;
        
        if (!selectedPaymentInstrumentId) {
            secureResponseHelper.secureJsonResponse(res, { error: true, errorMessage: 'Payment instrument ID is required' });
            next();
            return;
        }
        
        // Validate format - basic alphanumeric check
        if (!/^[A-Za-z0-9]+$/.test(selectedPaymentInstrumentId)) {
            secureResponseHelper.secureJsonResponse(res, { error: true, errorMessage: 'Invalid payment instrument ID format' });
            next();
            return;
        }
        
        handleUCTokenCreation(false, selectedPaymentInstrumentId, res, next);
    });

    /**
     * GetSavedCards - Return list of saved payment instruments for card selector
     * Returns card details from SFCC wallet with TMS payment instrument IDs
     */
    server.get('GetSavedCards', server.middleware.https, function (req, res, next) {
        var Logger = require('dw/system/Logger');
        var savedCards = [];
        
        try {
            var customer = session.getCustomer();
            var customerProfile = customer ? customer.getProfile() : null;
            var isRegisteredCustomer = customer && customer.isRegistered() && customer.isAuthenticated() &&
                customerProfile && !empty(customerProfile.getEmail()) && !empty(customerProfile.getCustomerNo());
            
            if (isRegisteredCustomer && customerProfile) {
                var CustomerMgr = require('dw/customer/CustomerMgr');
                var dwOrderPaymentInstrument = require('dw/order/PaymentInstrument');
                var customerObj = CustomerMgr.getCustomerByCustomerNumber(customerProfile.customerNo);
                
                if (customerObj && customerObj.profile && customerObj.profile.wallet) {
                    var wallet = customerObj.profile.wallet;
                    var paymentInstruments = wallet.getPaymentInstruments(dwOrderPaymentInstrument.METHOD_CREDIT_CARD).toArray();
                    
                    for (var i = 0; i < paymentInstruments.length; i++) {
                        var pi = paymentInstruments[i];
                        var token = pi.creditCardToken;

                        // Token format: instrumentIdentifierId-paymentInstrumentId-flex[-customerId]
                        if (!empty(token) && token.indexOf('-') > 0) {
                            var tokenParts = token.split('-');
                            if (tokenParts.length >= 2) {
                                var paymentInstrumentId = tokenParts[1];
                                var cardType = pi.creditCardType || 'Card';
                                var isEcheck = cardType === 'eCheck';

                                // eCheck instruments keep the routing number on a custom
                                // attribute alongside the masked account in creditCardNumber.
                                // Surface it here so the saved-card selector can render the
                                // routing line below the masked account.
                                var echeckRoutingNumber = '';
                                if (isEcheck) {
                                    try {
                                        echeckRoutingNumber = (pi.custom && pi.custom.echeckRoutingNumber) || '';
                                    } catch (eRouting) {
                                        echeckRoutingNumber = '';
                                    }
                                }

                                savedCards.push({
                                    paymentInstrumentId: paymentInstrumentId,
                                    cardType: cardType,
                                    maskedNumber: pi.maskedCreditCardNumber || '****',
                                    expirationMonth: pi.creditCardExpirationMonth || '',
                                    expirationYear: pi.creditCardExpirationYear || '',
                                    cardHolder: pi.creditCardHolder || '',
                                    isEcheck: isEcheck,
                                    echeckRoutingNumber: echeckRoutingNumber
                                });
                            }
                        }
                    }
                }
            }
            
            secureResponseHelper.secureJsonResponse(res, {
                success: true,
                savedCards: savedCards,
                hasSavedCards: savedCards.length > 0
            });
        } catch (e) {
            Logger.error('[SecureAcceptance.js] GetSavedCards ERROR: {0}', e.message);
            secureResponseHelper.secureJsonResponse(res, {
                success: false,
                error: true,
                errorMessage: 'Failed to retrieve saved cards',
                savedCards: []
            });
        }
        
        next();
    });

    /**
     * CreateUCTokenSaveCard - Generate capture context for My Account "Add Payment" flow
     * Uses SAVE_CARD completeMandate type for tokenization without authorization
     * UC widget collects billing address (billingType: 'FULL')
     */
    server.get('CreateUCTokenSaveCard', server.middleware.https, function (req, res, next) {
        var uc = require('~/cartridge/scripts/http/payments');
        var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');

        // Resolve the customer's default billing address (preferred, else first) to
        // prefill the Unified Checkout billing form. Defensive: any failure simply
        // yields no prefill (billTo stays null) and capture context still generates.
        var billTo = null;
        try {
            var customerObj = session.getCustomer();
            var addressBook = customerObj && customerObj.addressBook;
            if (addressBook) {
                var srcAddress = addressBook.preferredAddress
                    || (addressBook.addresses && addressBook.addresses.length ? addressBook.addresses[0] : null);
                var email = (customerObj.profile && customerObj.profile.email) || '';
                billTo = ucPaymentHelper.buildBillToFromCustomerAddress(srcAddress, email);
            }
        } catch (prefillErr) {
            require('dw/system/Logger').warn('[SecureAcceptance.js] CreateUCTokenSaveCard: address prefill skipped: {0}', prefillErr.message || String(prefillErr));
        }

        var UcCaptureContext = uc.generateUcCaptureContextSaveCard(billTo);
        
        // Check if generateUcCaptureContextSaveCard returned an error object
        if (!UcCaptureContext || typeof UcCaptureContext !== 'string' || UcCaptureContext.error) {
            var Logger = require('dw/system/Logger');
            var rawErrorMsg = (UcCaptureContext && UcCaptureContext.errorMessage) || 'Failed to generate capture context for save card';
            // Log the raw gateway/decrypt error server-side only - it can contain internal
            // details (e.g. a keystore alias name from a Response MLE decrypt failure).
            Logger.error('[SecureAcceptance.js] CreateUCTokenSaveCard ERROR: {0}', rawErrorMsg);
            // This action is consumed via a server-side <isinclude> on initial page load AND
            // via client AJAX with dataType:'html' on retry (see uc-save-card-reload-url in
            // paymentForm.isml / unifiedCheckout.js) - both insert the response verbatim as
            // markup, so it must always be a rendered template, never JSON. The template's
            // own uc-server-error block (Resource.msg('uc.tokenerror','payments',null)) shows
            // the merchant-customizable generic message on a null capture context.
            secureResponseHelper.secureRender(res, 'unifiedCheckoutSaveCard', {
                UcCaptureContext: null,
                serverError: true
            });
            next();
            return;
        }
        
        var parsedPayload = uc.jwtDecode(UcCaptureContext);
        
        if (parsedPayload != null) {
            var clientLibrary = parsedPayload.ctx[0].data.clientLibrary;
            var clientLibraryIntegrity = parsedPayload.ctx[0].data.clientLibraryIntegrity;
            secureResponseHelper.secureRender(res, 'unifiedCheckoutSaveCard', {
                UcCaptureContext: UcCaptureContext,
                clientLibrary: clientLibrary,
                clientLibraryIntegrity: clientLibraryIntegrity
            });
            next();
        }
    });

    /**
     * SetUCBillingAddress - Persist the checkout billing form to the basket.
     *
     * Unified Checkout builds the capture-context billTo from basket.billingAddress
     * (see payments.js buildOrderInformation). SFRA only persists the billing form
     * on CheckoutServices-SubmitPayment, but UC hides Place Order and never posts it,
     * so a shopper-entered or edited billing address never reaches the basket and the
     * regenerated capture context authorizes against the stale/default address.
     *
     * This action does ONLY the billing-address portion of SubmitPayment (validate +
     * copy to basket) - no payment-instrument creation, no processor Handle hook - so
     * the client can save the address and then regenerate the UC capture context.
     */
    server.post('SetUCBillingAddress', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

        var currentBasket = BasketMgr.getCurrentBasket();
        if (!currentBasket) {
            secureResponseHelper.secureJsonResponse(res, { error: true, errorMessage: 'Basket not found' });
            next();
            return;
        }

        var billingForm = server.forms.getForm('billing');
        var billingFormErrors = COHelpers.validateBillingForm(billingForm.addressFields);
        if (Object.keys(billingFormErrors).length) {
            secureResponseHelper.secureJsonResponse(res, { error: true, fieldErrors: billingFormErrors });
            next();
            return;
        }

        var af = billingForm.addressFields;
        Transaction.wrap(function () {
            var billingAddress = currentBasket.billingAddress || currentBasket.createBillingAddress();
            billingAddress.setFirstName(af.firstName.value);
            billingAddress.setLastName(af.lastName.value);
            billingAddress.setAddress1(af.address1.value);
            billingAddress.setAddress2(af.address2.value);
            billingAddress.setCity(af.city.value);
            billingAddress.setPostalCode(af.postalCode.value);
            if (Object.prototype.hasOwnProperty.call(af, 'states')) {
                billingAddress.setStateCode(af.states.stateCode.value);
            }
            billingAddress.setCountryCode(af.country.value);
            // Set phone unconditionally (unlike COHelpers.copyBillingAddressToBasket,
            // which skips it when one exists) so an edited phone reaches the billTo.
            if (billingForm.contactInfoFields && billingForm.contactInfoFields.phone) {
                billingAddress.setPhone(billingForm.contactInfoFields.phone.value);
            }
        });

        secureResponseHelper.secureJsonResponse(res, { success: true });
        next();
    });
}

module.exports = server.exports();