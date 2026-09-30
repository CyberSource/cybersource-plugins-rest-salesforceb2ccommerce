'use strict';

// Visa Acceptance webhook-subscription REST calls. Each function builds the request from SDK model
// constructors, calls the generated Api class, and returns { data, error } (callApi fires its
// callback synchronously). merchantId is read fresh from the live Site preference per call —
// configObject is frozen at module load, so it would be stale after a Business-Manager MID change.

var configObject = require('*/cartridge/configuration/index');
var cybersourceRestApi = require('*/cartridge/apiClient/index');
var Site = require('dw/system/Site');

function retrieveWebhooks(productId) {
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
    var result = { data: null, error: null };

    instance.getWebhookSubscriptionsByOrg(merchantId, { 'productId': productId }, function (data, error) {
        if (!error) {
            result.data = data;
        } else if (parseInt(error, 10) === 404) {
            // 404 = no subscriptions for this product yet; treat as an empty list.
            result.data = [];
        } else {
            result.error = error;
        }
    });

    return result;
}

function getWebhookById(webhookId) {
    var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
    var result = { data: null, error: null };

    instance.getWebhookSubscriptionById(webhookId, function (data, error) {
        if (!error) {
            result.data = data;
        } else if (parseInt(error, 10) === 404) {
            // 404 = the webhook no longer exists; treat as "not found" (data stays null, no error).
            result.data = null;
        } else {
            result.error = error;
        }
    });

    return result;
}

function createSecurityKey() {
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var keyInformation = new cybersourceRestApi.Kmsegressv2keyssymKeyInformation();
    keyInformation.provider = 'nrtd';
    keyInformation.tenant = merchantId;
    keyInformation.keyType = 'sharedSecret';
    keyInformation.organizationId = merchantId;

    var request = new cybersourceRestApi.SaveSymEgressKey();
    request.clientRequestAction = 'CREATE';
    request.keyInformation = keyInformation;

    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.CreateNewWebhooksApi(configObject);
    instance.saveSymEgressKey({ saveSymEgressKey: request }, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

// Register the egress public cert with KMS so Visa Acceptance can encrypt Response-MLE webhooks.
// ASYM key: provider=merchantId, tenant='nrtd' (the SYM key in createSecurityKey swaps these);
// `pub` is the raw base64 DER cert, not PEM.
function uploadAsymmetricKey(pubCertB64) {
    if (!pubCertB64) {
        return { data: { status: 'SKIPPED' }, error: null };
    }
    var cleanCert = String(pubCertB64).replace(/\s+/g, '');
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var keyInformation = new cybersourceRestApi.Kmsegressv2keysasymKeyInformation();
    keyInformation.provider = merchantId;
    keyInformation.tenant = 'nrtd';
    keyInformation.keyType = 'publickey';
    keyInformation.organizationId = merchantId;
    keyInformation.pub = cleanCert;

    var request = new cybersourceRestApi.SaveAsymEgressKey();
    request.clientRequestAction = 'STORE';
    request.keyInformation = keyInformation;

    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
    instance.saveAsymEgressKey(request, {}, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

function createSubscription(config, webhookUrl) {
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var products = [];
    for (var i = 0; i < config.products.length; i++) {
        var product = new cybersourceRestApi.Notificationsubscriptionsv2webhooksProducts1();
        product.productId = config.products[i].productId;
        product.eventTypes = config.products[i].eventTypes;
        products.push(product);
    }

    var retryPolicy = new cybersourceRestApi.Notificationsubscriptionsv2webhooksRetryPolicy();
    retryPolicy.algorithm = 'ARITHMETIC';
    retryPolicy.firstRetry = 1;
    retryPolicy.interval = 1;
    retryPolicy.numberOfRetries = 3;
    retryPolicy.deactivateFlag = true;
    retryPolicy.repeatSequenceCount = 0;
    retryPolicy.repeatSequenceWaitTime = 0;

    var securityPolicy = new cybersourceRestApi.Notificationsubscriptionsv2webhooksSecurityPolicy();
    securityPolicy.securityType = 'key';
    securityPolicy.proxyType = 'external';

    var request = new cybersourceRestApi.CreateWebhook();
    request.name = config.name;
    request.description = config.description || ('Visa Acceptance Webhook for ' + config.name);
    request.organizationId = merchantId;
    request.products = products;
    request.webhookUrl = webhookUrl;
    request.healthCheckUrl = webhookUrl;
    request.notificationScope = 'SELF';
    request.retryPolicy = retryPolicy;
    request.securityPolicy = securityPolicy;

    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.CreateNewWebhooksApi(configObject);
    instance.notificationSubscriptionsV2WebhooksPost({ createWebhook: request }, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

function activateSubscription(webhookId) {
    var request = new cybersourceRestApi.UpdateStatus();
    request.status = 'ACTIVE';
    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
    instance.notificationSubscriptionsV2WebhooksWebhookIdStatusPut(webhookId, { updateStatus: request }, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

function deleteSubscription(webhookId) {
    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.ManageWebhooksApi(configObject);
    instance.deleteWebhookSubscription(webhookId, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

function findProductsToSubscribe() {
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var result = { data: null, error: null };
    var instance = new cybersourceRestApi.CreateNewWebhooksApi(configObject);
    instance.findProductsToSubscribe(merchantId, function (data, error) {
        result.data = data;
        result.error = error;
    });
    return result;
}

module.exports = {
    retrieveWebhooks: retrieveWebhooks,
    getWebhookById: getWebhookById,
    createSecurityKey: createSecurityKey,
    uploadAsymmetricKey: uploadAsymmetricKey,
    createSubscription: createSubscription,
    activateSubscription: activateSubscription,
    deleteSubscription: deleteSubscription,
    findProductsToSubscribe: findProductsToSubscribe
};
