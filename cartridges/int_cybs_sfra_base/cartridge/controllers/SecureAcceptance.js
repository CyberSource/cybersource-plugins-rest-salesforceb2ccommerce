'use strict';

var server = require('server');
var configObject = require('../configuration/index');

if (configObject.cartridgeEnabled) {
    server.get('CreateFlexToken', server.middleware.https, function (req, res, next) {
        var Flex = require('~/cartridge/scripts/http/payments');
        var flexResult = Flex.createFlexKey(null);
        res.render('secureAcceptanceFlexMicroformContent', {
            flexTokenResult: flexResult
        });
        next();
    });
}

module.exports = server.exports();
