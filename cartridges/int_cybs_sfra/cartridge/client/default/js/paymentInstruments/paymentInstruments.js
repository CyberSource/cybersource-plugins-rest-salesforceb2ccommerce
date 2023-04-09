'use strict';

var base = require('base/paymentInstruments/paymentInstruments');

var baseSubmitPayment = base.submitPayment;

base.submitPayment = function () {
    baseSubmitPayment();
};
module.exports = base;
