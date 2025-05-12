'use strict';

var page = module.superModule;
var server = require('server');

server.extend(page);

server.prepend(
    'Begin',
    server.middleware.https,
    function (req, res, next) {
        var URLUtils = require('dw/web/URLUtils');
        var Transaction = require('dw/system/Transaction');
        // eslint-disable-next-line no-undef
        var requestQueryMap = (request.getHttpQueryString() || '').split('&').reduce(function (acc, current) {
            var qs = current.split('=');
            acc[qs[0]] = qs[1];
            return acc;
        }, {});
        if ('stage' in requestQueryMap && requestQueryMap.stage === 'placeOrder'
            // eslint-disable-next-line no-undef
            && empty(session.privacy.encryptedDataGP)) {
            res.redirectUrl = URLUtils.url('Checkout-Begin').toString() + '?stage=payment';
            return next();
        }
        session.custom.Flag3ds = false;
        session.custom.scaTokenFlag = false;
        // eslint-disable-next-line no-undef
        if (session.getCustomer().getProfile() !== null) {
            // eslint-disable-next-line no-undef
            var paymentInstrumentToBeDeleted = session.getCustomer().getProfile().custom.deleteInstrumentId;
            if (paymentInstrumentToBeDeleted.length !== 0) {
                var tokenManagement = require('~/cartridge/scripts/http/tokenManagement.js');
                // eslint-disable-next-line no-undef
                var result = tokenManagement.httpDeleteCustomerPaymentInstrument(session.getCustomer().getProfile().custom.customerID, paymentInstrumentToBeDeleted[0]);
                if (result === true) {
                    Transaction.wrap(function () {
                        // eslint-disable-next-line no-undef
                        session.getCustomer().getProfile().custom.deleteInstrumentId = [];
                    });
                }
            }
        }
        return next();
    }
);

module.exports = server.exports();
