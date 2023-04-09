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
    root.CyberSource.Ptsv2payoutsRecipientInformation = factory(root.CyberSource.ApiClient);
  }
}(this, function(ApiClient) {
  'use strict';




  /**
   * The Ptsv2payoutsRecipientInformation model module.
   * @module model/Ptsv2payoutsRecipientInformation
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>Ptsv2payoutsRecipientInformation</code>.
   * @alias module:model/Ptsv2payoutsRecipientInformation
   * @class
   */
  var exports = function() {
    var _this = this;











  };

  /**
   * Constructs a <code>Ptsv2payoutsRecipientInformation</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/Ptsv2payoutsRecipientInformation} obj Optional instance to populate.
   * @return {module:model/Ptsv2payoutsRecipientInformation} The populated <code>Ptsv2payoutsRecipientInformation</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('firstName')) {
        obj['firstName'] = ApiClient.convertToType(data['firstName'], 'String');
      }
      if (data.hasOwnProperty('middleInitial')) {
        obj['middleInitial'] = ApiClient.convertToType(data['middleInitial'], 'String');
      }
      if (data.hasOwnProperty('lastName')) {
        obj['lastName'] = ApiClient.convertToType(data['lastName'], 'String');
      }
      if (data.hasOwnProperty('address1')) {
        obj['address1'] = ApiClient.convertToType(data['address1'], 'String');
      }
      if (data.hasOwnProperty('locality')) {
        obj['locality'] = ApiClient.convertToType(data['locality'], 'String');
      }
      if (data.hasOwnProperty('administrativeArea')) {
        obj['administrativeArea'] = ApiClient.convertToType(data['administrativeArea'], 'String');
      }
      if (data.hasOwnProperty('country')) {
        obj['country'] = ApiClient.convertToType(data['country'], 'String');
      }
      if (data.hasOwnProperty('postalCode')) {
        obj['postalCode'] = ApiClient.convertToType(data['postalCode'], 'String');
      }
      if (data.hasOwnProperty('phoneNumber')) {
        obj['phoneNumber'] = ApiClient.convertToType(data['phoneNumber'], 'String');
      }
      if (data.hasOwnProperty('dateOfBirth')) {
        obj['dateOfBirth'] = ApiClient.convertToType(data['dateOfBirth'], 'String');
      }
    }
    return obj;
  }

  /**
   * First name of recipient. characters. * CTV (14) * Paymentech (30) 
   * @member {String} firstName
   */
  exports.prototype['firstName'] = undefined;
  /**
   * Middle Initial of recipient. Required only for FDCCompass. 
   * @member {String} middleInitial
   */
  exports.prototype['middleInitial'] = undefined;
  /**
   * Last name of recipient. characters. * CTV (14) * Paymentech (30) 
   * @member {String} lastName
   */
  exports.prototype['lastName'] = undefined;
  /**
   * Recipient address information. Required only for FDCCompass.
   * @member {String} address1
   */
  exports.prototype['address1'] = undefined;
  /**
   * Recipient city. Required only for FDCCompass.
   * @member {String} locality
   */
  exports.prototype['locality'] = undefined;
  /**
   * Recipient State. Required only for FDCCompass.
   * @member {String} administrativeArea
   */
  exports.prototype['administrativeArea'] = undefined;
  /**
   * Recipient country code. Required only for FDCCompass.
   * @member {String} country
   */
  exports.prototype['country'] = undefined;
  /**
   * Recipient postal code. Required only for FDCCompass.
   * @member {String} postalCode
   */
  exports.prototype['postalCode'] = undefined;
  /**
   * Recipient phone number. Required only for FDCCompass.
   * @member {String} phoneNumber
   */
  exports.prototype['phoneNumber'] = undefined;
  /**
   * Recipient date of birth in YYYYMMDD format. Required only for FDCCompass.
   * @member {String} dateOfBirth
   */
  exports.prototype['dateOfBirth'] = undefined;



  return exports;
}));

