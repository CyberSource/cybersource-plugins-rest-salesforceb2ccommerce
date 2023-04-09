/* eslint-disable no-undef */

'use strict';

if (window.dw
    && window.dw.applepay
    && window.ApplePaySession
    && window.ApplePaySession.canMakePayments()) {
    $('body').addClass('apple-pay-enabled');
}
