/* eslint-disable no-undef */

'use strict';

var processInclude = require('base/util');

$(document).ready(function () {
    processInclude(require('./checkout/checkout'));
    processInclude(require('./checkout/applePay'));
    // Override saved payment instrument selection to remove CVV handling
    $(document).off('click', '.saved-payment-instrument');
    $(document).on('click', '.saved-payment-instrument', function (e) {
        e.preventDefault();
        $('.saved-payment-instrument').removeClass('selected-payment');
        $(this).addClass('selected-payment');
    });
});
