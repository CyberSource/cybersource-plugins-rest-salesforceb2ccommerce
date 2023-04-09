/* eslint-disable no-plusplus */
/* eslint-disable no-use-before-define */
/* eslint-disable no-undef */

'use strict';

var base = require('base/checkout/shipping');

var baseShippingFormResponse = base.methods.shippingFormResponse;

/**
 * *
 * @param {*} resources *
 * @param {*} originalAddress *
 * @param {*} normalizedOriginalAddress *
 * @param {*} normalizedStandardAddress *
 */
function showSelectAddressModal(resources, originalAddress, normalizedOriginalAddress, normalizedStandardAddress) {
    var formHTMLNAmes = {
        address1: originalAddress.address1.htmlName,
        address2: originalAddress.address2.htmlName,
        stateCode: originalAddress.states && originalAddress.states.stateCode && originalAddress.states.stateCode.htmlName,
        country: originalAddress.country.htmlName,
        city: originalAddress.city.htmlName,
        postalCode: originalAddress.postalCode.htmlName
    };

    var popupTemplate = '<div class="modal fade">'
        + '  <div class="modal-dialog">'
        + '    <div class="modal-content">'
        + '      <div class="modal-header">'
        + '        <h4 class="modal-title">' + resources.modalheader + '</h4>'
        + '      </div>'
        + '      <div class="modal-body">'
        + '       <div class="row">'
        + '           <div class="col">'
        + '               <h5>' + resources.originaladdress + '</h5>'
        + '               <hr>'
        + '               <b>' + resources.address1 + '</b>:</br>' + normalizedOriginalAddress.address1 + '</br>'
        + '               <b>' + resources.address2 + '</b>:</br>' + normalizedOriginalAddress.address2 + '</br>'
        + '               <b>' + resources.state + '</b>:</br>' + normalizedOriginalAddress.administrativeArea + '</br>'
        + '               <b>' + resources.country + '</b>:</br>' + normalizedOriginalAddress.country + '</br>'
        + '               <b>' + resources.city + '</b>:</br>' + normalizedOriginalAddress.locality + '</br>'
        + '               <b>' + resources.postalcode + '</b>:</br>' + normalizedOriginalAddress.postalCode + '</br>' + '</br>' // eslint-disable-line no-useless-concat
        + '               <button id="useOriginalAddressButton" data-formHTMLNames="' + encodeURIComponent(JSON.stringify(formHTMLNAmes)) + '" data-address="' + encodeURIComponent(JSON.stringify(normalizedOriginalAddress)) + '" type="button" class="btn btn-primary" data-dismiss="modal">' + resources.useoriginaladdress + '</button>'
        + '           </div>'
        + '           <div class="col">'
        + '               <h5>' + resources.standardaddress + '</h5>'
        + '               <hr>'
        + '               <b>' + resources.address1 + '</b>:</br>' + normalizedStandardAddress.address1 + '</br>'
        + '               <b>' + resources.address2 + '</b>:</br>' + normalizedStandardAddress.address2 + '</br>'
        + '               <b>' + resources.state + '</b>:</br>' + normalizedStandardAddress.administrativeArea + '</br>'
        + '               <b>' + resources.country + '</b>:</br>' + normalizedStandardAddress.country + '</br>'
        + '               <b>' + resources.city + '</b>:</br>' + normalizedStandardAddress.locality + '</br>'
        + '               <b>' + resources.postalcode + '</b>:</br>' + normalizedStandardAddress.postalCode + '</br>' + '</br>' // eslint-disable-line no-useless-concat
        + '               <button id="useStandardAddressButton" data-formHTMLNames="' + encodeURIComponent(JSON.stringify(formHTMLNAmes)) + '" data-address="' + encodeURIComponent(JSON.stringify(normalizedStandardAddress)) + '" type="button" class="btn btn-primary" data-dismiss="modal">' + resources.usestandardaddress + '</button>'
        + '           </div>'
        + '       </div>'
        + '      </div>'
        + '      <div class="modal-footer">'
        + '       <div class="row">'
        + '           <div class="col">'
        + '           </div>'
        + '           <div class="col">'
        + '           </div>'
        + '       </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    $(popupTemplate).modal();
    $(document).on('click', '#useStandardAddressButton', replaceAddressDataOnDom);
    $(document).on('click', '#useOriginalAddressButton', replaceAddressDataOnDom);
}

/**
 * *
 * @param {*} e *
 */
function replaceAddressDataOnDom(e) {
    var formHTMLNamesJson = decodeURIComponent(e.target.getAttribute('data-formHTMLNames'));
    var addressJSON = decodeURIComponent(e.target.getAttribute('data-address'));
    var formHTMLNames = JSON.parse(formHTMLNamesJson);
    var address = JSON.parse(addressJSON);
    $("[name='" + formHTMLNames.address1 + "']").val(address.address1);
    $("[name='" + formHTMLNames.address2 + "']").val(address.address2);
    $("[name='" + formHTMLNames.stateCode + "']").val(address.administrativeArea);
    $("[name='" + formHTMLNames.country + "']").val(address.country);
    $("[name='" + formHTMLNames.city + "']").val(address.locality);
    $("[name='" + formHTMLNames.postalCode + "']").val(address.postalCode);
    $('.submit-shipping').click();
}

/**
 * *
 * @param {*} resources *
 * @param {*} originalAddress *
 */
function showInvalidAddress(resources, originalAddress) {
    var popupTemplate = '<div class="modal fade">'
        + '  <div class="modal-dialog">'
        + '    <div class="modal-content">'
        + '      <div class="modal-header">'
        + '        <h4 class="modal-title">' + resources.invalidAddress + '</h4>'
        + '      </div>'
        + '      <div class="modal-body" style="text-align:center">'
        + '           <button id="tryAgainBtn" type="button" class="btn btn-primary" data-dismiss="modal">' + resources.tryagain + '</button>'
        + '      </div>'
        + '      <div class="modal-footer">'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    $(popupTemplate).modal();
    $(document).on('click', '#tryAgainBtn', function () {
        $("input[name='" + originalAddress.address1.htmlName + "']").val('');
        $("input[name='" + originalAddress.address2.htmlName + "']").val('');
        $("input[name='" + originalAddress.states.stateCode.htmlName + "']").val('');
        $("input[name='" + originalAddress.country.htmlName + "']").val('');
        $("input[name='" + originalAddress.city.htmlName + "']").val('');
        $("input[name='" + originalAddress.postalCode.htmlName + "']").val('');
        $('.submit-shipping').click();
    });
}

base.methods.shippingFormResponse = function (defer, data) {
    var fieldErrors = data.fieldErrors;
    if (fieldErrors) {
        var davResponse = null;
        for (var i = 0; i < fieldErrors.length > 0; i++) {
            if (davResponse) break;
            var errors = fieldErrors[i];
            var errorNames = Object.keys(errors);
            for (var j = 0; j < errorNames.length; j++) {
                var errorName = errorNames[j];
                if (errorName === 'dav') {
                    davResponse = errors[errorName];
                    break;
                }
            }
        }
        if (davResponse) {
            var resources = davResponse.resources;
            var originalAddress = data.form.shippingAddress.addressFields;
            var normalizedOriginalAddress = {
                address1: originalAddress.address1.htmlValue,
                address2: originalAddress.address2.htmlValue,
                administrativeArea: originalAddress.states && originalAddress.states.stateCode && originalAddress.states.stateCode.htmlValue,
                country: originalAddress.country.htmlValue,
                county: null,
                locality: originalAddress.city.htmlValue,
                postalCode: originalAddress.postalCode.htmlValue
            };
            if (davResponse.status === 'COMPLETED') {
                var standardAddress = davResponse.data.standardAddress;
                var normalizedStandardAddress = {
                    address1: standardAddress.address1.withApartment,
                    address2: typeof standardAddress.address2 === 'object' ? standardAddress.address2.withApartment : '',
                    administrativeArea: standardAddress.administrativeArea,
                    country: standardAddress.country,
                    county: standardAddress.county,
                    locality: standardAddress.locality,
                    postalCode: standardAddress.postalCode
                };
                showSelectAddressModal(resources, originalAddress, normalizedOriginalAddress, normalizedStandardAddress);
            } else {
                showInvalidAddress(resources, originalAddress);
            }
            return;
        }
    }
    baseShippingFormResponse(defer, data);
};

module.exports = base;
