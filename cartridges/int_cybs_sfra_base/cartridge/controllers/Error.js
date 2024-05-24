/* eslint-disable no-plusplus */

'use strict';

var server = require('server');
var system = require('dw/system/System');
var URLUtils = require('dw/web/URLUtils');
var configObject = require('../configuration/index');

var page = module.superModule;
server.extend(page);

if (configObject.cartridgeEnabled) {
    server.get('ErrorCodeAjaxRedirect', function (req, res, next) {
        var redirectURL = URLUtils.url('Error-ErrorCode', 'err', req.querystring.err).toString();
        var statusCode = +req.querystring.statuscode;
        res.setStatusCode(statusCode);
        res.json({
            success: false,
            redirectUrl: redirectURL
        });
        next();
    });

    server.append('Start', function (req, res, next) {
        var errors = require('~/cartridge/scripts/util/errors.js');
        var customError = errors.errorDeserialize(req.error.errorText);
        if (customError !== null) {
            if (customError.errorCode) {
                if (customError.errorCode >= 400 && customError.errorCode < 500) res.setStatusCode(200);
            }
            var showError = system.getInstanceType() !== system.PRODUCTION_SYSTEM && system.getInstanceType() !== system.STAGING_SYSTEM;
            if (showError) {
                var messages = [customError.messageText || customError.message.message];
                var hasDetails = customError.message && customError.message.details;
                if (hasDetails) {
                    for (var i = 0; i < customError.message.details.length; i++) {
                        var detail = customError.message.details[i];
                        messages.push(JSON.stringify(detail));
                    }
                }
                messages.push();
                res.setContentType('application/json;charset=utf-8');
                if (req.httpHeaders.get('x-requested-with') === 'XMLHttpRequest') {
                    res.json({
                        errorObj: customError,
                        showError: showError,
                        message: messages[0],
                        serverErrors: [messages.join('\n')],
                        fieldErrors: []
                    });
                } else {
                    res.render('error', {
                        errorObj: customError,
                        showError: showError,
                        message: messages[0]
                    });
                }
            }
        }
        next();
    });
}

module.exports = server.exports();
