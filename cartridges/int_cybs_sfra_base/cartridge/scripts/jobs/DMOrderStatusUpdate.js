/* eslint-disable no-plusplus */
/**
* This script is used to update order status in  SFCC which are
*  in REVIEW state in Decision manager.
*/

'use strict';

var HashMap = require('dw/util/HashMap');
var Logger = require('dw/system/Logger');
var Order = require('dw/order/Order');
var OrderMgr = require('dw/order/OrderMgr');
var Transaction = require('dw/system/Transaction');
var configObject = require('~/cartridge/configuration/index');

var logger = Logger.getLogger('CyberSource', 'ConversionDetailReport');

/**
* Function to parse XML response return from Conversion response
* service and change Order status in BM as per the decision received for Order.
* @param {string} message message
* @param {Object} orderHashMap orderHashMap
* */
function parseJSONResponse(message, orderHashMap) {
    try {
        // eslint-disable-next-line no-undef
        if (!empty(message)) {
            logger.info('Message - ' + message);
            var obj = JSON.parse(message);
            logger.info('conversionDetail report count:' + obj.conversionDetails.length);
            logger.info('Processing daily conversion report JSON.......');
            Transaction.wrap(function () {
                // eslint-disable-next-line guard-for-in
                for (var i = 0; i < obj.conversionDetails.length; i++) {
                    var conversionDetails = obj.conversionDetails[i];
                    var orderNumber = conversionDetails.merchantReferenceNumber;
                    var order = orderHashMap.get(orderNumber);
                    logger.info('Order Id - ' + conversionDetails.requestId + '\n');
                    if (order !== null) {
                        // new decision ACCEPT decision applied to order
                        if (conversionDetails.newDecision === 'ACCEPT') {
                            OrderMgr.placeOrder(order);
                            order.setConfirmationStatus(Order.CONFIRMATION_STATUS_CONFIRMED);
                            logger.info('Order number: ( {0} ) is successfully placed  ', orderNumber);
                            // new decision REJECT decision applied to order
                        } else if (conversionDetails.newDecision === 'REJECT') {
                            //  Cancel Order.
                            OrderMgr.failOrder(order, false);
                            var reviewerComment = conversionDetails.reviewerComments;
                            order.cancelDescription = reviewerComment;
                            logger.info('Order number: ( {0} ) is canceled   ', orderNumber);
                        } else {
                            logger.info('No records in ACCEPT/REJECT state.');
                        }
                    } else {
                        logger.debug('Order in Daily conversion report not found in the query results against DB');
                    }
                }
            });
        }
    } catch (error) {
        logger.error('Error in conversionReportjob.js ' + error);
        throw new Error('Error in conversion detail report : service unavailable');
    }
}
/**
* Function to handle multiple error scenarios in case of error
* returned form Service
* @param {JSON} responseObj response object
* */
function handleErrorCases(responseObj) {
    // eslint-disable-next-line no-undef
    if (empty(responseObj)) {
        logger.error('Error in conversion detail report request :', 'RESPONSE_EMPTY');
        throw new Error('Error in conversion detail report : RESPONSE_EMPTY');
    } else if ('status' in responseObj && responseObj.getStatus().equals('SERVICE_UNAVAILABLE')) {
        logger.error('Error in conversion detail report request ( {0} )', 'service unavailable');
        throw new Error('Error in conversion detail report : service unavailable');
    } else if (responseObj.status === 'OK' && (responseObj.object === 'Invalid login credentials.' || responseObj.object === 'No merchant found for username.')) {
        logger.error('Error in conversion detail report request ( {0} )', responseObj.object);
        throw new Error('Error in conversion detail report : Invalid login credentials.');
    // eslint-disable-next-line no-undef
    } else if ('errorMessage' in responseObj && !empty(responseObj.errorMessage)) {
        //  Log all error messages.
        logger.error('Service Error: ' + responseObj.errorMessage);
    }
}

/**
* Function to set date time parameter to provide
* as an input. The date range will pick
* records of 24 hours before the current time
* @returns {time} date time for parameter
* */
function setDateTimeForParameter() {
    var System = require('dw/system/System');
    var StringUtils = require('dw/util/StringUtils');
    var time = {};
    var endDate = System.getCalendar();
    endDate.setTimeZone('GMT');
    time.end = StringUtils.formatCalendar(endDate, 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\''); // 2019-07-30T00:00:00.0Z
    var currentDate = System.getCalendar();
    currentDate.setTimeZone('GMT');
    var lookBackPref = configObject.fmeDmConversionDetailReportLookbackTime;
    // eslint-disable-next-line no-undef
    var lookbackTime = empty(lookBackPref) ? -24 : (-1 * lookBackPref);
    // eslint-disable-next-line no-undef
    currentDate.add(dw.util.Calendar.HOUR, lookbackTime);
    time.start = StringUtils.formatCalendar(currentDate, 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\''); // 2019-07-30T00:00:00.0Z

    return time;
}

/**
 * @param {*} jobParams *
 */
function orderStatusUpdate(jobParams) { // eslint-disable-line no-unused-vars
    var cybersourceRestApi = require('~/cartridge/apiClient/index');

    logger.debug('ConversionDetailReport---------------- -');
    var conversionDetails = new cybersourceRestApi.ConversionDetailsApi(configObject);

    //  Create hashmap of orders based on the query below
    var orderIterator = OrderMgr.searchOrders('confirmationStatus = {0} AND status != {1} AND status != {2}', 'orderNo asc', Order.CONFIRMATION_STATUS_NOTCONFIRMED, Order.ORDER_STATUS_FAILED, Order.ORDER_STATUS_CANCELLED);
    var orderHashMap = new HashMap();
    // eslint-disable-next-line no-undef
    if (!empty(orderIterator)) {
        while (orderIterator.hasNext()) {
            var order = orderIterator.next();
            orderHashMap.put(order.orderNo, order);
            logger.debug('order ID - ' + order.orderNo);
        }
    }
    //  Process Orders and change status in SFCC
    if (orderHashMap.length > 0) {
        //  Mapping request object with correct parameter
        var time = setDateTimeForParameter();
        var merchantId = configObject.merchantID;

        conversionDetails.getConversionDetail(time.start, time.end, { organizationId: merchantId }, function (data, error, response) {
            handleErrorCases(response);
            //  Parse service JSON response and set Order status based on response
            parseJSONResponse(JSON.stringify(data, null, 2), orderHashMap);
        });
    }
}
/** Exported functions * */
module.exports = {
    orderStatusUpdate: orderStatusUpdate
};
