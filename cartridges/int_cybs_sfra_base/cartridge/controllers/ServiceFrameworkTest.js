'use strict';

var server = require('server');
var System = require('dw/system/System');
var configObject = require('../configuration/index');

/**
 * Renders Test Capture Service Form.
 */
// eslint-disable-next-line consistent-return
server.get('TestCaptureService', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    //  When in production, Redirect to home page.
    if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
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
            res.render('captureServiceForm', {
                captureServiceForm: captureServiceForm,
                // eslint-disable-next-line no-undef
                continueUrl: dw.web.URLUtils.https('ServiceFrameworkTest-CaptureService').toString()
            });
            return next();
        }
    }
});

// eslint-disable-next-line consistent-return
server.post('CaptureService', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    //  When in production, Redirect to home page.
    if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
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
            res.render('transactionresult', {
                serviceReply: captureReply,
                response: serviceResponse,
                msgHeader: captureReplyTitle
            });
            return next();
        }
        res.render('common/scripterror', {
            // eslint-disable-next-line no-undef
            log: !empty(serviceResponse.errorMsg) ? serviceResponse.errorMsg : 'System Exception occured contact administrator'
        });
        return next();
    }
});
/**
 * Renders Test authReversal Service Form.
 */
// eslint-disable-next-line consistent-return
server.get('TestAuthReversal', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    //  When in production, Redirect to home page.
    if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
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
            res.render('authreversalform', {
                authreversalform: authReversalServiceForm,
                continueUrl: URLUtils.https('ServiceFrameworkTest-authReversalService').toString()
            });
            return next();
        }
    }
});

// eslint-disable-next-line consistent-return
server.post('authReversalService', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    //  When in production, Redirect to home page.
    if (System.getInstanceType() === System.PRODUCTION_SYSTEM) {
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
            res.render('transactionresult', {
                serviceReply: reversalReply,
                response: serviceResponse,
                msgHeader: reversalReplyTitle
            });
            return next();
        }
        res.render('common/scripterror', {
            // eslint-disable-next-line no-undef
            log: !empty(serviceResponse.errorMsg) ? serviceResponse.errorMsg : 'System Exception occured contact administrator'
        });
        return next();
    }
});

module.exports = server.exports();
