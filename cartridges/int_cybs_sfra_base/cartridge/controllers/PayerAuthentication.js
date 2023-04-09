'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var configObject = require('~/cartridge/configuration/index');

server.get('createDeviceDataCollection', server.middleware.https, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    // eslint-disable-next-line no-undef
    var orderNo = session.privacy.orderID;
    var order = OrderMgr.getOrder(orderNo);
    if (!order) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }
    var paymentInstruments = order.paymentInstruments;
    var paymentInstrument = paymentInstruments[0];
    var cardNumber = paymentInstrument.creditCardNumber.slice(0, 6);
    if (cardNumber) {
        var jwtUtil = require('*/cartridge/scripts/cardinal/JWTBuilder');
        var jwtToken = jwtUtil.generateTokenWithKey(cardNumber);

        res.render('payerAuthentication/deviceDataCollection', {
            cardNumber: cardNumber,
            jwtToken: jwtToken,
            deviceDataUrl: configObject.cruiseDDCEndPoint[configObject.payerAuthenticationCruiseEndPoint]
        });
    }
    return next();
});

/*
 * Module exports
 */
if (configObject.cartridgeEnabled) {
    module.exports = server.exports();
}
