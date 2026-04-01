'use strict';

window.onload = function () {
    // Auto submit form on page load
    document.getElementById('collectionForm').submit();
};

// Derive the trusted origin dynamically from the DDC URL (form action)
var collectionForm = document.getElementById('collectionForm');
var ddcUrl = collectionForm ? collectionForm.getAttribute('action') : '';
var ddcOrigin = ddcUrl ? (new URL(ddcUrl)).origin : '';

window.addEventListener('message', function (event) {
    // Compare event.origin against the dynamically derived origin
    if (ddcOrigin && event.origin === ddcOrigin) {
        console.log(event.data);
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
        document.payerAuthRedirect.submit();
    }
}, false);
