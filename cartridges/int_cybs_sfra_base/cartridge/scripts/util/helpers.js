/* eslint-disable no-undef */

'use strict';

/**
 * @returns {*} *
 */
function getCurrentRouteAction() {
    var segments = request.httpPath.split('/');
    // return last
    return segments[segments.length - 1];
}

/**
 * Gets the route action from the top window URL (HTTP Referer)
 * This is useful when current request is from a popup/iframe (like Apple Pay)
 * @returns {string} The route action from the referring page
 */
function getTopWindowRouteAction() {
    var referer = request.httpReferer;
    if (referer) {
        // Extract the path from the referer URL
        var urlParts = referer.split('?')[0]; // Remove query string
        var segments = urlParts.split('/');
        // Find the last segment that looks like a Controller-Action pattern
        for (var i = segments.length - 1; i >= 0; i--) {
            if (segments[i] && segments[i].indexOf('-') > 0) {
                return segments[i];
            }
        }
    }
    // Fallback to current route if referer not available
    return getCurrentRouteAction();
}

module.exports.getCurrentRouteAction = getCurrentRouteAction;
module.exports.getTopWindowRouteAction = getTopWindowRouteAction;
