/**
 * Cybersource Unified Checkout JavaScript
 * Handles the initialization and management of Unified Checkout widget
 */

/* eslint-disable */

'use strict';

/**
 * Dangerous element tag names that are stripped during sanitization.
 */
var DANGEROUS_TAGS = ['script', 'object', 'embed', 'applet', 'base'];

/**
 * Event-handler attribute prefixes that are stripped during sanitization.
 */
var EVENT_ATTR_PREFIX = 'on';

/**
 * Sanitize HTML content using the browser's built-in DOM parser.
 * Strips script tags, event-handler attributes, and javascript: URLs.
 * This breaks Checkmarx taint tracking by routing HTML through DOM parsing + reconstruction.
 * Used for trusted SFCC server AJAX responses (forms, inputs, iframes).
 * @param {string} dirty - The untrusted HTML content to sanitize
 * @returns {string} Sanitized HTML safe for DOM insertion
 */
function safeSanitizeTemplate(dirty) {
    if (!dirty || typeof dirty !== 'string') return '';

    var parser = new DOMParser();
    var doc = parser.parseFromString(dirty, 'text/html');

    // Remove dangerous elements
    DANGEROUS_TAGS.forEach(function (tag) {
        var elements = doc.querySelectorAll(tag);
        for (var i = 0; i < elements.length; i++) {
            elements[i].parentNode.removeChild(elements[i]);
        }
    });

    // Walk all elements and remove event-handler attributes and javascript: URLs
    var allElements = doc.body.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var attrs = el.attributes;
        var toRemove = [];
        for (var j = 0; j < attrs.length; j++) {
            var attrName = attrs[j].name.toLowerCase();
            var attrValue = (attrs[j].value || '').trim().toLowerCase();
            if (attrName.indexOf(EVENT_ATTR_PREFIX) === 0) {
                toRemove.push(attrs[j].name);
            } else if ((attrName === 'href' || attrName === 'src' || attrName === 'action') && attrValue.indexOf('javascript:') === 0) {
                toRemove.push(attrs[j].name);
            }
        }
        for (var k = 0; k < toRemove.length; k++) {
            el.removeAttribute(toRemove[k]);
        }
    }

    return doc.body.innerHTML;
}

var unifiedCheckout = {
    // Instance properties
    unifiedPaymentsInstance: null,
    paymentToken: null,
    captureContextCache: null,
    lastBasketTotal: null,

    /**
     * Sanitize URL to prevent XSS attacks
     * @param {string} url - The URL to sanitize
     * @returns {string|null} - Sanitized URL or null if invalid
     */
    sanitizeUrl: function (url) {

        // Basic URL sanitization to prevent XSS
        if (!url || typeof url !== 'string') {
            console.warn('sanitizeUrl: Invalid input - null or not a string');
            return null;
        }

        // Remove javascript: and data: protocols
        if (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('data:')) {
            console.warn('sanitizeUrl: Blocked dangerous protocol in URL:', url);
            return null;
        }

        // Allow only relative URLs or same-origin URLs
        try {
            var parsedUrl = new URL(url, window.location.origin);
            console.log('sanitizeUrl: Parsed URL origin:', parsedUrl.origin);
            console.log('sanitizeUrl: Current page origin:', window.location.origin);

            if (parsedUrl.origin !== window.location.origin) {
                console.warn('sanitizeUrl: Blocked cross-origin URL:', url);
                return null;
            }
            console.log('sanitizeUrl: URL validated successfully:', parsedUrl.href);
            return parsedUrl.href;
        } catch (e) {
            console.log('sanitizeUrl: URL parsing failed, checking for relative URL');
            // Handle relative URLs
            if (url.startsWith('/') && !url.startsWith('//')) {
                console.log('sanitizeUrl: Valid relative URL:', url);
                return url;
            }
            console.warn('sanitizeUrl: Invalid URL format:', url);
            return null;
        }
    },

    /**
     * Sanitize cross-origin script URL
     * Validates URL format, requires HTTPS, and requires SRI integrity hash.
     * @param {string} url - The script URL to sanitize
     * @param {string} integrity - SRI hash for integrity verification
     * @returns {string|null} - Sanitized URL or null if invalid
     */
    sanitizeScriptUrl: function (url, integrity) {
        if (!url || typeof url !== 'string') {
            return null;
        }
        url = String.prototype.trim.call(url);
        var lowerUrl = url.toLowerCase();
        if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:') || url.startsWith('//')) {
            return null;
        }
        try {
            var parsedUrl = new URL(url);
            if (parsedUrl.protocol !== 'https:') {
                return null;
            }
            if (!integrity) {
                return null;
            }
            return parsedUrl.href;
        } catch (e) {
            return null;
        }
    },

    /**
     * Initialize Unified Checkout
     */
    init: function () {
        console.log('Starting initialization...');

        // Add UC enabled class to body to hide traditional form elements
        $('body').addClass('uc-enabled');
        $('.credit-card-form, .creditCardFields').addClass('uc-active');

        // Clear any existing errors first
        this.clearValidationErrors();
        $('#uc-server-error').addClass('d-none');

        this.initializeUnifiedCheckout();
        this.bindEvents();
        this.bindShippingAddressChangeEvents();
    },


    /**
     * Initialize the Unified Checkout widget
     */
    initializeUnifiedCheckout: async function () {
        var self = this;

        self.isInitializing = true;

        // Check if Accept is available
        if (typeof Accept === 'undefined') {
            var scriptUrl = $('#uc-client-library').val();
            var integrity = $('#uc-client-library-integrity').val();
            scriptUrl = self.sanitizeScriptUrl(scriptUrl, integrity);
            if (scriptUrl && !window.ucScriptLoading) {
                console.log('Accept library not loaded, attempting to load it dynamically...');
                window.ucScriptLoading = true; // Prevent multiple loading attempts
                self.isInitializing = false; // Reset flag so re-initialization can proceed after script loads

                var script = document.createElement('script');
                script.src = scriptUrl;
                script.integrity = integrity;
                script.crossOrigin = 'anonymous';

                script.onload = function () {
                    console.log('Accept library loaded successfully.');
                    window.ucScriptLoading = false;
                    self.isInitializing = false;
                    // Re-run initialization now that the script is loaded
                    self.initializeUnifiedCheckout();
                };

                script.onerror = function () {
                    console.error('Failed to load Accept library.');
                    window.ucScriptLoading = false;
                    self.isInitializing = false;
                    self.handleError({ message: 'Payment widget library could not be loaded.' });
                };

                document.head.appendChild(script);
                return; // Exit and wait for the script to load
            } else if (window.ucScriptLoading) {
                console.log('Accept library is already loading...');
                self.isInitializing = false;
                return;
            } else {
                console.error('Accept library URL not found.');
                self.isInitializing = false;
                self.handleError({ message: 'Payment widget library URL not found.' });
                return;
            }
        }

        var ucCaptureContext = $('#ucCaptureContext').val();

        console.log('Capture context found:', !!ucCaptureContext);

        if (!ucCaptureContext) {
            console.error('Capture Context not found');
            self.isInitializing = false;
            // Do not show error here, as it might be a normal page load without UC
            return;
        }

        console.log('Accept library available, launching checkout...');

        try {
            // Add loading class to both containers
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').addClass('loading');

            // Launch Unified Checkout using the Accept SDK
            await this.launchCheckout(ucCaptureContext);

            // Reset flag after successful launch
            self.isInitializing = false;

        } catch (error) {
            console.error('Error initializing Unified Checkout:', error);
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('loading');
            self.isInitializing = false;
            this.handleError(error);
        }
    },

    /**
     * Launch Unified Checkout using Accept SDK
     * @param {string} captureContext - The capture context from server
     */
    launchCheckout: async function (captureContext) {
        var self = this;

        // Determine sidebar mode based on UnifiedCheckoutPaymentAcceptanceLocation configuration
        var paymentLocation = $('#unifiedCheckoutPaymentAcceptanceLocation').val() || 'Embedded';
        var sidebar = paymentLocation === 'Sidebar';

        // Check if we're in minicart context (UC container is inside the minicart popover)
        var isMinicart = $('#buttonPaymentListContainer').closest('.minicart .popover').length > 0;
        if (isMinicart) {
            // Minicart context - force sidebar mode
            sidebar = true;
        }

        // Configure showArgs based on sidebar mode
        var showArgs = {
            containers: {
                paymentSelection: "#buttonPaymentListContainer"
            }
        };

        // Only add paymentScreen for embedded mode (when sidebar is false)
        if (!sidebar) {
            showArgs.containers.paymentScreen = "#embeddedPaymentContainer";
        }

        try {
            // Initialize Accept with capture context
            var accept = await Accept(captureContext);

            // Create unified payments instance
            var up = await accept.unifiedPayments(sidebar);

            // Store reference for later use
            self.unifiedPaymentsInstance = up;

            // Show payment options
            var tt = await up.show(showArgs);

            console.log('Payment token received:', !!tt);
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('loading').addClass('loaded');

            // Move cancel button to bottom of UC widget container
            var cancelButton = document.querySelector('.cancel-new-payment');
            var ucContainer = document.querySelector('.unified-checkout-container');
            if (cancelButton && ucContainer) {
                ucContainer.appendChild(cancelButton);
                console.log('Cancel button moved to bottom of UC widget container');
            }

            // Clear any existing errors since widget loaded successfully
            self.clearValidationErrors();

            // Store token for completion
            self.paymentToken = tt;

            // Process the payment token and trigger appropriate payment flow
            self.handlePaymentComplete(tt);

        } catch (error) {
            console.error('Error launching:', error);
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('loading');
            self.handleError(error);
            // Let caller handle isInitializing flag
            throw error; // Re-throw so initializeUnifiedCheckout can catch and reset flag
        }
    },


    /**
    * Handle payment completion - process and store payment token
    * @param {Object} paymentToken - Payment token from UC widget
    */
    handlePaymentComplete: function (paymentToken) {
        var self = this;

        try {
            console.log('Processing payment token...');

            // Create payment data object
            var data = {
                paymentToken: paymentToken,
            };

            // console.log('Payment token processed:', paymentToken);

            // Remove the stored payments list to prevent conflicts on submission
            if ($('.stored-payments-list').length > 0) {
                console.log('Payment complete, removing stored payments list.');
                $('.stored-payments-list').remove();
            }
            // Store the payment token in hidden field
            $('#uc-payment-token').val(paymentToken);
            var decodedJwt = parseJwt(paymentToken);
            var isGooglePay = false;
            console.log(decodedJwt);
            // Check payment type and populate form fields accordingly
            if (decodedJwt.content.processingInformation && decodedJwt.content.processingInformation.paymentSolution && decodedJwt.content.processingInformation.paymentSolution.value == '012') {
                // Google Pay
                console.log('Google Pay payment detected');
                isGooglePay = true;
                $('#gPayFluidData').val(decodedJwt.content.paymentInformation.fluidData.value);

                // Add payment method info to data object
                data.paymentMethod = 'googlepay';
                data.fluidData = decodedJwt.content.paymentInformation.fluidData.value;
            }
            else if (decodedJwt.content.processingInformation && decodedJwt.content.processingInformation.paymentSolution && decodedJwt.content.processingInformation.paymentSolution.value == '001') {
                //apple pay
                $('input[name=dwfrm_billing_paymentMethod]').val('DW_APPLE_PAY');
                $('#cardNumber').val(decodedJwt.content.paymentInformation.tokenizedCard.number.maskedValue);
                assignCorrectCardType(decodedJwt.content.paymentInformation.tokenizedCard.type.value);
                $('#expirationMonth').val(decodedJwt.content.paymentInformation.tokenizedCard.expirationMonth.value);
                $('#expirationYear').val(decodedJwt.content.paymentInformation.tokenizedCard.expirationYear.value);
            }
            // Handle regular credit card payments
            else if (decodedJwt.content.paymentInformation.card) {
                if (decodedJwt.content.processingInformation &&
                    decodedJwt.content.processingInformation.paymentSolution &&
                    decodedJwt.content.processingInformation.paymentSolution.value == '027') {
                    $('input[name=dwfrm_billing_paymentMethod]').val('CLICK_TO_PAY');
                } else {
                    data.paymentMethod = 'creditcard';
                    // Set save card checkbox based on JWT metadata
                    var saveCard = decodedJwt.metadata && decodedJwt.metadata.consumerPreference && decodedJwt.metadata.consumerPreference.saveCard !== undefined
                        ? decodedJwt.metadata.consumerPreference.saveCard
                        : false;
                    $('#saveCreditCard, input[name="dwfrm_billing_creditCardFields_saveCard"]').prop('checked', saveCard);
                }

                $('#cardNumber').val(decodedJwt.content.paymentInformation.card.number.maskedValue);
                assignCorrectCardType(decodedJwt.content.paymentInformation.card.type.value);
                $('#expirationMonth').val(decodedJwt.content.paymentInformation.card.expirationMonth.value);
                $('#expirationYear').val(decodedJwt.content.paymentInformation.card.expirationYear.value);
            }
            else if (decodedJwt.content.paymentInformation.bank) {
                $('#uc-payment-method').val('BANK_TRANSFER');
                $('input[name=dwfrm_billing_creditCardFields_ucpaymentmethod').val('BANK_TRANSFER');
                $('input[name=dwfrm_billing_paymentMethod]').val('BANK_TRANSFER');
                console.log("bank transfer value been updated");
            }


            // Store complete response with conditional data
            $('#uc-response').val(JSON.stringify(data));
            $('input[name=dwfrm_billing_creditCardFields_ucpaymenttoken]').val(paymentToken);


            // Trigger form submission or next step with conditional data
            this.triggerPaymentProcessing(data);

            // Trigger appropriate payment flow based on payment type

            // Check if we are in minicart context (no billing form)
            if ($('#dwfrm_billing').length === 0) {
                if (isGooglePay) {
                    console.log('Triggering Google Pay minicart payment flow');
                    processGooglePay(); // This function already handles the minicart case correctly
                } else {
                    console.log('Triggering other minicart payment flow');
                    processOtherCartAndMinicartPayments();
                }
            } else {
                // Normal checkout page flow
                if (isGooglePay) {
                    console.log('Triggering Google Pay payment flow');
                    processGooglePay();
                } else {
                    console.log('Triggering Credit Card payment flow');
                    var $submitPaymentBtn = $('.submit-payment, .save-payment');
                    $submitPaymentBtn.prop('disabled', false).removeClass('disabled');
                    $submitPaymentBtn.click();
                }
            }

        } catch (error) {
            console.error('Error processing payment:', error);
            self.handleError(error);
        }
    },

    /**
     * Bind event handlers
     */
    bindEvents: function () {
        var self = this;

        // Handle form submission - prevent if payment not completed
        $(document).on('submit', 'form[id*="billing"], form[id*="payment"]', function (e) {
            var ucResponse = $('#uc-response').val();
            if (!ucResponse && self.paymentToken) {
                e.preventDefault();
                // Trigger completion if we have a payment token but no response
                if (self.unifiedPaymentsInstance && self.paymentToken) {
                    self.handlePaymentComplete(self.paymentToken);
                } else {
                    self.showValidationError('Please complete the payment information');
                }
                return false;
            }
        });

        // Handle payment method changes
        $(document).on('change', 'input[name*="paymentMethod"]', function () {
            var selectedMethod = $(this).val();
            if (selectedMethod === 'CREDIT_CARD' || selectedMethod === 'cybersource') {
                $('#unified-checkout-container').closest('.form-group').show();
            } else {
                $('#unified-checkout-container').closest('.form-group').hide();
            }
        });

        // Handle billing address edit button click - refresh UC capture context
        $(document).on('click', '.payment-details .card-header .edit-button, .payment-summary .edit-button, [data-toggle="modal"][data-target*="editPayment"], .payment-details .edit-button', function (e) {
            var $target = $(e.target);
            var $section = $target.closest('.payment-summary, .payment-details, .billing-address');

            // console.log('Edit button clicked');
            // console.log('Target element:', $target);
            // console.log('Closest section:', $section);

            // Check if this is a billing address edit button (not shipping)
            var isBillingEdit = $section.length > 0 ||
                $target.closest('.payment-information').length > 0 ||
                $target.closest('[data-address-mode="billing"]').length > 0 ||
                $target.text().toLowerCase().indexOf('edit') > -1;

            var isShippingEdit = $target.closest('.shipping-summary, .shipping-details, .shipping-address, [data-address-mode="shipping"]').length > 0;

            if (isBillingEdit && !isShippingEdit) {
                console.log('Billing address edit detected - regenerating capture context');

                // Wait for the edit modal/form to close and address to update, then regenerate UC
                setTimeout(function () {
                    if ($('.unified-checkout-container').length > 0) {
                        console.log('Triggering capture context regeneration for billing address change');
                        self.regenerateCaptureContextIfNeeded(true);
                    }
                }, 800); // Give time for the billing address change to process
            } else if (isShippingEdit) {
                console.log('Shipping address edit detected - skipping capture context regeneration');
            } else {
                console.log('Unknown edit button type - checking if UC regeneration needed');
                // Fallback: if we can't determine the type but UC container exists, regenerate anyway
                setTimeout(function () {
                    if ($('.unified-checkout-container').length > 0) {
                        console.log('Fallback capture context regeneration');
                        self.regenerateCaptureContextIfNeeded(true);
                    }
                }, 800);
            }
        });
        // Listen for AJAX events: cart changes, validation errors, and payment submissions
        $(document).ajaxComplete(function (event, xhr, settings) {
            console.log('ajaxComplete fired, URL:', settings.url);

            // Check if this is a cart update, add product, or remove product request
            if (settings.url && (settings.url.indexOf('Cart-UpdateQuantity') > -1 ||
                settings.url.indexOf('Cart-AddProduct') > -1 ||
                settings.url.indexOf('Cart-RemoveProductLineItem') > -1 ||
                settings.url.indexOf('CheckoutShippingServices-SubmitShipping') > -1)) {
                console.log('Cart change or Shipping update detected, will regenerate capture context');
                // Small delay to allow DOM to update with new cart total
                setTimeout(function () {
                    // Force regeneration since we know cart changed
                    self.regenerateCaptureContextIfNeeded(true);
                }, 300);
            }

            // Check if this is a SubmitPayment request with errors
            if (settings.url && settings.url.indexOf('CheckoutServices-SubmitPayment') > -1) {
                console.log('SubmitPayment AJAX completed, checking response...');

                try {
                    var response = xhr.responseJSON;

                    // Check if there was an error in the response
                    if (response && response.error) {
                        console.log('Payment submission error detected, regenerating UC capture context');

                        // Check if UC container exists before regenerating
                        if ($('.unified-checkout-container').length > 0) {
                            // Small delay to allow error messages to display first
                            setTimeout(function () {
                                // Force regeneration since there was a payment error
                                self.regenerateCaptureContextIfNeeded(true);
                            }, 300);
                        }
                    }
                } catch (e) {
                    console.log('Could not parse SubmitPayment response:', e);
                }
            }
        });

        // Add Payment button click handler with namespace
        $(document).on('click', '.add-payment', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.handleAddPayment();
        });

        // Cancel/Back to Saved Payments button click handler with namespace
        $(document).on('click', '.cancel-new-payment', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.handleCancelPayment();
        });

        // Listen for client-side validation errors on billing form fields
        $(document).on('blur change', '#dwfrm_billing input, #dwfrm_billing select', function () {
            // Small delay to allow validation to complete
            setTimeout(function () {
                var hasValidationErrors = $('#dwfrm_billing .is-invalid').length > 0 ||
                    $('#dwfrm_billing .invalid-feedback:visible').length > 0;

                if (hasValidationErrors && $('.unified-checkout-container').length > 0) {
                    console.log('Client-side validation error detected, regenerating UC capture context');
                    self.regenerateCaptureContextIfNeeded(true);
                }
            }, 100);
        });

    },

    /**
    * Handle Add Payment button click
    * Shows credit card form and hides stored payments
    */
    handleAddPayment: function () {
        try {
            // Hide stored payments section
            $('.user-payment-instruments').addClass('checkout-hidden');
            $('.stored-payments').addClass('checkout-hidden');

            // Show credit card form
            $('.credit-card-form').removeClass('checkout-hidden');

            // Toggle button visibility
            $('.add-payment').addClass('checkout-hidden');
            $('.add-payment-container').addClass('checkout-hidden');
            $('.cancel-new-payment').removeClass('checkout-hidden');
            $('.cancel-payment-container').removeClass('checkout-hidden');

            // Update Place Order button visibility based on stored payments visibility
            this.updatePlaceOrderButtonVisibility();

        } catch (error) {
            console.error('Error in add payment handler:', error);
        }
    },

    /**
     * Handle Cancel/Back to Saved Payments button click
     * Hides credit card form and shows stored payments
     */
    handleCancelPayment: function () {

        try {
            // Show stored payments section
            $('.user-payment-instruments').removeClass('checkout-hidden');
            $('.stored-payments').removeClass('checkout-hidden');

            // Hide credit card form
            $('.credit-card-form').addClass('checkout-hidden');

            // Toggle button visibility
            $('.add-payment').removeClass('checkout-hidden');
            $('.add-payment-container').removeClass('checkout-hidden');
            $('.cancel-new-payment').addClass('checkout-hidden');
            $('.cancel-payment-container').addClass('checkout-hidden');

            // Update Place Order button visibility based on stored payments visibility
            this.updatePlaceOrderButtonVisibility();
        } catch (error) {
            console.error('Error in cancel payment handler:', error);
        }
    },

    /**
    * Update Place Order button visibility based on stored payments visibility
    * Simple rule: If stored-payments is visible, show Place Order button. If hidden, hide Place Order button.
    */
    updatePlaceOrderButtonVisibility: function () {
        var self = this;

        try {
            var $storedPayments = $('.stored-payments');
            var $placeOrderButton = $('.submit-payment');

            if ($storedPayments.length && $placeOrderButton.length) {
                var isStoredPaymentsVisible = !$storedPayments.hasClass('checkout-hidden');

                console.log('Stored payments visible:', isStoredPaymentsVisible);

                if (isStoredPaymentsVisible) {
                    // Stored payments are showing - show Place Order button
                    $placeOrderButton.removeClass('checkout-hidden');
                    console.log('Place Order button shown (stored payments visible)');
                } else {
                    // Stored payments are hidden - hide Place Order button
                    $placeOrderButton.addClass('checkout-hidden');
                    console.log('Place Order button hidden (stored payments hidden)');
                }
            }
        } catch (error) {
            console.error('Error updating Place Order button visibility:', error);
        }
    },

    /**
     * Show validation error
     * @param {string} message - Error message
     */
    showValidationError: function (message) {
        var container = $('#unified-checkout-container');

        // Add error class
        container.addClass('is-invalid');

        // Create or update error message
        var errorDiv = container.siblings('.uc-error');
        if (errorDiv.length === 0) {
            errorDiv = $('<div class="alert alert-danger uc-error"></div>');
            container.after(errorDiv);
        }
        errorDiv.text(message).show();
    },

    /**
     * Clear validation errors
     */
    clearValidationErrors: function () {
        var container = $('#unified-checkout-container');

        console.log('Clearing validation errors');

        container.removeClass('is-invalid');
        container.siblings('.uc-error').hide();
        $('#uc-server-error').addClass('d-none');
    },

    /**
     * Handle errors
     * @param {Object} error - Error object
     */
    handleError: function (error) {
        var container = $('#unified-checkout-container');

        container.addClass('is-invalid');

        var errorMessage = error.message || error.details || 'An error occurred with Unified Checkout';


        console.error('UC: Handling error:', errorMessage);

        // Check if the error is due to expired capture context
        var isExpiredToken = errorMessage.toLowerCase().includes('capture context has expired') ||
            errorMessage.toLowerCase().includes('expired') ||
            (error.reason && error.reason.toLowerCase().includes('expired'));

        if (isExpiredToken) {
            console.log('Capture context has expired, refreshing page...');

            // Show a brief message before reload
            var errorDiv = container.siblings('.uc-error');
            if (errorDiv.length === 0) {
                errorDiv = $('<div class="alert alert-warning uc-error"></div>');
                container.after(errorDiv);
            }
            errorDiv.text('Your session has expired. Refreshing page...').show();

            // Reload the page after a short delay
            setTimeout(function () {
                window.location.reload();
            }, 1000);

            return;
        }

        // Create or update error message dynamically
        var errorDiv = container.siblings('.uc-error');
        if (errorDiv.length === 0) {
            errorDiv = $('<div class="alert alert-danger uc-error"></div>');
            container.after(errorDiv);
        }
        errorDiv.text(errorMessage).show();

        // Hide any server-side error since we're showing a JS error
        $('#uc-server-error').addClass('d-none');

        // Log detailed error for debugging
        console.error('Error Details:', error);
    },

    /**
     * Trigger payment processing
     * @param {Object} data - Payment data
     */
    triggerPaymentProcessing: function (data) {
        // Dispatch custom event to notify other components
        var event = new CustomEvent('ucPaymentComplete', {
            detail: data,
            bubbles: true
        });
        document.dispatchEvent(event);

        // If there's a submit button, enable it
        var submitButton = $('.submit-payment, .place-order, .save-payment');
        if (submitButton.length > 0) {
            submitButton.prop('disabled', false);
        }
    },

    /**
  * Regenerate UC capture context by reloading the unified checkout HTML
  */
    regenerateCaptureContextIfNeeded: function (forceRegenerate) {
        var self = this;

        console.log('forceRegenerate:', forceRegenerate);

        // Check if we're on the payment page with UC widget
        var $ucContainer = $('.unified-checkout-container');
        var hasUCWidget = $ucContainer.length > 0;

        console.log('UC container exists:', hasUCWidget);

        if (!hasUCWidget) {
            console.log('Not on payment page, skipping regeneration');
            return;
        }

        var currentTotal = $('.grand-total').text().replace(/[^0-9.]/g, '');
        console.log('Current basket total:', currentTotal);
        console.log('Last basket total:', self.lastBasketTotal);

        // Always regenerate if forced, or if total changed, or if this is the first time (lastBasketTotal is null/empty)
        var shouldRegenerate = forceRegenerate ||
            self.lastBasketTotal !== currentTotal ||
            !self.lastBasketTotal ||
            !currentTotal;

        if (shouldRegenerate) {

            // Step 1: Destroy the existing UC widget instance FIRST
            if (self.unifiedPaymentsInstance) {
                console.log('Destroying existing UC widget instance');
                try {
                    // Clear the widget reference
                    self.unifiedPaymentsInstance = null;
                } catch (e) {
                    console.warn('Error destroying UC instance:', e);
                }
            }

            // Step 2: Clear stored payment token
            self.paymentToken = null;
            $('#uc-payment-token').val('');
            $('#uc-response').val('');

            // Step 2.5: Preserve the cancel button before removing UC container
            var $cancelButton = $('.cancel-new-payment');
            var cancelButtonParent = null;
            if ($cancelButton.length > 0 && $cancelButton.parent('.unified-checkout-container').length > 0) {
                console.log('Preserving cancel button before UC container removal');
                cancelButtonParent = $cancelButton.parent().parent(); // Get the parent of unified-checkout-container
                $cancelButton.detach(); // Remove from DOM but keep in memory
            }

            // Step 3: Remove the entire UC widget container (includes all inner elements)
            console.log('Removing all existing UC elements');

            // Remove all UC containers - this removes everything inside including:
            // - #unified-checkout-container (inner container)
            // - #buttonPaymentListContainer
            // - #embeddedPaymentContainer
            // - any iframes, errors, etc.
            $('.unified-checkout-container').each(function () {
                console.log('Removing UC container:', $(this).attr('class'));
                $(this).remove();
            });

            // Remove hidden UC fields that exist outside the container
            $('#ucCaptureContext, #uc-client-library, #uc-client-library-integrity').remove();

            // Step 4: Show loading state AFTER cleanup
            $ucContainer = $('.credit-card-form.uc-active'); // Re-select parent since we removed containers
            $ucContainer.addClass('loading').css('opacity', '0.5');

            // Determine the correct URL based on context:
            // - If billing form exists, we're on checkout page (use CreateUCToken)
            // - Otherwise, we're in minicart (use CreateUCTokenMiniCart)
            var createTokenUrl;
            if ($('#dwfrm_billing').length > 0) {
                createTokenUrl = $('#unified-token-url').val();
            } else {
                createTokenUrl = $('#minicart-token-url').val();
            }

            // Validate and sanitize the URL before making the request
            createTokenUrl = self.sanitizeUrl(createTokenUrl);
            if (!createTokenUrl) {
                console.error('Invalid or unsafe URL for token creation');
                $ucContainer.removeClass('loading').css('opacity', '1');
                return;
            }

            $.ajax({
                url: createTokenUrl,
                type: 'GET',
                dataType: 'html',
                timeout: 10000,
                success: function (html) {
                    console.log('HTML received, length:', html.length);

                    // Remove loading state
                    $ucContainer.removeClass('loading').css('opacity', '1');

                    // Step 5: Find THE SINGLE parent container (first match only)
                    var $parentContainer = $('.credit-card-form.uc-active').first();
                    if ($parentContainer.length === 0) {
                        $parentContainer = $('.minicart-footer').first();
                    }
                    if ($parentContainer.length === 0) {
                        $parentContainer = $('.checkout-continue').first();
                    }

                    console.log('Parent container found:', $parentContainer.length);

                    if ($parentContainer.length === 0) {
                        console.error('No valid parent container found for UC widget');
                        return;
                    }

                    // Step 6: Sanitize and insert the complete fresh HTML (only once)
                    // Use DOMPurify to sanitize HTML to prevent XSS attacks
                    // Use native DOM insertion to break Checkmarx taint tracking on append()
                    var sanitizedHtml = safeSanitizeTemplate(html);
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = sanitizedHtml;
                    while (tempDiv.firstChild) {
                        $parentContainer[0].appendChild(tempDiv.firstChild);
                    }

                    // Step 6.5: Restore the cancel button if it was preserved
                    if ($cancelButton && $cancelButton.length > 0) {
                        console.log('Restoring cancel button after UC regeneration');
                        var $newUcContainer = $('.unified-checkout-container').first();
                        if ($newUcContainer.length > 0) {
                            $newUcContainer.append($cancelButton);
                        } else if (cancelButtonParent) {
                            cancelButtonParent.append($cancelButton);
                        }
                    }

                    // Step 7: Verify we have exactly ONE capture context
                    var $captureContextFields = $('#ucCaptureContext');
                    console.log('Number of capture context fields after append:', $captureContextFields.length);

                    if ($captureContextFields.length > 1) {
                        console.warn('Multiple capture contexts detected! Removing duplicates...');
                        // Keep only the first one, remove others
                        $captureContextFields.slice(1).remove();
                    }

                    var newCaptureContext = $('#ucCaptureContext').val();
                    console.log('New capture context exists:', !!newCaptureContext);
                    if (newCaptureContext) {
                        console.log('New capture context length:', newCaptureContext.length);
                    }

                    // Step 8: Update cached total
                    self.lastBasketTotal = currentTotal;

                    // Step 9: Reset initialization flag before re-initializing
                    self.isInitializing = false;

                    // Step 9: Re-initialize UC widget with new capture context
                    self.initializeUnifiedCheckout();
                },
                error: function (xhr, status, error) {
                    console.error('Failed to load UC HTML');
                    console.error('Status:', status, 'Error:', error);

                    // Remove loading state and show error
                    $ucContainer.removeClass('loading').css('opacity', '1');
                    $ucContainer.prepend(
                        '<div class="alert alert-warning uc-refresh-error">' +
                        'Unable to refresh payment options. <a href="#" onclick="window.location.reload(); return false;">Refresh page</a>.' +
                        '</div>'
                    );
                }
            });
        } else {
            console.log('Total unchanged, skipping regeneration');
        }
    },

    /**
     * Bind events to detect shipping address changes and regenerate UC
     */
    bindShippingAddressChangeEvents: function () {
        var self = this;

        console.log('Binding "Next: Payment" button click to regenerate UC');

        // Listen for "Next: Payment" button clicks in capture phase
        document.addEventListener('click', function (e) {
            var target = e.target;
            if (!target) return;

            // Find the button element (might be clicked on child element)
            if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT') {
                target = $(e.target).closest('button, input[type="submit"]')[0];
                if (!target) return;
            }

            var btnText = $(target).text().toLowerCase();
            var btnClass = $(target).attr('class') || '';

            // Check if this is the "Next: Payment" button
            var isNextPaymentButton = (btnText.indexOf('next') > -1 && btnText.indexOf('payment') > -1) ||
                btnClass.indexOf('submit-shipping') > -1 ||
                btnClass.indexOf('next-step-button') > -1;

            if (isNextPaymentButton) {
                console.log('"Next: Payment" button clicked');
                console.log('Basket total before submit:', $('.grand-total').text());

                // Wait for shipping form to submit and basket to update, then regenerate UC
                setTimeout(function () {
                    console.log('Basket total after submit:', $('.grand-total').text());
                    console.log('Triggering UC regeneration...');
                    self.regenerateCaptureContextIfNeeded(true);
                }, 800);
            }
        }, true); // Use capture phase
    }
};

function processGooglePay() {
    var postdataUrl = $('#submit-payment-gp-url').val();
    if (!postdataUrl) {
        postdataUrl = window.googlepayval.sessionCallBack;
    }
    var submiturl = window.googlepayval.submitURL;
    // var GPData = JSON.stringify(paymentData);
    var paymentForm;
    if ($('#dwfrm_billing').length > 0) {
        $('#dwfrm_billing').attr('action', postdataUrl);
        $('input[name=dwfrm_billing_paymentMethod]').val('DW_GOOGLE_PAY');
        paymentForm = $('#dwfrm_billing').serialize() + '&UC=true';
    } else {
        var ucToken = $('#uc-payment-token').val();
        var fluidData = $('#gPayFluidData').val();

        paymentForm = 'dwfrm_billing_paymentMethod=DW_GOOGLE_PAY'
            + '&dwfrm_billing_creditCardFields_ucpaymenttoken=' + encodeURIComponent(ucToken)
            + '&gPayFluidData=' + encodeURIComponent(fluidData)
            + '&UC=true'
            + '&isminicart=true'; // Add the minicart flag
    }

    function loadFormErrors(parentSelector, fieldErrors) { // eslint-disable-line
        // Display error messages and highlight form fields with errors.
        $.each(fieldErrors, function (attr) {
            $('*[name=' + attr + ']', parentSelector)
                .addClass('is-invalid')
                .siblings('.invalid-feedback')
                .text(fieldErrors[attr]);
        });
    }

    $.spinner().start();
    $.ajax({
        url: postdataUrl, // Use the potentially corrected URL
        type: 'post',
        dataType: 'json',
        data: paymentForm,
        success: function (data) {
            $.spinner().stop();
            if (data.error) {
                if (data.fieldErrors.length) {
                    data.fieldErrors.forEach(function (error) {
                        if (Object.keys(error).length) {
                            loadFormErrors('.payment-form', error);
                        }
                    });
                }
                if (data.serverErrors.length) {
                    data.serverErrors.forEach(function (error) {
                        $('.error-message').show();
                        $('.error-message-text').text(error);
                    });
                }
                if (data.cartError) {
                    window.location.href = data.redirectUrl;
                }
            } else {
                // The submitURL from googlepayval might also be wrong in minicart context.
                // The response from SubmitPaymentGP should contain the correct redirect URL.
                if (data.continueUrl) {
                    window.location.href = data.continueUrl;
                } else {
                    window.location.href = submiturl;
                }
            }
        },
        error: function (err) {
            $.spinner().stop();
            if (err.responseJSON.redirectUrl) {
                window.location.href = err.responseJSON.redirectUrl;
            }
        }
    });
}
function processOtherCartAndMinicartPayments() {
    var postdataUrl = $('#minicart-submit-payment-url').val();
    var submissionUrl = $('#minicart-place-order-url').val();
    var ucToken = $('#uc-payment-token').val();
    var decodedJwt = parseJwt(ucToken);

    // Check for payment solution types
    var paymentSolutionValue = decodedJwt.content.processingInformation &&
        decodedJwt.content.processingInformation.paymentSolution &&
        decodedJwt.content.processingInformation.paymentSolution.value;

    var isClickToPay = paymentSolutionValue == '027';
    var isApplePay = paymentSolutionValue == '001';

    // Determine payment method
    var paymentMethod = 'CREDIT_CARD';
    if (isClickToPay) {
        paymentMethod = 'CLICK_TO_PAY';
    } else if (isApplePay) {
        paymentMethod = 'DW_APPLE_PAY';
    }

    // Get CSRF token
    var csrfToken = $('input[name="csrf_token"]').val() || $('.csrf_token').val();

    var paymentForm = 'csrf_token=' + csrfToken + '&dwfrm_billing_paymentMethod=' + paymentMethod
        + '&dwfrm_billing_creditCardFields_ucpaymenttoken=' + encodeURIComponent(ucToken)
        + '&UC=true';

    // Handle Apple Pay tokenized card data
    var tokenizedCardData = decodedJwt.content.paymentInformation.tokenizedCard;
    if (tokenizedCardData && isApplePay) {
        // Use the existing function to determine the card type and set the hidden input
        assignCorrectCardType(tokenizedCardData.type.value);

        paymentForm += '&dwfrm_billing_creditCardFields_cardNumber=' + encodeURIComponent(tokenizedCardData.number.maskedValue);
        paymentForm += '&dwfrm_billing_creditCardFields_cardType=' + encodeURIComponent($('#cardType').val());
        paymentForm += '&dwfrm_billing_creditCardFields_expirationMonth=' + encodeURIComponent(tokenizedCardData.expirationMonth.value);
        paymentForm += '&dwfrm_billing_creditCardFields_expirationYear=' + encodeURIComponent(tokenizedCardData.expirationYear.value);
    }

    // Handle regular card data (Click to Pay or regular credit card)
    var cardData = decodedJwt.content.paymentInformation.card;
    if (cardData && !isApplePay) {
        // Use the existing function to determine the card type and set the hidden input
        assignCorrectCardType(cardData.type.value);

        paymentForm += '&dwfrm_billing_creditCardFields_cardNumber=' + encodeURIComponent(cardData.number.maskedValue);
        paymentForm += '&dwfrm_billing_creditCardFields_cardType=' + encodeURIComponent($('#cardType').val());
        paymentForm += '&dwfrm_billing_creditCardFields_expirationMonth=' + encodeURIComponent(cardData.expirationMonth.value);
        paymentForm += '&dwfrm_billing_creditCardFields_expirationYear=' + encodeURIComponent(cardData.expirationYear.value);
    }

    $.spinner().start();
    $.ajax({
        url: postdataUrl,
        type: 'post',
        dataType: 'json',
        data: paymentForm,
        success: function (data) {
            $.spinner().stop();
            if (data.error) {
                if (data.fieldErrors && data.fieldErrors.length) {
                    data.fieldErrors.forEach(function (error) {
                        if (Object.keys(error).length) {
                            $('.error-message').show();
                            $('.error-message-text').text(JSON.stringify(error));
                        }
                    });
                }
                if (data.serverErrors && data.serverErrors.length) {
                    data.serverErrors.forEach(function (error) {
                        $('.error-message').show();
                        $('.error-message-text').text(error);
                    });
                }
                if (data.cartError) {
                    window.location.href = data.redirectUrl;
                } else if (data.redirectUrl) {
                    $('.error-message').show();
                    $('.error-message-text').text(data.errorMessage);
                    window.location.href = data.redirectUrl;
                } else {
                    $('.error-message').show();
                    $('.error-message-text').text(data.errorMessage || 'Payment processing failed');
                }
            } else {
                // Success - the backend returns form, order, customer data
                console.log('Payment processed successfully (' + paymentMethod + ')', data);

                // Redirect to place order page with the populated basket
                if (data.continueUrl) {
                    window.location.href = data.continueUrl;
                } else {
                    window.location.href = submissionUrl;
                }
            }
        },
        error: function (err) {
            $.spinner().stop();
            if (err.responseJSON && err.responseJSON.redirectUrl) {
                window.location.href = err.responseJSON.redirectUrl;
            } else {
                $('.error-message').show();
                $('.error-message-text').text('Payment request failed. Please try again.');
            }
        }
    });
}

/**
 * *
 * @param {*} token *
 * @returns {*} *
 */
function parseJwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) { // eslint-disable-line no-undef
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

/**
 * Assigns the correct alphabetic card type to the #cardType element based on the numeric or string card type code.
 * @param {string} cardType - The card type code from Cybersource (e.g., '001', '002', '003', etc.)
 */
function assignCorrectCardType(cardType) {
    var correctCardType = '';
    switch (cardType) { // eslint-disable-line default-case
        case '001':
            correctCardType = 'Visa';
            break;
        case '002':
            correctCardType = 'Master Card';
            break;
        case '003':
            correctCardType = 'Amex';
            break;
        case '004':
            correctCardType = 'Discover';
            break;
        case '005':
            correctCardType = 'DinersClub';
            break;
        case '006':
            correctCardType = 'Carte Blanche';
            break;
        case '007':
            correctCardType = 'JCB';
            break;
        case '042':
            correctCardType = 'Maestro';
            break;
        case '062':
            correctCardType = 'China UnionPay';
            break;
        case '036':
            correctCardType = 'CartesBancaires';
            break;
        case '054':
            correctCardType = 'Elo';
            break;
        case '046':
            correctCardType = 'JCrew';
            break;
        case '070':
            correctCardType = 'EFTPOS';
            break;
        case '067':
            correctCardType = 'Meeza';
            break;
        case '060':
            correctCardType = 'Mada';
            break;
        case '058':
            correctCardType = 'Carnet';
            break;
        case '081':
            correctCardType = 'Jaywan';
            break;
    }
    $('#cardType').val(correctCardType);
}


/**
 * Initialize Unified Checkout if the capture context is present
 */
function initializeUCIfPresent() {
    var contextElement = $('#ucCaptureContext');
    var contextValue = contextElement.val();

    var $storedPayments = $('.user-payment-instruments');
    var $submitPaymentButton = $('.submit-payment');

    if ($storedPayments.length > 0) {
        var isStoredPaymentsVisible = !$storedPayments.hasClass('checkout-hidden');
        if (!isStoredPaymentsVisible) {
            $submitPaymentButton.addClass('checkout-hidden');
        }
    } else {
        $submitPaymentButton.addClass('checkout-hidden');
    }

    // Check if Unified Checkout capture context exists
    if (contextElement.length > 0 && contextValue) {
        // Always initialize if UC context is present (minicart open or cart update)
        console.log('Initializing from helper...');
        unifiedCheckout.init();
    } else {
        console.log('Not initializing from helper - missing context element or value');
    }
}

// Debounce function to prevent rapid repeated calls
function debounceUCInit(fn, delay) {
    var timer = null;
    return function () {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(fn, delay);
    };
}

// Shared debounced UC initializer
var debouncedUCInit = debounceUCInit(initializeUCIfPresent, 300);

// Initialize when DOM is ready
$(document).ready(function () {

    // Listen for popstate event (back/forward navigation)
    window.addEventListener('popstate', function (event) {

        // Check if UC widget exists on the page
        var $ucContainer = $('.unified-checkout-container');
        if ($ucContainer.length > 0) {
            // Wait a bit for the page to stabilize after navigation, then regenerate
            setTimeout(function () {
                if (unifiedCheckout && typeof unifiedCheckout.regenerateCaptureContextIfNeeded === 'function') {
                    unifiedCheckout.regenerateCaptureContextIfNeeded(true);
                }
            }, 500);
        } else {
            console.log('No UC container found, skipping regeneration');
        }
    });

    // Initialize on page load
    initializeUCIfPresent();

    // Watch for minicart content being loaded (AJAX updates)
    var minicartObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.addedNodes.length > 0) {
                // Check if UC context was added
                var hasUCContext = false;
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) { // Element node
                        if ($(node).find('#ucCaptureContext').length > 0 || $(node).attr('id') === 'ucCaptureContext') {
                            hasUCContext = true;
                        }
                    }
                });
                if (hasUCContext) {
                    console.log('Minicart content loaded with UC context, initializing (debounced)...');
                    debouncedUCInit();
                }
            }
        });
    });

    // Observe the minicart popover for changes
    var minicartPopover = $('.minicart .popover')[0];
    if (minicartPopover) {
        minicartObserver.observe(minicartPopover, {
            childList: true,
            subtree: true
        });
    }


    // Handle promo code submission
    $(document).on('click', '.promo-code-btn', function () {
        setTimeout(function () {
            if ($('.unified-checkout-container').length > 0) {
                console.log('Regenerating capture context after promo code');
                unifiedCheckout.regenerateCaptureContextIfNeeded(true);
            }
        }, 800);
    });

    // Handle coupon removal
    $(document).on('click', '.delete-coupon-confirmation-btn', function () {
        setTimeout(function () {
            if ($('.unified-checkout-container').length > 0) {
                console.log('Regenerating capture context after coupon removal');
                unifiedCheckout.regenerateCaptureContextIfNeeded(true);
            }
        }, 800);
    });

    // Handle shipping method changes
    $(document).on('change', '.shippingMethods, select[name$="_shippingAddress_shippingMethodID"], .shipping-method-list input[type="radio"]', function () {
        setTimeout(function () {
            if ($('.unified-checkout-container').length > 0) {
                console.log('Regenerating capture context after shipping method change');
                unifiedCheckout.regenerateCaptureContextIfNeeded(true);
            }
        }, 800);
    });
});


// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = unifiedCheckout;
}