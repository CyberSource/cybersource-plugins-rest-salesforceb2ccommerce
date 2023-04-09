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
    define(['ApiClient', 'model/Ptsv2paymentsidreversalsClientReferenceInformationPartner'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./Ptsv2paymentsidreversalsClientReferenceInformationPartner'));
  } else {
    // Browser globals (root is window)
    if (!root.CyberSource) {
      root.CyberSource = {};
    }
    root.CyberSource.Ptsv2paymentsidreversalsClientReferenceInformation = factory(root.CyberSource.ApiClient, root.CyberSource.Ptsv2paymentsidreversalsClientReferenceInformationPartner);
  }
}(this, function(ApiClient, Ptsv2paymentsidreversalsClientReferenceInformationPartner) {
  'use strict';




  /**
   * The Ptsv2paymentsidreversalsClientReferenceInformation model module.
   * @module model/Ptsv2paymentsidreversalsClientReferenceInformation
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>Ptsv2paymentsidreversalsClientReferenceInformation</code>.
   * @alias module:model/Ptsv2paymentsidreversalsClientReferenceInformation
   * @class
   */
  var exports = function() {
    var _this = this;








  };

  /**
   * Constructs a <code>Ptsv2paymentsidreversalsClientReferenceInformation</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/Ptsv2paymentsidreversalsClientReferenceInformation} obj Optional instance to populate.
   * @return {module:model/Ptsv2paymentsidreversalsClientReferenceInformation} The populated <code>Ptsv2paymentsidreversalsClientReferenceInformation</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('code')) {
        obj['code'] = ApiClient.convertToType(data['code'], 'String');
      }
      if (data.hasOwnProperty('pausedRequestId')) {
        obj['pausedRequestId'] = ApiClient.convertToType(data['pausedRequestId'], 'String');
      }
      if (data.hasOwnProperty('comments')) {
        obj['comments'] = ApiClient.convertToType(data['comments'], 'String');
      }
      if (data.hasOwnProperty('partner')) {
        obj['partner'] = Ptsv2paymentsidreversalsClientReferenceInformationPartner.constructFromObject(data['partner']);
      }
      if (data.hasOwnProperty('applicationName')) {
        obj['applicationName'] = ApiClient.convertToType(data['applicationName'], 'String');
      }
      if (data.hasOwnProperty('applicationVersion')) {
        obj['applicationVersion'] = ApiClient.convertToType(data['applicationVersion'], 'String');
      }
      if (data.hasOwnProperty('applicationUser')) {
        obj['applicationUser'] = ApiClient.convertToType(data['applicationUser'], 'String');
      }
    }
    return obj;
  }

  /**
   * Merchant-generated order reference or tracking number. It is recommended that you send a unique value for each transaction so that you can perform meaningful searches for the transaction.  #### Used by **Authorization** Required field.  #### PIN Debit Requests for PIN debit reversals need to use the same merchant reference number that was used in the transaction that is being reversed.  Required field for all PIN Debit requests (purchase, credit, and reversal).  #### FDC Nashville Global Certain circumstances can cause the processor to truncate this value to 15 or 17 characters for Level II and Level III processing, which can cause a discrepancy between the value you submit and the value included in some processor reports. 
   * @member {String} code
   */
  exports.prototype['code'] = undefined;
  /**
   * Used to resume a transaction that was paused for an order modification rule to allow for payer authentication to complete. To resume and continue with the authorization/decision service flow, call the services and include the request id from the prior decision call. 
   * @member {String} pausedRequestId
   */
  exports.prototype['pausedRequestId'] = undefined;
  /**
   * Comments
   * @member {String} comments
   */
  exports.prototype['comments'] = undefined;
  /**
   * @member {module:model/Ptsv2paymentsidreversalsClientReferenceInformationPartner} partner
   */
  exports.prototype['partner'] = undefined;
  /**
   * The name of the Connection Method client (such as Virtual Terminal or SOAP Toolkit API) that the merchant uses to send a transaction request to CyberSource. 
   * @member {String} applicationName
   */
  exports.prototype['applicationName'] = undefined;
  /**
   * Version of the CyberSource application or integration used for a transaction. 
   * @member {String} applicationVersion
   */
  exports.prototype['applicationVersion'] = undefined;
  /**
   * The entity that is responsible for running the transaction and submitting the processing request to CyberSource. This could be a person, a system, or a connection method. 
   * @member {String} applicationUser
   */
  exports.prototype['applicationUser'] = undefined;



  return exports;
}));

