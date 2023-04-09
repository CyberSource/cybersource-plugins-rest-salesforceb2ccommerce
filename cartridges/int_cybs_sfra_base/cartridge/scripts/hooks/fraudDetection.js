'use strict';

var configObject = require('../../configuration/index');

/**
 * Fraud Detection Hook
 *
 * @param {dw.order.Basket} basket - The baasket object to be placed
 * @returns {Object} an error object. Status can have three values 'success', 'fail' or 'flag'
 *         error code that could be mapped to localized resources error Message a string with the
 *         error message, that could be used as a fall-back if error code doesn't have a mapping
 */
function fraudDetection(basket) { // eslint-disable-line no-unused-vars
    var Logger = require('dw/system/Logger');
    var errorCode = '';
    var errorMessage = '';
    var decision = 'ACCEPT';
    var status = 'success';

    //  If DM is disabled, default status returned is 'success'.
    //  If DM is enabled, get the status saved in the session, form the last Auth call.
    if (configObject.fmeDmEnabled) {
        // eslint-disable-next-line no-undef
        if ('orderStatus' in session.privacy) {
            // eslint-disable-next-line no-undef
            decision = session.privacy.orderStatus;
        } else {
            Logger.debug("Error setting fraud decision.  CybersourceFraudDecision missing from session.  Default is set to 'ACCEPT'");
        }
    }

    if (decision === 'AUTHORIZED_PENDING_REVIEW') {
        status = 'review';
    } else if (decision === 'REJECT') { //  Reject state shouldn't happen with CS. The CC auth returns an error when decision is REJECT, so it shouldn't get to this point.
        status = 'fail';
    }

    return {
        status: status,
        errorCode: errorCode,
        errorMessage: errorMessage
    };
}

exports.fraudDetection = fraudDetection;
