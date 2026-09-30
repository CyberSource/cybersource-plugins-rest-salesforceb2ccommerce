'use strict';

/**
 * Early Payer Authentication trigger.
 *
 * Decides WHEN to ask the server for Payer Auth setup: once the shopper has finished entering a
 * new card, or as soon as a saved card is selected. The engine (earlyPayerAuthEngine.js) then
 * handles Device Data Collection.
 *
 * Copied to static verbatim rather than webpack-bundled, so plain browser JS only - no require().
 * See the two-jQuery note in earlyPayerAuthEngine.js: this file must not use SFRA's jQuery custom
 * events either.
 */

(function ($) {
    // Long enough that typing a card number does not fire a request per keystroke, short enough
    // that setup is normally already done by the time the shopper reaches for Submit Payment.
    var TRIGGER_DEBOUNCE_MS = 1000;

    var $host = $('#cybs-early-pa-host');
    // The container is only rendered when Payer Auth is on and Unified Checkout is off, so its
    // absence is the whole feature switch. Nothing below runs otherwise.
    if (!$host.length || !window.CybsEarlyPaEngine) {
        return;
    }

    var engine = window.CybsEarlyPaEngine;
    var setupUrl = $host.data('setup-url');
    var clearUrl = $host.data('clear-url');
    var csrfName = $host.data('csrf-name');
    var csrfToken = $host.data('csrf-token');

    var enabledCardTypes = String($host.data('enabled-card-types') || '')
        .split(',')
        .map(function (name) { return name.replace(/\s+/g, '').toUpperCase(); })
        .filter(function (name) { return name.length > 0; });

    var debounceId = null;
    // Identifies the card already requested, so re-entering the payment stage or an incidental
    // change event does not re-run setup for a card that is already set up.
    var lastRequestedKey = '';
    // Bumped whenever a setup request is fired or abandoned, so a late response from a superseded
    // request can be recognised and ignored.
    var activeRequestToken = 0;
    // Whether the server is currently holding a setup reference. Used to avoid pointless clear
    // requests, and to know when a stale one has to be dropped.
    var hasServerReference = false;
    var paymentStageReached = false;

    /**
     * @returns {string} the checkout stage currently displayed
     */
    function currentStage() {
        return $('#checkout-main').attr('data-checkout-stage') || '';
    }

    /**
     * SFRA renders every checkout step up front, so a saved card already carries
     * .selected-payment and the card fields already exist while the shopper is still on customer
     * or shipping - at which point the basket may have no address and setup would be pointless.
     * @returns {boolean} true once the shopper is at or past the payment step
     */
    function isAtPaymentStage() {
        var stage = currentStage();
        return stage === 'payment' || stage === 'placeOrder';
    }

    /**
     * @returns {boolean} true when the new-card form is the active branch, false for saved cards
     */
    function isNewCardMode() {
        var $form = $('.credit-card-form');
        return $form.length > 0 && !$form.hasClass('checkout-hidden');
    }

    /**
     * The payment method tabs are <li data-method-id="..."> wrappers around an <a class="nav-link">
     * that carries the active class (see creditCardTab.isml). With no tabs rendered there is only
     * one method, so treat it as selected.
     * @returns {boolean} true when the credit card tab is the selected payment method
     */
    function isCreditCardSelected() {
        var $tabs = $('li[data-method-id]');
        if (!$tabs.length) {
            return true;
        }
        var $activeTab = $tabs.filter(function () {
            return $(this).find('.nav-link').hasClass('active');
        });
        if (!$activeTab.length) {
            return true;
        }
        return $activeTab.data('method-id') === 'CREDIT_CARD';
    }

    /**
     * Luhn check.
     * @param {string} digits - the card number, digits only
     * @returns {boolean} true when the check digit is consistent
     */
    function passesLuhn(digits) {
        var sum = 0;
        var alternate = false;
        for (var i = digits.length - 1; i >= 0; i -= 1) {
            var value = parseInt(digits.charAt(i), 10);
            if (alternate) {
                value *= 2;
                if (value > 9) {
                    value -= 9;
                }
            }
            sum += value;
            alternate = !alternate;
        }
        return digits.length > 0 && sum % 10 === 0;
    }

    /**
     * @param {string} cardType - card type name from the hidden #cardType input
     * @returns {boolean} true when the type is one this site accepts
     */
    function isRecognisedCardType(cardType) {
        if (!cardType || cardType === 'Unknown') {
            return false;
        }
        if (!enabledCardTypes.length) {
            return true;
        }
        return enabledCardTypes.indexOf(cardType.replace(/\s+/g, '').toUpperCase()) > -1;
    }

    /**
     * @param {string} month - expiry month
     * @param {string} year - expiry year
     * @returns {boolean} true when the expiry is present and not in the past
     */
    function isFutureExpiry(month, year) {
        var expiryMonth = parseInt(month, 10);
        var expiryYear = parseInt(year, 10);
        if (!expiryMonth || !expiryYear) {
            return false;
        }
        var now = new Date();
        if (expiryYear > now.getFullYear()) {
            return true;
        }
        return expiryYear === now.getFullYear() && expiryMonth >= (now.getMonth() + 1);
    }

    /**
     * Posts a setup request and hands a successful response to the engine.
     * @param {Object} payload - the request fields
     * @param {string} key - dedupe key identifying this card
     */
    function requestSetup(payload, key) {
        lastRequestedKey = key;
        payload[csrfName] = csrfToken;

        // Veil the page and disable Submit Payment from the moment the request goes out, not from
        // when it comes back - otherwise the button stays live for the whole round trip and a
        // quick shopper can reach the review step before setup has answered.
        engine.beginSetup();

        activeRequestToken += 1;
        var requestToken = activeRequestToken;

        $.ajax({
            url: setupUrl,
            method: 'POST',
            data: payload,
            success: function (data) {
                // The shopper changed the card (or the payment method) while this was in flight,
                // so this answer describes a card that is no longer being paid with. Dropping it
                // matters: acting on it would start DDC against the wrong card.
                if (requestToken !== activeRequestToken) {
                    return;
                }
                // Every one of these paths has already cleared any previous reference on the
                // server - PayerAuthSetupData does that before it does anything else.
                if (!data) {
                    hasServerReference = false;
                    engine.clear();
                    return;
                }
                if (data.error) {
                    // Blocking: the shopper is told and cannot advance until a release path runs.
                    hasServerReference = false;
                    showError(data.errorMessage);
                    engine.markFailed();
                    return;
                }
                if (data.applicable !== true) {
                    // Silent no-op. Release the hold and go back to idle so checkout behaves
                    // exactly as it would without this feature; the order-time setup is the
                    // fallback and nothing is surfaced to the shopper.
                    hasServerReference = false;
                    engine.clear();
                    return;
                }
                hasServerReference = true;
                hideError();
                engine.run(data.ddcUrl, data.jwtToken, data.generation);
            },
            error: function () {
                if (requestToken !== activeRequestToken) {
                    return;
                }
                // A transport failure must not strand the shopper: release the hold and leave the
                // engine idle so the order-time setup runs as it always did.
                lastRequestedKey = '';
                engine.clear();
            }
        });
    }

    /**
     * Drops any run in progress and forgets the card it was for, locally only. Used when the
     * shopper changes the card or the payment method: the stored reference no longer matches what
     * would be charged, and an answer still in flight must not be acted on.
     */
    function abandonSetup() {
        activeRequestToken += 1;
        lastRequestedKey = '';
        engine.clear();
    }

    /**
     * Tells the server to drop the stored reference, so the order-time gate falls through to a
     * fresh setup rather than reusing one belonging to a card the shopper has moved away from.
     *
     * @param {boolean} keepOrderNo - true when the shopper is still paying by card and only the
     *        card changed, so the reserved order number should survive
     */
    function requestClear(keepOrderNo) {
        lastRequestedKey = '';
        hasServerReference = false;
        var payload = {};
        payload[csrfName] = csrfToken;
        if (keepOrderNo) {
            payload.keepOrderNo = 'true';
        }
        $.ajax({ url: clearUrl, method: 'POST', data: payload });
    }

    /**
     * @param {string} message - message to display
     */
    function showError(message) {
        if (!message) {
            return;
        }
        $('.error-message').show();
        $('.error-message-text').text(message);
    }

    /**
     * Hides a previously shown setup error.
     */
    function hideError() {
        $('.error-message').hide();
    }

    /**
     * Builds the dedupe key for the new-card form as it currently stands.
     * @returns {string} a key identifying the card currently typed in
     */
    function currentNewCardKey() {
        return 'new:'
            + String($('#cardNumber').val() || '').replace(/\D/g, '') + ':'
            + String($('#cardType').val() || '').trim() + ':'
            + String($('#expirationMonth').val() || '').trim() + ':'
            + String($('#expirationYear').val() || '').trim();
    }

    /**
     * Evaluates the new-card form and fires setup once it is complete and valid. The security
     * code is part of the readiness test only - it signals the shopper has finished typing - and
     * is deliberately never included in the request.
     *
     * @returns {boolean} true when a setup request was fired
     */
    function evaluateNewCard() {
        if (!isAtPaymentStage() || !isNewCardMode() || !isCreditCardSelected()) {
            return false;
        }

        var cardNumber = String($('#cardNumber').val() || '').replace(/\D/g, '');
        var cardType = String($('#cardType').val() || '').trim();
        var expirationMonth = String($('#expirationMonth').val() || '').trim();
        var expirationYear = String($('#expirationYear').val() || '').trim();
        var securityCode = String($('#securityCode').val() || '').replace(/\D/g, '');

        if (cardNumber.length < 12 || !passesLuhn(cardNumber)) {
            return false;
        }
        if (!isRecognisedCardType(cardType)) {
            return false;
        }
        if (!isFutureExpiry(expirationMonth, expirationYear)) {
            return false;
        }
        if (securityCode.length < 3 || securityCode.length > 4) {
            return false;
        }

        var key = currentNewCardKey();
        if (key === lastRequestedKey) {
            return false;
        }

        requestSetup({
            cardNumber: cardNumber,
            cardType: cardType,
            expirationMonth: expirationMonth,
            expirationYear: expirationYear
        }, key);
        return true;
    }

    /**
     * Fires setup for whichever saved card is currently selected.
     * @returns {boolean} true when a setup request was fired
     */
    function evaluateSavedCard() {
        if (!isAtPaymentStage() || isNewCardMode() || !isCreditCardSelected()) {
            return false;
        }

        var $selected = $('.saved-payment-instrument.selected-payment');
        if (!$selected.length) {
            return false;
        }

        var uuid = $selected.data('uuid');
        var cardType = String($selected.data('card-type') || '').trim();

        // eCheck instruments share this list. They are not cards and payer auth does not apply.
        if (!uuid || !cardType || cardType === 'eCheck') {
            abandonSetup();
            return false;
        }

        var key = 'saved:' + uuid;
        if (key === lastRequestedKey) {
            return false;
        }

        // No security code is read or sent: setup authenticates against the wallet token, and
        // this cartridge renders no CVV field for saved cards at all.
        requestSetup({ storedPaymentUUID: uuid }, key);
        return true;
    }

    /**
     * Debounced entry point for new-card field edits. Whatever happens, the speculative disable
     * applied on the first keystroke is resolved: either a request takes ownership of the button,
     * or it is handed straight back.
     */
    function scheduleNewCardEvaluation() {
        if (debounceId) {
            window.clearTimeout(debounceId);
        }
        debounceId = window.setTimeout(function () {
            debounceId = null;
            if (evaluateNewCard()) {
                return;
            }
            engine.releaseSubmitIfNotRunning();

            // The card has been edited into a state we cannot set up, yet the server is still
            // holding a reference for the card as it was. Drop it, or the order-time gate would
            // enrol that old card against whatever is finally submitted. The reserved order
            // number is kept: the shopper is still paying by card.
            if (hasServerReference) {
                requestClear(true);
            }
        }, TRIGGER_DEBOUNCE_MS);
    }

    /**
     * Evaluates whichever branch is active. Safe to call repeatedly - both branches dedupe - and
     * always leaves the button either owned by a run or released.
     */
    function evaluateActiveBranch() {
        var fired = isNewCardMode() ? evaluateNewCard() : evaluateSavedCard();
        if (!fired) {
            engine.releaseSubmitIfNotRunning();
        }
    }

    /**
     * Runs once the shopper reaches the payment step, covering the saved card that SFRA has
     * already pre-selected so a returning shopper needs no click at all.
     */
    function onPaymentStageReached() {
        if (paymentStageReached) {
            return;
        }
        paymentStageReached = true;
        window.setTimeout(evaluateActiveBranch, 0);
    }

    // ---- wiring -----------------------------------------------------------------------------

    $(document).on('input change', '#cardNumber, #expirationMonth, #expirationYear, #securityCode', function () {
        if (!isAtPaymentStage() || !isNewCardMode() || !isCreditCardSelected()) {
            return;
        }

        // Editing the card is also the primary recovery route out of a blocked failed state.
        engine.clearFailure();

        // Whatever setup produced is for the card as it was BEFORE this edit, so stop trusting it
        // now rather than at the end of the debounce.
        if (currentNewCardKey() !== lastRequestedKey) {
            abandonSetup();
        }

        // Disable immediately, ahead of the debounce. Waiting would leave the button live for a
        // full second while the shopper has already finished typing.
        engine.holdSubmitForInput();
        scheduleNewCardEvaluation();
    });

    $(document).on('click', '.saved-payment-instrument', function () {
        engine.clearFailure();
        engine.holdSubmitForInput();
        // Deferred by a tick on purpose: the cartridge's own handler that moves .selected-payment
        // is delegated on document too and registered later, so reading the selection
        // synchronously here would see the PREVIOUS card and cost the shopper a second click.
        window.setTimeout(function () {
            if (!evaluateSavedCard()) {
                engine.releaseSubmitIfNotRunning();
            }
        }, 0);
    });

    // Toggling between the saved-card list and the new-card form changes which card would be
    // charged, so any reference already stored is no longer the right one.
    $(document).on('click', '.add-payment, .cancel-new-payment', function () {
        abandonSetup();
        // Still paying by card, just a different one - keep the reserved order number.
        requestClear(true);
        window.setTimeout(evaluateActiveBranch, 0);
    });

    // Switching to a wallet method takes payer auth out of the picture entirely.
    $(document).on('click', '#applePayPaymentOptionLink, #gPaypaymentOptionLink', function () {
        abandonSetup();
        requestClear();
    });

    $(document).on('click', '#creditCardPaymentOptionLink', function () {
        engine.clearFailure();
        window.setTimeout(evaluateActiveBranch, 0);
    });

    // The stage attribute is rewritten in place as the shopper moves through checkout, so watch
    // it rather than trying to hook every navigation path.
    var checkoutMain = document.getElementById('checkout-main');
    if (checkoutMain && window.MutationObserver) {
        new window.MutationObserver(function () {
            if (isAtPaymentStage()) {
                onPaymentStageReached();
            }
        }).observe(checkoutMain, { attributes: true, attributeFilter: ['data-checkout-stage'] });
    }

    $(function () {
        if (isAtPaymentStage()) {
            onPaymentStageReached();
        }
    });
}(window.jQuery));
