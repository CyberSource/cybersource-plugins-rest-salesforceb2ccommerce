/* eslint-disable no-undef */

'use strict';

var baseRequest = {
    apiVersion: 2,
    apiVersionMinor: 0
};

var gatewayMerchantId = $('#googlePaygatewayMerchantId').val();

var googleMerchantId = $('#googlePayMerchantID').val();

var googlePayEnvironment = $('#googlePayEnvironment').val();

var allowedCardNetworks = ['AMEX', 'DISCOVER', 'JCB', 'MASTERCARD', 'VISA'];

var allowedCardAuthMethods = ['PAN_ONLY', 'CRYPTOGRAM_3DS'];
var DOMPurify = require('dompurify');

var tokenizationSpecification = {
    type: 'PAYMENT_GATEWAY',
    parameters: {
        gateway: 'cybersource',
        gatewayMerchantId: gatewayMerchantId
    }
};

var baseCardPaymentMethod = {
    type: 'CARD',
    parameters: {
        allowedAuthMethods: allowedCardAuthMethods,
        allowedCardNetworks: allowedCardNetworks,
        assuranceDetailsRequired: true,
        billingAddressRequired: true,
        billingAddressParameters: {
            format: 'FULL',
            phoneNumberRequired: true
        }
    }
};

var cardPaymentMethod = {
    tokenizationSpecification: tokenizationSpecification,
    ...baseCardPaymentMethod
};
var paymentsClient = null;

// Function to format money based on input
function formatInputMoney(input) {
    var standardNumber = input;
    if (input.indexOf(",") > input.indexOf(".") || (input.indexOf(",") !== -1 && input.indexOf(".") === -1)) {
        standardNumber = parseFloat(input.replace(".", "").replace(",", ".").replace(/[^0-9.]/g, ''));
    } else {
        standardNumber = parseFloat(input.replace(/[^0-9.]/g, ''));
    }
    return standardNumber;
}

/**
 * @returns {*} *
 */
function getGoogleTransactionInfo() {
    var totalPrice = '';
    var totalPriceRaw = $('.checkout-continue').find('#carttotal').val() != null ? $('.checkout-continue').find('#carttotal').val().replace('$', '') : '';
    totalPrice = formatInputMoney(totalPriceRaw);
    return {
        countryCode: window.googlepayval.countryCode,
        currencyCode: window.googlepayval.currencyCode,
        totalPriceStatus: 'FINAL',
        totalPrice: totalPrice.toString()
    };
}

/**
 * @returns {*} *
 */
function getGoogleIsReadyToPayRequest() {
    return {
        ...baseRequest,
        allowedPaymentMethods: [baseCardPaymentMethod]
    };
}

/**
 * *
 * @returns {*} *
 */
function getGooglePaymentDataRequest() {
    var paymentDataRequest = {
        ...baseRequest
    };
    paymentDataRequest.allowedPaymentMethods = [cardPaymentMethod];
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    paymentDataRequest.emailRequired = true;
    paymentDataRequest.shippingAddressRequired = true;
    paymentDataRequest.merchantInfo = {
        merchantId: googleMerchantId
    };
    return paymentDataRequest;
}
/**
 * *
 * @returns {*} *
 */
function getGooglePaymentsClient() {
    if (paymentsClient === null) {
        if (googlePayEnvironment === 'TEST') {
            paymentsClient = new google.payments.api.PaymentsClient({ // eslint-disable-line no-undef
                environment: 'TEST'
            });
        } else {
            paymentsClient = new google.payments.api.PaymentsClient({ // eslint-disable-line no-undef
                environment: 'PRODUCTION',
                merchantInfo: {
                    merchantId: googleMerchantId
                }
            });
        }
    }
    return paymentsClient;
}

/**
 */
function prefetchGooglePaymentData() {
    var paymentDataRequest = getGooglePaymentDataRequest();
    paymentDataRequest.transactionInfo = {
        totalPriceStatus: 'NOT_CURRENTLY_KNOWN',
        currencyCode: window.googlepayval.currencyCode
    };
    // eslint-disable-next-line no-shadow
    var paymentsClient = getGooglePaymentsClient();
    paymentsClient.prefetchPaymentData(paymentDataRequest);
}

/**
 * @param {*} paymentData *
 */
function processPayment(paymentData) {
    var postdataUrl = window.googlepayval.sessionCallBack;
    var urlParams = {
        paymentData: JSON.stringify(paymentData)

    };
    $.ajax({
        url: postdataUrl,
        type: 'post',
        dataType: 'json',
        data: urlParams,
        success: function (data) {
            if (data.status === 'success') {
                window.location.href = window.googlepayval.returnURL;
            } else {
                window.location.href = window.googlepayval.cartURL;
            }
        }
    });
}

/**
 */
function onGooglePaymentButtonClicked() {
    var paymentDataRequest = getGooglePaymentDataRequest();
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    // eslint-disable-next-line no-shadow
    var paymentsClient = getGooglePaymentsClient();
    paymentsClient.loadPaymentData(paymentDataRequest)
        .then(function (paymentData) {
            // handle the response
            processPayment(paymentData);
        });
}
/**
 */
function addGooglePayButton() {
    // eslint-disable-next-line no-shadow
    var paymentsClient = getGooglePaymentsClient();
    var button = paymentsClient.createButton({
        onClick: onGooglePaymentButtonClicked
    });
    if ($('.checkout-continue').find('#cart-googlepay-container').length > 0) {
        $('.checkout-continue').find('#cart-googlepay-container').append(button);
    }
    if ($('.checkout-continue').find('#minicart-googlepay-container').length > 0) {
        $('.checkout-continue').find('#minicart-googlepay-container').append(button);
    }
}
/**
 */
function onGooglePayLoaded() {
    // eslint-disable-next-line no-shadow
    var paymentsClient = getGooglePaymentsClient();
    paymentsClient.isReadyToPay(getGoogleIsReadyToPayRequest())
        .then(function (response) {
            if (response.result) {
                addGooglePayButton();
                prefetchGooglePaymentData();
            } else {
                var popupHeader = 'Alert!!';
                var popupBody = 'Unable to pay using Google Pay';
                var popupTemplate = '<div class="modal fade">'
                    + '<div class="modal-dialog">'
                    + '<div class="modal-content">'
                    + '<div class="modal-header">'
                    + '<h4 class="modal-title">' + popupHeader + '</h4>'
                    + '</div>'
                    + '<div class="modal-body">'
                    + '<div class="row">'
                    + '<div class="col">'
                    + '<h5>' + popupBody + '</h5>'
                    + '</div>'
                    + '</div>'
                    + '</div>'
                    + '    <div class="modal-footer">'
                    + '        <div class="row">'
                    + '            <div class="col">'
                    + '            </div>'
                    + '            <div class="col">'
                    + '            </div>'
                    + '         </div>'
                    + '      </div>'
                    + '    </div>'
                    + '  </div>'
                    + '</div>';
                $(popupTemplate).modal();
            }
        });
}

var gpayPaymentMethodEnabled = $('#gPayPaymentMethodEnabled').val();
var cartridgeEnabled = $('#cartridgeEnabled').val();

$('.minicart').off('mouseenter focusin touchstart').on('mouseenter focusin touchstart', function (event) {
    if ($('.search:visible').length === 0) {
        return;
    }
    var url = $('.minicart').data('action-url');
    var count = parseInt($('.minicart .minicart-quantity').text(), 10);
    if (count !== 0 && $('.minicart .popover.show').length === 0) {
        $('.minicart .popover').addClass('show');
        $('.minicart .popover').spinner().start();
        $.get(url, function (data) {
            var sanitizeData = DOMPurify.sanitize(data, {ADD_TAGS: ['isapplepay']});
            $('.minicart .popover').empty();
            $('.minicart .popover').append(sanitizeData);

            var isGooglePayEnabled = $('#isGooglePayEnabledOnMiniCart').length > 0 && $('#isGooglePayEnabledOnMiniCart').val() === 'true';

            if (isGooglePayEnabled && gpayPaymentMethodEnabled === 'true' && cartridgeEnabled === 'true') {
                onGooglePayLoaded();
            }
            $.spinner().stop();
        });
    }
    event.stopImmediatePropagation();
});

var isGooglePayEnabledOnCart = $('#isGooglePayEnabledOnCart').length > 0 && $('#isGooglePayEnabledOnCart').val() === 'true';
if (isGooglePayEnabledOnCart && gpayPaymentMethodEnabled === 'true' && cartridgeEnabled === 'true') {
    onGooglePayLoaded();
}
