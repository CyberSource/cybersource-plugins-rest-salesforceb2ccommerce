'use strict';

var server = require('server');
var cybersourceRestApi = require('../apiClient/index');
var configObject = require('../configuration/index');

var tests = {
    handleResponseTerst: function (res, data, error, response) { // eslint-disable-line no-unused-vars
        if (!error) {
            res.json(data);
        } else {
            res.json({ errorCode: error, error: data });
        }
    },
    getUserInformation: function (callback) {
        try {
            // var configObject = new configuration();
            var instance = new cybersourceRestApi.ReportsApi(configObject);

            var opts = [];
            opts.reportMimeType = 'application/xml';

            var startDate = new Date('2018/10/01');
            var endDate = new Date('2018/10/30');
            instance.searchReports(startDate.toISOString(), endDate.toISOString(), 'executedTime', opts, callback);
        } catch (error) {
            var e = error;
            throw e;
        }
    },
    createInstrumentIdentifier: function (callback) {
        try {
            // var configObject = new configuration();
            var instance = new cybersourceRestApi.InstrumentIdentifierApi(configObject);

            var card = new cybersourceRestApi.Tmsv1instrumentidentifiersCard();
            card.number = '1234567890117654';

            var body = new cybersourceRestApi.CreateInstrumentIdentifierRequest();
            body.card = card;

            instance.createInstrumentIdentifier(configObject.profileId, body, callback);
        } catch (error) {
            var e = error;
            throw e;
        }
    }
};

server.get('getUserInformation', function (req, res, next) {
    tests.getUserInformation(function (data, error, response) {
        tests.handleResponseTerst(res, data, error, response);
    });
    next();
});

server.get('createInstrumentIdentifier', function (req, res, next) {
    tests.createInstrumentIdentifier(function (data, error, response) {
        tests.handleResponseTerst(res, data, error, response);
    });
    next();
});

if (configObject.cartridgeEnabled) {
    module.exports = server.exports();
}
