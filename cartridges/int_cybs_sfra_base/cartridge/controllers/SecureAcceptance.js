'use strict';

var server = require('server');
var configObject = require('../configuration/index');

if (configObject.cartridgeEnabled) {
    server.get('CreateFlexToken', server.middleware.https, function (req, res, next) {
        var Flex = require('~/cartridge/scripts/http/payments');
        var flexResult = Flex.createFlexKey(); 
        var parsedPayload = Flex.jwtDecode(flexResult);
        if(parsedPayload != null){
            var clientLibrary = parsedPayload.ctx[0].data.clientLibrary;
            var clientLibraryIntegrity = parsedPayload.ctx[0].data.clientLibraryIntegrity;
            res.render('secureAcceptanceFlexMicroformContent', {
                flexTokenResult: flexResult,
                clientLibrary: clientLibrary,
                clientLibraryIntegrity: clientLibraryIntegrity
            });
            next();
        }
    });
}

module.exports = server.exports();
