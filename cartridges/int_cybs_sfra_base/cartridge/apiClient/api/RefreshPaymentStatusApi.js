/**
 * CyberSource Merged Spec
 * All CyberSource API specs merged together. These are available at https://developer.cybersource.com/api/reference/api-reference.html
 *
 * OpenAPI spec version: 0.0.1
 *
 * NOTE: This class follows the shape of the swagger-generated API classes
 * (e.g. TransactionDetailsApi, PaymentsApi) but is hand-authored so it can be
 * required directly without regenerating the aggregated apiClient/index.js.
 *
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['ApiClient'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS-like environments that support module.exports, like Node.
        module.exports = factory(require('../ApiClient'));
    } else {
        // Browser globals (root is window)
        if (!root.CyberSource) {
            root.CyberSource = {};
        }
        root.CyberSource.RefreshPaymentStatusApi = factory(root.CyberSource.ApiClient);
    }
}(this, function (ApiClient) {
    'use strict';

    /**
     * RefreshPaymentStatus service.
     * @module api/RefreshPaymentStatusApi
     * @version 0.0.1
     */

    /**
     * Constructs a new RefreshPaymentStatusApi.
     * @alias module:api/RefreshPaymentStatusApi
     * @class
     * @param {Object} configObject merchant configuration (MID, key id, secret key, host)
     * @param {module:ApiClient} apiClient Optional API client implementation to use,
     * default to {@link module:ApiClient#instance} if unspecified.
     */
    var exports = function (configObject, apiClient) {
        this.apiClient = apiClient || ApiClient.instance;

        this.apiClient.setConfiguration(configObject);

        /**
         * Callback function to receive the result of the refreshPaymentStatus operation.
         * @callback module:api/RefreshPaymentStatusApi~refreshPaymentStatusCallback
         * @param {Object} data The data returned by the service call.
         * @param {String} error Error message, if any.
         * @param {Object} response The complete HTTP response.
         */

        /**
         * Check a Payment Status
         * Retrieve the current status of a previously submitted payment (typically an
         * asynchronous / alternative payment method) via POST /pts/v2/refresh-payment-status/{id}.
         * Include the original request id (stored on the SFCC PaymentTransaction as its
         * transaction id) as {id}.
         * @param {String} id Request ID of the original payment to refresh.
         * @param {Object} refreshRequest request body (clientReferenceInformation, processingInformation, ...)
         * @param {module:api/RefreshPaymentStatusApi~refreshPaymentStatusCallback} callback
         *        accepting three arguments: data, error, response
         */
        this.refreshPaymentStatus = function (id, refreshRequest, callback) {
            var postBody = refreshRequest;

            // verify the required parameter 'id' is set
            if (id === undefined || id === null) {
                throw new Error("Missing the required parameter 'id' when calling refreshPaymentStatus");
            }

            // verify the required parameter 'refreshRequest' is set
            if (refreshRequest === undefined || refreshRequest === null) {
                throw new Error("Missing the required parameter 'refreshRequest' when calling refreshPaymentStatus");
            }

            var pathParams = {
                id: id
            };
            var queryParams = {};
            var headerParams = {};
            var formParams = {};

            var authNames = [];
            var contentTypes = ['application/json;charset=utf-8'];
            var accepts = ['application/hal+json;charset=utf-8'];
            // returnType null: ApiClient.callApi JSON-parses the response and hands the
            // plain object to the callback; no swagger model deserialization is needed.
            var returnType = null;

            return this.apiClient.callApi(
                '/pts/v2/refresh-payment-status/{id}', 'POST',
                pathParams, queryParams, headerParams, formParams, postBody,
                authNames, contentTypes, accepts, returnType, callback
            );
        };
    };

    return exports;
}));
