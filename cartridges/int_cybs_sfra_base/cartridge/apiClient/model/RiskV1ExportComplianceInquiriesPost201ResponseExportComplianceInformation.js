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
    define(['ApiClient', 'model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList'], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS-like environments that support module.exports, like Node.
    module.exports = factory(require('../ApiClient'), require('./RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList'));
  } else {
    // Browser globals (root is window)
    if (!root.CyberSource) {
      root.CyberSource = {};
    }
    root.CyberSource.RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation = factory(root.CyberSource.ApiClient, root.CyberSource.RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList);
  }
}(this, function(ApiClient, RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList) {
  'use strict';




  /**
   * The RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation model module.
   * @module model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation
   * @version 0.0.1
   */

  /**
   * Constructs a new <code>RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation</code>.
   * @alias module:model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation
   * @class
   */
  var exports = function() {
    var _this = this;




  };

  /**
   * Constructs a <code>RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation</code> from a plain JavaScript object, optionally creating a new instance.
   * Copies all relevant properties from <code>data</code> to <code>obj</code> if supplied or a new instance if not.
   * @param {Object} data The plain JavaScript object bearing properties of interest.
   * @param {module:model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation} obj Optional instance to populate.
   * @return {module:model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation} The populated <code>RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformation</code> instance.
   */
  exports.constructFromObject = function(data, obj) {
    if (data) {
      obj = obj || new exports();

      if (data.hasOwnProperty('ipCountryConfidence')) {
        obj['ipCountryConfidence'] = ApiClient.convertToType(data['ipCountryConfidence'], 'Number');
      }
      if (data.hasOwnProperty('infoCodes')) {
        obj['infoCodes'] = ApiClient.convertToType(data['infoCodes'], ['String']);
      }
      if (data.hasOwnProperty('watchList')) {
        obj['watchList'] = RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList.constructFromObject(data['watchList']);
      }
    }
    return obj;
  }

  /**
   * Likelihood that the country associated with the customer’s IP address was identified correctly. Returns a value from 1–100, where 100 indicates the highest likelihood. If the country cannot be determined, the value is –1. 
   * @member {Number} ipCountryConfidence
   */
  exports.prototype['ipCountryConfidence'] = undefined;
  /**
   * Returned when the Denied Parties List check (first two codes) or the export service (all others) would have declined the transaction. This field can contain one or more of these values: - `MATCH-DPC`: Denied Parties List match. - `UNV-DPC`: Denied Parties List unavailable. - `MATCH-BCO`: Billing country restricted. - `MATCH-EMCO`: Email country restricted. - `MATCH-HCO`: Host name country restricted. - `MATCH-IPCO`: IP country restricted. - `MATCH-SCO`: Shipping country restricted. 
   * @member {Array.<String>} infoCodes
   */
  exports.prototype['infoCodes'] = undefined;
  /**
   * @member {module:model/RiskV1ExportComplianceInquiriesPost201ResponseExportComplianceInformationWatchList} watchList
   */
  exports.prototype['watchList'] = undefined;



  return exports;
}));

