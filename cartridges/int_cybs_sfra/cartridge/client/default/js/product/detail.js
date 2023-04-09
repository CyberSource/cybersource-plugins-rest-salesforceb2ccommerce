'use strict';

module.exports = function () {
    /* eslint-disable no-undef */
    $('body').on('product:updateAddToCart', function (e, response) {
        if (response.product.readyToOrder) {
            var applePayButton = $('.apple-pay-pdp', response.$productContainer);
            if (applePayButton.length !== 0) {
                applePayButton.attr('sku', response.product.id);
            } else {
                var showApplePay = true;
                if (typeof $('.cart-and-ipay').data('ipay-enabled') !== 'undefined') {
                    showApplePay = $('.cart-and-ipay').data('ipay-enabled');
                }
                if ($('.apple-pay-pdp').length === 0 && showApplePay) { // eslint-disable-line no-lonely-if
                    var applePayButtonIsmlString = '<div class="col col-sm-5 pdp-apple-pay-button">'
                                                   + '<isapplepay class="apple-pay-pdp btn"'
                                                   + 'sku=' + response.product.id + '></isapplepay>'
                                                   + '</div>';
                    $('.cart-and-ipay .row').append(applePayButtonIsmlString);

                    if ($('.cart-and-ipay').data('is-apple-session') === true) {
                        $('.pdp-checkout-button').removeClass('col-12');
                        $('.pdp-checkout-button').addClass('col col-sm-5');
                    }
                }
            }
        } else {
            $('.pdp-apple-pay-button').remove();
            $('.pdp-checkout-button').removeClass('col col-sm-5');
            $('.pdp-checkout-button').addClass('col-12');
        }
    });
};
