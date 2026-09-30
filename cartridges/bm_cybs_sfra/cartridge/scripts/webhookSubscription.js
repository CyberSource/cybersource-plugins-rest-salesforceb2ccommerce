'use strict';

// Relies on the http layer's callApi invoking its callback synchronously (so each webhooks.* call
// returns a populated { data, error } before it returns).

var webhooks = require('*/cartridge/scripts/http/webhookManagement');
var webhookHelper = require('*/cartridge/scripts/helpers/webhookHelper');
var WEBHOOK_CONFIGS = require('*/cartridge/scripts/config/webhookConfigs');
var Transaction = require('dw/system/Transaction');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var URLUtils = require('dw/web/URLUtils');
var URLAction = require('dw/web/URLAction');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger').getLogger('webhookSubscription');

var CUSTOM_OBJECT_TYPE = 'VisaAcceptanceWebhookSubscription';
var SECURITY_KEY_OBJECT_TYPE = 'VisaAcceptanceWebhookSecurityKey';

/**
 * Fetch the merchant's available webhook products once, normalized to an array.
 *
 * @returns {Object} { products: Array|null, error: (boolean|number|string) }
 */
function getAvailableProducts() {
    var productsResult = webhooks.findProductsToSubscribe();
    if (productsResult.error) {
        return { products: null, error: productsResult.error };
    }
    var data = productsResult.data;
    var list = Array.isArray(data) ? data : (data && data.products ? data.products : null);
    return { products: list, error: null };
}

/**
 * Reduce a normalized product list to the set of product ids the merchant has enabled.
 *
 * @param {Array} products normalized product list from getAvailableProducts
 * @returns {Array} product id strings
 */
function toProductIds(products) {
    var ids = [];
    if (Array.isArray(products)) {
        for (var i = 0; i < products.length; i++) {
            if (products[i] && products[i].productId) ids.push(products[i].productId);
        }
    }
    return ids;
}

/**
 * Persist a keyId -> key pair (stamped with the current MID) so WebhookNotification can fetch the signing
 * key named in a notification's v-c-signature header.
 *
 * @param {string} keyId KMS key id (matches the header's keyId)
 * @param {string} key base64 shared secret
 */
function storeSecurityKeyPair(keyId, key) {
    if (!keyId || !key) return;
    var merchantId = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    Transaction.wrap(function () {
        var obj = CustomObjectMgr.getCustomObject(SECURITY_KEY_OBJECT_TYPE, keyId)
            || CustomObjectMgr.createCustomObject(SECURITY_KEY_OBJECT_TYPE, keyId);
        obj.custom.Key = key;
        obj.custom.MerchantId = merchantId;
    });
}

/**
 * Mint a fresh org signing key in KMS and store it as a keyId -> key pair for the current MID.
 *
 * @returns {boolean} true when a fresh key was minted and stored
 */
function mintAndStoreSigningKey() {
    var keyResult = webhooks.createSecurityKey();
    if (keyResult.error) {
        Logger.error('createSecurityKey failed: ' + JSON.stringify(keyResult.error));
        return false;
    }
    var keyInfo = (keyResult.data && keyResult.data.status === 'SUCCESS') ? keyResult.data.keyInformation : null;
    var keyId = keyInfo ? keyInfo.keyId : '';
    var key = keyInfo ? keyInfo.key : '';
    if (!keyId || !key) {
        Logger.error('mintAndStoreSigningKey: createSecurityKey returned no keyId/key');
        return false;
    }
    storeSecurityKeyPair(keyId, key);
    return true;
}

/**
 * Delete every stored signing key not minted for the current MID.
 *
 * @param {string} currentMid the MID whose key to keep
 */
function purgeSecurityKeysForOtherMids(currentMid) {
    Transaction.wrap(function () {
        var stale = [];
        var it = CustomObjectMgr.getAllCustomObjects(SECURITY_KEY_OBJECT_TYPE);
        while (it.hasNext()) {
            var obj = it.next();
            if (obj.custom.MerchantId !== currentMid) stale.push(obj);
        }
        it.close();
        for (var i = 0; i < stale.length; i++) {
            CustomObjectMgr.remove(stale[i]);
        }
    });
}

/**
 * Ensure a usable signing key exists for the current MID: reuse the existing one; if there is none,
 * purge any keys belonging to other MIDs and then mint a fresh one.
 *
 * @returns {boolean} true when a usable signing key is available
 */
function ensureSigningKey() {
    var currentMid = Site.getCurrent().getCustomPreferenceValue('VisaAcceptance_MerchantID');
    var existing = CustomObjectMgr.queryCustomObjects(SECURITY_KEY_OBJECT_TYPE, 'custom.MerchantId = {0}', null, currentMid);
    var hasKey = existing.hasNext();
    existing.close();
    if (hasKey) return true;
    purgeSecurityKeysForOtherMids(currentMid);
    return mintAndStoreSigningKey();
}

/**
 * Resolve the fraud product to subscribe. Uses the stored Product when set; otherwise queries the products
 * endpoint once to pick whichever fraud product the MID has.
 *
 * @param {Object} config the fraudManagement WEBHOOK_CONFIGS entry
 * @param {string} storedProduct product id previously persisted on the custom object ('' if none)
 * @returns {Object} { product: (Object|null), error: (string|null) }
 */
function resolveFraudProduct(config, storedProduct) {
    if (storedProduct) {
        for (var s = 0; s < config.products.length; s++) {
            if (config.products[s].productId === storedProduct) return { product: config.products[s], error: null };
        }
    }
    var avail = getAvailableProducts();
    if (avail.error) {
        Logger.error('resolveFraudProduct: product lookup failed: ' + JSON.stringify(avail.error));
        return { product: null, error: 'API_ERROR' };
    }
    var availableIds = toProductIds(avail.products);
    for (var c = 0; c < config.products.length; c++) {
        if (availableIds.indexOf(config.products[c].productId) !== -1) return { product: config.products[c], error: null };
    }
    Logger.error('resolveFraudProduct: NO_FRAUD_PRODUCT — no fraud product available for the MID [' + availableIds.join(', ') + '].');
    return { product: null, error: 'NO_FRAUD_PRODUCT' };
}

/**
 * Delete whatever subscription occupies these product slots at Visa Acceptance so the recreate can succeed
 * (Visa allows one subscription per product per MID). Scope is strictly the given products.
 *
 * @param {Array} products subscription products ({ productId, eventTypes }) whose slots to clear
 * @param {string} trackedWebhookId locally stored webhook id to also delete ('' if none)
 */
function deleteExistingSubscriptions(products, trackedWebhookId) {
    var idsToDelete = [];
    if (trackedWebhookId) idsToDelete.push(trackedWebhookId);
    for (var p = 0; p < products.length; p++) {
        var listResult = webhooks.retrieveWebhooks(products[p].productId);
        if (!listResult.error && Array.isArray(listResult.data)) {
            for (var i = 0; i < listResult.data.length; i++) {
                var wh = listResult.data[i];
                if (wh && wh.webhookId && idsToDelete.indexOf(wh.webhookId) === -1) {
                    idsToDelete.push(wh.webhookId);
                }
            }
        }
    }
    for (var d = 0; d < idsToDelete.length; d++) {
        var delResult = webhooks.deleteSubscription(idsToDelete[d]);
        if (delResult.error && parseInt(delResult.error, 10) !== 404) {
            Logger.error('deleteExistingSubscriptions: delete of webhook ' + idsToDelete[d] + ' failed: ' + JSON.stringify(delResult.error));
        }
    }
}

/**
 * Create the subscription, recovering once from a 400 already-exists by clearing the slot and retrying.
 *
 * @param {Object} subConfig per-call subscription config (name, description, products)
 * @param {string} webhookUrl target webhook URL
 * @returns {Object} the create result { data, error }
 */
function createSubscriptionWithConflictRetry(subConfig, webhookUrl) {
    var createResult = webhooks.createSubscription(subConfig, webhookUrl);
    if (createResult.error && parseInt(createResult.error, 10) === 400) {
        var body = (typeof createResult.data === 'string') ? createResult.data : JSON.stringify(createResult.data || '');
        if (/already\s*exist/i.test(body)) {
            deleteExistingSubscriptions(subConfig.products, '');
            createResult = webhooks.createSubscription(subConfig, webhookUrl);
        }
    }
    return createResult;
}

/**
 * Whether the given webhook id is still present at Visa Acceptance, looked up directly by id (404 = not
 * present). No call is made when webhookId is empty.
 *
 * @param {string} webhookId the tracked webhook id to look for
 * @returns {boolean} true when a webhook is returned for that id
 */
function subscriptionPresent(webhookId) {
    if (!webhookId) return false;
    var result = webhooks.getWebhookById(webhookId);
    return !result.error && !!result.data;
}

/**
 * Subscribe a BM-managed product: skip when the tracked webhook is still present; otherwise clear the
 * slot, ensure the signing key, create the subscription, persist it, then force it ACTIVE.
 *
 * @param {string} configId WEBHOOK_CONFIGS key ('fraudManagement' | 'unifiedCheckout')
 * @param {boolean} [keyReady] true when the caller already ensured the signing key (skips the per-product check)
 * @returns {Object} subscribe result { success, error, webhookId, status, product }
 */
function subscribeProduct(configId, keyReady) {
    var config = WEBHOOK_CONFIGS[configId];
    var site = Site.getCurrent();

    var existingObj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId);
    var existingWebhookId = (existingObj && existingObj.custom.WebhookId) ? existingObj.custom.WebhookId : '';
    var storedProduct = (existingObj && existingObj.custom.Product) ? existingObj.custom.Product : '';

    // fraudManagement is one product (stored value or one-time lookup); UC is a fixed bundle.
    var targetProduct = '';
    var subConfig;
    if (configId === 'fraudManagement') {
        var resolved = resolveFraudProduct(config, storedProduct);
        if (resolved.error) return { success: false, error: resolved.error };
        targetProduct = resolved.product.productId;
        subConfig = { name: config.name, description: config.description, products: [resolved.product] };
    } else {
        subConfig = { name: config.name, description: config.description, products: config.products };
    }

    var webhookUrl = URLUtils.https(new URLAction(config.notificationEndpoint, site.ID)).toString();

    // Already present at Visa Acceptance — leave it be.
    if (existingWebhookId && subscriptionPresent(existingWebhookId)) {
        return { success: true, webhookId: existingWebhookId, status: (existingObj.custom.Status || ''), product: storedProduct, alreadyExists: true };
    }

    // Not present: clear this subscription's product slot(s) and the stale local id before recreating.
    deleteExistingSubscriptions(subConfig.products, existingWebhookId);
    if (existingWebhookId) {
        Transaction.wrap(function () {
            var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId);
            if (obj) { obj.custom.WebhookId = ''; obj.custom.Status = ''; }
        });
    }

    if (!keyReady && !ensureSigningKey()) return { success: false, error: 'KEY_ERROR' };

    var createResult = createSubscriptionWithConflictRetry(subConfig, webhookUrl);
    if (createResult.error || !createResult.data || !createResult.data.webhookId) {
        var msg = (typeof createResult.data === 'string') ? createResult.data : JSON.stringify(createResult.data || createResult.error);
        Logger.error('subscribeProduct: createSubscription failed for ' + configId + ' (' + targetProduct + '): ' + msg);
        return { success: false, error: 'API_ERROR' };
    }
    var webhookId = createResult.data.webhookId;
    var createdStatus = createResult.data.status || '';

    Transaction.wrap(function () {
        var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId) || CustomObjectMgr.createCustomObject(CUSTOM_OBJECT_TYPE, configId);
        obj.custom.WebhookId = webhookId;
        obj.custom.WebhookUrl = webhookUrl;
        obj.custom.Status = createdStatus || '';
        obj.custom.Product = targetProduct;
    });

    // Force ACTIVE only for states we can change; PENDING_REVIEW / RESEND / BLOCKED are gateway-owned.
    var GATEWAY_MANAGED_STATUSES = ['PENDING_REVIEW', 'RESEND', 'BLOCKED'];
    var finalStatus = createdStatus || '';
    if (finalStatus !== 'ACTIVE' && GATEWAY_MANAGED_STATUSES.indexOf(finalStatus) === -1) {
        var activation = webhooks.activateSubscription(webhookId);
        if (!activation.error) {
            finalStatus = (activation.data && activation.data.status) ? activation.data.status : 'ACTIVE';
            Transaction.wrap(function () {
                var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId);
                if (obj) obj.custom.Status = finalStatus;
            });
        }
    }
    if (!finalStatus) finalStatus = 'PENDING_REVIEW';

    return { success: true, webhookId: webhookId, status: finalStatus, product: targetProduct, pendingReview: finalStatus !== 'ACTIVE' };
}

/**
 * Unsubscribe a BM-managed product. The local record is removed only when the delete is confirmed
 * (error false or 404); any other outcome keeps it for retry.
 *
 * @param {string} configId WEBHOOK_CONFIGS key ('fraudManagement' | 'unifiedCheckout')
 * @returns {Object} { success, alreadyRemoved?, error? }
 */
function unsubscribeProduct(configId) {
    var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId);
    if (!obj || !obj.custom.WebhookId) return { success: true, alreadyRemoved: true };
    var deleteResult = webhooks.deleteSubscription(obj.custom.WebhookId);
    if (deleteResult.error && parseInt(deleteResult.error, 10) !== 404) {
        Logger.error('deleteSubscription failed for ' + configId + ' (' + obj.custom.WebhookId + '): ' + JSON.stringify(deleteResult.error));
        return { success: false, error: 'DELETE_FAILED' };
    }
    Transaction.wrap(function () { CustomObjectMgr.remove(obj); });
    return { success: true };
}

/**
 * Clear the tracked WebhookId/Status so the next sync creates a fresh subscription. Used when the stored
 * webhook is no longer present for the active merchant.
 *
 * @param {string} configId WEBHOOK_CONFIGS key ('fraudManagement' | 'unifiedCheckout')
 */
function abandonStoredWebhook(configId) {
    try {
        Transaction.wrap(function () {
            var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, configId);
            if (obj && obj.custom.WebhookId) {
                obj.custom.WebhookId = '';
                obj.custom.Status = '';
            }
        });
    } catch (e) {
        Logger.error('abandonStoredWebhook failed for ' + configId + ': ' + (e && e.message ? e.message : e));
    }
}

/**
 * Consolidates all data needed for the Webhook Manager view
 */
function getViewData() {
    var site = Site.getCurrent();
    var method = site.getCustomPreferenceValue('VisaAcceptance_Secure_Integration_Method');
    var methodValue = (method && method.value) ? method.value : (method || '');
    var dmEnabled = site.getCustomPreferenceValue('VisaAcceptance_DecisionManager') || false;
    var egressMleAlias = site.getCustomPreferenceValue('VisaAcceptance_ResponseMLEPrivateKeyAlias');

    var testAction = new URLAction('WebhookNotification-dmNotification', site.ID);
    var fullUrl = URLUtils.https(testAction).toString();
    var standardBaseUrl = fullUrl.substring(0, fullUrl.indexOf('WebhookNotification-dmNotification')).replace(/\/$/, '');

    var data = {
        config: {
            dmEnabled: dmEnabled,
            secureIntegrationMethod: methodValue,
            egressMleAlias: egressMleAlias,
            standardBaseUrl: standardBaseUrl,
            activeBaseUrl: standardBaseUrl
        },
        subscriptions: {}
    };

    ['fraudManagement', 'unifiedCheckout'].forEach(function (productId) {
        try {
            var obj = CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, productId);
            data.subscriptions[productId] = (obj && obj.custom.WebhookId)
                ? { webhookId: obj.custom.WebhookId, status: obj.custom.Status, product: obj.custom.Product || '' }
                : null;
        } catch (e) { data.subscriptions[productId] = null; }
    });

    // Reconcile each tracked webhook by looking it up directly by its stored webhookId: null the record on
    // 404, else refresh its status. Records with no stored id are left as-is (we never probe by productId).
    try {
        ['fraudManagement', 'unifiedCheckout'].forEach(function (entryKey) {
            var entryEnabled = (entryKey === 'fraudManagement')
                ? !!data.config.dmEnabled
                : (data.config.secureIntegrationMethod === 'Unified_Checkout');
            if (!entryEnabled) return;

            var trackedId = (data.subscriptions[entryKey] && data.subscriptions[entryKey].webhookId)
                ? data.subscriptions[entryKey].webhookId : '';
            if (!trackedId) return;

            var result = webhooks.getWebhookById(trackedId);
            if (result.error) {
                Logger.error('External webhook lookup failed for ' + entryKey + ' (' + trackedId + '): ' + JSON.stringify(result.error));
                return;
            }

            if (!result.data) {
                abandonStoredWebhook(entryKey);
                data.subscriptions[entryKey] = null;
                return;
            }

            if (result.data.status) {
                data.subscriptions[entryKey].status = result.data.status;
            }
        });
    } catch (e) { Logger.error('getViewData discovery failed: ' + (e && e.message ? e.message : e)); }
    return data;
}

/**
 * Sync every BM-managed webhook to the current site preferences: (re)create when enabled, remove when disabled.
 *
 * @returns {Object} per-product results keyed by 'dm' / 'uc'
 */
function syncWithPreferences() {
    var site = Site.getCurrent();
    var method = site.getCustomPreferenceValue('VisaAcceptance_Secure_Integration_Method');
    var methodValue = (method && method.value) ? method.value : (method || '');
    var dmEnabled = site.getCustomPreferenceValue('VisaAcceptance_DecisionManager') || false;
    var results = {};

    var keyReady = false;
    if (dmEnabled || methodValue === 'Unified_Checkout') {
        keyReady = ensureSigningKey();
    }

    if (dmEnabled) {
        results.dm = subscribeProduct('fraudManagement', keyReady);
    } else if (CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, 'fraudManagement')) {
        results.dm = unsubscribeProduct('fraudManagement');
    }

    if (methodValue === 'Unified_Checkout') {
        results.uc = subscribeProduct('unifiedCheckout', keyReady);
    } else if (CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_TYPE, 'unifiedCheckout')) {
        results.uc = unsubscribeProduct('unifiedCheckout');
    }
    return results;
}

/**
 * Register the egress MLE public key with KMS (derived from the .p12 alias). Does not create/sync webhooks.
 *
 * @param {string} egressMleAlias the .p12 alias being saved (falls back to the stored alias when empty)
 * @returns {Object} results ({ egressKey } only when a freshly derived key was rejected)
 */
function updateAdvanced(egressMleAlias) {
    var site = Site.getCurrent();

    var effectiveAlias = egressMleAlias || site.getCustomPreferenceValue('VisaAcceptance_ResponseMLEPrivateKeyAlias');
    var derivedKey = webhookHelper.deriveEgressCertificateB64(effectiveAlias);
    var keyToUse = derivedKey || '';

    var egressUploadOk = false;
    if (keyToUse) {
        var egressUpload = webhooks.uploadAsymmetricKey(keyToUse);
        if (egressUpload.error) Logger.error('Failed to upload Egress Public Key: ' + JSON.stringify(egressUpload.error));
        else egressUploadOk = true;
    }

    Transaction.wrap(function () {
        try { site.setCustomPreferenceValue('VisaAcceptance_ResponseMLEPrivateKeyAlias', effectiveAlias); } catch(e) { /* pref write is best-effort */ }
    });

    var results = {};
    if (derivedKey && !egressUploadOk) {
        results.egressKey = { success: false, error: 'EGRESS_KEY_UPLOAD_FAILED' };
    }

    return results;
}

exports.retrieveWebhooks = webhooks.retrieveWebhooks;
exports.subscribeFraudManagement = function() { return subscribeProduct('fraudManagement'); };
exports.unsubscribeFraudManagement = function() { return unsubscribeProduct('fraudManagement'); };
exports.subscribeUC = function() { return subscribeProduct('unifiedCheckout'); };
exports.unsubscribeUC = function() { return unsubscribeProduct('unifiedCheckout'); };
exports.getViewData = getViewData;
exports.syncWithPreferences = syncWithPreferences;
exports.updateAdvanced = updateAdvanced;
