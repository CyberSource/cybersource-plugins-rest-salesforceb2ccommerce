'use strict';

var marker = 'CUSTOMERROR:';
var delimiter = ':CUSTOMERROR';
var errorSerialize = function (obj) {
    return marker + JSON.stringify(obj) + delimiter;
};
var errorDeserialize = function (str) {
    if (str.indexOf(marker) !== 0) return null;
    var endIndex = str.indexOf(delimiter);
    var serializedObj = str.substring(marker.length, endIndex);
    return JSON.parse(serializedObj);
};
module.exports = {
    errorDeserialize: errorDeserialize,
    CARD_NOT_AUTHORIZED_ERROR: function (message) {
        this.type = 'CARD_NOT_AUTHORIZED_ERROR';
        // this.constructor.prototype.__proto__ = Error.prototype;
        this.name = this.constructor.name;
        if (typeof message !== 'string') {
            this.message = message;
        } else {
            this.messageText = message;
        }
        this.toString = function () { return errorSerialize(this); };
    },
    API_CLIENT_ERROR: function (message) {
        this.type = 'API_CLIENT_ERROR';
        // this.constructor.prototype.__proto__ = Error.prototype;
        this.name = this.constructor.name;
        if (typeof message !== 'string') {
            this.message = message;
        } else {
            this.messageText = message;
        }
        this.toString = function () { return errorSerialize(this); };
    },
    MERCHANT_CONFIGURATION_ERROR: function (message) {
        this.type = 'MERCHANT_CONFIGURATION_ERROR';
        // this.constructor.prototype.__proto__ = Error.prototype;
        this.name = this.constructor.name;
        if (typeof message !== 'string') {
            this.message = message;
        } else {
            this.messageText = message;
        }
        this.toString = function () { return errorSerialize(this); };
    },
    SERVICE_ERROR: function (errorCode, message) {
        this.type = 'SERVICE_ERROR';
        // this.constructor.prototype.__proto__ = Error.prototype;
        this.name = this.constructor.name;
        this.errorCode = errorCode;
        if (typeof message !== 'string') {
            this.message = message;
        } else {
            this.messageText = message;
        }
        this.toString = function () { return errorSerialize(this); };
    }
};
