/* eslint-disable no-undef */

'use strict';

var base = require('base/components/cleave');

base.handleCreditCardNumber = function (cardFieldSelector, cardTypeSelector) {
    var cleave = new Cleave(cardFieldSelector, { // eslint-disable-line no-undef
        creditCard: true,
        onCreditCardTypeChanged: function (type) {
            window.ccType = type;
            var creditCardTypes = {
                visa: 'Visa',
                mastercard: 'Master Card',
                amex: 'Amex',
                discover: 'Discover',
                maestro: 'Maestro',
                jcb: 'JCB',
                diners: 'DinersClub',
                unknown: 'Unknown'
            };
            var cardType = creditCardTypes[Object.keys(creditCardTypes).indexOf(type) > -1
                ? type
                : 'unknown'];
            $(cardTypeSelector).val(cardType);
            $('.card-number-wrapper').attr('data-type', type);
            if (type === 'visa' || type === 'mastercard' || type === 'discover') {
                $('#securityCode').attr('maxlength', 3);
            } else {
                $('#securityCode').attr('maxlength', 4);
            }
        }
    });

    var cleaveSecurityCode = new Cleave('#securityCode', {
        numericOnly: true,
        delimiter: '',
        numeral: true,
    });
 
    if($('#saved-payment-security-code').length){
        var cleaveSavedPaymentSecurityCode = new Cleave('#saved-payment-security-code', {
            numericOnly: true,
            delimiter: '',
            numeral: true,
        });
    }

    $(cardFieldSelector).data('cleave', cleave);
};

base.serializeData = function (form) {
    var serializedArray = form.serializeArray();

    serializedArray.forEach(function (item) {
        if (item.name.indexOf('cardNumber') > -1) {
            if (!$('#flexTokenResponse').val()) {
                item.value = $('#cardNumber').data('cleave').getRawValue(); // eslint-disable-line
            }
        }
    });

    return $.param(serializedArray);
};

module.exports = base;
