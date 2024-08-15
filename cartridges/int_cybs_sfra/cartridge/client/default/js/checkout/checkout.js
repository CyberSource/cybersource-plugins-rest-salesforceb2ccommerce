/* eslint-disable no-undef  */

'use strict';

var base = require('base/checkout/checkout');
var shippingHelpers = require('./shipping');
var billingHelpers = require('./billing');
var cleave = require('./cleave');

[billingHelpers, shippingHelpers, cleave].forEach(function (library) {
    Object.keys(library).forEach(function (item) {
        if (typeof library[item] === 'object') {
            exports[item] = $.extend({}, exports[item], library[item]);
        } else {
            exports[item] = library[item];
        }
    });
});

$('button[value="submit-payment"]').on('click', function () {
    $('.payerAuthError').hide();
});

/**
 * *
 * @param {*} url *
 */
function openModal(url) {
    var iframe = $(
        `<div class="modal fade"><div class="modal-dialog"><div class="modal-content"><div class="modal-body">
        <iframe src='${decodeURIComponent(url)}' 
            style="border: none; height:85vh; display: block;" 
            height="100%" width="100%" 
            marginheight="0" marginwidth="0" frameBorder="0" scrolling="no"
            ></iframe>
        </div></div></div></div>`
    );
    iframe.modal({ backdrop: 'static', keyboard: false });
}

/**
 * *
 * @returns {*} *
 */
function handlePlaceOrder() {
    var defer = $.Deferred(); // eslint-disable-line
    $('body').trigger('checkout:disableButton', '.next-step-button button');
    $.ajax({
        url: $('.place-order').data('action'),
        method: 'POST',
        success: function (data) {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', '.next-step-button button');
            if (data.error) {
                if (data.cartError) {
                    window.location.href = data.redirectUrl;
                    defer.reject();
                } else {
                    defer.reject(data);
                }
            } else if (data.createDeviceDataCollection) {
                openModal(encodeURIComponent(data.redirectUrl));
                defer.resolve();
            } else {
                var continueUrl = data.continueUrl;
                var urlParams = {
                    ID: data.orderID,
                    token: data.orderToken
                };

                continueUrl += (continueUrl.indexOf('?') !== -1 ? '&' : '?')
                    + Object.keys(urlParams).map(function (key) {
                        return key + '=' + encodeURIComponent(urlParams[key]);
                    }).join('&');

                window.location.href = continueUrl;
                defer.resolve();
            }
        },
        error: function (data) {
            // enable the placeOrder button here
            $('body').trigger('checkout:enableButton', $('.next-step-button button'));
            defer.reject(data);
        }
    });
    return defer;
}

$('#checkout-main').on('click', '.next-step-button button', function (event) {
    var step = $(this).attr('value');
    if (step === 'place-order') {
        event.preventDefault();
        event.stopImmediatePropagation();
        var promise = handlePlaceOrder();
        promise.fail(function (data) {
            // show errors
            if (data && data.errorMessage) {
                $('.error-message').show();
                $('.error-message-text').text(data.errorMessage);
            } else if (data) {
                $('.error-message').show();
                $('.error-message-text').text(JSON.stringify(data));
            }
        });
    }
});
$('#applePayPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').hide();
});
 
$('#gPaypaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').hide();
});
 
$('#visaCheckoutPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').hide();
});
 
$('#creditCardPaymentOptionLink').on('click', function (event) {
    $('#placeOrderButton').show();
});
module.exports = base;
