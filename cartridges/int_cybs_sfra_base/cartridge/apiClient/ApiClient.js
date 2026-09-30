'use strict';
var Bytes = require('dw/util/Bytes');
var Encoding = require('dw/crypto/Encoding');
var Mac = require('dw/crypto/Mac');
var MessageDigest = require('dw/crypto/MessageDigest');
var configObject = require('*/cartridge/configuration/index');
var MerchantConfig = require('./merchantConfig');
var Logger = require('./logger');

var _exports = function () { }

_exports.prototype.createService = function () {
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
            if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PATCH' || method.toUpperCase() === 'PUT') {
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
            // Filter sensitive payment data from logs to comply with PCI-DSS
            if (!msg || typeof msg !== 'string') {
                return msg;
            }

            function filterSensitiveFields(obj) {
                if (!obj || typeof obj !== 'object') {
                    return obj;
                }

                var filtered = Array.isArray(obj) ? [] : {};

                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        var lowerKey = key.toLowerCase();
                        var value = obj[key];

                        // Mask credit card numbers - keep last 4 digits
                        if (lowerKey === 'number' || lowerKey === 'cardnumber' || lowerKey === 'accountnumber') {
                            if (typeof value === 'string' && value.length >= 13) {
                                filtered[key] = '****' + value.slice(-4);
                            } else {
                                filtered[key] = '****';
                            }
                        }
                        // Completely redact security codes, CVV, CVV2
                        else if (lowerKey === 'securitycode' || lowerKey === 'cvv' || lowerKey === 'cvv2' || lowerKey === 'cvc') {
                            filtered[key] = '***';
                        }
                        // Redact secret keys, passwords, tokens
                        else if (lowerKey.indexOf('secret') !== -1 || lowerKey.indexOf('password') !== -1 ||
                            lowerKey.indexOf('token') !== -1 || lowerKey === 'pin') {
                            filtered[key] = '[REDACTED]';
                        }
                        // Mask authorization signatures
                        else if (lowerKey === 'signature' || lowerKey === 'authorization') {
                            filtered[key] = '[REDACTED]';
                        }
                        // Recursively filter nested objects and arrays
                        else if (typeof value === 'object' && value !== null) {
                            filtered[key] = filterSensitiveFields(value);
                        }
                        // Keep non-sensitive values
                        else {
                            filtered[key] = value;
                        }
                    }
                }

                return filtered;
            }

            function filterSensitiveText(text) {
                var filtered = text;

                // Mask 13-19 digit card numbers (keep last 4)
                filtered = filtered.replace(/\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4})\b/g, function (match) {
                    var digits = match.replace(/[\s-]/g, '');
                    return '****' + digits.slice(-4);
                });

                // Redact CVV/CVV2 patterns (3-4 digits labeled as CVV)
                filtered = filtered.replace(/\b(cvv2?|cvc|security_?code)["\s:=]+(\d{3,4})\b/gi, '$1:***');

                // Redact authorization headers
                filtered = filtered.replace(/(authorization|signature)["\s:=]+[^\s,"}]+/gi, '$1:[REDACTED]');

                return filtered;
            }

            var filteredMsg = msg;

            try {
                // Try to parse as JSON to filter structured data
                var parsedMsg = JSON.parse(msg);
                filteredMsg = JSON.stringify(filterSensitiveFields(parsedMsg));
            } catch (e) {
                // Not JSON, apply regex-based filtering for plain text logs
                filteredMsg = filterSensitiveText(msg);
            }

            return filteredMsg;
        }
    });
    return PaymentsHttpService;
};

_exports.prototype.setConfiguration = function (configObject) {
    this.merchantConfig = new MerchantConfig(configObject);
    this.basePath = this.createService().configuration.credential.getURL();
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
    var buffer = new Bytes(payload, 'utf8');
    var messageDigest = new MessageDigest('SHA-256');
    messageDigest.updateBytes(buffer);
    var digest = messageDigest.digest();
    var digestBase64 = Encoding.toBase64(digest);

    return digestBase64;
}

_exports.prototype.base64UrlEncode = function (input) {
    var base64;
    if (typeof input === 'string') {
        base64 = Encoding.toBase64(new Bytes(input, 'UTF-8'));
    } else {
        base64 = Encoding.toBase64(input);
    }
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
        var headersForGetMethod = "host date request-target v-c-merchant-id";
        signatureHeader += ", headers=\"" + headersForGetMethod + "\"";
    } else if (method === "post" || method === "patch" || method === "put") {
        var headersForPostMethod = "host date request-target digest v-c-merchant-id";
        signatureHeader += ", headers=\"" + headersForPostMethod + "\"";
    }

    var signatureString = 'host: ' + requestHost;

    signatureString += '\ndate: ' + new Date(Date.now()).toUTCString();
    signatureString += '\nrequest-target: ';

    if (method === "get" || method === "delete") {
        var targetUrlForGet = method + " " + resource;
        signatureString += targetUrlForGet + '\n';
    } else if (method === "post" || method === "patch" || method === "put") {
        // Digest for POST call
        var digest = this.generateDigest(payload);

        var targetUrlForPost = method + " " + resource;
        signatureString += targetUrlForPost + '\n';

        signatureString += 'digest: SHA-256=' + digest + '\n';
    }

    // For a meta (portfolio/account) key the signature is computed over the portfolio
    // owner MID, while the request sends the transacting child MID in v-c-merchant-id.
    // Mirrors the JWT `iss` handling in getJWTToken. keyid/shared secret are already the
    // meta key credentials (getMerchantKeyID/getMerchantsecretKey).
    var signatureMerchantId = (configObject.metaKeyEnabled && configObject.metaKeyMerchantId) ? configObject.metaKeyMerchantId : merchantId;
    signatureString += 'v-c-merchant-id: ' + signatureMerchantId;

    var data = new Bytes(signatureString, 'utf8');

    // Decoding scecret key
    var key = Encoding.fromBase64(merchantSecretKey);

    var mac = new Mac("HmacSHA256");
    var digest = mac.digest(data, key);
    signatureValue = Encoding.toBase64(digest);

    signatureHeader += ", signature=\"" + signatureValue + "\"";

    return signatureHeader;
}


_exports.prototype.getJWTToken = function (resource, method, merchantId, digest, requestHost, responseMleKid) {
    var Constants = require('../apiClient/constants');
    var UUIDUtils = require('dw/util/UUIDUtils');

    // Shared-secret JWT (v2): the token is signed with the REST shared secret key pair
    // (KeyId + Secret Key from EBC), not a P12 certificate. The `kid` is the shared-secret
    // key id and the signature is an HMAC-SHA256 over the signing input keyed with the
    // base64-decoded shared secret. See restgs-jwt-con-shared-secret-intro.md.
    var merchantKeyId = this.merchantConfig.getMerchantKeyID();
    var merchantSecretKey = this.merchantConfig.getMerchantsecretKey();

    var currentTimestamp = Math.floor(Date.now() / 1000);

    // JWS Header Claims - alg, typ, kid per spec (Step 3B)
    var header = {
        alg: Constants.JWT_SHARED_SECRET_ALG,
        typ: 'JWT',
        kid: merchantKeyId
    };

    // JWS Body Claims - JWT v2 (Step 3C)
    var jwtPayload = {};
    if (digest) {
        jwtPayload.digest = digest;
        jwtPayload.digestAlgorithm = 'SHA-256';
    }
    jwtPayload.exp = currentTimestamp + 120;
    jwtPayload.iat = currentTimestamp;
    // iss is the MID that created the shared secret key pair. For meta/portfolio keys this is
    // the portfolio owner MID; v-c-merchant-id stays the transacting child MID.
    jwtPayload.iss = (configObject.metaKeyEnabled && configObject.metaKeyMerchantId) ? configObject.metaKeyMerchantId : merchantId;
    jwtPayload.jti = UUIDUtils.createUUID();
    jwtPayload['request-method'] = method;
    jwtPayload['request-resource-path'] = resource;
    jwtPayload['request-host'] = requestHost;
    jwtPayload['v-c-jwt-version'] = '2';
    jwtPayload['v-c-merchant-id'] = merchantId;
    // Response MLE: when a Response MLE key id is configured, this claim instructs the gateway
    // to encrypt the response ({"encryptedResponse": "<JWE>"}) with the merchant Response MLE
    // public key. The kid is the serial number of that certificate; the response is decrypted
    // with the private key at the egress alias (see jweDecrypt.decryptResponse).
    if (responseMleKid) {
        jwtPayload['v-c-response-mle-kid'] = responseMleKid;
    }

    // Base64URL encode header and payload (Step 4)
    var encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    var encodedPayload = this.base64UrlEncode(JSON.stringify(jwtPayload));

    // Create signing input: [JWS Header].[Claim Set] (Step 3D)
    var signingInput = encodedHeader + '.' + encodedPayload;

    // HMAC-SHA256 the signing input with the base64-decoded shared secret, then base64URL encode.
    var key = Encoding.fromBase64(merchantSecretKey);
    var mac = new Mac(Constants.HmacSHA256);
    var signatureBytes = mac.digest(new Bytes(signingInput, 'UTF-8'), key);
    var encodedSignature = this.base64UrlEncode(signatureBytes);

    return signingInput + '.' + encodedSignature;
}

/**
 * Applies HTTP Signature authentication headers to the request.
 * This is the historical default behavior of the cartridge.
 *
 * @param {Object} headerParams - header map to mutate
 * @param {Object} opts - {resource, method, requestHost, merchantId, merchantKeyId,
 *                          merchantSecretKey, payload, isBodyMethod, rawDigest, date}
 */
_exports.prototype.applyHttpSignatureHeaders = function (headerParams, opts) {
    var Constants = require('../apiClient/constants');
    var signature;
    if (opts.isBodyMethod) {
        signature = this.getHttpSignature(opts.resource, opts.method, opts.merchantKeyId, opts.requestHost, opts.merchantId, opts.merchantSecretKey, opts.payload);
        // Digest header carries the "SHA-256=" prefix for HTTP signature.
        headerParams['digest'] = Constants.SIGNATURE_ALGORITHAM + opts.rawDigest;
    } else {
        signature = this.getHttpSignature(opts.resource, opts.method, opts.merchantKeyId, opts.requestHost, opts.merchantId, opts.merchantSecretKey);
    }
    headerParams['date'] = opts.date;
    headerParams['host'] = opts.requestHost;
    headerParams['signature'] = signature;
    headerParams['User-Agent'] = Constants.USER_AGENT_VALUE;
};

/**
 * Applies shared-secret JWT (token) authentication headers to the request.
 * The JWT carries host / method / resource / digest as claims, so the
 * HTTP-signature-only headers (signature, host, date, User-Agent) are NOT sent.
 *
 * The raw (unprefixed) base64 digest is passed to getJWTToken so the digest claim is
 * not double-prefixed with "SHA-256=" against its separate digestAlgorithm claim.
 *
 * @param {Object} headerParams - header map to mutate
 * @param {Object} opts - {resource, method, requestHost, merchantId, isBodyMethod, rawDigest, responseMleKid}
 */
_exports.prototype.applyJwtHeaders = function (headerParams, opts) {
    var jwtToken;
    if (opts.isBodyMethod) {
        jwtToken = this.getJWTToken(opts.resource, opts.method, opts.merchantId, opts.rawDigest, opts.requestHost, opts.responseMleKid);
    } else {
        jwtToken = this.getJWTToken(opts.resource, opts.method, opts.merchantId, null, opts.requestHost, opts.responseMleKid);
    }
    headerParams['Authorization'] = 'Bearer ' + jwtToken;
};

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

_exports.prototype.callApi = function (path, httpMethod, pathParams, queryParams, headerParams, formParams, bodyParam, authNames, contentTypes, accepts, returnType, callback, isMLESupportedByCybsForApi) {
    var Constants = require('../apiClient/constants');

    // requestHost is the API host. basePath is the credential URL with no path component,
    // so the remainder after "//" is the host for both auth mechanisms.
    var requestHost = this.basePath.substr(this.basePath.indexOf("//") + 2);

    var method = httpMethod.toLowerCase();
    var merchantId = this.merchantConfig.getMerchantID();

    // Response MLE runs on an MLE-capable endpoint only when MLE is switched on
    // (VisaAcceptance_MLEEnabled — the master switch covering both directions) AND the response
    // private key alias is set. Leaving the kid null both suppresses the v-c-response-mle-kid
    // claim and skips response decryption, so a disabled flag means the gateway is never asked to
    // encrypt in the first place. Derivation failure only disables response MLE — it must never
    // fail the payment.
    var responseMleKid = null;
    if (isMLESupportedByCybsForApi == true
        && configObject.mleEnabled
        && !empty(configObject.responseMlePrivateKeyAlias)) {
        try {
            // Gated on the RESPONSE private key alias ALONE, and the kid is derived from that very
            // keystore entry. That entry holds the private key the reply is decrypted with, so
            // deriving from it means we only ever ask the gateway to encrypt a response we can
            // actually decrypt, and an unresolvable alias fails here rather than at decrypt time.
            //
            // Deliberately NOT tied to the request-MLE IMPEX bundle: that file supplies public
            // certificates only. A kid taken from it would make the gateway encrypt a reply we
            // hold no private key for, leaving the response unreadable.
            //
            // For a meta (portfolio/account) key, the Response MLE P12's CN is the portfolio
            // owner MID, not the child transacting MID — mirrors the iss/v-c-merchant-id handling
            // in getJWTToken/getHttpSignature above.
            var expectedMerchantId = (configObject.metaKeyEnabled && configObject.metaKeyMerchantId) ? configObject.metaKeyMerchantId : merchantId;
            responseMleKid = require('*/cartridge/scripts/helpers/certHelper')
                .getKidFromAlias(configObject.responseMlePrivateKeyAlias, expectedMerchantId) || null;
        } catch (kidErr) {
            require('dw/system/Logger').getLogger('VisaAcceptance', 'mle').warn(
                'Response MLE disabled for {0}: could not derive v-c-response-mle-kid from alias "{1}" ({2}).',
                path, configObject.responseMlePrivateKeyAlias, (kidErr && kidErr.message) || kidErr);
            responseMleKid = null;
        }
    }

    var url = this.buildUrl(path, pathParams, queryParams);
    var resource = url.substr(this.basePath.length);
    var contentType = contentTypes.join(';');
    var acceptType = accepts.join(';');

    var payload = "";
    var rawDigest = null;
    var isBodyMethod = (method === 'post' || method === 'patch' || method === 'put');

    if (isBodyMethod) {
        if (typeof bodyParam === 'string') {
            bodyParam = JSON.parse(bodyParam);
        }

        // UC V1 Sessions API (/uc/v1/sessions) does not support clientReferenceInformation
        // Skip adding partner/solution info for this endpoint per UC V1 API Contract
        var isUcV1SessionsApi = path === '/uc/v1/sessions';

        // adding solution id to all post calls (except UC V1 Sessions which doesn't support it)
        if (!isUcV1SessionsApi) {
            if (!bodyParam.clientReferenceInformation) {
                bodyParam.clientReferenceInformation = {};
            }
            if (path === '/up/v1/capture-contexts') {
                bodyParam.clientReferenceInformation.code = '102';
            } else {
                bodyParam.clientReferenceInformation.applicationName = Constants.APPLICATION_NAME;
                bodyParam.clientReferenceInformation.applicationVersion = Constants.APPLICATION_VERSION;
                bodyParam.clientReferenceInformation.partner = {
                    solutionId: this.merchantConfig.getSolutionId()
                }
            }
        }
        payload = JSON.stringify(bodyParam);

        // Request MLE runs on an MLE-capable endpoint when MLE is switched on
        // (VisaAcceptance_MLEEnabled) and a request-MLE certificate source is configured — the
        // keystore alias (preferred) or the IMPEX .p12 bundle; jweEncrypt picks between them and
        // derives the kid from whichever certificate it uses. With MLE on but neither source
        // configured we log and abort rather than send an unencrypted request; with MLE off the
        // payload is sent as-is, which is why the flag defaults to on.
        if (isMLESupportedByCybsForApi == true && configObject.mleEnabled) {
            if (!empty(configObject.requestMleCertificateAlias) || !empty(configObject.requestMleP12ImpexPath)) {
                var encryptPayload = require('*/cartridge/scripts/mle/jweEncrypt.js');
                payload = encryptPayload.getJWE(payload);
            } else {
                var mleErrorMessage = 'MLE required for ' + path + ' but neither VisaAcceptance_RequestMLECertificateAlias nor VisaAcceptance_RequestMLEP12ImpexPath is set. Aborting request.';
                require('dw/system/Logger').getLogger('VisaAcceptance', 'mle').error(mleErrorMessage);
                throw new Error(mleErrorMessage);
            }
        }
        // Unprefixed base64 SHA-256 digest of the (possibly MLE-encrypted) payload.
        // HTTP signature adds the "SHA-256=" prefix for its digest header; JWT uses the
        // raw value in its digest claim.
        rawDigest = this.generateDigest(payload);
    }

    // Every endpoint authenticates with shared-secret JWT. (applyHttpSignatureHeaders/getHttpSignature are retained as the
    // HTTP-signature implementation but are no longer used by any endpoint.)
    this.applyJwtHeaders(headerParams, {
        resource: resource,
        method: method,
        requestHost: requestHost,
        merchantId: merchantId,
        isBodyMethod: isBodyMethod,
        rawDigest: rawDigest,
        responseMleKid: responseMleKid
    });

    // Common headers for both mechanisms.
    headerParams['v-c-merchant-id'] = merchantId;
    headerParams['Content-Type'] = contentType;
    headerParams['Accept'] = acceptType;

    // Set header parameters
    var normalizedHeaders = this.normalizeParams(headerParams);

    // Calling service.
    if (isBodyMethod) {
        var response = this.createService().call(url, normalizedHeaders, method, payload);
    } else {
        var response = this.createService().call(url, normalizedHeaders, method);
    }

    if (response.ok) {
        var responseObj = response.object;
        // MLE response decryption: when we asked the gateway to encrypt the response
        // (v-c-response-mle-kid was sent), unwrap {"encryptedResponse": "<JWE>"} back to the
        // plaintext payload BEFORE the JSON-vs-JWT branch below. decryptResponse is a no-op
        // passthrough when the body is not MLE-wrapped, so this is safe for any response shape.
        if (responseMleKid) {
            var decryptResponse = require('*/cartridge/scripts/mle/jweDecrypt.js').decryptResponse;
            responseObj = decryptResponse(responseObj);
        }
        // These endpoints return JWT strings, not JSON - skip JSON.parse
        if (path === '/microform/v2/sessions' || path === '/up/v1/capture-contexts' || path === '/uc/v1/sessions') {
            callback(responseObj, false, response);
        } else {
            callback(JSON.parse(responseObj), false, response);
        }
    } else {
        callback(response.errorMessage, response.error, response);
    }
};

module.exports = {
    instance: new _exports()
};
 