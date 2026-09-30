'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var cybersourceRestApi = require('../../apiClient/index');
var Logger = require('dw/system/Logger').getLogger('webhookActivationHelper');

/**
 * Force the BM-managed webhook subscriptions to ACTIVE from the storefront payment flow.
 *
 * Visa Acceptance creates a subscription as PENDING_REVIEW/INACTIVE; this issues a PUT status=ACTIVE for
 * each stored subscription so it can begin delivering. Best-effort: failures are logged and never
 * interrupt checkout.
 *
 * @returns {void}
 */
function activateWebhooks() {
    try {
        var configObject = require('../../configuration/index');

        var webhooksToActivate = [
            { type: 'VisaAcceptanceWebhookSubscription', id: 'fraudManagement', enabled: configObject.fmeDmEnabled },
            { type: 'VisaAcceptanceWebhookSubscription', id: 'unifiedCheckout', enabled: configObject.unifiedCheckoutEnabled }
        ];

        webhooksToActivate.forEach(function (item) {
            if (!item.enabled) {
                return;
            }
            var obj = CustomObjectMgr.getCustomObject(item.type, item.id);
            var webhookId = obj ? obj.custom.WebhookId : null;
            if (!webhookId) {
                return;
            }

            var request = new cybersourceRestApi.UpdateStatus();
            request.status = 'ACTIVE';
            var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
            instance.notificationSubscriptionsV2WebhooksWebhookIdStatusPut(webhookId, { updateStatus: request }, function (data, error) {
                if (error) {
                    Logger.error('Failed to activate webhook ' + item.id + ' (' + webhookId + '): ' + error);
                }
            });
        });
    } catch (e) {
        Logger.error('Exception in activateWebhooks: ' + e.message);
    }
}

module.exports = {
    activateWebhooks: activateWebhooks
};
