'use strict';

// How long to wait for the Device Data Collection iframe to post its message back before moving
// on without it. Collection is best effort: enrollment needs the referenceId (already in the
// redirect form) and the browser fields below, both of which we have regardless. Waiting forever
// on a message that never arrives would strand the shopper on this page mid-checkout.
var DDC_MESSAGE_TIMEOUT_MS = 10000;

// Guards against submitting twice when the message lands at almost exactly the timeout boundary.
var proceeded = false;
var ddcTimeoutId = null;

// Derive the trusted origin dynamically from the DDC URL (form action)
var collectionForm = document.getElementById('collectionForm');
var ddcUrl = collectionForm ? collectionForm.getAttribute('action') : '';
var ddcOrigin = ddcUrl ? (new URL(ddcUrl)).origin : '';

/**
 * Populates the browser/device backup fields and continues to payer auth enrollment.
 * @param {string} reason - why we are continuing, for the console trail
 */
function proceedToEnrollment(reason) {
    if (proceeded) {
        return;
    }
    proceeded = true;

    if (ddcTimeoutId) {
        window.clearTimeout(ddcTimeoutId);
        ddcTimeoutId = null;
    }

    var browserProperties = {
        httpBrowserScreenWidth: window.screen.width,
        httpBrowserScreenHeight: window.screen.height,
        httpBrowserColorDepth: window.screen.colorDepth,
        httpBrowserJavaEnabled: false, //The navigator.javaEnabled() method is deprecated and always returns false in modern browsers since Java applet support has been removed.
        httpBrowserJavaScriptEnabled: true,
        httpBrowserLanguage: navigator.language || navigator.userLanguage,
        httpBrowserTimeDifference: new Date().getTimezoneOffset(),
        httpUserAgent: navigator.userAgent,
        // deviceChannel field : Determines the channel that the transaction came through. This field is required for SDK integration. Possible Values: SDK/Browser/3RI
        // When you use the SDK integration, this field is dynamically set to SDK.
        // When you use the JavaScript code, this field is dynamically set to Browser.
        // For merchant-initiated or 3RI transactions, you must set the field to 3RI.
        // When you use this field in addition to JavaScript code, you must set the field to Browser.
        deviceChannel: 'Browser'
    };
    var browserfields = JSON.stringify(browserProperties);
    document.getElementById('browserfields').value = browserfields;
    console.log('Device data collection: continuing to enrollment (' + reason + ')');
    document.payerAuthRedirect.submit();
}

window.onload = function () {
    // Auto submit form on page load
    if (collectionForm) {
        collectionForm.submit();
    }

    // Start the clock once collection has actually been kicked off. Started unconditionally: if
    // the form or the DDC URL is missing, no message can ever match and this timer is the only
    // way off the page.
    ddcTimeoutId = window.setTimeout(function () {
        ddcTimeoutId = null;
        proceedToEnrollment('timed out after ' + DDC_MESSAGE_TIMEOUT_MS + 'ms with no message event from the cardinal');
    }, DDC_MESSAGE_TIMEOUT_MS);
};

window.addEventListener('message', function (event) {
    // Compare event.origin against the dynamically derived origin
    if (ddcOrigin && event.origin === ddcOrigin) {
        console.log(event.data);
        proceedToEnrollment('device data collection completed');
    }
}, false);
