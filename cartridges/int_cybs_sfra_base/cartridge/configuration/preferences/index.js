'use strict';

var Site = require('dw/system/Site');
var CustomPreferences = require('./customPreferences');

/**
 * *
 * @param {*} prefenceKey *
 * @returns {*} *
 */
function get(prefenceKey) {
    var value;
    if (Site.getCurrent().getPreferences() == null) {
        value = Site.allSites[0].getCustomPreferenceValue(prefenceKey);
        return value;
    }
    value = Site.getCurrent().getCustomPreferenceValue(prefenceKey);
    return value;
}

// This builds the custom preferences object
// eslint-disable-next-line guard-for-in, no-restricted-syntax
for (var groupKey in CustomPreferences) {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (var preferenceKey in CustomPreferences[groupKey].Preferences) {
        CustomPreferences[groupKey].Preferences[preferenceKey].getValue = function () { return get(this.id); };
    }
}

module.exports = CustomPreferences;
