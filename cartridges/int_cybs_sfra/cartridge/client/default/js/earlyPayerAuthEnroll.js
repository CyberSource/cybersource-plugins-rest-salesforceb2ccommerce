'use strict';

/**
 * Companion to payerAuthentication/earlyPayerAuthEnroll.isml.
 *
 * Setup and Device Data Collection already completed at card-entry time, so there is nothing to
 * collect here - post straight through to PayerAuthentication-PayerAuthEnroll, which picks the
 * browser fields up from the session.
 */
window.onload = function () {
    document.payerAuthRedirect.submit();
};
