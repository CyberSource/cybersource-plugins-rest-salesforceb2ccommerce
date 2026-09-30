'use strict';

var server = require('server');
var webhookSubscription = require('*/cartridge/scripts/webhookSubscription');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');

server.get('Show', server.middleware.https, function (req, res, next) {
    var viewData = webhookSubscription.getViewData();
    viewData.actionUrl = require('dw/web/URLUtils').url('WebhookManager-Save').toString();
    viewData.success = req.querystring.success === 'true';
    viewData.error = req.querystring.error;
    
    viewData.info = req.querystring.info;
    

    viewData.errorDetail = req.querystring.errorDetail;

    secureResponseHelper.secureRender(res, 'webhookManager', viewData);
    return next();
});

server.post('Save', server.middleware.https, function (req, res, next) {
    var action = req.form.action;
    var syncResults = null;

    // Sync/Advanced call out to KMS and the webhook API. Those helpers report expected failures via
    // { success: false, error }, but a lower layer (e.g. the SDK ApiClient) can still throw outright.
    // Catch it here so BM renders the page with a surfaced error banner instead of a raw 500; the full
    // exception (message + stack) is written to the customerror log for diagnosis.
    try {
    if (action === 'sync') {
        syncResults = webhookSubscription.syncWithPreferences();
    } else if (action === 'advanced') {
        syncResults = webhookSubscription.updateAdvanced(req.form.egressMleAlias);
        syncResults = webhookSubscription.updateAdvanced(req.form.egressMleAlias, req.form.egressPublicKey);
        }
    } catch (e) {
        require('dw/system/Logger').getLogger('VisaAcceptance', 'webhook').error(
            'WebhookManager-Save action "' + action + '" threw: ' + e.message + '\n' + (e.stack || '')
        );
        var errorDetail = String(e.message || 'Unknown error').substring(0, 300);
        res.redirect(require('dw/web/URLUtils').url('WebhookManager-Show', 'error', 'unexpected', 'errorDetail', errorDetail).toString());
        return next();
    }

    var redirectArgs = ['WebhookManager-Show'];
    var hasError = false;
    
    if (syncResults && syncResults.dm && syncResults.dm.success === false && syncResults.dm.error === 'NO_FRAUD_PRODUCT') {
        var Transaction = require('dw/system/Transaction');
        var Site = require('dw/system/Site');
        Transaction.wrap(function () {
            try { Site.getCurrent().setCustomPreferenceValue('VisaAcceptance_DecisionManager', false); } catch(e) {}
        });
        redirectArgs.push('error', 'no_fraud_product');
        hasError = true;
    }
    // Surface any other sync failure (API_ERROR, KEY_ERROR, ACTIVATION_ERROR,
    // PRODUCT_NOT_ENABLED, …) so a failed subscribe is not reported as "successful".
    if (!hasError && syncResults) {
        var failedKeys = Object.keys(syncResults).filter(function (key) {
            return syncResults[key] && syncResults[key].success === false;
        });
        if (failedKeys.length > 0) {
            redirectArgs.push('error', 'sync_failed');
            hasError = true;
        }
    }


    // Non-ACTIVE state (PENDING_REVIEW / INACTIVE / SUSPENDED) is surfaced live from the subscription
    // status in the view, not via a redirect flash — so the banner always matches the status column.
    if (!hasError) {
        redirectArgs.push('success', 'true');
    }

    res.redirect(require('dw/web/URLUtils').url.apply(null, redirectArgs));
    return next();
});

module.exports = server.exports();
 