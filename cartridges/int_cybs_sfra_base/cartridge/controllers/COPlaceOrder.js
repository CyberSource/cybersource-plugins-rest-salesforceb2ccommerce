'use strict';

var server = require('server');

var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');
var Resource = require('dw/web/Resource');
var checkoutHelper = require('*/cartridge/scripts/checkout/checkoutHelpers');
var OrderModel = require('*/cartridge/models/order');
var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
var configObject = require('../configuration/index');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

if (configObject.cartridgeEnabled) {
    server.post('Submit', function (req, res, next) {
        // Require both order_id and order_token for secure order retrieval
        var orderId = req.querystring.order_id;
        var orderToken = req.querystring.order_token;

        if (!orderId || !orderToken) {
            // eslint-disable-next-line consistent-return
            return next(new Error('Order ID and token are required'));
        }

        // Use two-argument form to verify order ownership via token
        var order = OrderMgr.getOrder(orderId, orderToken);

        // eslint-disable-next-line no-undef
        if (session.privacy.orderPaymentSuccessful !== true) return;
        // eslint-disable-next-line no-undef
        session.privacy.orderPaymentSuccessful = false;

        if (!order) {
            // eslint-disable-next-line consistent-return
            return next(new Error('Order token does not match'));
        }

        var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', order, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
        if (fraudDetectionStatus.status === 'fail') {
            Transaction.wrap(function () { OrderMgr.failOrder(order); });

            // fraud detection failed
            req.session.privacyCache.set('fraudDetectionStatus', true);
            var fraudError = Resource.msg('error.technical', 'checkout', null);
            // eslint-disable-next-line consistent-return
            return next(new Error(fraudError));
        }
        var orderPlacementStatus = checkoutHelper.placeOrder(order, fraudDetectionStatus);

        if (orderPlacementStatus.error) {
            // eslint-disable-next-line consistent-return
            return next(new Error('Could not place order'));
        }

        var config = {
            numberOfLineItems: '*'
        };
        var orderModel = new OrderModel(order, { config: config });
        if (!req.currentCustomer.profile) {
            var passwordForm = server.forms.getForm('newPasswords');
            passwordForm.clear();
            secureResponseHelper.secureRender(res, 'checkout/confirmation/confirmation', {
                order: orderModel,
                returningCustomer: false,
                passwordForm: passwordForm
            });
        } else {
            secureResponseHelper.secureRender(res, 'checkout/confirmation/confirmation', {
                order: orderModel,
                returningCustomer: true
            });
        }
        // eslint-disable-next-line consistent-return
        return next();
    });
}

server.get('SubmitOrderConformation', csrfProtection.generateToken, function (req, res, next) {
    var orderId = req.querystring.ID;
    var token = req.querystring.token;
    secureResponseHelper.secureRender(res, 'cart/RedirectToConformation', {
        orderId: orderId,
        orderToken: token
    });
    return next();
});

module.exports = server.exports();
