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
        '/notification-subscriptions/v1/webhooks', 'GET',
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
    var postBody = {
        name: 'Network Tokens Webhook',
        description: 'Webhook for Network Token Subscription',
        organizationId: merchantId,
        productId: 'tokenManagement',
        eventTypes: ['tms.networktoken.updated'],
        webhookUrl: URLUtils.https('WebhookNotification-tokenUpdate').toString(),
        healthCheckUrl: URLUtils.https('WebhookNotification-tokenUpdate').toString(),
        notificationScope: 'SELF',
        retryPolicy: {
            algorithm: 'ARITHMETIC',
            firstRetry: 1,
            interval: 1,
            numberOfRetries: 3,
            deactivateFlag: 'false',
            repeatSequenceCount: 0,
            repeatSequenceWaitTime: 0
        },
        securityPolicy: {
            securityType: 'KEY',
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
        '/notification-subscriptions/v1/webhooks', 'POST',
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
        '/notification-subscriptions/v1/webhooks/{webhookId}' , 'DELETE',
        pathParams, queryParams, headerParams, formParams, postBody,
        authNames, contentTypes, accepts, returnType, callback
    );
}
function createNetworkTokenSubscription() {
    retrieveAllCreatedWebhooks(function (data, error, response) {
        if (data[0].webhookId) {
            var obj = CustomObjectMgr.getCustomObject("Network Tokens Webhook", merchantId);
                if (obj == null) {
                    deleteSusbscriprion(data[0].webhookId, function (data, error, responseData) {
                        if(responseData.status === 'OK'){
                            createNetworkTokenSubscription();
                        }
                    });
                } 
        }
        if (error) {
            data = JSON.parse(data);
            if (data.statusCode === 404) {
                var key = '';
                createWebhookSecurityKey(function (data, error, response) {
                    if (!error) {
                        if (data.status === 'SUCCESS') {
                            key = data.keyInformation.key;
                        }
                    } else {
                        throw new Error(new errors.API_CLIENT_ERROR(JSON.stringify(data)));
                    }
                });
                var webhookId = '';
                createWebhookSubscription(function (data, error, response) {
                    if (!error) {
                        webhookId = data.webhookId;
                    } else {
                        throw new Error(new errors.API_CLIENT_ERROR(JSON.stringify(data)));
                    }
                });
                Transaction.wrap(function () {
                    var obj = CustomObjectMgr.getCustomObject("Network Tokens Webhook", merchantId);
                    if (obj == null) {
                        obj = CustomObjectMgr.createCustomObject('Network Tokens Webhook', merchantId);
                    }
                    obj.custom.SecurityKey = key;
                    obj.custom.SubscriptionId = webhookId;
                });
            } else {
                throw new Error(new errors.API_CLIENT_ERROR(JSON.stringify(data)));
            }
        }
    });
}

module.exports = {
    retrieveAllCreatedWebhooks: retrieveAllCreatedWebhooks,
    createWebhookSecurityKey: createWebhookSecurityKey,
    createWebhookSubscription: createWebhookSubscription,
    createNetworkTokenSubscription: createNetworkTokenSubscription
};
