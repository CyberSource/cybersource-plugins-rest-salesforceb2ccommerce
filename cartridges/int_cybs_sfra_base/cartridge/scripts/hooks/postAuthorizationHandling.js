'use strict';

var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var HookMgr = require('dw/system/HookMgr');
var OrderMgr = require('dw/order/OrderMgr');

/**
 * This function is to handle the post payment authorization customizations
 * @param {Object} handlePaymentResult - Authorization Result
 * @param {Object} order - Order object
 * @param {Object} options - Options object containing req, res, etc.
 */
function postAuthorization(handlePaymentResult, order, options) { // eslint-disable-line no-unused-vars
    var req = options.req;
    var res = options.res;

    if (handlePaymentResult.error) {
        return {
            error: true,
            redirectUrl: URLUtils.url('Checkout-Begin', 'stage', 'payment', 'PlaceOrderError', Resource.msg('error.technical', 'checkout', null)).toString()
        };
    }

    // Check if payer authentication setup is required
    if (handlePaymentResult.performPayerAuthSetup) {
        return {
            error: false,
            orderID: order.orderNo,
            orderToken: order.orderToken,
            continueUrl: URLUtils.url('PayerAuthentication-PayerAuthSetup').toString()
        };
    }
}

exports.postAuthorization = postAuthorization;
