'use strict';

var server = require('server');
var URLUtils = require('dw/web/URLUtils');
var configObject = require('~/cartridge/configuration/index');

server.get('createDeviceDataCollection', server.middleware.https, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    // eslint-disable-next-line no-undef
    var orderNo = session.privacy.orderID;
    var jwtToken = req.querystring.accessToken;
    var deviceDataCollectionUrl = session.privacy.deviceDataCollectionUrl;
  
    var order = OrderMgr.getOrder(orderNo);
    if (!order) {
        res.redirect(URLUtils.url('Cart-Show'));
        return next();
    }
    var action = URLUtils.url('CheckoutServices-getResponse');
    var paymentInstruments = order.paymentInstruments;
    var paymentInstrument = paymentInstruments[0];
    var cardNumber = paymentInstrument.creditCardNumber.slice(0, 6);
    if (cardNumber) {
        res.render('payerAuthentication/deviceDataCollection', {
            cardNumber: cardNumber,
            jwtToken: jwtToken,
            action: action,
            orderNo: orderNo,
            deviceDataUrl: deviceDataCollectionUrl
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
