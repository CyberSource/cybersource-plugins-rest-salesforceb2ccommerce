'use strict';

var assert = require('chai').assert;
var helper = require('../../../../../cartridges/int_cybs_sfra_base/cartridge/scripts/helpers/savedCardExpiry');

describe('savedCardExpiry', function () {
    describe('isExpired', function () {
        it('is not expired on the last day of the expiry month', function () {
            assert.isFalse(helper.isExpired(12, 2025, new Date(2025, 11, 31, 23, 59)));
        });
        it('is expired at the start of the following month', function () {
            assert.isTrue(helper.isExpired(12, 2025, new Date(2026, 0, 1, 0, 0)));
        });
        it('treats unknown month/year as not expired (let TMS decide)', function () {
            assert.isFalse(helper.isExpired(null, 2025, new Date(2030, 0, 1)));
            assert.isFalse(helper.isExpired(12, null, new Date(2030, 0, 1)));
        });
        it('parses string month/year', function () {
            assert.isTrue(helper.isExpired('01', '2020', new Date(2026, 5, 10)));
        });
    });

    describe('filterValid', function () {
        it('drops expired cards and keeps valid + unknown ones', function () {
            var now = new Date(2026, 5, 10);
            var list = [
                { UUID: 'a', creditCardExpirationMonth: 1, creditCardExpirationYear: 2020 },
                { UUID: 'b', creditCardExpirationMonth: 12, creditCardExpirationYear: 2030 },
                { UUID: 'c' }
            ];
            var kept = helper.filterValid(list, now).map(function (c) { return c.UUID; });
            assert.deepEqual(kept, ['b', 'c']);
        });
        it('returns an empty array for null input', function () {
            assert.deepEqual(helper.filterValid(null, new Date()), []);
        });
    });
});
