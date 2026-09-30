'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Stub the `server` module so requiring the controller doesn't explode; we only test findOwnInstrument.
var serverStub = {
    post: function () {}, get: function () {}, extend: function () {},
    middleware: { https: function () {} },
    exports: function () { return {}; }
};

var ctrl = proxyquire('../../../../cartridges/int_cybs_sfra_base/cartridge/controllers/SavedCardRefresh', {
    server: serverStub,
    'dw/web/URLUtils': { url: function () { return { toString: function () { return '/x'; } }; } },
    '*/cartridge/scripts/middleware/csrf': { validateAjaxRequest: function () {} },
    '*/cartridge/scripts/middleware/userLoggedIn': { validateLoggedInAjax: function () {} },
    '*/cartridge/scripts/util/array': {
        find: function (arr, cb) { for (var i = 0; i < arr.length; i++) { if (cb(arr[i])) return arr[i]; } return null; }
    },
    '*/cartridge/configuration/index': { networkTokenizationEnabled: true },
    '*/cartridge/models/account': function () {},
    '*/cartridge/scripts/renderTemplateHelper': { getRenderedHtml: function () { return ''; } },
    '~/cartridge/scripts/helpers/secureResponseHelper': {
        secureJsonResponse: function (res, data) { res.json(data); },
        secureRender: function (res, template, data) { res.render(template, data); }
    },
    '~/cartridge/scripts/helpers/savedCardExpiry': { filterValid: function (l) { return l; } },
    '~/cartridge/scripts/helpers/tokenRefreshHelper': { refreshInstrument: function () { return { success: true }; } }
});

describe('SavedCardRefresh.findOwnInstrument (IDOR guard)', function () {
    var pis = [{ UUID: 'a', raw: {} }, { UUID: 'b', raw: {} }];
    it('returns the matching instrument for an owned UUID', function () {
        assert.equal(ctrl.findOwnInstrument(pis, 'b').UUID, 'b');
    });
    it('returns null for a foreign/unknown UUID', function () {
        assert.isNull(ctrl.findOwnInstrument(pis, 'zzz'));
    });
    it('returns null when the wallet list is empty', function () {
        assert.isNull(ctrl.findOwnInstrument([], 'a'));
    });
});
