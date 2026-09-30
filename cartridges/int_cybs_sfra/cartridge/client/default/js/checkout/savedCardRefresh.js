/* eslint-disable no-undef */

'use strict';

/**
 * Reads the saved-card wrapper config (route URLs + CSRF token) from the DOM.
 * @returns {Object|null} { $wrap, refreshUrl, listUrl, csrfName, csrfToken } or null if absent
 */
function readConfig() {
    var $wrap = $('.cybs-saved-cards');
    if (!$wrap.length) {
        return null;
    }
    return {
        $wrap: $wrap,
        refreshUrl: $wrap.data('refresh-url'),
        listUrl: $wrap.data('list-url'),
        csrfName: $wrap.data('csrf-name'),
        csrfToken: $wrap.data('csrf-token')
    };
}

/**
 * Refreshes one card; resolves regardless of outcome so Promise.all never blocks.
 * @param {Object} cfg - config from readConfig
 * @param {string} uuid - the card's wallet UUID
 * @returns {Promise} always resolves
 */
function refreshOne(cfg, uuid) {
    var data = { piUuid: uuid };
    // One CSRF token is shared across all parallel refresh POSTs. Safe in SFCC:
    // CSRFProtection.validateRequest() validates against a rolling token set and is
    // not single-use within the token's lifetime (same pattern SFRA uses for repeated AJAX).
    data[cfg.csrfName] = cfg.csrfToken;
    return Promise.resolve($.ajax({ url: cfg.refreshUrl, method: 'POST', data: data }))
        .catch(function () { return { success: false }; });
}

/**
 * Re-renders the picker from the server and swaps it in, then reconciles selection.
 * @param {Object} cfg - config from readConfig
 * @param {string} prevSelectedUuid - UUID that was selected before refresh (may be '')
 */
function reRender(cfg, prevSelectedUuid) {
    $.ajax({ url: cfg.listUrl, method: 'GET' }).done(function (resp) {
        if (!resp || !resp.success) {
            return;
        }
        cfg.$wrap.html(resp.html);

        var $cards = cfg.$wrap.find('.saved-payment-instrument');
        if ($cards.length === 0) {
            // Mirrors base SFRA billing visibility (creditCardContent.isml): hide stored
            // payments, show the new-card form. Coupled to those SFRA class names.
            $('.user-payment-instruments').addClass('checkout-hidden');
            $('.credit-card-form').removeClass('checkout-hidden');
            return;
        }

        // Reconcile selection: keep prior selection if still present, else select the first.
        var $stillSelected = prevSelectedUuid
            ? $cards.filter('[data-uuid="' + prevSelectedUuid + '"]')
            : $();
        $cards.removeClass('selected-payment');
        if ($stillSelected.length) {
            $stillSelected.addClass('selected-payment');
        } else {
            $cards.first().addClass('selected-payment');
        }
    }).fail(function () {
        // Re-render failed (network/5xx). Intentionally leave the existing picker DOM
        // in place — the background refresh must never block or disrupt checkout.
    });
}

/**
 * Entry point: kicks off the non-blocking background refresh when saved cards exist.
 */
function init() {
    var cfg = readConfig();
    if (!cfg) {
        return; // no saved-card wrapper on the page
    }
    var uuids = cfg.$wrap.find('.saved-payment-instrument').map(function () {
        return $(this).data('uuid');
    }).get();
    if (uuids.length === 0) {
        return; // empty wallet — skip the TMS round-trips entirely
    }

    var prevSelectedUuid = cfg.$wrap.find('.saved-payment-instrument.selected-payment').data('uuid') || '';

    // refreshOne always resolves (it catches internally), so Promise.all never
    // short-circuits — equivalent to allSettled here, with broader browser support.
    Promise.all(uuids.map(function (uuid) {
        return refreshOne(cfg, uuid);
    })).then(function () {
        reRender(cfg, prevSelectedUuid);
    });
}

module.exports = {
    init: init
};
