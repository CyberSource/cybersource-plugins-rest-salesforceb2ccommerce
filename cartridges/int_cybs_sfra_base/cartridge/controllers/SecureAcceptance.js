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
    /**
     * Helper function to handle UC token creation and rendering
     * @param {boolean} isMiniCart - Flag to indicate if this is for mini cart
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    function handleUCTokenCreation(isMiniCart, res, next) {
        var uc = require('~/cartridge/scripts/http/payments');
        var UcCaptureContext = uc.generateUcCaptureContext(isMiniCart);
        var parsedPayload = uc.jwtDecode(UcCaptureContext);
        
        if (parsedPayload != null) {
            var clientLibrary = parsedPayload.ctx[0].data.clientLibrary;
            var clientLibraryIntegrity = parsedPayload.ctx[0].data.clientLibraryIntegrity;
            res.render('unifiedCheckout', {
                UcCaptureContext: UcCaptureContext,
                clientLibrary: clientLibrary,
                clientLibraryIntegrity: clientLibraryIntegrity
            });
            next();
        }
    }

    server.get('CreateUCToken', server.middleware.https, function (req, res, next) {
        handleUCTokenCreation(false, res, next);
    });

    server.get('CreateUCTokenMiniCart', server.middleware.https, function (req, res, next) {
        handleUCTokenCreation(true, res, next);
    });
}

module.exports = server.exports();
