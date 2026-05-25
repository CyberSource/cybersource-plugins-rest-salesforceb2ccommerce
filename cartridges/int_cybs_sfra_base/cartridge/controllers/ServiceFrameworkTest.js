'use strict';

var server = require('server');
var System = require('dw/system/System');
var Site = require('dw/system/Site');
var configObject = require('../configuration/index');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var userLoggedIn = require('*/cartridge/scripts/middleware/userLoggedIn');

// Membership in this customer group is required to access the test endpoints.
// The group must be created in Business Manager and assigned only to authorized
// merchant staff. An empty value blocks all access.
var TEST_ENDPOINT_CUSTOMER_GROUP = 'CybersourceTestAdmin';

/**
 * Returns true only when the request is from an authenticated, registered
 * customer who is a member of the privileged Cybersource test customer group.
 * @param {Object} req SFRA request wrapper
 * @returns {boolean} true if the caller is authorized to use the test endpoints
 */
function isAuthorizedTestUser(req) {
    var rawCustomer = req && req.currentCustomer && req.currentCustomer.raw;
    if (!rawCustomer || !rawCustomer.authenticated || !rawCustomer.registered) {
        return false;
    }
    if (!TEST_ENDPOINT_CUSTOMER_GROUP) {
        return false;
    }
    return rawCustomer.isMemberOfCustomerGroup(TEST_ENDPOINT_CUSTOMER_GROUP);
}

/**
 * Composite gate: production check, site-pref toggle, and authorization.
 * @param {Object} req SFRA request wrapper
 * @returns {boolean} true if the test endpoints may execute for this request
 */
function isTestEndpointAccessAllowed(req) {
    if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
        return false;
    }
    if (!Site.current.getCustomPreferenceValue('Cybersource_EnableTestEndpoints')) {
        return false;
    }
    return isAuthorizedTestUser(req);
}

/**
 * Renders Test Capture Service Form.
 */
// eslint-disable-next-line consistent-return
server.get(
    'TestCaptureService',
    userLoggedIn.validateLoggedIn,
    csrfProtection.generateToken,
    function (req, res, next) {
        var URLUtils = require('dw/web/URLUtils');
        if (!isTestEndpointAccessAllowed(req)) {
            res.redirect(URLUtils.url('Home-Show'));
            return next();
        }
        // check if service parameter not available,display form
        if (configObject.cartridgeEnabled) {
            // eslint-disable-next-line no-undef
            if (empty(request.httpParameterMap.service.stringValue)) {
                // eslint-disable-next-line no-undef
                session.forms.generictestinterfaceform.clearFormElement();
                var captureServiceForm = server.forms.getForm('generictestinterfaceform');
                // render the refund service form
                secureResponseHelper.secureRender(res, 'captureServiceForm', {
                    captureServiceForm: captureServiceForm,
                    // eslint-disable-next-line no-undef
                    continueUrl: dw.web.URLUtils.https('ServiceFrameworkTest-CaptureService').toString()
                });
                return next();
            }
        }
    }
);

// eslint-disable-next-line consistent-return
server.post(
    'CaptureService',
    userLoggedIn.validateLoggedIn,
    csrfProtection.validateRequest,
    function (req, res, next) {
        var URLUtils = require('dw/web/URLUtils');
        if (!isTestEndpointAccessAllowed(req)) {
            res.redirect(URLUtils.url('Home-Show'));
            return next();
        }
        if (configObject.cartridgeEnabled) {
            // eslint-disable-next-line no-undef
            var requestID = session.forms.generictestinterfaceform.authRequestID.htmlValue;
            // eslint-disable-next-line no-undef
            var merchantRefCode = session.forms.generictestinterfaceform.merchantReferenceCode.htmlValue;
            // eslint-disable-next-line no-undef
            var paymentTotal = session.forms.generictestinterfaceform.grandtotalamount.value;
            // eslint-disable-next-line no-undef
            var currency = session.forms.generictestinterfaceform.currency.value;

            var serviceResponse;
            var captureReply;
            var captureReplyTitle;
            var captureObj = require('~/cartridge/scripts/http/capture.js');
            serviceResponse = captureObj.httpCapturePayment(requestID, merchantRefCode, paymentTotal, currency);

            captureReplyTitle = 'Capture Service Reply';
            captureReply = 'CaptureReply';
            // eslint-disable-next-line no-undef
            session.forms.generictestinterfaceform.clearFormElement();
            // eslint-disable-next-line no-undef
            if (!empty(serviceResponse)) {
                secureResponseHelper.secureRender(res, 'transactionresult', {
                    serviceReply: captureReply,
                    response: serviceResponse,
                    msgHeader: captureReplyTitle
                });
                return next();
            }
            secureResponseHelper.secureRender(res, 'common/scripterror', {
                // eslint-disable-next-line no-undef
                log: !empty(serviceResponse.errorMsg) ? serviceResponse.errorMsg : 'System Exception occured contact administrator'
            });
            return next();
        }
    }
);
/**
 * Renders Test authReversal Service Form.
 */
// eslint-disable-next-line consistent-return
server.get(
    'TestAuthReversal',
    userLoggedIn.validateLoggedIn,
    csrfProtection.generateToken,
    function (req, res, next) {
        var URLUtils = require('dw/web/URLUtils');
        if (!isTestEndpointAccessAllowed(req)) {
            res.redirect(URLUtils.url('Home-Show'));
            return next();
        }

        // check if service parameter not available,display form
        if (configObject.cartridgeEnabled) {
            // eslint-disable-next-line no-undef
            if (empty(request.httpParameterMap.service.stringValue)) {
                // eslint-disable-next-line no-undef
                session.forms.generictestinterfaceform.clearFormElement();
                var authReversalServiceForm = server.forms.getForm('generictestinterfaceform');
                // render the refund service form
                secureResponseHelper.secureRender(res, 'authreversalform', {
                    authreversalform: authReversalServiceForm,
                    continueUrl: URLUtils.https('ServiceFrameworkTest-authReversalService').toString()
                });
                return next();
            }
        }
    }
);

// eslint-disable-next-line consistent-return
server.post(
    'authReversalService',
    userLoggedIn.validateLoggedIn,
    csrfProtection.validateRequest,
    function (req, res, next) {
        var URLUtils = require('dw/web/URLUtils');
        if (!isTestEndpointAccessAllowed(req)) {
            res.redirect(URLUtils.url('Home-Show'));
            return next();
        }
        if (configObject.cartridgeEnabled) {
            // eslint-disable-next-line no-undef
            var requestID = session.forms.generictestinterfaceform.authRequestID.htmlValue;
            // eslint-disable-next-line no-undef
            var merchantRefCode = session.forms.generictestinterfaceform.merchantReferenceCode.htmlValue;
            // eslint-disable-next-line no-undef
            var paymentTotal = session.forms.generictestinterfaceform.grandtotalamount.value;
            // eslint-disable-next-line no-undef
            var currency = session.forms.generictestinterfaceform.currency.value;

            var serviceResponse;
            var reversalReply;
            var reversalReplyTitle;
            var reversalObj = require('~/cartridge/scripts/http/authReversal.js');
            serviceResponse = reversalObj.httpAuthReversal(requestID, merchantRefCode, paymentTotal, currency);

            reversalReplyTitle = 'Reversal Service Reply';
            reversalReply = 'ccAuthReversalReply';
            // eslint-disable-next-line no-undef
            session.forms.generictestinterfaceform.clearFormElement();
            // eslint-disable-next-line no-undef
            if (!empty(serviceResponse)) {
                secureResponseHelper.secureRender(res, 'transactionresult', {
                    serviceReply: reversalReply,
                    response: serviceResponse,
                    msgHeader: reversalReplyTitle
                });
                return next();
            }
            secureResponseHelper.secureRender(res, 'common/scripterror', {
                // eslint-disable-next-line no-undef
                log: !empty(serviceResponse.errorMsg) ? serviceResponse.errorMsg : 'System Exception occured contact administrator'
            });
            return next();
        }
    }
);

module.exports = server.exports();
