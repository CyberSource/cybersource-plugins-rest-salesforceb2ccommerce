/* eslint-disable no-use-before-define */
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
        assuranceDetailsRequired: true
    }
};

var cardPaymentMethod = {
    tokenizationSpecification: tokenizationSpecification,
    ...baseCardPaymentMethod
};
var paymentsClient = null;

/**
 * *
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
    paymentDataRequest.merchantInfo = {
        merchantId: googleMerchantId
    };
    return paymentDataRequest;
}

/**
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

/**
 */
function addGooglePayButton() {
    // eslint-disable-next-line no-shadow
    var paymentsClient = getGooglePaymentsClient();
    var button = paymentsClient.createButton({
        onClick: onGooglePaymentButtonClicked
    });
    if ($('#js-googlepay-container').length > 0) {
        document.getElementById('js-googlepay-container').appendChild(button);
    }
}


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
    var totalPriceRaw = $('body').find('.row.grand-total').find('.grand-total-sum').text();
    var totalPrice = formatInputMoney(totalPriceRaw);

    return {
        countryCode: window.googlepayval.countryCode,
        currencyCode: window.googlepayval.currencyCode,
        totalPriceStatus: 'FINAL',
        totalPrice: totalPrice.toString()
    };
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
 * @param {*} paymentData /
 */
function processPayment(paymentData) {
    var postdataUrl = window.googlepayval.sessionCallBack;
    var submiturl = window.googlepayval.submitURL;
    var GPData = JSON.stringify(paymentData);
    $('#dwfrm_billing').attr('action', postdataUrl);
    $('#isgooglepayclicked').val('true');
    $('#googletoken').val(GPData);
    $('input[name=dwfrm_billing_paymentMethod]').val('DW_GOOGLE_PAY');
    var paymentForm = $('#dwfrm_billing').serialize();

    function loadFormErrors(parentSelector, fieldErrors) { // eslint-disable-line
        // Display error messages and highlight form fields with errors.
        $.each(fieldErrors, function (attr) {
            $('*[name=' + attr + ']', parentSelector)
                .addClass('is-invalid')
                .siblings('.invalid-feedback')
                .text(fieldErrors[attr]);
        });
    }

    $.ajax({
        url: $('#dwfrm_billing').attr('action'),
        type: 'post',
        dataType: 'json',
        data: paymentForm,
        success: function (data) {
            if (data.error) {
                if (data.fieldErrors.length) {
                    data.fieldErrors.forEach(function (error) {
                        if (Object.keys(error).length) {
                            loadFormErrors('.payment-form', error);
                        }
                    });
                }
                if (data.serverErrors.length) {
                    data.serverErrors.forEach(function (error) {
                        $('.error-message').show();
                        $('.error-message-text').text(error);
                    });
                }
                if (data.cartError) {
                    window.location.href = data.redirectUrl;
                }
            } else {
                window.location.href = submiturl;
            }
        },
        error: function (err) {
            if (err.responseJSON.redirectUrl) {
                window.location.href = err.responseJSON.redirectUrl;
            }
        }
    });
}
var clickedOnce = false;
if ($('#isGooglePayEnabled').val() === 'true' && $('#gPayPaymentMethodEnabled').val() === 'true') {
    $('.googlepay-tab-wrapper').click(function () {
        if (!clickedOnce) {
            onGooglePayLoaded();
            clickedOnce = true;
        }
    });
}
