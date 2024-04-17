'use strict';

window.onload = function () {
    // Auto submit form on page load
    document.getElementById('collectionForm').submit();
};

window.addEventListener('message', function(event) {
    if (event.origin === 'https://centinelapistag.cardinalcommerce.com'  || event.origin === 'https://centinelapi.cardinalcommerce.com') {
       console.log(event.data);
       document.payerAuthRedirect.submit();
    }
}, false);
setTimeout(function () {
    document.payerAuthRedirect.submit();}, 10000);