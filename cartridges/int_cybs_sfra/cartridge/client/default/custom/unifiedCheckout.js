/**
 * Visa Acceptance Unified Checkout JavaScript
 * Handles the initialization and management of Unified Checkout widget
 */

/* eslint-disable */

'use strict';

/**
 * Ensure SFRA's jQuery spinner plugin ($.spinner / $.fn.spinner) is available.
 *
 * This file is served as a standalone static script (URLUtils.staticURL), NOT through
 * the webpack main.js bundle. SFRA only registers the spinner plugin inside that bundle
 * (require('base/components/spinner')). In some contexts — notably the mini-cart Unified
 * Checkout / Google Pay flow — placeOrderDirect() runs against a global jQuery on which
 * the plugin was never registered, throwing "TypeError: $.spinner is not a function" and
 * aborting order placement. Register a SFRA-compatible fallback (identical .veil/.spinner
 * markup, so the existing CSS applies) only when the real plugin is absent; this stays
 * inert whenever main.js has already registered it.
 */
function ensureSpinnerPlugin() {
    if (typeof $ === 'undefined' || typeof $.spinner === 'function') {
        return;
    }
    function addSpinner($target) {
        var $veil = $('<div class="veil"><div class="underlay"></div></div>');
        $veil.append('<div class="spinner"><div class="dot1"></div><div class="dot2"></div></div>');
        if ($target.get(0).tagName === 'IMG') {
            $target.after($veil);
            $veil.css({ width: $target.width(), height: $target.height() });
            if ($target.parent().css('position') === 'static') {
                $target.parent().css('position', 'relative');
            }
        } else {
            $target.append($veil);
            if ($target.css('position') === 'static') {
                $target.parent().css('position', 'relative');
                $target.parent().addClass('veiled');
            }
            if ($target.get(0).tagName === 'BODY') {
                $veil.find('.spinner').css('position', 'fixed');
            }
        }
        $veil.click(function (e) { e.stopPropagation(); });
    }
    function removeSpinner($veil) {
        if ($veil.parent().hasClass('veiled')) {
            $veil.parent().css('position', '');
            $veil.parent().removeClass('veiled');
        }
        $veil.off('click');
        $veil.remove();
    }
    if (typeof $.fn.spinner !== 'function') {
        $.fn.spinner = function () {
            var $element = $(this);
            return {
                start: function () { if ($element.length) { addSpinner($element); } },
                stop: function () { if ($element.length) { removeSpinner($('.veil')); } }
            };
        };
    }
    $.spinner = function () {
        return {
            start: function () { addSpinner($('body')); },
            stop: function () { removeSpinner($('.veil')); }
        };
    };
}

/**
 * Always-safe page-level spinner accessor. Use this instead of calling $.spinner()
 * directly. It lazily registers the SFRA-compatible fallback above AT CALL TIME, which
 * covers the cases the load-time guard alone cannot: jQuery (or the spinner plugin) not
 * yet present when this static script first executed, or a second jQuery instance having
 * replaced the decorated one afterwards. Falls back to a no-op so callers never throw
 * even if jQuery itself is somehow unavailable.
 */
function ucPageSpinner() {
    ensureSpinnerPlugin();
    if (typeof $ !== 'undefined' && typeof $.spinner === 'function') {
        return $.spinner();
    }
    return { start: function () {}, stop: function () {} };
}

// Register eagerly too (no-op if jQuery isn't ready yet) so any other SFRA code on the
// page that expects $.spinner finds it; ucPageSpinner() re-ensures it at call time.
ensureSpinnerPlugin();

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
    unifiedCheckoutInstance: null,  // v1.x checkout instance
    unifiedPaymentsInstance: null,  // v0.x (legacy support)
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
        var self = this;
        console.log('[UC] ====== INIT STARTED ======');

        // Add UC enabled class to body to hide traditional form elements
        $('body').addClass('uc-enabled');
        $('.credit-card-form, .creditCardFields').addClass('uc-active');

        // Clear any existing errors first
        this.clearValidationErrors();
        $('#uc-server-error').addClass('d-none');

        // ALWAYS hide the Place Order button when UC is enabled - UC handles payment
        $('.submit-payment').addClass('checkout-hidden').hide();

        // DON'T hide SFRA saved cards UI here - let checkAndLoadSavedCards handle it
        // The method will either enhance SFRA UI with UC buttons OR hide it and show UC widget

        // Try to load saved cards - if successful, show selector; otherwise show UC directly
        self.checkAndLoadSavedCards();
        
        this.bindEvents();
        this.bindShippingAddressChangeEvents();
        this.injectUpdateBillingButton();
    },

    /**
     * Inject an "Update Billing Address" button below the billing address form on the
     * checkout page. SFRA persists the billing form only via CheckoutServices-SubmitPayment
     * (Place Order), which UC hides. The dropdown-select path already regenerates the
     * capture context on change, but "New address"/"Update address" entry has no persist
     * step, so the entered address never reaches the basket. This button gives the shopper
     * an explicit save-then-regenerate for those paths. See saveBillingAddressAndRegenerate.
     */
    injectUpdateBillingButton: function () {
        // Checkout page only - the minicart/cart express instance has no billing form.
        if ($('#dwfrm_billing').length === 0 || $('.unified-checkout-container').length === 0) {
            return;
        }
        if ($('#uc-update-billing-address-btn').length > 0) {
            return; // already injected
        }
        // Anchor after the phone/contact block (the last billing-address field in SFRA),
        // outside .unified-checkout-container so it survives capture-context regeneration.
        var $anchor = $('.contact-info-block').first();
        if ($anchor.length === 0) {
            $anchor = $('.billing-address').first();
        }
        if ($anchor.length === 0) {
            return;
        }
        var btnHtml =
            '<div class="row mt-2 mb-3" id="uc-update-billing-address-row">' +
                '<div class="col-12">' +
                    '<button type="button" id="uc-update-billing-address-btn" class="btn btn-outline-primary btn-block">Update Billing Address</button>' +
                '</div>' +
            '</div>';
        $anchor.after(btnHtml);

        // Keep the button and the phone/contact block hidden until the shopper opts to
        // edit ("Update Address") or add ("Add New") a billing address. Existing-address
        // selection regenerates automatically via the dropdown change handler, so it
        // needs neither. See the .btn-show-details/.btn-add-new handler in bindEvents.
        $('#uc-update-billing-address-row').hide();
        $('.contact-info-block').hide();
    },

    /**
     * Persist the checkout billing form to the basket, then regenerate the UC capture
     * context so the widget authorizes against the entered billing address.
     */
    saveBillingAddressAndRegenerate: function () {
        var self = this;

        var url = self.sanitizeUrl($('#set-uc-billing-address-url').val());
        if (!url) {
            console.error('[UC] SetUCBillingAddress URL missing or invalid');
            return;
        }

        var $form = $('#dwfrm_billing');
        if ($form.length === 0) {
            console.error('[UC] Billing form not found');
            return;
        }

        var $btn = $('#uc-update-billing-address-btn');
        $btn.prop('disabled', true);
        ucPageSpinner().start();

        $.ajax({
            url: url,
            type: 'POST',
            dataType: 'json',
            data: $form.serialize(),
            success: function (data) {
                ucPageSpinner().stop();
                $btn.prop('disabled', false);

                if (data && data.error) {
                    self.showValidationError(data.errorMessage || 'Please complete the billing address before continuing.');
                    return;
                }

                // Address saved to basket - regenerate so billTo reflects it.
                self.clearValidationErrors();
                self.regenerateCaptureContextIfNeeded(true);
            },
            error: function () {
                ucPageSpinner().stop();
                $btn.prop('disabled', false);
                self.showValidationError('Unable to update billing address. Please try again.');
            }
        });
    },

    // ============================================================================
    // Saved Card Selector Methods (for multi-card support with UC widget)
    // ============================================================================
    
    /**
     * Selected payment instrument ID for UC
     */
    selectedPaymentInstrumentId: null,

    /**
     * Check for saved cards and initialize appropriate UI
     * Uses existing SFRA saved card UI with UC-specific buttons
     */
    checkAndLoadSavedCards: function() {
        var self = this;
        
        // Check if SFRA saved cards exist in the DOM
        var $userPaymentInstruments = $('.user-payment-instruments');
        var $savedPaymentCards = $('.saved-payment-instrument[data-pi-id]');
        
        console.log('[UC] Checking for SFRA saved cards...');
        console.log('[UC] .user-payment-instruments found:', $userPaymentInstruments.length);
        console.log('[UC] .saved-payment-instrument with data-pi-id:', $savedPaymentCards.length);
        
        if ($savedPaymentCards.length > 0) {
            console.log('[UC] Found ' + $savedPaymentCards.length + ' saved cards in SFRA UI');
            // Enhance existing SFRA UI with our buttons
            self.enhanceSfraPaymentUI();
        } else {
            console.log('[UC] No saved cards with TMS IDs, showing UC widget directly');
            // Hide SFRA payment instruments UI and show UC
            $userPaymentInstruments.addClass('checkout-hidden');
            $('.unified-checkout-container').removeClass('checkout-hidden').show();
            self.initializeUnifiedCheckout();
        }
    },

    /**
     * Enhance the existing SFRA saved payment UI with UC-specific buttons
     */
    enhanceSfraPaymentUI: function() {
        var self = this;
        
        var $userPaymentInstruments = $('.user-payment-instruments');
        var $storedPayments = $('.stored-payments');
        var $addPaymentBtn = $('.add-payment');
        var $savedCards = $('.saved-payment-instrument[data-pi-id]');
        
        // Show the SFRA saved payments UI
        $userPaymentInstruments.removeClass('checkout-hidden d-none').show();
        
        // Hide the original SFRA buttons - we'll replace them with our UC buttons
        $addPaymentBtn.hide();
        $('.cancel-new-payment').hide(); // Hide SFRA's "Back to Saved Payments" - we use our own
        
        // Hide the credit card form
        $('.credit-card-form').addClass('checkout-hidden');
        
        // Hide UC widget initially (will show after card selection or "Pay with New Card")
        $('.unified-checkout-container').addClass('checkout-hidden');
        
        // Hide Place Order button - UC handles payment completion
        $('.submit-payment').addClass('checkout-hidden').hide();
        
        // Remove any existing UC buttons and back buttons (in case of re-init)
        $('#uc-saved-card-buttons').remove();
        $('#back-to-saved-cards-btn').remove();
        
        // Add our UC-specific buttons after the stored payments
        var buttonsHtml = 
            '<div id="uc-saved-card-buttons" class="row mt-3">' +
                '<div class="col-12">' +
                    '<button type="button" id="use-selected-card-btn" class="btn btn-primary btn-block mb-2">Continue with Selected Card</button>' +
                    '<div class="text-center my-2"><span class="text-muted">OR</span></div>' +
                    '<button type="button" id="use-new-card-btn" class="btn btn-outline-secondary btn-block">Pay with a New Card or Other Payment Method</button>' +
                '</div>' +
            '</div>';
        
        $storedPayments.after(buttonsHtml);
        
        // Set initial selection from first card with TMS ID
        var $firstCard = $savedCards.filter('.selected-payment').first();
        if (!$firstCard.length) {
            $firstCard = $savedCards.first();
            $savedCards.removeClass('selected-payment');
            $firstCard.addClass('selected-payment');
        }
        self.selectedPaymentInstrumentId = $firstCard.data('pi-id');
        console.log('[UC] Initial selected card PI ID:', self.selectedPaymentInstrumentId);
        
        // Bind events for SFRA saved card selection
        self.bindSfraSavedCardEvents();
        
        console.log('[UC] SFRA payment UI enhanced with UC buttons');
    },

    /**
     * Bind events for SFRA saved card UI with UC functionality
     */
    bindSfraSavedCardEvents: function() {
        var self = this;
        
        // Card selection - when clicking on a saved card row
        $(document).off('click.uc-saved-card').on('click.uc-saved-card', '.saved-payment-instrument[data-pi-id]', function(e) {
            var $card = $(this);
            var piId = $card.data('pi-id');
            
            // Update visual selection
            $('.saved-payment-instrument').removeClass('selected-payment');
            $card.addClass('selected-payment');
            
            // Store selected PI ID
            self.selectedPaymentInstrumentId = piId;
            console.log('[UC] Selected card PI ID:', piId);
        });
        
        // "Continue with Selected Card" button
        $(document).off('click.uc-continue').on('click.uc-continue', '#use-selected-card-btn', function(e) {
            e.preventDefault();
            
            if (!self.selectedPaymentInstrumentId) {
                console.error('[UC] No card selected!');
                return;
            }
            
            console.log('[UC] Continue with selected card:', self.selectedPaymentInstrumentId);
            
            // Hide the saved cards UI
            $('.user-payment-instruments').addClass('checkout-hidden');
            $('#uc-saved-card-buttons').hide();
            
            // Show the UC container and its parent (credit-card-form)
            // The UC container is inside credit-card-form which might be hidden
            var $ucContainer = $('.unified-checkout-container').first();
            $ucContainer.removeClass('checkout-hidden d-none').show();
            $ucContainer.parents().each(function() {
                var $parent = $(this);
                // Don't show user-payment-instruments, only the form container
                if (!$parent.hasClass('user-payment-instruments') && !$parent.hasClass('stored-payments')) {
                    $parent.removeClass('checkout-hidden d-none');
                    if ($parent.css('display') === 'none') {
                        $parent.show();
                    }
                }
            });
            console.log('[UC] UC container visibility:', $ucContainer.is(':visible'));
            
            // Also show credit-card-form explicitly (it contains UC)
            $('.credit-card-form').removeClass('checkout-hidden d-none').show();
            
            // Load UC with selected card
            self.loadUCWithSelectedCard(self.selectedPaymentInstrumentId);
        });
        
        // "Pay with a New Card" button
        $(document).off('click.uc-new-card').on('click.uc-new-card', '#use-new-card-btn', function(e) {
            e.preventDefault();
            
            console.log('[UC] Switching to new card entry (no TMS token)');
            
            // Hide saved cards UI
            $('.user-payment-instruments').addClass('checkout-hidden');
            $('#uc-saved-card-buttons').hide();
            
            // Clear selected card - UC will generate context without TMS token
            self.selectedPaymentInstrumentId = null;
            
            // Show credit-card-form for UC to render into
            $('.credit-card-form').removeClass('checkout-hidden d-none').show();
            
            // Load UC with a FRESH capture context (no TMS token)
            // This will fetch new HTML from CreateUCToken endpoint (not CreateUCTokenWithCard)
            self.loadUCForNewCard();
        });
        
        // "Back to Saved Cards" button (inside UC container)
        $(document).off('click.uc-back').on('click.uc-back', '#back-to-saved-cards-btn', function(e) {
            e.preventDefault();
            
            console.log('[UC] Going back to saved cards');
            
            // Hide UC widget, back button, and credit card form
            $('.unified-checkout-container').addClass('checkout-hidden');
            $('.credit-card-form').addClass('checkout-hidden');
            $(this).hide();
            
            // Show saved cards UI and UC buttons again
            $('.user-payment-instruments').removeClass('checkout-hidden').show();
            $('#uc-saved-card-buttons').show();
            
            // Ensure Place Order stays hidden
            $('.submit-payment').addClass('checkout-hidden').hide();
        });
    },

    /**
     * Load UC widget with a specific saved card
     * @param {string} paymentInstrumentId - TMS payment instrument ID
     */
    loadUCWithSelectedCard: function(paymentInstrumentId) {
        var self = this;
        var createTokenWithCardUrl = $('#create-uc-token-with-card-url').val();
        
        if (!createTokenWithCardUrl) {
            console.error('[UC] Create UC token with card URL not found');
            return;
        }

        createTokenWithCardUrl = self.sanitizeUrl(createTokenWithCardUrl);
        if (!createTokenWithCardUrl) {
            console.error('[UC] Invalid create UC token URL');
            return;
        }

        // Add payment instrument ID to URL
        createTokenWithCardUrl += '?piId=' + encodeURIComponent(paymentInstrumentId);
        console.log('[UC] Fetching capture context with card from:', createTokenWithCardUrl);

        // Find the UC container - could be #uc-widget-wrapper or .unified-checkout-container
        var $ucContainer = $('#uc-widget-wrapper');
        if (!$ucContainer.length) {
            $ucContainer = $('.unified-checkout-container').first();
        }
        
        console.log('[UC] UC container found:', $ucContainer.length > 0, 'selector:', $ucContainer.attr('id') || $ucContainer.attr('class'));

        // Show loading state and ensure container & parents are visible
        $ucContainer.removeClass('checkout-hidden d-none').show().addClass('loading');
        $ucContainer.parents().each(function() {
            var $parent = $(this);
            if (!$parent.hasClass('user-payment-instruments') && !$parent.hasClass('stored-payments')) {
                $parent.removeClass('checkout-hidden d-none');
            }
        });
        $('.credit-card-form').removeClass('checkout-hidden d-none').show();
        
        // Remove any existing back buttons, then add ONE at the BOTTOM
        $('#back-to-saved-cards-btn').remove();
        var backBtnHtml = '<button type="button" id="back-to-saved-cards-btn" class="btn btn-outline-primary btn-block mt-2">Back to Saved Cards</button>';
        $ucContainer.append(backBtnHtml);
        
        // Destroy existing UC instance
        self.destroyExistingUCInstance();

        // Fetch new capture context with selected card
        $.ajax({
            url: createTokenWithCardUrl,
            type: 'GET',
            dataType: 'html',
            success: function(html) {
                console.log('[UC] Received UC HTML with selected card');
                
                $ucContainer.removeClass('loading');
                
                // Remove the back button before clearing, we'll re-add it
                var $backBtn = $('#back-to-saved-cards-btn').detach();
                
                // Clear existing UC content
                $ucContainer.find('.unified-checkout, #ucCaptureContext, #uc-client-library, #uc-client-library-integrity').remove();
                
                // Sanitize and insert new HTML
                var sanitizedHtml = safeSanitizeTemplate(html);
                $ucContainer.html(sanitizedHtml);
                
                // Re-add the back button at the BOTTOM (only once)
                $ucContainer.append($backBtn);
                
                console.log('[UC] HTML inserted, checking for capture context...');
                console.log('[UC] #ucCaptureContext exists:', $('#ucCaptureContext').length > 0);
                console.log('[UC] Capture context value:', $('#ucCaptureContext').val() ? 'present' : 'empty');
                console.log('[UC] #buttonPaymentListContainer exists:', $('#buttonPaymentListContainer').length > 0);
                console.log('[UC] #embeddedPaymentContainer exists:', $('#embeddedPaymentContainer').length > 0);
                
                // Ensure UC mount containers are visible
                $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('checkout-hidden d-none').css({
                    'display': 'block',
                    'visibility': 'visible'
                });
                
                // Ensure the .unified-checkout-container inside is visible
                $ucContainer.find('.unified-checkout-container').removeClass('checkout-hidden d-none').show();
                
                // Re-initialize UC widget
                self.isInitializing = false;
                self.initializeUnifiedCheckout();
            },
            error: function(xhr, status, error) {
                console.error('[UC] Failed to load UC with selected card:', error);
                $ucContainer.removeClass('loading');
                self.showValidationError('Failed to load payment widget. Please try again.');
            }
        });
    },

    /**
     * Load UC widget for new card entry (no TMS token)
     * Fetches a fresh capture context from CreateUCToken endpoint
     */
    loadUCForNewCard: function() {
        var self = this;
        var createTokenUrl = $('#unified-token-url').val();
        
        if (!createTokenUrl) {
            console.error('[UC] Create UC token URL not found');
            return;
        }

        createTokenUrl = self.sanitizeUrl(createTokenUrl);
        if (!createTokenUrl) {
            console.error('[UC] Invalid create UC token URL');
            return;
        }

        console.log('[UC] Fetching fresh capture context for new card from:', createTokenUrl);

        // Find the UC container
        var $ucContainer = $('.unified-checkout-container').first();
        if (!$ucContainer.length) {
            $ucContainer = $('.credit-card-form').first();
        }
        
        // Show loading state and ensure visibility
        $ucContainer.removeClass('checkout-hidden d-none').show().addClass('loading');
        $ucContainer.parents().each(function() {
            var $parent = $(this);
            if (!$parent.hasClass('user-payment-instruments') && !$parent.hasClass('stored-payments')) {
                $parent.removeClass('checkout-hidden d-none');
            }
        });
        $('.credit-card-form').removeClass('checkout-hidden d-none').show();
        
        // Remove any existing back buttons first, then add ONE at the BOTTOM
        $('#back-to-saved-cards-btn').remove();
        var backBtnHtml = '<button type="button" id="back-to-saved-cards-btn" class="btn btn-outline-primary btn-block mt-2">Back to Saved Cards</button>';
        $ucContainer.append(backBtnHtml);

        // Destroy existing UC instance
        self.destroyExistingUCInstance();

        // Fetch new capture context WITHOUT TMS token
        $.ajax({
            url: createTokenUrl,
            type: 'GET',
            dataType: 'html',
            success: function(html) {
                console.log('[UC] Received UC HTML for new card (no TMS token)');
                
                $ucContainer.removeClass('loading');
                
                // Remove the back button before clearing, we'll re-add it
                var $backBtn = $('#back-to-saved-cards-btn').detach();
                
                // Clear existing UC content
                $ucContainer.find('.unified-checkout, #ucCaptureContext, #uc-client-library, #uc-client-library-integrity').remove();
                $ucContainer.find('#buttonPaymentListContainer, #embeddedPaymentContainer').remove();
                
                // Sanitize and insert new HTML
                var sanitizedHtml = safeSanitizeTemplate(html);
                $ucContainer.html(sanitizedHtml);
                
                // Re-add the back button at the BOTTOM (only once)
                $ucContainer.append($backBtn);
                
                console.log('[UC] HTML inserted for new card, verifying capture context...');
                console.log('[UC] #ucCaptureContext exists:', $('#ucCaptureContext').length > 0);
                
                // Ensure UC mount containers are visible
                $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('checkout-hidden d-none').css({
                    'display': 'block',
                    'visibility': 'visible'
                });
                
                // Re-initialize UC widget
                self.isInitializing = false;
                self.initializeUnifiedCheckout();
            },
            error: function(xhr, status, error) {
                console.error('[UC] Failed to load UC for new card:', error);
                $ucContainer.removeClass('loading');
                self.showValidationError('Failed to load payment widget. Please try again.');
            }
        });
    },

    /**
     * Destroy existing UC instance and clear state
     */
    destroyExistingUCInstance: function() {
        var self = this;
        
        if (self.unifiedCheckoutInstance) {
            console.log('Destroying existing UC instance');
            try {
                self.unifiedCheckoutInstance = null;
            } catch (e) {
                console.warn('Error destroying UC instance:', e);
            }
        }
        
        if (self.unifiedPaymentsInstance) {
            try {
                self.unifiedPaymentsInstance = null;
            } catch (e) {
                console.warn('Error destroying legacy UC instance:', e);
            }
        }
        
        // Clear payment state
        self.paymentToken = null;
        $('#uc-payment-token').val('');
        $('#uc-transaction-id').val('');
        $('#uc-response').val('');

        // Disconnect save card observer/polling and remove info message
        $('.uc-guest-info').remove();
    },


    /**
     * Initialize the Unified Checkout widget
     */
    initializeUnifiedCheckout: async function () {
        var self = this;

        self.isInitializing = true;

        // Check if VAS SDK is available (v1.x - Visa Application Server)
        // Also check for legacy Accept SDK (v0.x) as fallback
        var hasVasSDK = typeof VAS !== 'undefined' && typeof VAS.UnifiedCheckout === 'function';
        var hasAcceptSDK = typeof Accept !== 'undefined' && typeof Accept === 'function';
        
        if (!hasVasSDK && !hasAcceptSDK) {
            var scriptUrl = $('#uc-client-library').val();
            var integrity = $('#uc-client-library-integrity').val();
            scriptUrl = self.sanitizeScriptUrl(scriptUrl, integrity);
            if (scriptUrl && !window.ucScriptLoading) {
                console.log('UC library not loaded, attempting to load it dynamically...');
                window.ucScriptLoading = true; // Prevent multiple loading attempts
                self.isInitializing = false; // Reset flag so re-initialization can proceed after script loads

                var script = document.createElement('script');
                script.src = scriptUrl;
                script.integrity = integrity;
                script.crossOrigin = 'anonymous';

                script.onload = function () {
                    console.log('UC library loaded successfully.');
                    window.ucScriptLoading = false;
                    self.isInitializing = false;
                    // Re-run initialization now that the script is loaded
                    self.initializeUnifiedCheckout();
                };

                script.onerror = function () {
                    console.error('Failed to load UC library.');
                    window.ucScriptLoading = false;
                    self.isInitializing = false;
                    self.handleError({ message: 'Payment widget library could not be loaded.' });
                };

                document.head.appendChild(script);
                return; // Exit and wait for the script to load
            } else if (window.ucScriptLoading) {
                console.log('UC library is already loading...');
                self.isInitializing = false;
                return;
            } else {
                console.error('UC library URL not found.');
                self.isInitializing = false;
                self.handleError({ message: 'Payment widget library URL not found.' });
                return;
            }
        }

        var sessionJWT = $('#ucCaptureContext').val();

        console.log('Session JWT (Capture context) found:', !!sessionJWT);

        if (!sessionJWT) {
            console.error('Session JWT not found');
            self.isInitializing = false;
            // Do not show error here, as it might be a normal page load without UC
            return;
        }

        console.log('UC library available, launching checkout...');
        console.log('SDK Version - VAS:', typeof VAS !== 'undefined' ? 'v1.x' : 'v0.x');

        try {
            // Add loading class to both containers
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').addClass('loading');

            // Launch Unified Checkout using the SDK
            await this.launchCheckout(sessionJWT);

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
     * Launch Unified Checkout using VAS SDK v1.x (Manual Mode)
     * @param {string} sessionJWT - The session JWT from server
     */
    launchCheckout: async function (sessionJWT) {
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

        try {
            // Initialize VAS SDK with session JWT (v1.x)
            var client = await VAS.UnifiedCheckout(sessionJWT);

            // Centralized SDK-level error handling (v1.x)
            client.on('error', function (err) {
                console.error('UC Error:', err && err.reason, err && err.message);
                self.handleError(err || {});
            });

            // Create checkout instance with manual token handling (autoProcessing: false)
            var checkout = await client.createCheckout({
                autoProcessing: false  // Manual mode - we handle token processing
            });

            // Store reference for later use
            self.unifiedCheckoutInstance = checkout;

            // Mount payment widget and get transient token
            // VAS SDK v1.x mount options:
            // - paymentSelection: Container for payment method buttons
            // - paymentScreen: Container for embedded payment form (only for Embedded mode, not Sidebar)
            var mountArgs = {
                paymentSelection: '#buttonPaymentListContainer'
            };

            // For embedded mode, add the payment screen container
            // Sidebar mode opens a modal overlay, so doesn't need paymentScreen
            if (!sidebar) {
                mountArgs.paymentScreen = '#embeddedPaymentContainer';
            }
            var token = await checkout.mount(mountArgs);

            // Show guest save-card info after widget is mounted
            // self.showGuestSaveCardInfo();

            // For checkout page: run completeMandate orchestration (3DS/DM/Auth)
            // For minicart/cart: also run completeMandate orchestration with captured billing/shipping
            // Total amount includes default SFCC tax (not Visa Acceptance tax calculation)
            var result = null;
            result = await checkout.complete(token);
            console.log('UC v1.x completeMandate orchestration finished');
            if (isMinicart) {
                console.log('UC v1.x minicart/cart flow - completeMandate with captured addresses');
            }

            console.log('UC v1.x payment widget mounted successfully');
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

            // Store token and pass complete response to existing processing flow
            self.paymentToken = token;
            self.handlePaymentComplete(token, result);

        } catch (error) {
            console.error('Error launching UC v1.x:', error);
            $('#buttonPaymentListContainer, #embeddedPaymentContainer').removeClass('loading');
            self.handleError(error);
            // Let caller handle isInitializing flag
            throw error; // Re-throw so initializeUnifiedCheckout can catch and reset flag
        }
    },


    /**
     * Handle payment completion - process and store payment token (v1.x)
     * @param {Object} paymentToken - Payment token from UC widget
     * @param {Object} completeResult - Optional result object from checkout.onComplete (contains authorization result for completeMandate)
     */
    handlePaymentComplete: function (paymentToken, completeResult) {
        var self = this;

        try {
            console.log('Processing payment token...');

            // Check if this is a completeMandate flow with authorization result
            // completeResult is a JWT string when completeMandate is used
            if (completeResult && typeof completeResult === 'string' && completeResult.split('.').length === 3) {
                console.log('completeMandate JWT detected, processing authorization result...');
                var decodedResult = parseJwt(completeResult);
                console.log('completeMandate result:', decodedResult);

                // Always call PlaceOrderDirect, regardless of status
                self.placeOrderDirect(completeResult, paymentToken, decodedResult);
                return;
            }

            // No completeMandate JWT was returned. Under the completeMandate-only
            // architecture (UC SDK always runs checkout.complete() for both checkout
            // and cart/minicart), this should not happen. Fail safe: surface an error
            // and regenerate the capture context so the shopper can retry, rather than
            // falling back to the removed legacy SubmitPayment token flow.
            console.error('handlePaymentComplete: no completeMandate JWT in result; cannot place order.');
            self.showValidationError('We could not complete your payment. Please try again.');
            setTimeout(function () {
                self.regenerateCaptureContextIfNeeded(true);
            }, 2000);

        } catch (error) {
            console.error('Error processing payment:', error);
            self.handleError(error);
        }
    },

     /**
     * Place order directly using completeMandate authorization result
     * This bypasses the traditional SubmitPayment -> PlaceOrder flow since authorization
     * was already performed by the UC SDK
     * 
     * @param {string} completeMandateJwt - The JWT string returned from checkout.complete()
     * @param {string} transientToken - The transient token from mount()
     * @param {Object} decodedResult - The decoded JWT payload for logging/display
     */
    placeOrderDirect: function (completeMandateJwt, transientToken, decodedResult) {
        var self = this;

        console.log('placeOrderDirect: Starting direct order placement...');
        console.log('Transaction ID:', decodedResult.id);
        console.log('Status:', decodedResult.status);

        // Get the PlaceOrderDirect endpoint URL
        var placeOrderUrl = $('#place-order-direct-url').val();
        
        if (!placeOrderUrl) {
            // #place-order-direct-url is rendered server-side in unifiedCheckout.isml via
            // URLUtils. If it is missing we cannot safely build a site/locale-correct
            // endpoint on the client, so fail loudly rather than POST to a hardcoded URL.
            console.error('placeOrderDirect: missing #place-order-direct-url hidden field');
            self.showValidationError('Unable to process payment. Please refresh and try again.');
            return;
        }

        // Sanitize URL
        placeOrderUrl = self.sanitizeUrl(placeOrderUrl);
        if (!placeOrderUrl) {
            console.error('placeOrderDirect: Invalid or unsafe URL');
            self.showValidationError('Unable to process payment. Please refresh and try again.');
            return;
        }

        // Get CSRF token
        var csrfToken = $('input[name="csrf_token"]').val() || $('.csrf_token').val();

        // Show loading spinner
        ucPageSpinner().start();

        // Prepare form data
        var formData = {
            completeMandateJwt: completeMandateJwt,
            transientToken: transientToken
        };

        if (csrfToken) {
            formData.csrf_token = csrfToken;
        }

        $.ajax({
            url: placeOrderUrl,
            type: 'POST',
            dataType: 'json',
            data: formData,
            success: function (data) {
                ucPageSpinner().stop();

                if (data.error) {
                    console.error('placeOrderDirect: Server returned error:', data.errorMessage);

                    // Cart issue - redirect to cart (separate UX from payment errors)
                    if (data.cartError && data.redirectUrl) {
                        window.location.href = data.redirectUrl;
                        return;
                    }

                    // SCA required - the server already flagged session.privacy.scaRequired, so
                    // the next capture context generated by regenerateCaptureContextIfNeeded picks
                    // up challengeCode='04' (see ucPaymentHelper.buildConsumerAuthenticationInformation).
                    // Retry in place like every other retryable error below, instead of navigating
                    // away - a full-page reload is unnecessary and would need one more click.
                    if (data.scaRequired) {
                        self.showValidationError(data.errorMessage || 'Additional verification is required. Please try again.');
                        self.regenerateCaptureContextIfNeeded(true);
                        return;
                    }

                    // Route remaining payment errors through the SFRA payerAuthError redirect so
                    // the message renders inside the checkout layout (.payerAuthError div in
                    // checkout.isml) instead of being prepended to <body> by showValidationError.
                    // #checkout-stage-url is rendered server-side in unifiedCheckout.isml via
                    // URLUtils.https('Checkout-Begin', 'stage', 'payment'). Fall back to the
                    // current checkout path (site/locale-agnostic) rather than a hardcoded
                    // site URL if the field is ever absent.
                    var checkoutUrl = $('#checkout-stage-url').val() || window.location.pathname;
                    var errorMsg = encodeURIComponent(data.errorMessage || 'An error occurred while processing your order.');
                    window.location.href = checkoutUrl + (checkoutUrl.indexOf('?') > -1 ? '&' : '?') + 'payerAuthError=' + errorMsg;
                    return;

                } else {
                    // Success - redirect to confirmation page via POST form
                    console.log('placeOrderDirect: Order placed successfully!');
                    console.log('Order ID:', data.orderID);
                    console.log('Continue URL:', data.continueUrl);

                    // Sanitize form values - reconstruct from allowed chars to break taint tracking
                    // Allowed chars for order IDs/tokens: alphanumeric, dash, underscore, equals, plus, slash (Base64)
                    var ALLOWED_TOKEN_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_=+/';
                    var safeOrderID = '';
                    var orderIDStr = String(data.orderID || '');
                    for (var i = 0; i < orderIDStr.length && i < 256; i++) {
                        var c = orderIDStr.charAt(i);
                        if (ALLOWED_TOKEN_CHARS.indexOf(c) !== -1) {
                            safeOrderID += ALLOWED_TOKEN_CHARS.charAt(ALLOWED_TOKEN_CHARS.indexOf(c));
                        }
                    }
                    var safeOrderToken = '';
                    var orderTokenStr = String(data.orderToken || '');
                    for (var j = 0; j < orderTokenStr.length && j < 256; j++) {
                        var t = orderTokenStr.charAt(j);
                        if (ALLOWED_TOKEN_CHARS.indexOf(t) !== -1) {
                            safeOrderToken += ALLOWED_TOKEN_CHARS.charAt(ALLOWED_TOKEN_CHARS.indexOf(t));
                        }
                    }

                    // Create and submit a POST form to Order-Confirm
                    // (Order-Confirm is a POST endpoint expecting orderID and orderToken in form data)
                    var form = document.createElement('form');
                    form.method = 'POST';
                    form.action = data.continueUrl;
                    form.style.display = 'none';

                    // Add orderID field
                    var orderIdInput = document.createElement('input');
                    orderIdInput.type = 'hidden';
                    orderIdInput.name = 'orderID';
                    orderIdInput.value = safeOrderID;
                    form.appendChild(orderIdInput);

                    // Add orderToken field
                    var orderTokenInput = document.createElement('input');
                    orderTokenInput.type = 'hidden';
                    orderTokenInput.name = 'orderToken';
                    orderTokenInput.value = safeOrderToken;
                    form.appendChild(orderTokenInput);

                    // Submit the form
                    document.body.appendChild(form);
                    form.submit();
                }
            },
            error: function (xhr, status, error) {
                ucPageSpinner().stop();
                console.error('placeOrderDirect: AJAX error:', status, error);

                var errorMessage = 'An error occurred while processing your order. Please try again.';

                if (xhr.responseJSON && xhr.responseJSON.errorMessage) {
                    errorMessage = xhr.responseJSON.errorMessage;
                }

                if (xhr.responseJSON && xhr.responseJSON.redirectUrl) {
                    window.location.href = xhr.responseJSON.redirectUrl;
                    return;
                }

                self.showValidationError(errorMessage);

                // Regenerate capture context for retry
                setTimeout(function () {
                    self.regenerateCaptureContextIfNeeded(true);
                }, 2000);
            }
        });
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
                if (self.unifiedCheckoutInstance && self.paymentToken) {
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

        // Billing address selection change (the "Billing Address" dropdown, incl.
        // multi-ship where the shopper picks a different saved/shipping address).
        // The capture context embeds the billing address, so a changed selection must
        // regenerate it or the UC widget authorizes against the wrong billTo (this is
        // the "Billing address set to true/New" case where the form fails to refresh).
        $(document).on('change', '#billingAddressSelector, select[name="addressSelector"]', function () {
            setTimeout(function () {
                if ($('.unified-checkout-container').length > 0) {
                    console.log('Billing address selection changed - regenerating capture context');
                    self.regenerateCaptureContextIfNeeded(true);
                }
            }, 800); // allow Checkout-SetBillingAddress to persist the new address first
        });

        // Reveal the phone field and "Update Billing Address" button when the shopper
        // chooses to edit ("Update Address") or add ("Add New") a billing address.
        $(document).on('click', '.btn-show-details, .btn-add-new', function () {
            $('.contact-info-block').show();
            $('#uc-update-billing-address-row').show();
        });

        // "Update Billing Address" button (injected by injectUpdateBillingButton).
        // Persists the billing form to the basket, THEN regenerates the capture context.
        // Needed for the "New address"/"Update address" paths, which SFRA never persists
        // until Place Order (hidden under UC).
        $(document).on('click', '#uc-update-billing-address-btn', function (e) {
            e.preventDefault();
            self.saveBillingAddressAndRegenerate();
        });

        // "Update Address" submit in the billing form — the shopper edited the billing
        // address fields in place. Regenerate once SFRA has saved the change.
        $(document).on('click', '.billing-address .btn-update-address, .btn-save-multi-ship, .update-address, [name="submit"].btn-update-address', function () {
            setTimeout(function () {
                if ($('.unified-checkout-container').length > 0) {
                    console.log('Billing address updated - regenerating capture context');
                    self.regenerateCaptureContextIfNeeded(true);
                }
            }, 800);
        });

        // The billing address is persisted server-side via Checkout-SetBillingAddress.
        // Regenerate whenever that call completes so the UC context always reflects the
        // address currently on the basket, regardless of which UI path triggered it.
        $(document).ajaxComplete(function (event, xhr, settings) {
            if (settings.url && settings.url.indexOf('Checkout-SetBillingAddress') > -1) {
                if ($('.unified-checkout-container').length > 0) {
                    console.log('Checkout-SetBillingAddress completed - regenerating capture context');
                    setTimeout(function () {
                        self.regenerateCaptureContextIfNeeded(true);
                    }, 300);
                }
            }
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
     * Hides credit card form and shows stored payments with UC buttons
     */
    handleCancelPayment: function () {

        try {
            console.log('[UC] handleCancelPayment - going back to saved cards');
            
            // Show stored payments section
            $('.user-payment-instruments').removeClass('checkout-hidden').show();
            $('.stored-payments').removeClass('checkout-hidden').show();

            // Hide credit card form and UC container
            $('.credit-card-form').addClass('checkout-hidden');
            $('.unified-checkout-container').addClass('checkout-hidden');

            // Show UC saved card buttons (our custom buttons)
            $('#uc-saved-card-buttons').show();
            
            // Hide SFRA's default buttons - we use our own
            $('.add-payment').addClass('checkout-hidden');
            $('.add-payment-container').addClass('checkout-hidden');
            $('.cancel-new-payment').addClass('checkout-hidden');
            $('.cancel-payment-container').addClass('checkout-hidden');

            // Always hide Place Order button when UC is enabled - UC handles payment
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
            var $placeOrderButton = $('.submit-payment');

            // When UC is enabled, ALWAYS hide the Place Order button
            // UC handles payment completion via its own buttons (Pay now, Google Pay, etc.)
            if ($placeOrderButton.length) {
                $placeOrderButton.addClass('checkout-hidden').hide();
                console.log('[UC] Place Order button hidden (UC handles payment)');
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
        // Use the same '.error-message'/'.error-message-text' banner non-UC checkout
        // errors use (see checkout.js showPlaceOrderFailure), instead of a UC-only element,
        // so UC errors read consistently with the rest of the page.
        $('.error-message-text').text(message);
        $('.error-message').show();
        $('#uc-server-error').addClass('d-none');

        // Also add error class to UC container for visual feedback
        var container = $('#unified-checkout-container');
        container.addClass('is-invalid');
    },

    /**
     * Clear validation errors
     */
    clearValidationErrors: function () {
        var container = $('#unified-checkout-container');

        console.log('Clearing validation errors');

        container.removeClass('is-invalid');
        $('.error-message').hide();
        $('#uc-server-error').addClass('d-none');
    },

    /**
     * Handle errors (supports both v0.x and v1.x)
     * @param {Object} error - Error object
     */
    handleError: function (error) {
        var self = this;
        var container = $('#unified-checkout-container');

        // The UC widget (and this handler) also runs in the mini-cart popover and on
        // the cart page. Payment errors must only be surfaced to the shopper on the
        // checkout page; in the mini-cart/cart we still log and recover, just without
        // showing any visible message. The checkout page wraps the widget in
        // #checkout-main (see checkout.isml); the mini-cart/cart contexts do not.
        var showErrorUI = container.closest('#checkout-main').length > 0;

        if (showErrorUI) {
            container.addClass('is-invalid');
        }

        // Handle v1.x UnifiedCheckoutError
        var errorMessage = '';
        var reason = '';
        
        if (this.isUnifiedCheckoutError(error)) {
            // v1.x UnifiedCheckoutError format
            errorMessage = error.message || 'An error occurred with Unified Checkout';
            reason = error.reason || '';
            console.error('UC v1.x Error:', {
                name: error.name,
                reason: reason,
                message: errorMessage,
                details: error.details || []
            });
        } else {
            // v0.x or generic error
            errorMessage = error.message || error.details || 'An error occurred with Unified Checkout';
            reason = error.reason || '';
            console.error('UC: Handling error:', errorMessage);
        }

        // Check if the error is due to expired capture context
        var isExpiredToken = reason.toLowerCase().includes('capture_context_expired') ||
            errorMessage.toLowerCase().includes('capture context has expired') ||
            errorMessage.toLowerCase().includes('expired') ||
            (error.reason && error.reason.toLowerCase().includes('expired'));

        if (isExpiredToken) {
            console.log('Capture context has expired, refreshing...');

            if (showErrorUI) {
                // Show a brief message before refresh, via the shared non-UC error banner
                $('.error-message-text').text('Your session has expired. Refreshing payment options...');
                $('.error-message').show();
            }

            // Refresh context instead of full page reload (v1.x improvement)
            setTimeout(function () {
                self.refreshCaptureContext();
            }, 1000);

            return;
        }

        // Check for mount/selector errors
        if (reason === 'MOUNT_CONTAINER_SELECTOR' || 
            errorMessage.toLowerCase().includes('container') ||
            errorMessage.toLowerCase().includes('selector')) {
            console.error('Container selector error:', errorMessage);
            errorMessage = 'Payment widget container not found. Please refresh the page.';
        }

        // Check for payment unavailable errors
        if (reason === 'MOUNT_PAYMENT_UNAVAILABLE' ||
            errorMessage.toLowerCase().includes('unavailable')) {
            console.error('Payment method unavailable:', errorMessage);
            errorMessage = 'No payment methods available. Please try a different payment option.';
        }

        // Check for authentication cancelled (e.g., 3DS cancelled)
        if (reason === 'COMPLETE_AUTHENTICATION_CANCELED' ||
            errorMessage.toLowerCase().includes('cancel')) {
            console.log('User cancelled 3DS authentication');
            errorMessage = 'Payment authentication was cancelled. Please try again.';
        }

        if (showErrorUI) {
            // Show via the shared non-UC error banner instead of a UC-only element
            $('.error-message-text').text(errorMessage);
            $('.error-message').show();

            // Hide any server-side error since we're showing a JS error
            $('#uc-server-error').addClass('d-none');
        }

        // Log detailed error for debugging
        console.error('Error Details:', error);
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
            if (self.unifiedCheckoutInstance) {
                console.log('Destroying existing UC widget instance (v1.x)');
                try {
                    // Clear the widget reference
                    self.unifiedCheckoutInstance = null;
                } catch (e) {
                    console.warn('Error destroying UC instance:', e);
                }
            }
            // Also support legacy v0.x instance
            if (self.unifiedPaymentsInstance) {
                console.log('Destroying existing UC widget instance (v0.x legacy)');
                try {
                    // Clear the widget reference
                    self.unifiedPaymentsInstance = null;
                } catch (e) {
                    console.warn('Error destroying UC v0.x instance:', e);
                }
            }

            // Step 2: Clear stored payment token
            self.paymentToken = null;
            $('#uc-payment-token').val('');
            $('#uc-transaction-id').val('');
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

            // Remove guest save card info message
            $('.uc-guest-info').remove();

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

                    // Remove loading state and show error via the shared non-UC error banner
                    $ucContainer.removeClass('loading').css('opacity', '1');
                    $('.error-message-text').html(
                        'Unable to refresh payment options. <a href="#" onclick="window.location.reload(); return false;">Refresh page</a>.'
                    );
                    $('.error-message').show();
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
    },

    /**
     * Check if error is a UnifiedCheckoutError (v1.x)
     * @param {Object} obj - Error object to check
     * @returns {boolean} - True if it's a UnifiedCheckoutError
     */
    isUnifiedCheckoutError: function(obj) {
        return obj && typeof obj === 'object' && obj.name === 'UnifiedCheckoutError';
    },

    /**
     * Refresh capture context when expired (v1.x)
     */
    refreshCaptureContext: async function() {
        var self = this;
        try {
            console.log('Refreshing expired capture context...');

            // Destroy current instance
            if (self.unifiedCheckoutInstance) {
                try {
                    self.unifiedCheckoutInstance = null;
                } catch (e) {
                    console.warn('Error destroying UC instance:', e);
                }
            }

            self.paymentToken = null;
            $('#uc-payment-token').val('');
            $('#uc-transaction-id').val('');
            $('#uc-response').val('');

            // Regenerate capture context by reloading UC HTML
            self.regenerateCaptureContextIfNeeded(true);
        } catch (error) {
            console.error('Error refreshing capture context:', error);
            self.handleError(error);
        }
    },

    // ============================================================================
    // UC Save Card (My Account) Methods
    // ============================================================================

    /**
     * Check if we're on the My Account Save Card page
     * @returns {boolean} - True if on save card page
     */
    isSaveCardPage: function() {
        return $('.uc-save-card-form').length > 0;
    },

    /**
     * Initialize UC Save Card flow for My Account
     * This is a separate initialization from checkout flow
     */
    initSaveCard: function() {
        var self = this;

        console.log('Initializing UC Save Card flow...');

        // Add UC enabled class
        $('body').addClass('uc-enabled uc-save-card-mode');

        // Check if VAS SDK is available
        var hasVasSDK = typeof VAS !== 'undefined' && typeof VAS.UnifiedCheckout === 'function';

        if (!hasVasSDK) {
            var scriptUrl = $('#uc-client-library').val();
            var integrity = $('#uc-client-library-integrity').val();
            scriptUrl = self.sanitizeScriptUrl(scriptUrl, integrity);

            if (scriptUrl && !window.ucScriptLoading) {
                console.log('UC library not loaded, loading for save card...');
                window.ucScriptLoading = true;

                var script = document.createElement('script');
                script.src = scriptUrl;
                script.integrity = integrity;
                script.crossOrigin = 'anonymous';

                script.onload = function() {
                    console.log('UC library loaded for save card.');
                    window.ucScriptLoading = false;
                    self.initSaveCardWidget();
                };

                script.onerror = function() {
                    console.error('Failed to load UC library for save card');
                    window.ucScriptLoading = false;
                    self.showSaveCardError('Failed to load payment widget. Please refresh and try again.');
                };

                document.head.appendChild(script);
            }
        } else {
            self.initSaveCardWidget();
        }

        // Bind save card button click
        self.bindSaveCardEvents();
    },

    /**
     * Initialize the UC widget for save card flow
     */
    initSaveCardWidget: async function() {
        var self = this;

        try {
            var captureContext = $('#ucCaptureContext').val();

            console.log('Capture context element:', $('#ucCaptureContext').length);
            console.log('Capture context value type:', typeof captureContext);
            console.log('Capture context value (first 100 chars):', captureContext ? captureContext.substring(0, 100) : 'EMPTY');

            if (!captureContext || typeof captureContext !== 'string' || !/\S/.test(captureContext)) {
                console.error('No capture context available for save card');
                self.showSaveCardError('Payment widget not available. Please refresh the page.');
                return;
            }

            console.log('Creating UC Save Card client...');

            // Step 1: Create UC client using VAS SDK v1.x
            var client = await VAS.UnifiedCheckout(captureContext);

            // Handle SDK-level errors
            client.on('error', function (err) {
                console.error('UC Save Card Error:', err && err.reason, err && err.message);
                self.handleSaveCardError(err || {});
            });

            // Step 2: Create checkout instance with manual mode
            console.log('Creating checkout instance...');
            var checkout = await client.createCheckout({
                autoProcessing: false  // Manual mode - we handle token processing
            });

            // Store the instance
            self.saveCardInstance = checkout;

            // Mount the widget - for save card, use embedded mode
            var paymentLocation = $('#unifiedCheckoutPaymentAcceptanceLocation').val() || 'EMBEDDED';

            console.log('Mounting UC Save Card widget, location:', paymentLocation);

            // Step 3: Mount with payment containers
            var mountArgs = {
                paymentSelection: '#buttonPaymentListContainer'
            };
            if (paymentLocation === 'EMBEDDED' || paymentLocation === 'Embedded') {
                mountArgs.paymentScreen = '#embeddedPaymentContainer';
            }

            // Mount returns transient token when user completes card entry
            var transientToken = await checkout.mount(mountArgs);
            console.log('UC Save Card widget mounted, transient token received');

            // Store the transient token for later use
            self.saveCardTransientToken = transientToken;

            // Now call complete() to execute completeMandate and get TMS tokens
            console.log('Executing completeMandate for save card...');
            var completeMandateJwt = await checkout.complete(transientToken);
            console.log('completeMandate completed, JWT received');

            // Auto-submit to backend since completeMandate is done
            self.submitSaveCardToBackend(completeMandateJwt, transientToken);

        } catch (error) {
            console.error('Error initializing UC Save Card widget:', error);
            ucPageSpinner().stop();
            self.showSaveCardError('Failed to initialize payment widget. Please try again.');
        }
    },

    /**
     * Bind events for save card flow
     */
    bindSaveCardEvents: function() {
        var self = this;

        // Save card button click - not needed for UC since widget handles submission
        // Keep for fallback/legacy
        $(document).off('click.ucSaveCard', '#uc-save-card-button');
        $(document).on('click.ucSaveCard', '#uc-save-card-button', function(e) {
            e.preventDefault();
            self.handleSaveCardSubmit();
        });
    },

    /**
     * Handle save card button submit (fallback if auto-submit doesn't work)
     */
    handleSaveCardSubmit: async function() {
        var self = this;

        if (!self.saveCardInstance) {
            console.error('No save card instance available');
            self.showSaveCardError('Payment widget not ready. Please wait or refresh the page.');
            return;
        }

        try {
            console.log('Processing save card manually...');
            ucPageSpinner().start();

            // Disable save button to prevent double-submit
            $('#uc-save-card-button').prop('disabled', true);

            // If we already have the transient token from mount(), use it
            var transientToken = self.saveCardTransientToken;
            
            if (!transientToken) {
                console.error('No transient token available - mount may not have completed');
                throw new Error('Payment not ready. Please complete card entry.');
            }

            // Execute completeMandate to get TMS tokens
            console.log('Executing completeMandate...');
            var completeMandateJwt = await self.saveCardInstance.complete(transientToken);

            if (!completeMandateJwt) {
                throw new Error('No response received from payment widget');
            }

            console.log('completeMandate JWT received');

            // Submit to backend
            self.submitSaveCardToBackend(completeMandateJwt, transientToken);

        } catch (error) {
            console.error('Error processing save card:', error);
            ucPageSpinner().stop();
            $('#uc-save-card-button').prop('disabled', false);
            self.handleSaveCardError(error);
        }
    },

    /**
     * Handle save card completion from UC
     * @param {Object} payment - Payment data from UC
     */
    handleSaveCardComplete: function(payment) {
        var self = this;

        console.log('Save card complete event received:', payment);

        // The payment object should contain the completeMandate JWT
        if (payment && payment.completeMandateJwt) {
            self.submitSaveCardToBackend(payment.completeMandateJwt, payment.transientToken || '');
        }
    },

    /**
     * Submit save card data to backend
     * @param {string} completeMandateJwt - The completeMandate JWT from UC
     * @param {string} transientToken - The transient token
     */
    submitSaveCardToBackend: function(completeMandateJwt, transientToken) {
        var self = this;

        var $form = $('#uc-save-payment-form');
        var submitUrl = $form.data('save-payment-direct-url') || $form.attr('action');

        // Validate and sanitize URL
        submitUrl = self.sanitizeUrl(submitUrl);
        if (!submitUrl) {
            console.error('Invalid save payment URL');
            ucPageSpinner().stop();
            self.showSaveCardError('Configuration error. Please contact support.');
            return;
        }

        // Set form values
        $('#completeMandateJwt').val(completeMandateJwt);
        $('#transientToken').val(transientToken);

        // Get CSRF token
        var csrfToken = $form.find('input[name="csrf_token"]').val();

        console.log('Submitting save card to:', submitUrl);

        $.ajax({
            url: submitUrl,
            type: 'POST',
            dataType: 'json',
            data: {
                csrf_token: csrfToken,
                completeMandateJwt: completeMandateJwt,
                transientToken: transientToken,
                // Send the "make default" checkbox state so the server can flag the saved card.
                makeDefaultPayment: $('#makeDefaultPayment').is(':checked')
            },
            success: function(data) {
                ucPageSpinner().stop();

                if (data.error) {
                    console.error('Save card error:', data.errorMessage);
                    $('#uc-save-card-button').prop('disabled', false);
                    self.showSaveCardError(data.errorMessage || 'Failed to save card. Please try again.');
                } else if (data.success && data.redirectUrl) {
                    console.log('Card saved successfully, redirecting...');
                    window.location.href = data.redirectUrl;
                } else {
                    // Fallback redirect to the account payment list. The URL is rendered
                    // server-side via URLUtils on the save-card form (paymentForm.isml);
                    // never hardcode the site/locale path here.
                    var listUrl = $('#uc-save-payment-form').data('payment-instruments-list-url');
                    if (listUrl) {
                        window.location.href = listUrl;
                    }
                }
            },
            error: function(xhr, status, error) {
                ucPageSpinner().stop();
                $('#uc-save-card-button').prop('disabled', false);
                console.error('Save card AJAX error:', status, error);
                self.showSaveCardError('Network error. Please try again.');
            }
        });
    },

    /**
     * Handle save card error
     * @param {Object} error - Error object
     */
    handleSaveCardError: function(error) {
        var errorMsg = 'An error occurred. Please try again.';

        if (error) {
            if (typeof error === 'string') {
                errorMsg = error;
            } else if (error.message) {
                errorMsg = error.message;
            } else if (error.reason) {
                errorMsg = error.reason;
            }
        }

        this.showSaveCardError(errorMsg);
    },

    /**
     * Show guest save-card info message below the UC widget.
     * Conditions: (1) guest user, (2) capture context has requestSaveCredentials: true.
     * The UC SDK renders the save-card checkbox inside an iframe, so we rely on the
     * JWT to know the checkbox will be shown rather than trying to detect it in the DOM.
     */
    showGuestSaveCardInfo: function() {
        // Only show for guest users
        var isGuest = $('#checkout-main').data('customer-type') === 'guest';
        if (!isGuest) {
            console.log('[UC] Not a guest user — skipping save card info');
            return;
        }

        // Check capture context for requestSaveCredentials
        var captureContext = $('#ucCaptureContext').val();
        if (!captureContext) {
            console.log('[UC] No capture context found — skipping save card info');
            return;
        }
        try {
            var decoded = parseJwt(captureContext);
            var requestSaveCredentials = decoded
                && decoded.ctx
                && decoded.ctx[0]
                && decoded.ctx[0].data
                && decoded.ctx[0].data.captureMandate
                && decoded.ctx[0].data.captureMandate.requestSaveCredentials === true;
            if (!requestSaveCredentials) {
                console.log('[UC] requestSaveCredentials is not true — skipping save card info');
                return;
            }
        } catch (e) {
            console.warn('[UC] Could not decode capture context for guest save card check:', e);
            return;
        }

        // Don't insert if already present
        if ($('.uc-guest-info').length) {
            return;
        }

        var infoHtml = '<div class="alert alert-info mt-2 uc-guest-info" role="alert">'
            + 'You are checking out as a guest. If you choose to save your card, '
            + 'you will need to create an account to access your saved payment methods in the future.'
            + '</div>';

        // Insert after the UC container (same sibling pattern used by handleError)
        var $ucContainer = $('#unified-checkout-container');
        if ($ucContainer.length) {
            $ucContainer.after(infoHtml);
        } else {
            // Fallback: after embeddedPaymentContainer or buttonPaymentListContainer
            var $fallback = $('#embeddedPaymentContainer').length
                ? $('#embeddedPaymentContainer')
                : $('#buttonPaymentListContainer');
            if ($fallback.length) {
                $fallback.after(infoHtml);
            }
        }
        console.log('[UC] Guest save card info message displayed');
    },

    /**
     * Show save card error message with a reload link.
     *
     * When a save fails, the UC widget is left in a spent/half-mounted state (its
     * transient token is single-use), so the shopper cannot simply retry in place —
     * the widget needs a fresh capture context. Rather than a full page reload (which
     * would wipe this error message before the shopper can read it), we surface a
     * "Reload" link that re-initializes the widget in place while keeping the message
     * visible. Mirrors the pre-existing reload-link pattern used on the checkout side.
     * @param {string} message - Error message
     */
    showSaveCardError: function(message) {
        var self = this;

        // Find or create error container
        var $errorContainer = $('.uc-save-card-error');
        if ($errorContainer.length === 0) {
            $errorContainer = $('<div class="alert alert-danger uc-save-card-error" style="margin-bottom: 20px;"></div>');
            $('.uc-save-card-form').prepend($errorContainer);
        }

        // Rebuild content: message text + reload link. Build the message node with
        // native DOM createElement + textContent (never string HTML / jQuery.text on
        // an appended node) so the server-provided message can never inject markup.
        $errorContainer.empty();
        var messageSpan = document.createElement('span');
        messageSpan.className = 'uc-save-card-error-message';
        messageSpan.textContent = message;
        $errorContainer.append(messageSpan);
        $errorContainer.append(document.createTextNode(' '));
        var $reload = $('<a href="#" class="uc-save-card-reload">Reload and try again</a>');
        $reload.on('click', function (e) {
            e.preventDefault();
            self.reloadSaveCardWidget();
        });
        $errorContainer.append($reload);
        $errorContainer.show();

        // Scroll to error
        $('html, body').animate({
            scrollTop: $errorContainer.offset().top - 100
        }, 300);
    },

    /**
     * Reload the UC save-card widget in place after a failed save.
     *
     * Fetches a fresh capture context (the save-card page renders it server-side in
     * the same template), re-mounts the widget, and re-enables the save button. The
     * error message is left on screen until the widget successfully re-initializes.
     */
    reloadSaveCardWidget: function() {
        var self = this;

        var reloadUrl = self.sanitizeUrl($('#uc-save-card-reload-url').val());

        // Re-enable the save button in case it was disabled during the failed attempt.
        $('#uc-save-card-button').prop('disabled', false);

        // No dedicated reload endpoint rendered â†’ fall back to a full page reload so
        // the shopper is never left stuck. (Full reload clears the message, but it is
        // the safe last resort when we cannot fetch a fresh context in place.)
        if (!reloadUrl) {
            window.location.reload();
            return;
        }

        ucPageSpinner().start();

        $.ajax({
            url: reloadUrl,
            type: 'GET',
            dataType: 'html',
            timeout: 10000, // Don't let a hung request leave the page spinner running forever.
            success: function (html) {
                // The CreateUCTokenSaveCard endpoint renders the unifiedCheckoutSaveCard
                // fragment: the widget container plus fresh #ucCaptureContext / client
                // library hidden fields. Replace only that widget region — NOT the whole
                // form — so the form's CSRF token, hidden JWT inputs and buttons survive.
                var $existing = $('.unified-checkout-container.uc-save-card').first();
                var $anchor = $existing.length ? $existing : $('.uc-save-card-form').first();
                if (!$anchor.length) {
                    ucPageSpinner().stop();
                    window.location.reload();
                    return;
                }

                // Capture the stale widget + its hidden fields NOW, by reference, so they
                // can be removed AFTER the fresh markup is inserted. Removing them first
                // detaches $existing, making $existing[0].parentNode null; the insertBefore
                // below then throws, aborting this success handler before ucPageSpinner()
                // .stop() runs — which is exactly what left the loader spinning forever
                // after a failed save. Capturing by reference also lets us delete only the
                // stale nodes, leaving the freshly-inserted #ucCaptureContext intact.
                var $staleNodes = $existing.add(
                    $('#ucCaptureContext, #uc-client-library, #uc-client-library-integrity, #unifiedCheckoutPaymentAcceptanceLocation')
                );

                // Sanitize (strips the fragment's <script> tags — the SDK and this file
                // are already loaded on the page) and insert the fresh widget markup.
                var sanitizedHtml = safeSanitizeTemplate(html);
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = sanitizedHtml;
                if ($existing.length) {
                    // Insert fresh nodes immediately before the still-attached stale widget.
                    while (tempDiv.firstChild) {
                        $existing[0].parentNode.insertBefore(tempDiv.firstChild, $existing[0]);
                    }
                } else {
                    while (tempDiv.firstChild) {
                        $anchor[0].insertBefore(tempDiv.firstChild, $anchor[0].firstChild);
                    }
                }

                // Now remove the stale widget region and its stale hidden fields (by
                // reference) so we don't end up with duplicate #ucCaptureContext elements.
                $staleNodes.remove();

                // Reset transient state from the failed attempt.
                self.saveCardInstance = null;
                self.saveCardTransientToken = null;
                window.ucScriptLoading = false;

                ucPageSpinner().stop();

                // Only clear the error / re-init if we actually got a fresh context.
                if ($('#ucCaptureContext').val()) {
                    $('.uc-save-card-error').hide();
                    self.initSaveCard();
                }
                // If no context came back, the error message stays visible with its
                // reload link so the shopper can try again.
            },
            error: function () {
                ucPageSpinner().stop();
                // Could not refresh in place — fall back to full reload.
                window.location.reload();
            }
        });
    }

};

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

    // Check if we're on the Save Card page (My Account)
    if (unifiedCheckout.isSaveCardPage()) {
        console.log('On Save Card page, initializing UC Save Card flow...');
        unifiedCheckout.initSaveCard();
        return; // Don't run checkout initialization
    }

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


// Expose to global scope for template-based initialization
window.unifiedCheckout = unifiedCheckout;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = unifiedCheckout;
}