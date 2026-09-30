'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var CONTROLLER_PATH = '../../../../cartridges/int_cybs_sfra_base/cartridge/controllers/PaymentInstruments';

/**
 * Minimal mock of the SFRA `server` module that records the last route function
 * registered under each endpoint name (across get/post/prepend/append), so the test
 * can invoke a specific route handler directly.
 * @returns {Object} server mock with a `routes` map
 */
function createServerMock() {
    var routes = {};
    function record(name, args) {
        // The route handler is always the final argument (after any middleware).
        routes[name] = args[args.length - 1];
    }
    var noop = function () {};
    return {
        routes: routes,
        extend: noop,
        prepend: function (name) { record(name, Array.prototype.slice.call(arguments, 1)); },
        append: function (name) { record(name, Array.prototype.slice.call(arguments, 1)); },
        replace: function (name) { record(name, Array.prototype.slice.call(arguments, 1)); },
        get: function (name) { record(name, Array.prototype.slice.call(arguments, 1)); },
        post: function (name) { record(name, Array.prototype.slice.call(arguments, 1)); },
        middleware: { https: noop, include: noop },
        forms: { getForm: function () { return {}; } },
        exports: function () { return {}; }
    };
}

describe('int_cybs_sfra_base/controllers/PaymentInstruments-SetDefault', function () {
    var serverMock;
    var setDefaultByUUID;
    var walletSentinel;
    var redirectedTo;

    /**
     * Loads the controller with all top-level + handler dependencies stubbed.
     * @returns {Object} the recording server mock
     */
    function loadController() {
        serverMock = createServerMock();
        walletSentinel = { id: 'wallet-sentinel' };
        setDefaultByUUID = sinon.spy();

        proxyquire(CONTROLLER_PATH, {
            server: serverMock,
            'dw/web/URLUtils': {
                url: function (endpoint) { return 'url:' + endpoint; }
            },
            '../configuration/index': {
                tokenizationEnabled: true,
                cartridgeEnabled: true,
                davEnabled: false
            },
            // Must forward like the real helper (it sets security headers then calls res.json /
            // res.render); a no-op stub silently swallows the response the assertions inspect.
            '~/cartridge/scripts/helpers/secureResponseHelper': {
                secureJsonResponse: function (res, data) { res.json(data); },
                secureRender: function (res, template, data) { res.render(template, data); }
            },
            '*/cartridge/scripts/middleware/csrf': {
                validateAjaxRequest: function () {},
                generateToken: function () {}
            },
            '*/cartridge/scripts/middleware/userLoggedIn': {
                validateLoggedIn: function () {},
                validateLoggedInAjax: function () {}
            },
            'dw/customer/CustomerMgr': {
                getCustomerByCustomerNumber: function () {
                    return {
                        getProfile: function () {
                            return { getWallet: function () { return walletSentinel; } };
                        }
                    };
                }
            },
            '~/cartridge/scripts/helpers/defaultPaymentHelper': {
                setDefaultByUUID: setDefaultByUUID,
                ensureSingleDefault: function () {},
                getCreditCardInstruments: function () { return []; }
            }
        });
        return serverMock;
    }

    /**
     * Invokes a recorded route handler, running its route:BeforeComplete listener.
     * @param {Function} handler - the route function
     * @param {Object} req - request object
     * @returns {void}
     */
    function invokeRoute(handler, req) {
        redirectedTo = null;
        var res = { redirect: function (url) { redirectedTo = url; } };
        var beforeComplete = null;
        var ctx = {
            on: function (event, cb) {
                if (event === 'route:BeforeComplete') { beforeComplete = cb; }
            }
        };
        var next = sinon.spy();
        handler.call(ctx, req, res, next);
        assert.isTrue(next.called, 'handler should call next()');
        assert.isFunction(beforeComplete, 'handler should register a route:BeforeComplete listener');
        beforeComplete();
    }

    it('registers the SetDefault route', function () {
        var server = loadController();
        assert.isFunction(server.routes.SetDefault, 'SetDefault should be registered');
    });

    it('sets the chosen card as default and redirects to the list', function () {
        var server = loadController();
        invokeRoute(server.routes.SetDefault, {
            querystring: { UUID: 'uuid-2' },
            currentCustomer: { profile: { customerNo: '00012345' } }
        });

        assert.isTrue(setDefaultByUUID.calledOnce, 'setDefaultByUUID should be called once');
        assert.strictEqual(setDefaultByUUID.firstCall.args[0], walletSentinel, 'should pass the customer wallet');
        assert.strictEqual(setDefaultByUUID.firstCall.args[1], 'uuid-2', 'should pass the selected UUID');
        assert.equal(redirectedTo, 'url:PaymentInstruments-List');
    });

    it('does not set a default when no UUID is supplied, but still redirects', function () {
        var server = loadController();
        invokeRoute(server.routes.SetDefault, {
            querystring: {},
            currentCustomer: { profile: { customerNo: '00012345' } }
        });

        assert.isFalse(setDefaultByUUID.called, 'setDefaultByUUID should not be called without a UUID');
        assert.equal(redirectedTo, 'url:PaymentInstruments-List');
    });
});

describe('int_cybs_sfra_base/controllers/PaymentInstruments-DeletePayment', function () {
    var removedInstrument;
    var ensureSingleDefaultCalled;

    /**
     * Builds a fake credit-card instrument.
     * @param {string} uuid - the instrument UUID
     * @param {boolean} isDefault - whether it is flagged as the default card
     * @returns {Object} a minimal CustomerPaymentInstrument stub
     */
    function makeCard(uuid, isDefault) {
        return {
            UUID: uuid,
            _isDefault: isDefault,
            getCreditCardToken: function () { return 'ii-' + uuid + '-pi-' + uuid + '-flex'; }
        };
    }

    /**
     * Loads the controller with the DeletePayment handler's dependencies stubbed.
     * @param {Array<Object>} cards - the saved cards in the wallet
     * @returns {Object} the recording server mock
     */
    function loadController(cards) {
        var serverMock = createServerMock();
        removedInstrument = null;
        ensureSingleDefaultCalled = false;

        var wallet = {
            getPaymentInstruments: function () { return { length: cards.length }; },
            removePaymentInstrument: function (pi) { removedInstrument = pi; }
        };

        proxyquire(CONTROLLER_PATH, {
            server: serverMock,
            'dw/web/URLUtils': { url: function (endpoint) { return 'url:' + endpoint; } },
            '../configuration/index': { tokenizationEnabled: true, cartridgeEnabled: true, davEnabled: false },
            '~/cartridge/scripts/helpers/secureResponseHelper': {
                secureJsonResponse: function (res, data) { res.json(data); },
                secureRender: function (res, template, data) { res.render(template, data); }
            },
            '*/cartridge/scripts/middleware/csrf': { validateAjaxRequest: function () {}, generateToken: function () {} },
            '*/cartridge/scripts/middleware/userLoggedIn': { validateLoggedIn: function () {}, validateLoggedInAjax: function () {} },
            'dw/customer/CustomerMgr': {
                getCustomerByCustomerNumber: function () {
                    return {
                        profile: {},
                        getProfile: function () {
                            return { getWallet: function () { return wallet; }, custom: { customerID: 'cust-1' } };
                        }
                    };
                }
            },
            'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
            'dw/web/Resource': { msg: function (key) { return key; } },
            'dw/system/Logger': { getLogger: function () { return { warn: function () {}, info: function () {}, error: function () {} }; } },
            '*/cartridge/scripts/helpers/accountHelpers': { sendAccountEditedEmail: function () {} },
            '../scripts/http/tokenManagement': { httpDeleteCustomerPaymentInstrument: function () { return true; } },
            '~/cartridge/scripts/util/mapper.js': {
                deserializeTokenInformation: function () { return { paymentInstrument: { id: 'pi-1' } }; }
            },
            '~/cartridge/scripts/helpers/defaultPaymentHelper': {
                getCreditCardInstruments: function () { return cards; },
                isDefault: function (pi) { return !!(pi && pi._isDefault); },
                ensureSingleDefault: function () { ensureSingleDefaultCalled = true; },
                setDefaultByUUID: function () {}
            }
        });
        return serverMock;
    }

    /**
     * Invokes the DeletePayment handler and returns the JSON payload it produced.
     * @param {Function} handler - the route function
     * @param {string} uuid - the UUID being deleted
     * @returns {Object} the payload passed to res.json
     */
    function invokeDelete(handler, uuid) {
        var jsonPayload = null;
        var res = {
            getViewData: function () { return { loggedin: true }; },
            json: function (payload) { jsonPayload = payload; }
        };
        var beforeComplete = null;
        var ctx = { on: function (event, cb) { if (event === 'route:BeforeComplete') { beforeComplete = cb; } } };
        var next = sinon.spy();
        handler.call(ctx, {
            querystring: { UUID: uuid },
            currentCustomer: { profile: { customerNo: '00012345' } }
        }, res, next);
        assert.isTrue(next.called, 'handler should call next()');
        if (beforeComplete) { beforeComplete(); }
        return jsonPayload;
    }

    it('blocks deleting the default card while other cards remain', function () {
        var server = loadController([makeCard('uuid-default', true), makeCard('uuid-other', false)]);
        var payload = invokeDelete(server.routes.DeletePayment, 'uuid-default');

        assert.isTrue(payload.error, 'response should signal an error');
        assert.isTrue(payload.defaultCard, 'response should flag the default-card block');
        assert.isNull(removedInstrument, 'the card must not be removed from the wallet');
    });

    it('deletes a non-default card and keeps a single default', function () {
        var server = loadController([makeCard('uuid-default', true), makeCard('uuid-other', false)]);
        var payload = invokeDelete(server.routes.DeletePayment, 'uuid-other');

        assert.isNotNull(removedInstrument, 'the card should be removed from the wallet');
        assert.strictEqual(removedInstrument.UUID, 'uuid-other');
        assert.isTrue(ensureSingleDefaultCalled, 'ensureSingleDefault should run after delete');
        assert.strictEqual(payload.UUID, 'uuid-other');
    });

    it('allows deleting the default card when it is the only card', function () {
        var server = loadController([makeCard('uuid-only', true)]);
        var payload = invokeDelete(server.routes.DeletePayment, 'uuid-only');

        assert.isNotNull(removedInstrument, 'the only card should be removable even if default');
        assert.strictEqual(removedInstrument.UUID, 'uuid-only');
        assert.isUndefined(payload.error, 'no error should be returned');
    });
});
