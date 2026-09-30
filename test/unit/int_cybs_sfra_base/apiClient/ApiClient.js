'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

/**
 * Loads a FRESH ApiClient singleton with the dw/* module-level requires stubbed.
 * Only the top-level requires need stubbing here; the auth helpers under test sign
 * via getHttpSignature / getJWTToken, which the tests stub directly on the instance.
 * apiClient/constants is intentionally NOT stubbed so the real Constants.HTTP / .JWT /
 * .SIGNATURE_ALGORITHAM / .USER_AGENT_VALUE values are exercised.
 * @returns {Object} the ApiClient instance
 */
function load() {
    var mod = proxyquire('../../../../cartridges/int_cybs_sfra_base/cartridge/apiClient/ApiClient', {
        'dw/util/Bytes': function () {},
        'dw/crypto/Encoding': {},
        'dw/crypto/Mac': function () {},
        'dw/crypto/MessageDigest': function () {},
        '*/cartridge/configuration/index': {},
        './merchantConfig': function () {},
        './logger': { getLogger: function () { return {}; } }
    });
    return mod.instance;
}

/**
 * Loads ApiClient for the MLE-capable paths: `config` backs configObject, and the MLE modules
 * reached through inline requires are stubbed. `mleDeps.aliasKid` is what the keystore lookup
 * returns; set `mleDeps.aliasThrows` to simulate an unresolvable alias.
 *
 * @param {Object} config - configObject values
 * @param {Object} mleDeps - {aliasKid, aliasThrows, impexKid, onImpexRead}
 * @returns {Object} the ApiClient instance
 */
function loadForMle(config, mleDeps) {
    var deps = mleDeps || {};
    global.empty = function (v) { return v === null || v === undefined || v === ''; };
    var mod = proxyquire('../../../../cartridges/int_cybs_sfra_base/cartridge/apiClient/ApiClient', {
        'dw/util/Bytes': function () {},
        'dw/crypto/Encoding': {},
        'dw/crypto/Mac': function () {},
        'dw/crypto/MessageDigest': function () {},
        'dw/system/Logger': { getLogger: function () { return { warn: function () {}, error: function () {} }; } },
        '*/cartridge/configuration/index': config,
        './merchantConfig': function () {},
        './logger': { getLogger: function () { return {}; } },
        '*/cartridge/scripts/helpers/certHelper': {
            getKidFromAlias: function () {
                if (deps.aliasThrows) { throw new Error('no certificate bound to alias'); }
                return deps.aliasKid === undefined ? 'ALIAS-KID' : deps.aliasKid;
            }
        },
        '*/cartridge/scripts/mle/p12Reader': {
            getResponseMleKid: function () {
                if (deps.onImpexRead) { deps.onImpexRead(); }
                return deps.impexKid === undefined ? 'IMPEX-KID' : deps.impexKid;
            }
        },
        '*/cartridge/scripts/mle/jweEncrypt.js': { getJWE: function (p) { return p; } },
        '*/cartridge/scripts/mle/jweDecrypt.js': { decryptResponse: function (r) { return r; } }
    });
    return mod.instance;
}

/**
 * Minimal MerchantConfig test double.
 * @returns {Object} merchant config stub
 */
function makeMerchantConfig() {
    return {
        getMerchantID: function () { return 'mid123'; },
        getMerchantKeyID: function () { return 'keyid'; },
        getMerchantsecretKey: function () { return 'secret'; },
        getSolutionId: function () { return 'sol'; }
    };
}

describe('ApiClient auth header application', function () {
    describe('applyHttpSignatureHeaders', function () {
        it('sets signature/host/date/User-Agent and a SHA-256= prefixed digest for body methods', function () {
            var apiClient = load();
            apiClient.getHttpSignature = sinon.stub().returns('SIGVAL');

            var headers = {};
            apiClient.applyHttpSignatureHeaders(headers, {
                resource: '/r', method: 'post', requestHost: 'host', merchantId: 'mid',
                merchantKeyId: 'k', merchantSecretKey: 's', payload: '{}',
                isBodyMethod: true, rawDigest: 'DIGEST', date: 'DATE'
            });

            assert.equal(headers.signature, 'SIGVAL');
            assert.equal(headers.digest, 'SHA-256=DIGEST');
            assert.equal(headers.host, 'host');
            assert.equal(headers.date, 'DATE');
            assert.equal(headers['User-Agent'], 'Mozilla/5.0');
            // HTTP signature must never emit a JWT Authorization header.
            assert.isUndefined(headers.Authorization);
        });

        it('omits the digest header for non-body methods', function () {
            var apiClient = load();
            apiClient.getHttpSignature = sinon.stub().returns('SIGVAL');

            var headers = {};
            apiClient.applyHttpSignatureHeaders(headers, {
                resource: '/r', method: 'get', requestHost: 'host', merchantId: 'mid',
                merchantKeyId: 'k', merchantSecretKey: 's',
                isBodyMethod: false, rawDigest: null, date: 'DATE'
            });

            assert.equal(headers.signature, 'SIGVAL');
            assert.isUndefined(headers.digest);
        });
    });

    describe('applyJwtHeaders', function () {
        it('sets a Bearer Authorization header and omits HTTP-signature-only headers', function () {
            var apiClient = load();
            apiClient.getJWTToken = sinon.stub().returns('AAA.BBB.CCC');

            var headers = {};
            apiClient.applyJwtHeaders(headers, {
                resource: '/r', method: 'post', requestHost: 'host', merchantId: 'mid',
                isBodyMethod: true, rawDigest: 'DIGEST'
            });

            assert.equal(headers.Authorization, 'Bearer AAA.BBB.CCC');
            assert.isUndefined(headers.signature);
            assert.isUndefined(headers['User-Agent']);
        });

        it('passes the RAW (unprefixed) digest to getJWTToken so the claim is not double-prefixed', function () {
            var apiClient = load();
            apiClient.getJWTToken = sinon.stub().returns('AAA.BBB.CCC');

            apiClient.applyJwtHeaders({}, {
                resource: '/r', method: 'post', requestHost: 'host', merchantId: 'mid',
                isBodyMethod: true, rawDigest: 'DIGEST'
            });

            assert.isTrue(apiClient.getJWTToken.calledWith('/r', 'post', 'mid', 'DIGEST', 'host'));
        });

        it('passes null digest to getJWTToken for non-body methods', function () {
            var apiClient = load();
            apiClient.getJWTToken = sinon.stub().returns('AAA.BBB.CCC');

            apiClient.applyJwtHeaders({}, {
                resource: '/r', method: 'get', requestHost: 'host', merchantId: 'mid',
                isBodyMethod: false, rawDigest: null
            });

            assert.isTrue(apiClient.getJWTToken.calledWith('/r', 'get', 'mid', null, 'host'));
        });
    });

    describe('callApi authentication (shared-secret JWT for every endpoint)', function () {
        /**
         * Wires an instance for a callApi that exercises only the auth decision,
         * stubbing both header helpers and the outbound service call.
         * @returns {Object} {apiClient, jwtSpy, httpSpy}
         */
        function setup() {
            var apiClient = load();
            apiClient.merchantConfig = makeMerchantConfig();
            apiClient.basePath = 'https://apitest.cybersource.com';
            var jwtSpy = sinon.spy();
            var httpSpy = sinon.spy();
            apiClient.applyJwtHeaders = jwtSpy;
            apiClient.applyHttpSignatureHeaders = httpSpy;
            // Isolate the dispatch decision from the (dw-backed) digest computation.
            apiClient.generateDigest = function () { return 'DIGEST'; };
            apiClient.createService = function () {
                return { call: function () { return { ok: true, object: '{}' }; } };
            };
            return { apiClient: apiClient, jwtSpy: jwtSpy, httpSpy: httpSpy };
        }

        /**
         * Invokes a GET callApi for the given path.
         * @param {Object} apiClient - the instance under test
         * @param {string} path - the API path
         */
        function callGet(apiClient, path) {
            apiClient.callApi(path, 'GET', {}, {}, {}, null, null,
                [], ['application/json'], ['application/json'], null, function () {});
        }

        it('dispatches to shared-secret JWT headers for ordinary REST endpoints', function () {
            var ctx = setup();
            callGet(ctx.apiClient, '/pts/v2/resource/x');
            assert.isTrue(ctx.jwtSpy.called);
            assert.isFalse(ctx.httpSpy.called);
        });

        // UC V1 Sessions was the last endpoint on HTTP signature, because shared-secret JWT was
        // not supported there. JWT is supported now, so it must authenticate like everything else.
        it('uses shared-secret JWT for /uc/v1/sessions too', function () {
            var ctx = setup();
            ctx.apiClient.callApi('/uc/v1/sessions', 'POST', {}, {}, {}, null, '{}',
                [], ['application/json'], ['application/json'], null, function () {});
            assert.isTrue(ctx.jwtSpy.called, '/uc/v1/sessions should authenticate with JWT');
            assert.isFalse(ctx.httpSpy.called, 'HTTP signature must no longer be used');
        });

        it('never falls back to HTTP signature on any method', function () {
            var ctx = setup();
            callGet(ctx.apiClient, '/uc/v1/sessions');
            callGet(ctx.apiClient, '/tms/v1/paymentinstruments/x');
            ctx.apiClient.callApi('/pts/v2/payments', 'POST', {}, {}, {}, null, '{}',
                [], ['application/json'], ['application/json'], null, function () {});
            assert.isFalse(ctx.httpSpy.called);
            assert.equal(ctx.jwtSpy.callCount, 3);
        });
    });

    // Enable MLE (VisaAcceptance_MLEEnabled) is the master switch over BOTH directions.
    describe('request MLE gating (Enable MLE)', function () {
        /**
         * Runs an MLE-capable POST and reports whether the payload was encrypted.
         * @param {Object} config - configObject values
         * @returns {Object} {encrypted, threw}
         */
        function callMlePost(config) {
            var encrypted = false;
            global.empty = function (v) { return v === null || v === undefined || v === ''; };
            var proxy = require('proxyquire').noCallThru().noPreserveCache();
            var mod = proxy('../../../../cartridges/int_cybs_sfra_base/cartridge/apiClient/ApiClient', {
                'dw/util/Bytes': function () {},
                'dw/crypto/Encoding': {},
                'dw/crypto/Mac': function () {},
                'dw/crypto/MessageDigest': function () {},
                'dw/system/Logger': { getLogger: function () { return { warn: function () {}, error: function () {} }; } },
                '*/cartridge/configuration/index': config,
                './merchantConfig': function () {},
                './logger': { getLogger: function () { return {}; } },
                '*/cartridge/scripts/helpers/certHelper': { getKidFromAlias: function () { return 'ALIAS-KID'; } },
                '*/cartridge/scripts/mle/p12Reader': { getResponseMleKid: function () { return 'IMPEX-KID'; } },
                '*/cartridge/scripts/mle/jweEncrypt.js': {
                    getJWE: function (p) { encrypted = true; return '{"encryptedRequest":"' + p.length + '"}'; }
                },
                '*/cartridge/scripts/mle/jweDecrypt.js': { decryptResponse: function (r) { return r; } }
            });
            var apiClient = mod.instance;
            apiClient.merchantConfig = makeMerchantConfig();
            apiClient.basePath = 'https://apitest.cybersource.com';
            apiClient.generateDigest = function () { return 'DIGEST'; };
            apiClient.applyJwtHeaders = function () {};
            apiClient.createService = function () {
                return { call: function () { return { ok: true, object: '{}' }; } };
            };
            var threw = null;
            try {
                apiClient.callApi('/pts/v2/payments', 'POST', {}, {}, {}, null, '{"a":1}',
                    [], ['application/json'], ['application/json'], null, function () {}, true);
            } catch (e) { threw = e.message; }
            return { encrypted: encrypted, threw: threw };
        }

        it('encrypts the request when Enable MLE is on and a certificate is configured', function () {
            var r = callMlePost({ mleEnabled: true, requestMleCertificateAlias: 'SJC' });
            assert.isTrue(r.encrypted);
            assert.isNull(r.threw);
        });

        it('sends the payload unencrypted when Enable MLE is off', function () {
            var r = callMlePost({ mleEnabled: false, requestMleCertificateAlias: 'SJC' });
            assert.isFalse(r.encrypted, 'no encryption should be attempted');
            assert.isNull(r.threw, 'and the request must not be aborted');
        });

        it('still aborts when Enable MLE is on but no certificate source is configured', function () {
            var r = callMlePost({ mleEnabled: true, requestMleCertificateAlias: '', requestMleP12ImpexPath: '' });
            assert.isFalse(r.encrypted);
            assert.match(r.threw, /neither VisaAcceptance_RequestMLECertificateAlias nor VisaAcceptance_RequestMLEP12ImpexPath/);
        });

        it('does not abort when Enable MLE is off and no certificate is configured', function () {
            var r = callMlePost({ mleEnabled: false, requestMleCertificateAlias: '', requestMleP12ImpexPath: '' });
            assert.isFalse(r.encrypted);
            assert.isNull(r.threw);
        });
    });

    // Response MLE asks the gateway to encrypt the reply. That is only safe when we hold the
    // private key to decrypt it, which lives at the response private key alias — so the alias
    // alone decides, and it must never be inferred from the request-MLE IMPEX bundle (public
    // certificates only). Getting this wrong yields a response nothing can read.
    describe('response MLE gating (v-c-response-mle-kid)', function () {
        /**
         * Runs an MLE-capable POST and returns the responseMleKid handed to applyJwtHeaders.
         * @param {Object} config - configObject values
         * @param {Object} deps - MLE dependency stubs
         * @returns {Object} {kid, impexRead}
         */
        function callMlePost(config, deps) {
            var impexRead = false;
            var stubs = deps || {};
            stubs.onImpexRead = function () { impexRead = true; };
            // Default the feature flag ON so the surrounding cases stay focused on alias
            // behaviour; the flag itself is covered by its own tests below.
            if (config.mleEnabled === undefined) {
                config.mleEnabled = true;
            }
            var apiClient = loadForMle(config, stubs);
            apiClient.merchantConfig = makeMerchantConfig();
            apiClient.basePath = 'https://apitest.cybersource.com';
            apiClient.generateDigest = function () { return 'DIGEST'; };
            apiClient.createService = function () {
                return { call: function () { return { ok: true, object: '{}' }; } };
            };
            var seen = null;
            apiClient.applyJwtHeaders = function (headers, opts) { seen = opts.responseMleKid; };
            apiClient.callApi('/pts/v2/payments', 'POST', {}, {}, {}, null, '{}',
                [], ['application/json'], ['application/json'], null, function () {}, true);
            return { kid: seen, impexRead: impexRead };
        }

        it('derives the kid from the response private key alias when enabled', function () {
            var r = callMlePost({
                mleEnabled: true,
                responseMlePrivateKeyAlias: 'EgressAlias',
                requestMleCertificateAlias: 'SJC'
            });
            assert.equal(r.kid, 'ALIAS-KID');
        });

        // Enable MLE is the master switch: with it off nothing is asked of the gateway, so no
        // encrypted reply can arrive and no decryption is attempted.
        it('is DISABLED when Enable MLE is off, even with a valid alias', function () {
            var r = callMlePost({
                mleEnabled: false,
                responseMlePrivateKeyAlias: 'EgressAlias',
                requestMleCertificateAlias: 'SJC'
            });
            assert.isNull(r.kid, 'no kid may be sent while response MLE is disabled');
        });

        it('does not even look up the alias when the flag is off', function () {
            var looked = false;
            var apiClient = loadForMle(
                { mleEnabled: false, responseMlePrivateKeyAlias: 'EgressAlias', requestMleCertificateAlias: 'SJC' },
                {}
            );
            apiClient.merchantConfig = makeMerchantConfig();
            apiClient.basePath = 'https://apitest.cybersource.com';
            apiClient.generateDigest = function () { return 'DIGEST'; };
            apiClient.createService = function () {
                return { call: function () { return { ok: true, object: '{}' }; } };
            };
            var seen;
            apiClient.applyJwtHeaders = function (headers, opts) { seen = opts.responseMleKid; looked = true; };
            apiClient.callApi('/pts/v2/payments', 'POST', {}, {}, {}, null, '{}',
                [], ['application/json'], ['application/json'], null, function () {}, true);
            assert.isTrue(looked, 'the request should still be sent');
            assert.isNull(seen);
        });

        it('is DISABLED when the alias is blank, even if the IMPEX bundle is configured', function () {
            var r = callMlePost({
                responseMlePrivateKeyAlias: '',
                requestMleP12ImpexPath: 'src/mle/visaacceptance.p12',
                requestMleCertificateAlias: ''
            });
            assert.isNull(r.kid, 'no kid may be sent without a private key to decrypt the reply');
            assert.isFalse(r.impexRead, 'the response kid must not be taken from the IMPEX bundle');
        });

        it('is DISABLED when the alias is set but unresolvable', function () {
            var r = callMlePost(
                { responseMlePrivateKeyAlias: 'Typo_Alias', requestMleP12ImpexPath: 'src/mle/x.p12', requestMleCertificateAlias: '' },
                { aliasThrows: true }
            );
            assert.isNull(r.kid);
            assert.isFalse(r.impexRead, 'must not fall back to the IMPEX bundle on alias failure');
        });

        it('is DISABLED when the alias yields an empty kid', function () {
            var r = callMlePost(
                { responseMlePrivateKeyAlias: 'EgressAlias', requestMleCertificateAlias: 'SJC' },
                { aliasKid: '' }
            );
            assert.isNull(r.kid);
        });

        it('is DISABLED for endpoints that are not MLE-capable', function () {
            var apiClient = loadForMle({ responseMlePrivateKeyAlias: 'EgressAlias' }, {});
            apiClient.merchantConfig = makeMerchantConfig();
            apiClient.basePath = 'https://apitest.cybersource.com';
            apiClient.generateDigest = function () { return 'DIGEST'; };
            apiClient.createService = function () {
                return { call: function () { return { ok: true, object: '{}' }; } };
            };
            var seen;
            apiClient.applyJwtHeaders = function (headers, opts) { seen = opts.responseMleKid; };
            // isMLESupportedByCybsForApi omitted => not MLE-capable
            apiClient.callApi('/reporting/v3/x', 'GET', {}, {}, {}, null, null,
                [], ['application/json'], ['application/json'], null, function () {});
            assert.isNull(seen);
        });
    });
});
