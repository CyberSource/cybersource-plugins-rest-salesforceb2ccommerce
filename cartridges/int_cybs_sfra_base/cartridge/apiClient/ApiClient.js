'use strict';
var Bytes = require('dw/util/Bytes');
var Encoding = require('dw/crypto/Encoding');
var Mac = require('dw/crypto/Mac');
var MessageDigest = require('dw/crypto/MessageDigest');

var MerchantConfig = require('./merchantConfig');
var Logger = require('./logger');
var PaymentsHttpService = dw.svc.LocalServiceRegistry.createService("PaymentHttpService", {
    createRequest: function (svc, url, headers, method, requestBody) {
        var keys = Object.keys(headers);
        var StringHeaders = "";
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            svc.addHeader(key, headers[key]);
            StringHeaders += key + ":" + headers[key] + "\n";
        }
        svc.URL = url;
        svc.setRequestMethod(method.toUpperCase());
        if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PATCH') {
            if (typeof requestBody === 'string') {
                return requestBody;
            }
            return JSON.stringify(requestBody);
        }
    },
    parseResponse: function (svc, client) {
        return client.text;
    },
    filterLogMessage: function (msg) {
        //  No need to filter logs.  No sensitive information.
        return msg;
    }
});

var _exports = function () {}

_exports.prototype.setConfiguration = function (configObject) {
    this.merchantConfig = new MerchantConfig(configObject);
    this.basePath = PaymentsHttpService.configuration.credential.getURL();
    this.logger = Logger.getLogger(this);
};

_exports.prototype.addQueryParams = function (url, queryParams) {
    var keys = Object.keys(queryParams);
    if (keys.length > 0) {
        if (url[url.length - 1] === '/') {
            url[url.length - 1] = '?';
        } else {
            url += '?';
        }
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (queryParams[key]) {
                url += key + '=' + queryParams[key];
            }
            if (i < keys.length - 1 && queryParams[keys[i + 1]]) {
                url += '&';
            }
        }
    }
    return url;
}

_exports.prototype.paramToString = function (param) {
    if (param == undefined || param == null) {
        return '';
    }
    if (param instanceof Date) {
        return param.toJSON();
    }
    return param.toString();
}

_exports.prototype.buildUrl = function (path, pathParams, queryParams) {
    if (!path.match(/^\//)) {
        path = '/' + path;
    }
    var url = this.basePath + path;
    var _this = this;
    url = url.replace(/\{([\w-]+)\}/g, function (fullMatch, key) {
        var value;

        if (pathParams.hasOwnProperty(key)) {
            value = _this.paramToString(pathParams[key]);
        } else {
            value = fullMatch;
        }

        return encodeURIComponent(value);
    });
    return this.addQueryParams(url, queryParams);
};

_exports.prototype.generateDigest = function (payload) {
    //var buffer = Buffer.from(payload, 'utf8');
    var buffer = new Bytes(payload, 'utf8');

    //var hash = crypto.createHash('sha256');
    var messageDigest = new MessageDigest("SHA-256");

    //hash.update(buffer);
    messageDigest.updateBytes(buffer);

    //var digest = hash.digest('base64');
    var digest = messageDigest.digest();
    var digestBase64 = Encoding.toBase64(digest);

    //return digest;
    return digestBase64;
}

_exports.prototype.getHttpSignature = function (resource, method, merchantKeyId, requestHost, merchantId, merchantSecretKey, payload) {
    var signatureHeader = "";
    var signatureValue = "";

    // KeyId is the key obtained from EBC
    signatureHeader += "keyid=\"" + merchantKeyId + "\"";

    // Algorithm should be always HmacSHA256 for http signature
    signatureHeader += ", algorithm=\"HmacSHA256\"";

    // Headers - list is choosen based on HTTP method.
    // Digest is not required for GET Method
    if (method === "get" || method === "delete") {
        var headersForGetMethod = "host date (request-target) v-c-merchant-id";
        signatureHeader += ", headers=\"" + headersForGetMethod + "\"";
    } else if (method === "post" || method === "patch") {
        var headersForPostMethod = "host date (request-target) digest v-c-merchant-id";
        signatureHeader += ", headers=\"" + headersForPostMethod + "\"";
    }

    var signatureString = 'host: ' + requestHost;

    signatureString += '\ndate: ' + new Date(Date.now()).toUTCString();
    signatureString += '\n(request-target): ';

    if (method === "get" || method === "delete") {
        var targetUrlForGet = method + " " + resource;
        signatureString += targetUrlForGet + '\n';
    } else if (method === "post" || method === "patch") {
        // Digest for POST call
        var digest = this.generateDigest(payload);

        var targetUrlForPost = method + " " + resource;
        signatureString += targetUrlForPost + '\n';

        signatureString += 'digest: SHA-256=' + digest + '\n';
    }

    signatureString += 'v-c-merchant-id: ' + merchantId;

    var data = new Bytes(signatureString, 'utf8');

    // Decoding scecret key
    var key = Encoding.fromBase64(merchantSecretKey);

    var mac = new Mac("HmacSHA256");
    var digest = mac.digest(data, key);
    signatureValue = Encoding.toBase64(digest);

    signatureHeader += ", signature=\"" + signatureValue + "\"";

    return signatureHeader;
}

_exports.prototype.normalizeParams = function (params) {
    var newParams = {};
    for (var key in params) {
        if (params.hasOwnProperty(key) && params[key] != undefined && params[key] != null) {
            var value = params[key];
            if (Array.isArray(value)) {
                newParams[key] = value;
            } else {
                newParams[key] = this.paramToString(value);
            }
        }
    }
    return newParams;
}

_exports.prototype.callApi = function (path, httpMethod, pathParams, queryParams, headerParams, formParams, bodyParam, authNames, contentTypes, accepts, returnType, callback) {
    var requestHost = this.basePath.substr(
        this.basePath.indexOf("//") + 2
    );

    var method = httpMethod.toLowerCase();
    var merchantId = this.merchantConfig.getMerchantID();
    var merchantKeyId = this.merchantConfig.getMerchantKeyID();
    var merchantSecretKey = this.merchantConfig.getMerchantsecretKey();
    var payload = "";

    var url = this.buildUrl(path, pathParams, queryParams);

    var resource = url.substr(this.basePath.length);
    var contentType = contentTypes.join(';');
    var acceptType = accepts.join(';');

    var date = new Date(Date.now()).toUTCString();
    if (method === 'post' || method === 'patch') {
        if (typeof bodyParam === 'string') {
            bodyParam = JSON.parse(bodyParam);
        }

        // adding solution id to all post calls
        if (!bodyParam.clientReferenceInformation) {
            bodyParam.clientReferenceInformation = {};
        }

        bodyParam.clientReferenceInformation.partner = {
            solutionId: this.merchantConfig.getSolutionId(),
            developerId: this.merchantConfig.getDeveloperId()
        }
        payload = JSON.stringify(bodyParam);

        var signature = this.getHttpSignature(resource, method, merchantKeyId, requestHost, merchantId, merchantSecretKey, payload);
        var digest = this.generateDigest(payload);
        digest = "SHA-256=" + digest;
        headerParams['digest'] = digest;
    } else {
        var signature = this.getHttpSignature(resource, method, merchantKeyId, requestHost, merchantId, merchantSecretKey);
    }

    headerParams['v-c-merchant-id'] = merchantId;
    headerParams['date'] = date;
    headerParams['host'] = requestHost;
    headerParams['signature'] = signature;
    headerParams['User-Agent'] = "Mozilla/5.0";
    headerParams['Content-Type'] = contentType;
    headerParams['Accept'] = acceptType;

    // Set header parameters
    var normalizedHeaders = this.normalizeParams(headerParams);

    // Calling service.
    if (method === 'post' || method === 'patch') {
        var response = PaymentsHttpService.call(url, normalizedHeaders, method, payload);
    } else {
        var response = PaymentsHttpService.call(url, normalizedHeaders, method);
    }

    if (response.ok) {
        var responseObj = response.object;
        callback(JSON.parse(responseObj), false, response);
    } else {
        callback(response.errorMessage, response.error, response);
    }
};

module.exports = {
    instance: new _exports()
};
