'use strict';

/**
 * Companion to payerAuthentication/payerAuthReturn.isml.
 *
 * Runs inside the step-up iframe once the ACS has returned. Tells the parent window the 3DS
 * challenge is over, then forwards the ACS's POST on to PayerAuthValidation.
 *
 * Order matters: the message goes out BEFORE the form is submitted. Submitting first would start a
 * navigation that can tear this document down before the message is dispatched, and the parent
 * would be left showing the challenge iframe over work that has already moved on.
 */
window.onload = function () {
    var messageTypeField = document.getElementById('payerAuthCompleteMessageType');
    var messageType = messageTypeField ? messageTypeField.value : '';

    if (messageType) {
        try {
            // Same-origin by construction, so the parent can verify event.origin strictly.
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: messageType }, window.location.origin);
            }
        } catch (e) {
            // A blocked postMessage must not stop the hand-off - the parent has a load-event
            // backstop that reaches the same conclusion.
            if (window.console && window.console.warn) {
                window.console.warn('Payer auth return: could not notify the parent window');
            }
        }
    }

    var forwardForm = document.getElementById('payerAuthForwardForm');
    if (forwardForm) {
        forwardForm.submit();
    }
};
