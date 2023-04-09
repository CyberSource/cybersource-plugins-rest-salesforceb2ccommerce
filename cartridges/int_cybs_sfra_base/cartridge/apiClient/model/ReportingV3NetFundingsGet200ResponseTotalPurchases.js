/**
 * CyberSource Merged Spec
 * All CyberSource API specs merged together. These are available at https://developer.cybersource.com/api/reference/api-reference.html
 *
 * OpenAPI spec version: 0.0.1
 *
 * NOTE: This class is auto generated by the swagger code generator program.
 * https://github.com/swagger-api/swagger-codegen.git
 *
 * Swagger Codegen version: 2.3.0
 *
 * Do not edit the class manually.
 *
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['ApiClient'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'));
  } else {
    // Browser globals (root is window)
    if (!root.CyberSource) {
      root.CyberSource = {};
    }
    root.CyberSource.ReportingV3NetFundingsGet200ResponseTotalPurchases = factory(root.CyberSource.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The ReportingV3NetFundingsGet200ResponseTotalPurchases model module.
   * @module model/ReportingV3NetFundingsGet200ResponseTotalPurchases
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>ReportingV3NetFundingsGet200ResponseTotalPurchases</code>.
   * @alias module:model/ReportingV3NetFundingsGet200ResponseTotalPurchases
   * @class
   * @param currency {String} Valid ISO 4217 ALPHA-3 currency code
   * @param value {String} 
   */
  var exports = function(currency, value) {
    var _this = this;

    _this['currency'] = currency;
    _this['value'] = value;
  };

  /**
   * Constructs a <code>ReportingV3NetFundingsGet200ResponseTotalPurchases</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/ReportingV3NetFundingsGet200ResponseTotalPurchases} obj Optional instance to populate.
   * @return {module:model/ReportingV3NetFundingsGet200ResponseTotalPurchases} The populated <code>ReportingV3NetFundingsGet200ResponseTotalPurchases</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('currency')) {
        obj['currency'] = ApiClient.convertToType(data['currency'], 'String');
      }
      if (data.hasOwnProperty('value')) {
        obj['value'] = ApiClient.convertToType(data['value'], 'String');
      }
    }
    return obj;
  }

  /**
   * Valid ISO 4217 ALPHA-3 currency code
   * @member {String} currency
   */
  exports.prototype['currency'] = undefined;
  /**
   * @member {String} value
   */
  exports.prototype['value'] = undefined;



  return exports;
}));

