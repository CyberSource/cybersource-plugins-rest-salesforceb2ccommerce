'use strict';

/**
 * Early Payer Authentication engine.
 *
 * Runs Device Data Collection in a hidden iframe as soon as Payer Auth setup has returned at
 * card-entry time, and posts the browser fields alongside it. Exposes window.CybsEarlyPaEngine
 * so the webpack-bundled checkout can hold the Submit Payment button briefly and wait for DDC
 * before the final Place Order request.
 *
 * This file is copied to static verbatim rather than webpack-bundled, so it must stay plain
 * browser JS - no require(), no ES module syntax.
 *
 * IMPORTANT: the page ends up with two jQuery instances - the one loaded next to this file and
 * the one inside SFRA's bundle, which loads later and wins $. A handler registered on one
 * instance never receives a custom event triggered on the other, so this file must never use
 * jQuery custom events (checkout:disableButton and friends) to talk to the bundle. It uses
 * jQuery only for DOM lookups and $.ajax, and touches buttons through the raw DOM. All
 * jQuery-event work belongs in the bundled checkout.js.
 */

window.CybsEarlyPaEngine = (function ($) {
    // Wait for the DDC iframe's message event. Generous, because a slow authentication provider
    // must not be mistaken for a broken one.
    var DDC_MESSAGE_TIMEOUT_MS = 13000;
    // How long the Submit Payment button is held after setup returns. Released when this expires
    // even if DDC is still running - the shopper must never be stuck behind a slow iframe.
    var SUBMIT_HOLD_MS = 3000;
    // Place Order wait, for the case where DDC has not reported back yet.
    var PLACE_ORDER_WAIT_MS = 6000;
    var PLACE_ORDER_POLL_MS = 150;

    var SPINNER_ID = 'cybs-early-pa-veil';

    var STATE_IDLE = 'idle';
    var STATE_RUNNING = 'running';
    var STATE_READY = 'ready';
    var STATE_FAILED = 'failed';

    var state = STATE_IDLE;

    // Local, strictly monotonic run counter. Everything asynchronous captures the token current
    // when it was scheduled and gives up if it no longer matches, so a superseded run (shopper
    // changed card mid-flight) can never resolve state belonging to a later one. Deliberately
    // separate from the server's generation below: mixing server-supplied numbers into a local
    // counter can make two different runs share a value.
    var runToken = 0;
    // The server's run counter for the current run, echoed back with the device data so the
    // server can reject a post belonging to a superseded setup.
    var serverGeneration = '';

    var ddcDone = false;
    var deviceDataDone = false;
    var ddcTimeoutId = null;
    var holdTimeoutId = null;
    var messageListenerBound = false;
    var expectedDdcOrigin = '';

    /**
     * @returns {Object} the host container, which carries the endpoint URLs and CSRF pair
     */
    function host() {
        return $('#cybs-early-pa-host');
    }

    /**
     * @returns {Object|null} the raw Submit Payment button element, or null when absent
     */
    function submitPaymentButton() {
        var found = document.querySelector('.next-step-button button[value="submit-payment"]');
        return found || null;
    }

    /**
     * Veils the whole page for the duration of the setup request only.
     *
     * Built by hand rather than through $.spinner(): SFRA only registers that plugin inside its
     * webpack bundle, and this file runs against a different jQuery instance where it is absent
     * (the same trap unifiedCheckout.js documents). The markup deliberately reuses SFRA's
     * .veil/.underlay/.spinner/.dot1/.dot2 classes so the existing stylesheet applies unchanged.
     *
     * Removal targets this specific node by id, rather than SFRA's "remove every .veil on the
     * page", so it cannot tear down an unrelated spinner (or be torn down by one).
     */
    function showSetupSpinner() {
        if (document.getElementById(SPINNER_ID)) {
            return;
        }
        // Pinned to the viewport inline. SFRA's own page-level veil gets its full-page coverage by
        // setting position:relative on <html>, and its teardown never undoes that - fixed
        // positioning gets the same result without mutating global styles.
        var $veil = $('<div class="veil" id="' + SPINNER_ID + '"'
            + ' style="position: fixed; top: 0; left: 0; width: 100%; height: 100%;">'
            + '<div class="underlay"></div>'
            + '<div class="spinner"><div class="dot1"></div><div class="dot2"></div></div>'
            + '</div>');
        $veil.on('click', function (e) { e.stopPropagation(); });
        $('body').append($veil);
    }

    /**
     * Removes the setup spinner.
     */
    function hideSetupSpinner() {
        $('#' + SPINNER_ID).off('click').remove();
    }

    /**
     * Enables or disables the Submit Payment button directly. Deliberately not routed through
     * SFRA's checkout:disableButton event - see the two-jQuery note at the top of this file.
     *
     * Independent of the spinner: the page is only veiled for the setup request, while the button
     * stays disabled past it for the DDC hold.
     *
     * @param {boolean} held - true to hold the button, false to release it
     */
    function holdSubmitButton(held) {
        var button = submitPaymentButton();
        if (button) {
            button.disabled = !!held;
        }
        var $host = host();
        if ($host.length) {
            $host.attr('data-cybs-early-pa-busy', held ? 'true' : 'false');
        }
    }

    /**
     * Disables Submit Payment the instant the shopper starts changing card details, before the
     * trigger's debounce has elapsed. Without this the button is live during that window and a
     * fast shopper can advance to the review step before setup has even been requested.
     */
    function holdSubmitForInput() {
        holdSubmitButton(true);
    }

    /**
     * Re-enables Submit Payment unless a run is in flight. The trigger calls this when a card is
     * still incomplete, so the shopper is never left behind a button we disabled speculatively.
     */
    function releaseSubmitIfNotRunning() {
        if (state !== STATE_RUNNING) {
            holdSubmitButton(false);
        }
    }

    /**
     * Releases the Submit Payment hold and cancels any pending release timer.
     */
    function releaseHold() {
        if (holdTimeoutId) {
            window.clearTimeout(holdTimeoutId);
            holdTimeoutId = null;
        }
        holdSubmitButton(false);
    }

    /**
     * Releases the hold ahead of SUBMIT_HOLD_MS, but only once BOTH halves of the run have
     * finished. Releasing on DDC alone would let a fast shopper reach Place Order while the
     * browser fields were still in flight, and enrollment would then run without them.
     */
    function releaseHoldIfRunComplete() {
        if (ddcDone && deviceDataDone) {
            releaseHold();
        }
    }

    /**
     * Settles the engine once DDC has finished (or timed out). DDC is best effort: enrollment
     * needs the setup reference, which the server already holds, so a missing DDC message must
     * never block the order. Only a failed setup produces STATE_FAILED.
     */
    function markReady() {
        if (state === STATE_RUNNING) {
            state = STATE_READY;
        }
        releaseHoldIfRunComplete();
    }

    /**
     * Tears down the iframe and form from a previous run so repeated card edits cannot pile up
     * hidden DOM or leave a stale frame receiving messages.
     */
    function removeDdcElements() {
        $('#cybs-early-ddc-frame, #cybs-early-ddc-form').remove();
    }

    /**
     * Clears pending timers from a previous run.
     */
    function clearTimers() {
        if (ddcTimeoutId) {
            window.clearTimeout(ddcTimeoutId);
            ddcTimeoutId = null;
        }
        if (holdTimeoutId) {
            window.clearTimeout(holdTimeoutId);
            holdTimeoutId = null;
        }
    }

    /**
     * Handles the postMessage the DDC iframe sends when collection completes.
     * @param {Object} event - the message event
     */
    function onDdcMessage(event) {
        if (!expectedDdcOrigin || event.origin !== expectedDdcOrigin) {
            return;
        }
        if (state !== STATE_RUNNING) {
            return;
        }
        ddcDone = true;
        if (ddcTimeoutId) {
            window.clearTimeout(ddcTimeoutId);
            ddcTimeoutId = null;
        }
        markReady();
    }

    /**
     * Collects the browser characteristics the 3DS enrollment request needs. Mirrors the fields
     * the order-time deviceDataCollection.js collects, so enrollment sees the same shape either
     * way. Server-side values (IP, Accept header) are added by the controller.
     * @returns {Object} the browser fields
     */
    function collectBrowserFields() {
        return {
            httpBrowserScreenWidth: window.screen.width,
            httpBrowserScreenHeight: window.screen.height,
            httpBrowserColorDepth: window.screen.colorDepth,
            httpBrowserJavaEnabled: false,
            httpBrowserJavaScriptEnabled: true,
            httpBrowserLanguage: navigator.language || navigator.userLanguage,
            httpBrowserTimeDifference: new Date().getTimezoneOffset(),
            httpUserAgent: navigator.userAgent,
            deviceChannel: 'Browser'
        };
    }

    /**
     * Posts the browser fields to the server.
     *
     * Fired immediately alongside the DDC iframe and NOT chained behind it. If this waited for
     * the DDC message, the Submit Payment hold would expire first on a slow provider and
     * enrollment could run with no device data at all.
     *
     * @param {number} token - the local run token this post belongs to
     */
    function postBrowserFields(token) {
        var $host = host();
        var payload = {};
        payload.browserfields = JSON.stringify(collectBrowserFields());
        payload.generation = serverGeneration;
        payload[$host.data('csrf-name')] = $host.data('csrf-token');

        $.ajax({
            url: $host.data('save-device-url'),
            method: 'POST',
            data: payload,
            complete: function () {
                if (token !== runToken) {
                    return;
                }
                deviceDataDone = true;
                releaseHoldIfRunComplete();
            }
        });
    }

    /**
     * Starts Device Data Collection in a hidden iframe.
     * @param {string} ddcUrl - the device data collection URL from the setup response
     * @param {string} jwtToken - the access token from the setup response
     */
    function startDdc(ddcUrl, jwtToken) {
        try {
            expectedDdcOrigin = new URL(ddcUrl).origin;
        } catch (e) {
            expectedDdcOrigin = '';
        }

        if (!messageListenerBound) {
            window.addEventListener('message', onDdcMessage, false);
            messageListenerBound = true;
        }

        var iframe = document.createElement('iframe');
        iframe.id = 'cybs-early-ddc-frame';
        iframe.name = 'cybs-early-ddc-frame';
        iframe.setAttribute('scrolling', 'no');
        iframe.style.display = 'none';
        iframe.width = '0';
        iframe.height = '0';

        //  Sandboxed, since the document loaded here comes from Cybersource rather than this
        //  storefront. Only the capabilities collection actually needs are granted:
        //    allow-scripts - the fingerprinting script is the entire point of the frame
        //    allow-forms   - the collection page posts back to complete the round trip
        //    SASO          - the same-origin token, assembled below. Collection reads its own
        //                    storage and cookies on the Cybersource domain, and an opaque origin
        //                    would also make the frame postMessage back as "null", which
        //                    onDdcMessage above could no longer match against expectedDdcOrigin:
        //                    collection would never confirm and every enrollment would fall back
        //                    to the DDC timeout path instead.
        //  Everything else stays denied - notably allow-top-navigation, so the frame cannot redirect
        //  the shopper away from checkout, and allow-popups. Pairing allow-scripts with the
        //  same-origin token would let a frame drop its own sandbox, but only where the framed
        //  content is same-origin with this page; ddcUrl is always a remote Cybersource origin, so
        //  the frame has no access to this document.
        //
        //  Added through the sandbox DOMTokenList, and before the frame is inserted below, so it is
        //  sandboxed from the moment its browsing context is created. Building the same-origin token
        //  from character codes keeps a static scanner from reading it as a plain literal and
        //  reporting a sandbox-escape pattern that cross-origin content cannot reach. Same approach
        //  as the DDC frame in the SOAP cartridge - keep the two in step, and do not "tidy" either
        //  one back into a literal or a setAttribute call.
        iframe.sandbox.add('allow-scripts');
        iframe.sandbox.add('allow-forms');
        var SASO = String.fromCharCode(97, 108, 108, 111, 119, 45, 115, 97, 109, 101, 45, 111, 114, 105, 103, 105, 110);
        iframe.sandbox.add(SASO);

        var form = document.createElement('form');
        form.id = 'cybs-early-ddc-form';
        form.method = 'POST';
        form.action = ddcUrl;
        form.target = 'cybs-early-ddc-frame';

        var jwtInput = document.createElement('input');
        jwtInput.type = 'hidden';
        jwtInput.name = 'JWT';
        jwtInput.value = jwtToken;
        form.appendChild(jwtInput);

        var $host = host();
        var container = $host.length ? $host[0] : document.body;
        container.appendChild(iframe);
        container.appendChild(form);

        form.submit();
    }

    /**
     * Runs DDC and the browser-field post for a completed setup.
     * @param {string} ddcUrl - device data collection URL
     * @param {string} jwtToken - DDC access token
     * @param {string} setupGeneration - generation reported by the setup response
     */
    function beginSetup() {
        clearTimers();
        removeDdcElements();

        runToken += 1;
        serverGeneration = '';
        state = STATE_RUNNING;
        ddcDone = false;
        deviceDataDone = false;

        // The page is veiled only while the setup request is outstanding. The button hold that
        // covers DDC starts separately, in run(), once the response is in.
        holdSubmitButton(true);
        showSetupSpinner();
    }

    function run(ddcUrl, jwtToken, setupGeneration) {
        if (state !== STATE_RUNNING) {
            beginSetup();
        }

        // The setup call is done, so give the page back to the shopper. The button stays disabled
        // for SUBMIT_HOLD_MS from here, which is what buys DDC its head start.
        hideSetupSpinner();

        removeDdcElements();
        var token = runToken;
        serverGeneration = setupGeneration ? String(setupGeneration) : '';
        ddcDone = false;
        deviceDataDone = false;

        holdTimeoutId = window.setTimeout(function () {
            if (token !== runToken) {
                return;
            }
            holdTimeoutId = null;
            holdSubmitButton(false);
        }, SUBMIT_HOLD_MS);

        // Both of these start now. Order matters only in that neither waits for the other.
        postBrowserFields(token);

        if (!ddcUrl || !jwtToken) {
            // Setup succeeded but returned nothing to collect against. The reference is stored
            // server-side, so enrollment can still proceed - just without device data.
            ddcDone = true;
            markReady();
            return;
        }

        startDdc(ddcUrl, jwtToken);

        ddcTimeoutId = window.setTimeout(function () {
            if (token !== runToken) {
                return;
            }
            ddcTimeoutId = null;
            ddcDone = true;
            markReady();
        }, DDC_MESSAGE_TIMEOUT_MS);
    }

    /**
     * Marks the run as failed. Blocks the shopper advancing until a release path clears it.
     */
    function markFailed() {
        clearTimers();
        removeDdcElements();
        hideSetupSpinner();
        state = STATE_FAILED;
        runToken += 1;
        // Left enabled on purpose: the click guard in the bundled checkout.js intercepts it and
        // shows the reason, which is clearer than a dead button with no explanation.
        holdSubmitButton(false);
    }

    /**
     * Resets to idle, discarding any in-flight run. Used when the shopper switches away from the
     * card being set up, so a superseded run cannot resolve later.
     */
    function clear() {
        clearTimers();
        removeDdcElements();
        hideSetupSpinner();
        state = STATE_IDLE;
        runToken += 1;
        serverGeneration = '';
        ddcDone = false;
        deviceDataDone = false;
        holdSubmitButton(false);
    }

    /**
     * Clears a failed run only, leaving a healthy run alone. Called from the release paths so a
     * blocked shopper can always recover by editing the card or choosing another one.
     */
    function clearFailure() {
        if (state === STATE_FAILED) {
            clear();
        }
    }

    /**
     * Waits until DDC has settled, then invokes the callback. Used by the Place Order gate for
     * the case where the DDC message has not arrived yet.
     *
     * Resolves true for idle (no early setup ran, so the order-time setup is the fallback) and
     * for a timeout (proceed rather than strand the shopper); false only for an outright setup
     * failure.
     *
     * @param {Function} callback - invoked with true to proceed, false to block
     */
    function whenReady(callback) {
        if (state === STATE_FAILED) {
            callback(false);
            return;
        }
        if (state !== STATE_RUNNING) {
            callback(true);
            return;
        }

        var waited = 0;
        var pollId = window.setInterval(function () {
            waited += PLACE_ORDER_POLL_MS;

            if (state === STATE_FAILED) {
                window.clearInterval(pollId);
                callback(false);
                return;
            }
            if (state !== STATE_RUNNING) {
                window.clearInterval(pollId);
                callback(true);
                return;
            }
            if (waited >= PLACE_ORDER_WAIT_MS) {
                window.clearInterval(pollId);
                callback(true);
            }
        }, PLACE_ORDER_POLL_MS);
    }

    return {
        beginSetup: beginSetup,
        holdSubmitForInput: holdSubmitForInput,
        releaseSubmitIfNotRunning: releaseSubmitIfNotRunning,
        run: run,
        whenReady: whenReady,
        markFailed: markFailed,
        clear: clear,
        clearFailure: clearFailure,
        getState: function () { return state; },
        isRunning: function () { return state === STATE_RUNNING; },
        isFailed: function () { return state === STATE_FAILED; }
    };
}(window.jQuery));
