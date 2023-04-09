'use strict';

exports.getLogger = function (obj) {
  return {
    warn: function warn(message) {},
    info: function info(message) {},
    error: function error(message) {}
  };
};