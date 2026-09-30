'use strict';

var configObject = require('../../configuration/index');
var apiClient = require('../../apiClient/ApiClient');
var MerchantConfig = require('~/cartridge/apiClient/merchantConfig');

var merchantId = new MerchantConfig(configObject).getMerchantID();
var Transaction = require('dw/system/Transaction');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Logger = require('dw/system/Logger');

function retrieveAllCreatedWebhooks(callback) {
    var postBody = null;

    var pathParams = {};
    var queryParams = {
        organizationId: merchantId,
        productId: 'tokenManagement',
        eventType: 'tms.networktoken.updated'
    };
    var headerParams = {};
    var formParams = {};

    var authNames = [];
    var contentTypes = ['application/json;charset=utf-8'];
    var accepts = ['application/json;charset=utf-8'];
    var returnType = {};
    apiClient.instance.callApi(
        '/notification-subscriptions/v2/webhooks', 'GET',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}

function createWebhookSecurityKey(callback) {
    var postBody = {
        clientRequestAction: 'CREATE',
        keyInformation: {
            provider: 'nrtd',
            tenant: merchantId,
            keyType: 'sharedSecret',
            organizationId: merchantId
        }
    };

    var pathParams = {
    };
    var queryParams = {
    };
    var headerParams = {
    };
    var formParams = {
    };

    var authNames = [];
    var contentTypes = ['application/json;charset=utf-8'];
    var accepts = ['application/hal+json;charset=utf-8'];
    var returnType = {};
    apiClient.instance.callApi(
        '/kms/egress/v2/keys-sym', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}

function createWebhookSubscription(callback) {
    var URLUtils = require('dw/web/URLUtils');
    var endpoint = 'WebhookNotification-tokenUpdate';
    
    var webhookBaseUrl = '';
    try {
        var globalObj = CustomObjectMgr.getCustomObject('VisaAcceptanceWebhookSubscription', 'globalConfiguration');
        if (globalObj) webhookBaseUrl = globalObj.custom.BaseUrl;
    } catch (e) {}

    var webhookUrl = webhookBaseUrl ? (webhookBaseUrl.replace(/\/$/, '') + '/' + endpoint) : URLUtils.https(endpoint).toString();

    var postBody = {
        name: 'Network Tokens Webhook',
        description: 'Webhook for Network Token Subscription',
        organizationId: merchantId,
        products: [{ productId: 'tokenManagement', eventTypes: ['tms.networktoken.updated'] }],
        webhookUrl: webhookUrl,
        healthCheckUrl: webhookUrl,
        notificationScope: 'SELF',
        retryPolicy: {
            algorithm: 'ARITHMETIC',
            firstRetry: 1,
            interval: 1,
            numberOfRetries: 3,
            deactivateFlag: 'true',
            repeatSequenceCount: 0,
            repeatSequenceWaitTime: 0
        },
        securityPolicy: {
            securityType: 'key',
            proxyType: 'external'
        }
    };

    var pathParams = {
    };
    var queryParams = {
    };
    var headerParams = {
    };
    var formParams = {
    };

    var authNames = [];
    var contentTypes = ['application/json;charset=utf-8'];
    var accepts = ['application/json;charset=utf-8'];
    var returnType = {};
    apiClient.instance.callApi(
        '/notification-subscriptions/v2/webhooks', 'POST',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}

function activateWebhookSubscription(webhookId, callback) {
    var postBody = { status: 'ACTIVE' };

    var pathParams = {
    };
    var queryParams = {
    };
    var headerParams = {
    };
    var formParams = {
    };

    var authNames = [];
    var contentTypes = ['application/json;charset=utf-8'];
    var accepts = ['application/json;charset=utf-8'];
    var returnType = {};
    apiClient.instance.callApi(
        '/notification-subscriptions/v2/webhooks/' + webhookId + '/status', 'PUT',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}

function deleteSusbscriprion(id, callback){
    var postBody = null;

    var pathParams = {
        'webhookId' : id
    };
    var queryParams = {};
    var headerParams = {};
    var formParams = {};

    var authNames = [];
    var contentTypes = ['application/json;charset=utf-8'];
    var accepts = ['application/json;charset=utf-8'];
    var returnType = {};
    apiClient.instance.callApi(
        '/notification-subscriptions/v2/webhooks/{webhookId}' , 'DELETE',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}
function createNetworkTokenSubscription() {
    retrieveAllCreatedWebhooks(function (data, error, response) {
        if (!error && data && data.length > 0 && data[0].webhookId) {
            var obj = CustomObjectMgr.getCustomObject("Network Tokens Webhook", merchantId);
            if (obj == null) {
                deleteSusbscriprion(data[0].webhookId, function (delData, delError, responseData) {
                    if (responseData && responseData.statusCode === 204) {
                        createNetworkTokenSubscription();
                    }
                });
                return;
            } 
        }
        
        if (error || (response && response.statusCode === 404)) {
            var errorObj = {};
            try { errorObj = (typeof data === 'string') ? JSON.parse(data) : data; } catch(e) { errorObj = {}; }
            
            if (response.statusCode === 404 || errorObj.statusCode === 404) {
                var key = '';
                createWebhookSecurityKey(function (keyData, keyError) {
                    if (!keyError && keyData.status === 'SUCCESS') {
                        key = keyData.keyInformation.key;
                    }
                });
                
                var webhookId = '';
                createWebhookSubscription(function (subData, subError) {
                    if (!subError) {
                        webhookId = subData.webhookId;
                    }
                });
                
                if (webhookId) {
                    activateWebhookSubscription(webhookId, function(actData, actError) {
                        if (actError) {
                            Logger.error("Error activating network token webhook: " + webhookId);
                        }
                    });

                    Transaction.wrap(function () {
                        var obj = CustomObjectMgr.getCustomObject("Network Tokens Webhook", merchantId) || CustomObjectMgr.createCustomObject('Network Tokens Webhook', merchantId);
                        obj.custom.SecurityKey = key;
                        obj.custom.SubscriptionId = webhookId;
                    });
                }
            } else if (response.statusCode !== 200) {
                Logger.error('Network Token Subscription API Error: ' + response.statusCode);
            }
        }
    });
}

module.exports = {
    retrieveAllCreatedWebhooks: retrieveAllCreatedWebhooks,
    createWebhookSecurityKey: createWebhookSecurityKey,
    createWebhookSubscription: createWebhookSubscription,
    activateWebhookSubscription: activateWebhookSubscription,
    createNetworkTokenSubscription: createNetworkTokenSubscription
};
