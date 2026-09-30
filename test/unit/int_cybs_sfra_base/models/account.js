'use strict';

var assert = require('chai').assert;
var Module = require('module');
var fs = require('fs');
var path = require('path');

var MODEL_PATH = '../../../../cartridges/int_cybs_sfra_base/cartridge/models/account.js';

/**
 * Loads a cartridge module that relies on `module.superModule`, injecting both the
 * super module and a set of require() stubs. proxyquire cannot set superModule, so we
 * compile the module manually with our own require shim.
 * @param {string} relativeFile - path to the module, relative to this test file
 * @param {Object} superModule - value to expose as module.superModule
 * @param {Object} stubs - map of require-id -> stub
 * @returns {*} the module's exports
 */
function loadModuleWithSuper(relativeFile, superModule, stubs) {
    var resolved = path.resolve(__dirname, relativeFile);
    var src = fs.readFileSync(resolved, 'utf8');
    var m = new Module(resolved, module);
    m.filename = resolved;
    m.paths = Module._nodeModulePaths(path.dirname(resolved));
    m.superModule = superModule;
    var realRequire = m.require.bind(m);
    m.require = function (request) {
        if (stubs && Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return realRequire(request);
    };
    m._compile(src, resolved);
    return m.exports;
}

// Stub constructor used for the `currentCustomer instanceof Customer` branch.
function CustomerStub() {}

// Faithful-but-minimal stand-in for the SFRA base account model.
function BaseAccount(currentCustomer) {
    var pis = currentCustomer.profile && currentCustomer.profile.wallet
        ? currentCustomer.profile.wallet.paymentInstruments.toArray()
        : (currentCustomer.wallet ? currentCustomer.wallet.paymentInstruments : null);
    this.customerPaymentInstruments = pis
        ? pis.map(function (it) { return { UUID: it.UUID, creditCardType: it.creditCardType }; })
        : null;
}
BaseAccount.getCustomerPaymentInstruments = function (list) {
    return list.map(function (it) { return { UUID: it.UUID }; });
};

var Account = loadModuleWithSuper(MODEL_PATH, BaseAccount, {
    'dw/customer/Customer': CustomerStub
});

describe('int_cybs_sfra_base/models/account (default-card decoration)', function () {
    describe('constructor (request-wrapped customer / checkout path)', function () {
        it('flags the default card and sorts it first', function () {
            var currentCustomer = {
                wallet: {
                    paymentInstruments: [
                        { UUID: 'u1', creditCardType: 'Visa', raw: { custom: { isDefault: false } } },
                        { UUID: 'u2', creditCardType: 'Amex', raw: { custom: { isDefault: true } } },
                        { UUID: 'u3', creditCardType: 'Master', raw: { custom: {} } }
                    ]
                }
            };

            var model = new Account(currentCustomer, null, null);
            var cards = model.customerPaymentInstruments;

            assert.equal(cards.length, 3);
            assert.equal(cards[0].UUID, 'u2', 'default card should be first');
            assert.isTrue(cards[0].isDefault);
            assert.isFalse(cards[1].isDefault);
            assert.isFalse(cards[2].isDefault);
        });

        it('leaves order unchanged and flags nothing when no card is default', function () {
            var currentCustomer = {
                wallet: {
                    paymentInstruments: [
                        { UUID: 'u1', creditCardType: 'Visa', raw: { custom: { isDefault: false } } },
                        { UUID: 'u2', creditCardType: 'Amex', raw: { custom: { isDefault: false } } }
                    ]
                }
            };

            var model = new Account(currentCustomer, null, null);

            assert.equal(model.customerPaymentInstruments[0].UUID, 'u1');
            assert.isFalse(model.customerPaymentInstruments[0].isDefault);
            assert.isFalse(model.customerPaymentInstruments[1].isDefault);
        });

        it('does not crash when the customer has no saved cards', function () {
            var model = new Account({ wallet: { paymentInstruments: [] } }, null, null);
            assert.deepEqual(model.customerPaymentInstruments, []);
        });

        it('does not crash when the customer has no wallet', function () {
            var model = new Account({}, null, null);
            assert.isNull(model.customerPaymentInstruments);
        });
    });

    describe('constructor (global Customer / instanceof path)', function () {
        it('reads custom.isDefault directly from raw instruments and sorts default first', function () {
            var currentCustomer = new CustomerStub();
            currentCustomer.profile = {
                wallet: {
                    paymentInstruments: {
                        toArray: function () {
                            return [
                                { UUID: 'x', custom: { isDefault: false } },
                                { UUID: 'y', custom: { isDefault: true } }
                            ];
                        }
                    }
                }
            };

            var model = new Account(currentCustomer, null, null);

            assert.equal(model.customerPaymentInstruments[0].UUID, 'y');
            assert.isTrue(model.customerPaymentInstruments[0].isDefault);
            assert.isFalse(model.customerPaymentInstruments[1].isDefault);
        });
    });

    describe('static getCustomerPaymentInstruments', function () {
        it('decorates and sorts the default card first', function () {
            var list = [
                { UUID: 'a', raw: { custom: { isDefault: false } } },
                { UUID: 'b', raw: { custom: { isDefault: true } } }
            ];

            var result = Account.getCustomerPaymentInstruments(list);

            assert.equal(result[0].UUID, 'b');
            assert.isTrue(result[0].isDefault);
            assert.isFalse(result[1].isDefault);
        });
    });
});
