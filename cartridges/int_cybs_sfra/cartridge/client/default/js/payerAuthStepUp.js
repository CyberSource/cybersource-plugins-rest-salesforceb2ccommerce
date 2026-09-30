'use strict';

// Only used to stop monitoring an authentication the shopper has clearly abandoned. Nothing about
// the spinner's timing depends on it.
var STEP_UP_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Initialize Payer Authentication Step-Up Modal.
 *
 * The parent window cannot see inside the challenge iframe while it is on the issuer's domain, so
 * the state of the modal is driven by two signals, both of which are proof rather than inference:
 *
 *   1. A postMessage from our own same-origin return interstitial, which fires at the exact moment
 *      the ACS hands control back.
 *   2. An iframe load whose URL is readable. Readable means same-origin, which means it is our own
 *      return plumbing rather than the issuer - so the challenge is over. Unreadable means the ACS,
 *      which is the only thing that ever shows the shopper something to act on.
 *
 * Deliberately no timers, load counters or thresholds are used to decide any of this. Guessing from
 * load timings can hide a live challenge behind the spinner, leaving the shopper stuck at a spinner
 * while their bank waits for input they cannot see.
 */
function initPayerAuthStepUpModal() {
    var config = document.getElementById('cyb_payerauth_stepup');
    var modalOverlay = document.getElementById('stepup-modal-overlay');
    var stepUpForm = document.getElementById('step-up-form');
    var iframe = document.getElementById('step-up-iframe');
    var status = document.getElementById('stepup-status');
    var statusMessage = document.getElementById('stepup-status-message');

    if (!modalOverlay || !stepUpForm || !iframe) {
        console.error('Payer Auth Step-Up: Required elements not found');
        return;
    }

    var completeMessageType = config ? config.getAttribute('data-complete-message-type') : '';

    // Latched once the challenge is known to be over, so a later load event can never put the
    // issuer's iframe back on top of work that has already moved on.
    var finished = false;
    var timeoutId = null;

    /**
     * Shows the spinner and hides the challenge iframe.
     */
    function showSpinner() {
        if (status) {
            status.classList.remove('stepup-status-hidden');
        }
        iframe.classList.add('stepup-iframe-hidden');
    }

    /**
     * Reveals the challenge iframe and hides the spinner.
     */
    function showChallenge() {
        if (status) {
            status.classList.add('stepup-status-hidden');
        }
        iframe.classList.remove('stepup-iframe-hidden');
    }

    /**
     * Marks the challenge finished and puts the spinner up for the remaining server-side work:
     * validation, order placement, then the top-level redirect.
     *
     * The overlay is deliberately never taken down here. Hiding it before the redirect completes
     * would show the shopper the stale checkout page underneath for as long as navigation takes.
     *
     * @param {string} reason - what proved the challenge was over, for the console trail
     */
    function markFinished(reason) {
        if (finished) {
            return;
        }
        finished = true;
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
        console.log('Payer Authentication: challenge complete (' + reason + ')');
        showSpinner();
    }

    /**
     * Inspects the iframe's current document.
     *
     * Readability and blankness are reported separately on purpose. They answer different
     * questions - "is this the issuer or us?" and "has anything actually loaded yet?" - and
     * collapsing them into one nullable string makes the cross-origin case indistinguishable from
     * the not-loaded-yet case, which silently stops the challenge from ever being revealed.
     *
     * @returns {Object} { readable: boolean, url: string } - readable false means cross-origin
     */
    function inspectIframe() {
        try {
            // Cross-origin: contentDocument is null in some browsers and contentWindow.document
            // throws in others. Both mean the same thing here.
            var iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
            if (!iframeDocument || !iframeDocument.location) {
                return { readable: false, url: '' };
            }
            return { readable: true, url: iframeDocument.location.href || '' };
        } catch (e) {
            return { readable: false, url: '' };
        }
    }

    // Signal 1: our own interstitial reporting in. Strict origin check - it is same-origin by
    // construction, so anything else is not ours.
    window.addEventListener('message', function (event) {
        if (event.origin !== window.location.origin) {
            return;
        }
        if (!completeMessageType || !event.data || event.data.type !== completeMessageType) {
            return;
        }
        markFinished('return interstitial posted back');
    }, false);

    // Signal 2: backstop for a blocked or missed postMessage.
    iframe.addEventListener('load', function () {
        var loaded = inspectIframe();

        // Unreadable means cross-origin, which means the issuer. This is the only load that ever
        // puts something interactive in front of the shopper, so it is the only one that reveals
        // the iframe. Checked BEFORE any blank-URL test: a cross-origin document reports no URL at
        // all, so testing for a blank URL first would swallow this case and leave the shopper
        // staring at the spinner with the OTP page hidden behind it.
        if (!loaded.readable) {
            if (!finished) {
                showChallenge();
            }
            return;
        }

        // Same-origin from here on. The initial empty document, before the step-up form has been
        // submitted into it, reports either about:blank or an empty string depending on the
        // browser - neither is a return, so ignore both.
        if (!loaded.url || loaded.url === 'about:blank') {
            return;
        }

        // Same-origin with a real URL: our own return plumbing, not the issuer.
        markFinished('iframe returned to this origin');
    }, false);

    // Start hidden behind the spinner: until a cross-origin load proves otherwise there is nothing
    // in the iframe worth showing.
    showSpinner();
    modalOverlay.style.display = 'flex';

    stepUpForm.submit();
    console.log('Payer Authentication Step-Up form submitted');

    timeoutId = window.setTimeout(function () {
        timeoutId = null;
        if (finished) {
            return;
        }
        // Say something rather than silently dropping the modal, which would leave the shopper on
        // an apparently normal checkout page with an order mid-authentication.
        console.warn('Payer Authentication timed out after ' + STEP_UP_TIMEOUT_MS + 'ms');
        showSpinner();
        if (status) {
            status.classList.add('stepup-status-timeout');
        }
        if (statusMessage) {
            statusMessage.textContent = statusMessage.getAttribute('data-timeout-message') || '';
        }
    }, STEP_UP_TIMEOUT_MS);
}

/**
 * Initialize when DOM is ready
 */
window.onload = function () {
    // Check if we're on the Payer Authentication Step-Up page
    var payerAuthDiv = document.getElementById('cyb_payerauth_stepup');
    if (payerAuthDiv) {
        initPayerAuthStepUpModal();
    } else {
        var stepUpForm = document.querySelector('#step-up-form');
        if (stepUpForm) {
            stepUpForm.submit();
        }
    }
};
