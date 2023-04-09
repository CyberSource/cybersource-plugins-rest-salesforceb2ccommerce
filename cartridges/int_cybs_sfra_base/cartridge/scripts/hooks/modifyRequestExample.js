'use strict';

/**
 * Example of how to customize and modify the Auth Reversal request.
 *
 * @param {Object} requestIn - The request object about to be sent to Cybersource.
 * @returns {Object} - A modified version of requestIn.
 */
function AuthReversal(requestIn) {
    var request = requestIn;

    //  Customize the request object here.

    return request;
}

/**
 * Example of how to customize and modify the Credit Card Capture request.
 *
 * @param {Object} requestIn - The request object about to be sent to Cybersource.
 * @returns {Object} - A modified version of requestIn.
 */
function Capture(requestIn) {
    var request = requestIn;

    //  Customize the request object here.

    return request;
}

exports.AuthReversal = AuthReversal;
exports.Capture = Capture;
