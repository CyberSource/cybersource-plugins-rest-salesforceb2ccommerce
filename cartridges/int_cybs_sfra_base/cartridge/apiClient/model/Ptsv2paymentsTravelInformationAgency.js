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
    root.CyberSource.Ptsv2paymentsTravelInformationAgency = factory(root.CyberSource.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Ptsv2paymentsTravelInformationAgency model module.
   * @module model/Ptsv2paymentsTravelInformationAgency
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>Ptsv2paymentsTravelInformationAgency</code>.
   * @alias module:model/Ptsv2paymentsTravelInformationAgency
   * @class
   */
  var exports = function() {
    var _this = this;



  };

  /**
   * Constructs a <code>Ptsv2paymentsTravelInformationAgency</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/Ptsv2paymentsTravelInformationAgency} obj Optional instance to populate.
   * @return {module:model/Ptsv2paymentsTravelInformationAgency} The populated <code>Ptsv2paymentsTravelInformationAgency</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('code')) {
        obj['code'] = ApiClient.convertToType(data['code'], 'String');
      }
      if (data.hasOwnProperty('name')) {
        obj['name'] = ApiClient.convertToType(data['name'], 'String');
      }
    }
    return obj;
  }

  /**
   * International Air Transport Association (IATA) code of travel agency that made the vehicle rental reservation. 
   * @member {String} code
   */
  exports.prototype['code'] = undefined;
  /**
   * Name of travel agency that made the reservation. 
   * @member {String} name
   */
  exports.prototype['name'] = undefined;



  return exports;
}));

