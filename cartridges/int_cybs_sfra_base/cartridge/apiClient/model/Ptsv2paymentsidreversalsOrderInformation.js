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
    define(['ApiClient', 'model/Ptsv2paymentsidreversalsOrderInformationAmountDetails', 'model/Ptsv2paymentsidreversalsOrderInformationLineItems'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Ptsv2paymentsidreversalsOrderInformationAmountDetails'), require('./Ptsv2paymentsidreversalsOrderInformationLineItems'));
  } else {
    // Browser globals (root is window)
    if (!root.CyberSource) {
      root.CyberSource = {};
    }
    root.CyberSource.Ptsv2paymentsidreversalsOrderInformation = factory(root.CyberSource.ApiClient, root.CyberSource.Ptsv2paymentsidreversalsOrderInformationAmountDetails, root.CyberSource.Ptsv2paymentsidreversalsOrderInformationLineItems);
  }
}(this, function(ApiClient, Ptsv2paymentsidreversalsOrderInformationAmountDetails, Ptsv2paymentsidreversalsOrderInformationLineItems) {
  'use strict';




  /**
   * The Ptsv2paymentsidreversalsOrderInformation model module.
   * @module model/Ptsv2paymentsidreversalsOrderInformation
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>Ptsv2paymentsidreversalsOrderInformation</code>.
   * @alias module:model/Ptsv2paymentsidreversalsOrderInformation
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>Ptsv2paymentsidreversalsOrderInformation</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/Ptsv2paymentsidreversalsOrderInformation} obj Optional instance to populate.
   * @return {module:model/Ptsv2paymentsidreversalsOrderInformation} The populated <code>Ptsv2paymentsidreversalsOrderInformation</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('amountDetails')) {
        obj['amountDetails'] = Ptsv2paymentsidreversalsOrderInformationAmountDetails.constructFromObject(data['amountDetails']);
      }
      if (data.hasOwnProperty('lineItems')) {
        obj['lineItems'] = ApiClient.convertToType(data['lineItems'], [Ptsv2paymentsidreversalsOrderInformationLineItems]);
      }
    }
    return obj;
  }

  /**
   * @member {module:model/Ptsv2paymentsidreversalsOrderInformationAmountDetails} amountDetails
   */
  exports.prototype['amountDetails'] = undefined;
  /**
   * @member {Array.<module:model/Ptsv2paymentsidreversalsOrderInformationLineItems>} lineItems
   */
  exports.prototype['lineItems'] = undefined;



  return exports;
}));

