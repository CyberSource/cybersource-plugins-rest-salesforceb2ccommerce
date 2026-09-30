'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var ucPaymentHelper = proxyquire('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/ucPaymentHelper', {
    'dw/system/Transaction': {
        wrap: function (callback) { return callback(); }
    },
    'dw/system/Logger': {
        getLogger: function () {
            return { info: function () {}, warn: function () {}, error: function () {}, debug: function () {} };
        }
    },
    'dw/order/PaymentInstrument': {
        METHOD_CREDIT_CARD: 'CREDIT_CARD'
    },
    'dw/util/StringUtils': {
        // Mirror dw.util.StringUtils.decodeBase64: return the decoded bytes as a binary
        // (latin1) string so decodeJwtPayload's per-byte percent-encoding reconstructs UTF-8.
        decodeBase64: function (b64) {
            return Buffer.from(b64, 'base64').toString('latin1');
        }
    }
});

/**
 * Builds a fake transient-token JWT (header.payload.signature) whose decoded payload is
 * the given object. Only the middle segment is read by decodeJwtPayload.
 * @param {Object} payloadObj - object to encode as the JWT payload
 * @returns {string} a three-segment JWT string
 */
function jwt(payloadObj) {
    var payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    return 'header.' + payload + '.signature';
}

/**
 * Builds a fake credit-card payment instrument with the given stored token.
 * @param {string} token - creditCardToken value
 * @returns {Object} fake instrument
 */
function card(token) {
    return { creditCardToken: token };
}

/**
 * Builds a fake wallet whose getPaymentInstruments() returns the given cards.
 * @param {Array} cards - fake instruments
 * @returns {Object} fake wallet
 */
function wallet(cards) {
    return {
        getPaymentInstruments: function () {
            return { toArray: function () { return cards; } };
        }
    };
}

describe('ucPaymentHelper.findCreditCardByInstrumentIdentifier', function () {
    it('matches the card whose token first segment equals the instrumentIdentifier', function () {
        var iid = '7010000000000000001';
        var match = card(iid + '-9999-flex-CUST1');
        var other = card('7020000000000000002-8888-flex-CUST1');
        var result = ucPaymentHelper.findCreditCardByInstrumentIdentifier(wallet([other, match]), iid);
        assert.strictEqual(result, match);
    });

    it('returns null when no card matches', function () {
        var result = ucPaymentHelper.findCreditCardByInstrumentIdentifier(
            wallet([card('A-1-flex'), card('B-2-flex')]),
            'C'
        );
        assert.isNull(result);
    });

    it('does not match when the instrumentIdentifier is only a prefix of the token segment', function () {
        // '123' must NOT match a card whose identifier is '1234'.
        var result = ucPaymentHelper.findCreditCardByInstrumentIdentifier(
            wallet([card('1234-55-flex')]),
            '123'
        );
        assert.isNull(result);
    });

    it('skips cards that have no stored token', function () {
        var match = card('IID-1-flex');
        var result = ucPaymentHelper.findCreditCardByInstrumentIdentifier(
            wallet([card(null), match]),
            'IID'
        );
        assert.strictEqual(result, match);
    });

    it('returns null for a null wallet', function () {
        assert.isNull(ucPaymentHelper.findCreditCardByInstrumentIdentifier(null, 'IID'));
    });

    it('returns null when no instrumentIdentifier is supplied', function () {
        assert.isNull(ucPaymentHelper.findCreditCardByInstrumentIdentifier(wallet([card('IID-1-flex')]), null));
    });
});

describe('ucPaymentHelper.didConsumerOptToSaveCard', function () {
    it('returns true when the transient token saveCard preference is exactly true', function () {
        var token = jwt({ metadata: { consumerPreference: { saveCard: true }, paymentType: 'PANENTRY' } });
        assert.isTrue(ucPaymentHelper.didConsumerOptToSaveCard(token));
    });

    it('returns false when saveCard is false', function () {
        var token = jwt({ metadata: { consumerPreference: { saveCard: false }, paymentType: 'PANENTRY' } });
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(token));
    });

    it('returns false when consumerPreference is absent', function () {
        var token = jwt({ metadata: { paymentType: 'PANENTRY' } });
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(token));
    });

    it('returns false for a truthy-but-not-boolean saveCard value', function () {
        var token = jwt({ metadata: { consumerPreference: { saveCard: 'true' } } });
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(token));
    });

    it('returns false for an empty or missing transient token', function () {
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(''));
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(null));
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard(undefined));
    });

    it('returns false for a malformed token that cannot be decoded', function () {
        assert.isFalse(ucPaymentHelper.didConsumerOptToSaveCard('not-a-jwt'));
    });
});

/**
 * Builds a fake CustomerPaymentInstrument with working getters/setters.
 * @param {Object} props - initial field values
 * @returns {Object} fake instrument
 */
function makePI(props) {
    var p = props || {};
    return {
        UUID: p.UUID || 'pi-uuid',
        creditCardToken: p.token || null,
        creditCardHolder: p.holder,
        creditCardType: p.type,
        maskedCreditCardNumber: p.masked,
        creditCardExpirationMonth: p.expMonth,
        creditCardExpirationYear: p.expYear,
        custom: p.custom || {},
        setCreditCardHolder: function (v) { this.creditCardHolder = v; },
        setCreditCardType: function (v) { this.creditCardType = v; },
        setCreditCardNumber: function (v) { this.maskedCreditCardNumber = v; },
        setCreditCardExpirationMonth: function (v) { this.creditCardExpirationMonth = v; },
        setCreditCardExpirationYear: function (v) { this.creditCardExpirationYear = v; },
        setCreditCardToken: function (v) { this.creditCardToken = v; }
    };
}

/**
 * Builds a mutable fake wallet that supports create/remove/getPaymentInstruments.
 * @param {Array} initial - starting instruments
 * @returns {Object} fake wallet exposing `_cards`
 */
function mutableWallet(initial) {
    var cards = (initial || []).slice();
    var seq = 0;
    return {
        _cards: cards,
        getPaymentInstruments: function () {
            return { toArray: function () { return cards.slice(); } };
        },
        createPaymentInstrument: function () {
            seq += 1;
            var pi = makePI({ UUID: 'created-' + seq });
            cards.push(pi);
            return pi;
        },
        removePaymentInstrument: function (pi) {
            var idx = cards.indexOf(pi);
            if (idx >= 0) { cards.splice(idx, 1); }
        }
    };
}

describe('ucPaymentHelper.upsertCreditCard', function () {
    it('creates a new card when none with the instrumentIdentifier exists', function () {
        var w = mutableWallet([]);
        var result = ucPaymentHelper.upsertCreditCard(w, 'IID-PI-flex', {
            cardHolderName: 'Jo', cardTypeName: 'Visa', maskedNumber: '**1111',
            expirationMonth: '12', expirationYear: '2030'
        }, 'IID');

        assert.isFalse(result.replacedExisting);
        assert.equal(w._cards.length, 1);
        var pi = w._cards[0];
        assert.equal(pi.creditCardToken, 'IID-PI-flex');
        assert.equal(pi.creditCardHolder, 'Jo');
        assert.equal(pi.maskedCreditCardNumber, '**1111');
        assert.equal(pi.creditCardExpirationMonth, 12);
        assert.equal(pi.creditCardExpirationYear, 2030);
    });

    it('replaces an existing card (same instrumentIdentifier) instead of duplicating, and never mutates the old one', function () {
        var existing = makePI({
            UUID: 'old', token: 'IID-OLDPI-flex', holder: 'Jo', type: 'Visa',
            masked: '**1111', expMonth: 1, expYear: 2025
        });
        // If the old (masked) instrument were mutated, this would flip — assert it does not.
        existing.setCreditCardExpirationMonth = function () { throw new Error('masked: must not mutate existing PI'); };
        var w = mutableWallet([existing]);

        var result = ucPaymentHelper.upsertCreditCard(w, 'IID-NEWPI-flex', {
            expirationMonth: '08', expirationYear: '2031'
        }, 'IID');

        assert.isTrue(result.replacedExisting);
        assert.equal(w._cards.length, 1, 'old card removed, exactly one remains');
        var pi = w._cards[0];
        assert.notEqual(pi.UUID, 'old', 'a fresh instrument replaced the masked one');
        assert.equal(pi.creditCardToken, 'IID-NEWPI-flex');
        assert.equal(pi.creditCardExpirationMonth, 8);
        assert.equal(pi.creditCardExpirationYear, 2031);
        // Missing details carried over from the replaced card.
        assert.equal(pi.creditCardHolder, 'Jo');
        assert.equal(pi.creditCardType, 'Visa');
        assert.equal(pi.maskedCreditCardNumber, '**1111');
    });

    it('preserves the default flag when replacing the default card', function () {
        var existing = makePI({ UUID: 'old', token: 'IID-OLDPI-flex', custom: { isDefault: true } });
        var w = mutableWallet([existing]);

        ucPaymentHelper.upsertCreditCard(w, 'IID-NEWPI-flex', { expirationMonth: '08', expirationYear: '2031' }, 'IID');

        assert.equal(w._cards.length, 1);
        assert.isTrue(w._cards[0].custom.isDefault, 'replacement card stays default');
    });
});

/**
 * Builds a fake dw.customer.CustomerAddress with property-style getters.
 * @param {Object} props - field overrides
 * @returns {Object} fake address
 */
function customerAddress(props) {
    return Object.assign({
        firstName: 'Jane',
        lastName: 'Doe',
        address1: '1 Market St',
        address2: 'Suite 200',
        city: 'San Francisco',
        stateCode: 'CA',
        postalCode: '94105',
        countryCode: { value: 'us' },
        phone: '4155551234'
    }, props || {});
}

describe('ucPaymentHelper.buildBillToFromCustomerAddress', function () {
    it('builds a billTo from a full address and email', function () {
        var billTo = ucPaymentHelper.buildBillToFromCustomerAddress(customerAddress(), 'jane@example.com');
        assert.deepEqual(billTo, {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            address1: '1 Market St',
            address2: 'Suite 200',
            locality: 'San Francisco',
            administrativeArea: 'CA',
            postalCode: '94105',
            country: 'US',
            phoneNumber: '4155551234'
        });
    });

    it('returns null when no address is supplied', function () {
        assert.isNull(ucPaymentHelper.buildBillToFromCustomerAddress(null, 'jane@example.com'));
    });

    it('uppercases the country code', function () {
        var billTo = ucPaymentHelper.buildBillToFromCustomerAddress(customerAddress({ countryCode: { value: 'gb' } }), '');
        assert.strictEqual(billTo.country, 'GB');
    });

    it('defaults missing fields to empty strings', function () {
        var billTo = ucPaymentHelper.buildBillToFromCustomerAddress({}, undefined);
        assert.deepEqual(billTo, {
            firstName: '', lastName: '', email: '', address1: '', address2: '',
            locality: '', administrativeArea: '', postalCode: '', country: '', phoneNumber: ''
        });
    });

    it('returns empty country when countryCode value is falsy', function () {
        var billTo = ucPaymentHelper.buildBillToFromCustomerAddress(customerAddress({ countryCode: { value: '' } }), '');
        assert.strictEqual(billTo.country, '');
    });
});

describe('ucPaymentHelper.buildCardHolderName', function () {
    it('joins first and last name', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName({ firstName: 'Jane', lastName: 'Doe' }), 'Jane Doe');
    });

    it('returns just the first name when last name is missing', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName({ firstName: 'Jane' }), 'Jane');
    });

    it('returns just the last name when first name is missing', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName({ lastName: 'Doe' }), 'Doe');
    });

    it('trims surrounding whitespace when one name is empty', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName({ firstName: '', lastName: 'Doe' }), 'Doe');
    });

    it('returns empty string for an empty billTo', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName({}), '');
    });

    it('returns empty string for a null billTo', function () {
        assert.strictEqual(ucPaymentHelper.buildCardHolderName(null), '');
    });
});

describe('ucPaymentHelper.mapUcBillToToSfccAddress', function () {
    var ucBillTo = {
        firstName: 'Jane',
        lastName: 'Doe',
        address1: '1 Market St',
        address2: 'Suite 200',
        locality: 'San Francisco',
        administrativeArea: 'CA',
        postalCode: '94105',
        country: 'US',
        phoneNumber: '4155551234',
        email: 'jane@example.com'
    };

    it('maps UC billTo field names to the SFCC address shape', function () {
        assert.deepEqual(ucPaymentHelper.mapUcBillToToSfccAddress(ucBillTo), {
            firstName: 'Jane',
            lastName: 'Doe',
            address1: '1 Market St',
            address2: 'Suite 200',
            city: 'San Francisco',
            postalCode: '94105',
            phone: '4155551234',
            country: 'US',
            states: { stateCode: 'CA' }
        });
    });

    it('returns null for a null billTo', function () {
        assert.isNull(ucPaymentHelper.mapUcBillToToSfccAddress(null));
    });

    it('defaults missing fields to empty strings', function () {
        assert.deepEqual(ucPaymentHelper.mapUcBillToToSfccAddress({}), {
            firstName: '', lastName: '', address1: '', address2: '',
            city: '', postalCode: '', phone: '', country: '',
            states: { stateCode: '' }
        });
    });
});

describe('ucPaymentHelper.buildTransientTokenResponseOptions', function () {
    it('sets includeCardPrefix=false when no option is selected (null/empty)', function () {
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: null }), { includeCardPrefix: false });
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: '' }), { includeCardPrefix: false });
    });

    it('omits includeCardPrefix entirely for Six (default 6-digit BIN)', function () {
        var result = ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: 'Six' });
        assert.deepEqual(result, {});
        assert.isFalse(Object.prototype.hasOwnProperty.call(result, 'includeCardPrefix'));
    });

    it('sets includeCardPrefix=true for Eight (8-digit BIN)', function () {
        var result = ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: 'Eight' });
        assert.deepEqual(result, { includeCardPrefix: true });
    });

    it('treats an unknown value as no-BIN (includeCardPrefix:false)', function () {
        var result = ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: 'bogus' });
        assert.deepEqual(result, { includeCardPrefix: false });
    });

    it('treats a leftover boolean (legacy toggle) as no-BIN', function () {
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: true }), { includeCardPrefix: false });
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: false }), { includeCardPrefix: false });
    });

    it('treats a missing/undefined config as no-BIN', function () {
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({}), { includeCardPrefix: false });
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions(undefined), { includeCardPrefix: false });
    });

    it('honors a Java-backed String pref (typeof "object", not === a JS string literal)', function () {
        // getCustomPreferenceValue returns a Java String object, not a native JS string. Simulate
        // it with an object whose String()/toString() yields the enum value. Strict === would miss it.
        var javaSix = { toString: function () { return 'Six'; } };
        var javaEight = { toString: function () { return 'Eight'; } };
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: javaSix }), {});
        assert.deepEqual(ucPaymentHelper.buildTransientTokenResponseOptions({ unifiedCheckoutAllowedCardPrefix: javaEight }), { includeCardPrefix: true });
    });
});

describe('ucPaymentHelper.getExistingTmsCustomerId', function () {
    function customerWithCustomerID(id) {
        return {
            getProfile: function () {
                return { custom: { customerID: id } };
            }
        };
    }

    it('returns the customerID when the profile has one', function () {
        assert.strictEqual(
            ucPaymentHelper.getExistingTmsCustomerId(customerWithCustomerID('CUST123')),
            'CUST123'
        );
    });

    it('returns null when the profile has no customerID', function () {
        assert.isNull(ucPaymentHelper.getExistingTmsCustomerId(customerWithCustomerID(undefined)));
    });

    it('returns null when customer is null', function () {
        assert.isNull(ucPaymentHelper.getExistingTmsCustomerId(null));
    });

    it('returns null when customer has no getProfile', function () {
        assert.isNull(ucPaymentHelper.getExistingTmsCustomerId({}));
    });

    it('returns null when getProfile() returns null', function () {
        assert.isNull(ucPaymentHelper.getExistingTmsCustomerId({ getProfile: function () { return null; } }));
    });
});

describe('ucPaymentHelper.buildTmsTokenTypes', function () {
    it('includes "customer" when there is no existing customer id (first card)', function () {
        assert.deepEqual(
            ucPaymentHelper.buildTmsTokenTypes(null),
            ['customer', 'paymentInstrument', 'instrumentIdentifier']
        );
    });

    it('omits "customer" when an existing customer id is supplied (subsequent card)', function () {
        assert.deepEqual(
            ucPaymentHelper.buildTmsTokenTypes('CUST123'),
            ['paymentInstrument', 'instrumentIdentifier']
        );
    });

    it('treats empty string as no existing customer id', function () {
        assert.deepEqual(
            ucPaymentHelper.buildTmsTokenTypes(''),
            ['customer', 'paymentInstrument', 'instrumentIdentifier']
        );
    });
});

describe('ucPaymentHelper.buildSerializedToken', function () {
    it('appends the customer id segment when one is provided', function () {
        assert.strictEqual(
            ucPaymentHelper.buildSerializedToken('IID1', 'PI1', 'CUST123'),
            'IID1-PI1-flex-CUST123'
        );
    });

    it('omits the customer segment when no customer id is provided', function () {
        assert.strictEqual(
            ucPaymentHelper.buildSerializedToken('IID1', 'PI1', null),
            'IID1-PI1-flex'
        );
    });

    it('omits the customer segment for an empty-string customer id', function () {
        assert.strictEqual(
            ucPaymentHelper.buildSerializedToken('IID1', 'PI1', ''),
            'IID1-PI1-flex'
        );
    });
});
