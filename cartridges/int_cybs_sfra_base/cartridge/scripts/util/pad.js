'use strict';

module.exports = function (number, size, padChar) {
    return new Array(size).concat([Math.abs(number)]).join(padChar).slice(-size);
};
