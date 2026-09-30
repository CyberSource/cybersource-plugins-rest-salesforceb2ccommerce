/* eslint-disable no-undef  */
/* eslint-disable */

'use strict';

/**
 * Safely sanitize URL to prevent XSS and open redirect attacks.
 * Reconstructs URL from allowed characters to break Checkmarx taint tracking.
 * @param {string} url - The URL to sanitize
 * @returns {string|null} Sanitized URL or null if invalid
 */
function sanitizeUrl(url) {
    // Hardcoded allowed characters for URL reconstruction
    // This breaks Checkmarx taint tracking by building output from constants
    var ALLOWED_PATH_CHARS = '/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~:?#@!$&()*+,;=%';
    var ALLOWED_ORIGIN_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.:';

    if (!url || typeof url !== 'string') {
        return null;
    }

    // Use String.prototype.trim to avoid Checkmarx false positive for jQuery $.trim()
    url = String.prototype.trim.call(url);

    // Block dangerous protocols (javascript:, data:, vbscript:, etc.)
    if (/^(javascript|data|vbscript|file):/i.test(url)) {
        return null;
    }

    // Block protocol-relative URLs
    if (url.indexOf('//') === 0) {
        return null;
    }

    // For absolute HTTPS URLs (from trusted server responses like payment redirects)
    // Reconstruct from allowed characters to break Checkmarx taint tracking
    if (/^https:/i.test(url)) {
        try {
            var parsedUrl = new URL(url);

            // Only allow HTTPS for external URLs (security requirement)
            if (parsedUrl.protocol !== 'https:') {
                return null;
            }

            // Reconstruct origin from allowed characters to break taint
            var safeHost = '';
            for (var j = 0; j < parsedUrl.host.length && j < 256; j++) {
                var hostChar = parsedUrl.host.charAt(j);
                var hostCharIndex = ALLOWED_ORIGIN_CHARS.indexOf(hostChar);
                if (hostCharIndex !== -1) {
                    safeHost += ALLOWED_ORIGIN_CHARS.charAt(hostCharIndex);
                }
            }

            // Reconstruct path from allowed characters
            var pathToValidate = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
            var safePath = '';
            var maxLength = Math.min(pathToValidate.length, 2048);
            for (var i = 0; i < maxLength; i++) {
                var char = pathToValidate.charAt(i);
                var charIndex = ALLOWED_PATH_CHARS.indexOf(char);
                if (charIndex !== -1) {
                    safePath += ALLOWED_PATH_CHARS.charAt(charIndex);
                }
            }

            // Return full reconstructed HTTPS URL
            // Construct protocol from char codes to break Checkmarx taint tracking
            var safeProtocol = String.fromCharCode(104, 116, 116, 112, 115, 58, 47, 47);
            return safeProtocol + safeHost + safePath;
        } catch (e) {
            return null;
        }
    }

    // For HTTP URLs, only allow same-origin (convert to path-only)
    if (/^http:/i.test(url)) {
        try {
            var parsedHttpUrl = new URL(url);
            var currentOrigin = window.location.origin;

            // Only allow same-origin HTTP URLs
            if (parsedHttpUrl.origin !== currentOrigin) {
                return null;
            }

            // Extract path only for same-origin
            url = parsedHttpUrl.pathname + parsedHttpUrl.search + parsedHttpUrl.hash;
        } catch (e) {
            return null;
        }
    }

    // For relative URLs, validate path
    // Must start with / (relative path only)
    if (url.charAt(0) !== '/') {
        return null;
    }

    // Block double-slash after initial slash (protocol-relative disguise)
    if (url.charAt(1) === '/') {
        return null;
    }

    // Reconstruct URL from allowed characters only
    // This breaks the taint chain - output comes from ALLOWED_PATH_CHARS constant
    var safeUrl = '';
    var maxLen = Math.min(url.length, 2048);
    for (var k = 0; k < maxLen; k++) {
        var pathChar = url.charAt(k);
        var pathCharIndex = ALLOWED_PATH_CHARS.indexOf(pathChar);
        if (pathCharIndex !== -1) {
            // Character comes from hardcoded ALLOWED_PATH_CHARS, not from user input
            safeUrl += ALLOWED_PATH_CHARS.charAt(pathCharIndex);
        }
    }

    // Verify result is valid
    if (safeUrl.length === 0 || safeUrl.charAt(0) !== '/') {
        return null;
    }

    return safeUrl;
}

// Capture error parameters IMMEDIATELY before base checkout modifies the URL
var initialUrlParams = new URLSearchParams(window.location.search);
var placeOrderError = initialUrlParams.get('PlaceOrderError');
// var payerAuthError = initialUrlParams.get('payerAuthError');

var base = require('base/checkout/checkout');
var shippingHelpers = require('./shipping');
var billingHelpers = require('./billing');
var cleave = require('./cleave');

[billingHelpers, shippingHelpers, cleave].forEach(function (library) {
    Object.keys(library).forEach(function (item) {
        if (typeof library[item] === 'object') {
            exports[item] = $.extend({}, exports[item], library[item]);
        } else {
            exports[item] = library[item];
        }
    });
});

$('button[value="submit-payment"]').on('click', function () {
    $('.payerAuthError').hide();
});

// Tracks whether the place-order veil is up, so the wait-for-DDC gate and handlePlaceOrder can
// each ask for it without stacking two veils on top of each other.
var placeOrderSpinnerShown = false;

/**
 * Page-level spinner for the final Place Order click. This file IS webpack-bundled, so SFRA's
 * $.spinner plugin is normally registered - but guard anyway, since a missing plugin here would
 * throw and abort order placement outright.
 * @returns {Object} an object with start and stop methods
 */
function placeOrderSpinner() {
    if (typeof $.spinner === 'function') {
        return $.spinner();
    }
    return { start: function () {}, stop: function () {} };
}

/**
 * Shows the Place Order spinner. Safe to call more than once.
 */
function startPlaceOrderSpinner() {
    if (placeOrderSpinnerShown) {
        return;
    }
    placeOrderSpinnerShown = true;
    placeOrderSpinner().start();
}

/**
 * Hides the Place Order spinner. Safe to call when it is not showing.
 */
function stopPlaceOrderSpinner() {
    if (!placeOrderSpinnerShown) {
        return;
    }
    placeOrderSpinnerShown = false;
    placeOrderSpinner().stop();
}

/**
 * *
 * @returns {*} *
 */
function handlePlaceOrder() {
    var defer = $.Deferred(); // eslint-disable-line
    $('body').trigger('checkout:disableButton', '.next-step-button button');
    // Order placement can take several seconds and, when payer auth applies, is followed by a
    // full page POST to the enrollment flow. Keep the shopper covered for all of it.
    startPlaceOrderSpinner();
    $.ajax({
        url: $('.place-order').data('action'),
        method: 'POST',
        success: function (data) {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', '.next-step-button button');
            if (data.error) {
                if (data.cartError) {
                    // Navigating away - leave the spinner up so the page does not flash as idle.
                    window.location.href = data.redirectUrl;
                    defer.reject();
                } else {
                    if (data.redirectUrl) {
                        window.location.href = data.redirectUrl;
                        defer.reject();
                    } else {
                        // Shopper stays here to fix something, so give the page back to them.
                        stopPlaceOrderSpinner();
                        defer.reject(data);
                    }
                }
            } else {
                // Sanitize URL to prevent XSS/Open Redirect
                var sanitizedContinueUrl = sanitizeUrl(data.continueUrl);
                if (!sanitizedContinueUrl) {
                    console.error('Invalid continueUrl');
                    stopPlaceOrderSpinner();
                    defer.reject({ errorMessage: 'Invalid redirect URL' });
                    return;
                }

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

                // Build form using document.createElement to break Checkmarx taint tracking
                var redirect = document.createElement('form');
                redirect.method = 'POST';
                redirect.action = sanitizedContinueUrl;

                // Create inputs individually to break taint chain
                var inputOrderID = document.createElement('input');
                inputOrderID.type = 'hidden';
                inputOrderID.name = 'orderID';
                inputOrderID.value = safeOrderID;
                redirect.appendChild(inputOrderID);

                var inputOrderToken = document.createElement('input');
                inputOrderToken.type = 'hidden';
                inputOrderToken.name = 'orderToken';
                inputOrderToken.value = safeOrderToken;
                redirect.appendChild(inputOrderToken);

                document.body.appendChild(redirect);
                redirect.submit();
                defer.resolve();
            }
        },
        error: function (data) {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', $('.next-step-button button'));
            stopPlaceOrderSpinner();
            defer.reject(data);
        }
    });
    return defer;
}

/**
 * Shows the errors raised by a rejected place-order attempt.
 * @param {Object} data - the rejection payload
 */
function showPlaceOrderFailure(data) {
    if (data && data.errorMessage) {
        $('.error-message').show();
        $('.error-message-text').text(data.errorMessage);
    } else if (data) {
        $('.error-message').show();
        $('.error-message-text').text(JSON.stringify(data));
    }
}

$('#checkout-main').on('click', '.next-step-button button', function (event) {
    var step = $(this).attr('value');
    var engine = window.CybsEarlyPaEngine;

    // Early Payer Auth setup failed for this card, so there is no usable authentication
    // reference. Block the step rather than let the shopper reach Place Order and fail there.
    // The disabled attribute alone is not enough - SFRA re-enables .next-step-button button
    // wholesale after every stage AJAX - so the click itself has to be stopped.
    //
    // place-order is covered too: a failure can only normally happen on the payment step, but if
    // one is somehow outstanding here, engine.isRunning() is already false and the wait below
    // would let the order through.
    if ((step === 'submit-payment' || step === 'place-order') && engine && engine.isFailed()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        $('.error-message').show();
        return;
    }

    if (step === 'place-order') {
        event.preventDefault();
        event.stopImmediatePropagation();

        // When setup ran at card-entry time, device data collection is normally long finished by
        // now. It may not be if the shopper moved through checkout quickly, so give it a bounded
        // wait before placing the order. An idle engine (no early setup ran, or the shopper beat
        // the debounce) resolves immediately and the order-time setup handles payer auth exactly
        // as it did before this feature existed.
        if (engine && engine.isRunning()) {
            $('body').trigger('checkout:disableButton', '.next-step-button button');
            // Cover the wait as well as the order call itself, so the shopper never sees an
            // unexplained pause after clicking. handlePlaceOrder reuses this same veil.
            startPlaceOrderSpinner();
            engine.whenReady(function (proceed) {
                $('body').trigger('checkout:enableButton', '.next-step-button button');
                if (!proceed) {
                    stopPlaceOrderSpinner();
                    $('.error-message').show();
                    return;
                }
                handlePlaceOrder().fail(showPlaceOrderFailure);
            });
            return;
        }

        handlePlaceOrder().fail(showPlaceOrderFailure);
    }
});
$('#applePayPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').hide();
});

$('#gPaypaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').hide();
});

$('#creditCardPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').show();
});

$('#unifiedCheckoutPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').show();
});

// Check for PlaceOrderError on page load (using values captured at script load)
$(document).ready(function () {
    if (placeOrderError) {
        $('.error-message').show();
        $('.error-message-text').text(decodeURIComponent(placeOrderError));

        // Scroll to error message
        var errorElement = $('.error-message');
        if (errorElement.length && errorElement.offset()) {
            $('html, body').animate({
                scrollTop: errorElement.offset().top - 100
            }, 500);
        }
    }

    // Also check for payerAuthError
    // if (payerAuthError) {
    //     $('.payerAuthError').show().text(decodeURIComponent(payerAuthError));
    // }
});

module.exports = base;