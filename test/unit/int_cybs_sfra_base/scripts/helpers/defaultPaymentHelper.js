'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var defaultPaymentHelper = proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/defaultPaymentHelper', {
    'dw/system/Transaction': {
        wrap: function (callback) {
            return callback();
        }
    },
    'dw/order/PaymentInstrument': {
        METHOD_CREDIT_CARD: 'CREDIT_CARD'
    }
});

/**
 * Builds a fake CustomerPaymentInstrument.
 * @param {string} uuid - the card UUID
 * @param {boolean} isDefault - initial default flag
 * @returns {Object} fake payment instrument
 */
function createCard(uuid, isDefault) {
    return {
        UUID: uuid,
        custom: {
            isDefault: isDefault || false
        }
    };
}

/**
 * Builds a fake wallet whose getPaymentInstruments(method) returns the given cards.
 * @param {Array} cards - fake credit-card instruments
 * @returns {Object} fake wallet
 */
function createWallet(cards) {
    return {
        getPaymentInstruments: function (method) {
            assert.equal(method, 'CREDIT_CARD', 'should request only credit-card instruments');
            return {
                toArray: function () {
                    return cards;
                }
            };
        }
    };
}

describe('defaultPaymentHelper', function () {
    describe('getCreditCardInstruments', function () {
        it('returns an empty array when the wallet is null', function () {
            assert.deepEqual(defaultPaymentHelper.getCreditCardInstruments(null), []);
        });

        it('returns the credit-card instruments from the wallet', function () {
            var cards = [createCard('uuid-1'), createCard('uuid-2')];
            assert.equal(defaultPaymentHelper.getCreditCardInstruments(createWallet(cards)).length, 2);
        });
    });

    describe('isDefault', function () {
        it('is true when the card is flagged as default', function () {
            assert.isTrue(defaultPaymentHelper.isDefault(createCard('uuid-1', true)));
        });

        it('is false when the card is not flagged', function () {
            assert.isFalse(defaultPaymentHelper.isDefault(createCard('uuid-1', false)));
        });

        it('is false for a null instrument', function () {
            assert.isFalse(defaultPaymentHelper.isDefault(null));
        });

        it('is false when custom.isDefault was never set', function () {
            assert.isFalse(defaultPaymentHelper.isDefault({ UUID: 'uuid-1', custom: {} }));
        });
    });

    describe('setDefaultByUUID', function () {
        it('flags the matching card and clears every other card', function () {
            var cards = [createCard('uuid-1', true), createCard('uuid-2', false), createCard('uuid-3', false)];
            var result = defaultPaymentHelper.setDefaultByUUID(createWallet(cards), 'uuid-2');

            assert.isTrue(result);
            assert.isFalse(cards[0].custom.isDefault);
            assert.isTrue(cards[1].custom.isDefault);
            assert.isFalse(cards[2].custom.isDefault);
        });

        it('returns false and changes nothing when the UUID is not found', function () {
            var cards = [createCard('uuid-1', true)];
            var result = defaultPaymentHelper.setDefaultByUUID(createWallet(cards), 'nope');

            assert.isFalse(result);
            // The non-matching card is cleared because exactly-one-default is enforced.
            assert.isFalse(cards[0].custom.isDefault);
        });

        it('returns false when there are no saved cards', function () {
            assert.isFalse(defaultPaymentHelper.setDefaultByUUID(createWallet([]), 'uuid-1'));
        });

        it('returns false when no UUID is supplied', function () {
            var cards = [createCard('uuid-1', true)];
            assert.isFalse(defaultPaymentHelper.setDefaultByUUID(createWallet(cards), null));
        });
    });

    describe('getDefaultUUID', function () {
        it('returns the UUID of the flagged default card', function () {
            var cards = [createCard('uuid-1', false), createCard('uuid-2', true)];
            assert.equal(defaultPaymentHelper.getDefaultUUID(createWallet(cards)), 'uuid-2');
        });

        it('falls back to the first card when none is flagged', function () {
            var cards = [createCard('uuid-1', false), createCard('uuid-2', false)];
            assert.equal(defaultPaymentHelper.getDefaultUUID(createWallet(cards)), 'uuid-1');
        });

        it('returns null when there are no saved cards', function () {
            assert.isNull(defaultPaymentHelper.getDefaultUUID(createWallet([])));
        });
    });

    describe('ensureSingleDefault', function () {
        it('leaves a single flagged default untouched', function () {
            var cards = [createCard('uuid-1', true), createCard('uuid-2', false)];
            defaultPaymentHelper.ensureSingleDefault(createWallet(cards));

            assert.isTrue(cards[0].custom.isDefault);
            assert.isFalse(cards[1].custom.isDefault);
        });

        it('promotes the first card when none is flagged', function () {
            var cards = [createCard('uuid-1', false), createCard('uuid-2', false)];
            defaultPaymentHelper.ensureSingleDefault(createWallet(cards));

            assert.isTrue(cards[0].custom.isDefault);
            assert.isFalse(cards[1].custom.isDefault);
        });

        it('keeps the first flagged card and clears duplicate defaults', function () {
            var cards = [createCard('uuid-1', true), createCard('uuid-2', true), createCard('uuid-3', false)];
            defaultPaymentHelper.ensureSingleDefault(createWallet(cards));

            assert.isTrue(cards[0].custom.isDefault);
            assert.isFalse(cards[1].custom.isDefault);
            assert.isFalse(cards[2].custom.isDefault);
        });

        it('does nothing when there are no saved cards', function () {
            // Should not throw.
            defaultPaymentHelper.ensureSingleDefault(createWallet([]));
        });
    });
});
