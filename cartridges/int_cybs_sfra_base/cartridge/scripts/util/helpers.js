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

module.exports.getCurrentRouteAction = getCurrentRouteAction;
