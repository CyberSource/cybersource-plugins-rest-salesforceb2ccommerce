var server = require('server');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Encoding = require('dw/crypto/Encoding');
var Mac = require('dw/crypto/Mac');
var Bytes = require('dw/util/Bytes');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var Transaction = require('dw/system/Transaction');
var CustomerMgr = require('dw/customer/CustomerMgr');
var Logger = require('dw/system/Logger');
var array = require('*/cartridge/scripts/util/array');
var mapper = require('~/cartridge/scripts/util/mapper.js');
var tokenManagement = require('../scripts/http/tokenManagement');
var configObject = require('../configuration/index');
var cybersourceRestApi = require('../apiClient/index');

var instance;

    server.use('tokenUpdate', function (req, res, next) {
        if (configObject.networkTokenizationEnabled && req.httpMethod === 'POST') {
            var digitalSignature = req.httpHeaders.get('v-c-signature');
            var payload = JSON.parse(req.body);
            var organizationId = payload.payload[0].organizationId;
            var message = JSON.stringify(payload.payload);

            if (validator(digitalSignature, message, organizationId)) {
                var webhookId = payload.webhookId;
                var data = payload.payload[0].data._links;
                var instrumentIdentifierLink = data.instrumentIdentifiers[0].href;
                var instrumentIdentifier = instrumentIdentifierLink.substring(instrumentIdentifierLink.lastIndexOf('/') + 1);
                var customerLink = data.customers[0].href;
                var customerId = customerLink.substring(customerLink.lastIndexOf('/') + 1);
                var paymentInstrument;
                if (data.paymentInstruments) {
                    var paymentInstrumentLink = data.paymentInstruments[0].href;
                    paymentInstrument = paymentInstrumentLink.substring(paymentInstrumentLink.lastIndexOf('/') + 1);
                }

                instance = new cybersourceRestApi.InstrumentIdentifierApi(configObject);
                var cardData; var cardNumber; var state;
                try { // eslint-disable-line no-useless-catch
                    instance.getInstrumentIdentifier(instrumentIdentifier, configObject.profileId, function (data, error, response) {
                        if (!error) {
                            cardData = data.tokenizedCard.card;
                            cardNumber = data.card.number;
                            state = data.tokenizedCard.state;
                        } else {
                            Logger.info('Card details does not exist');
                            res.setStatusCode(404);
                        }
                    });
                } catch (error) {
                    Logger.info('Token update failed'+ error);
                    res.setStatusCode(404);
                }

                if (state == 'ACTIVE') {
                    instance = new cybersourceRestApi.CustomerApi(configObject);
                    var email;
                    try { // eslint-disable-line no-useless-catch
                        instance.getCustomer(customerId, configObject.profileId, function (data, error, response) {
                            if (!error) {
                                email = data._embedded.defaultPaymentInstrument.billTo.email;
                            } else {
                                Logger.info('Customer data does not exist');
                                res.setStatusCode(404);
                            }
                        });
                    } catch (error) {
                        Logger.info('Token update failed'+ error);
                        res.setStatusCode(404);
                    }

                    var customer = CustomerMgr.getCustomerByLogin(email);
                    var wallet = customer.profile.wallet;
                    var paymentInstruments = wallet.getPaymentInstruments();
                    var paymentToDelete = array.find(paymentInstruments, function (item) {
                        var token = item.creditCardToken;
                        var tokenInfo = mapper.deserializeTokenInformation(token);
                        return instrumentIdentifier === tokenInfo.instrumentIdentifier.id;
                    });

                    Transaction.wrap(function () {
                        var cardHolder = paymentToDelete.creditCardHolder;
                        var cardType = paymentToDelete.creditCardType;
                        var cardToken = paymentToDelete.creditCardToken;
                        wallet.removePaymentInstrument(paymentToDelete);
                        var newPaymentInstrument = wallet.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD);
                        newPaymentInstrument.setCreditCardHolder(cardHolder);
                        var newCardNumber = cardNumber.slice(0, -4) + cardData.suffix;
                        newPaymentInstrument.setCreditCardNumber(newCardNumber);
                        newPaymentInstrument.setCreditCardType(cardType);
                        newPaymentInstrument.setCreditCardExpirationMonth(Number(cardData.expirationMonth));
                        newPaymentInstrument.setCreditCardExpirationYear(Number(cardData.expirationYear));
                        if (empty(paymentInstrument)) {
                            var oldToken = mapper.deserializeTokenInformation(cardToken);
                            paymentInstrument = oldToken.paymentInstrument.id;
                        }
                        var tokenInfo = {
                            instrumentIdentifier: { id: instrumentIdentifier },
                            paymentInstrument: { id: paymentInstrument }
                        };

                        var token = mapper.serializeTokenInformation(tokenInfo);
                        newPaymentInstrument.setCreditCardToken(token);
                        res.setStatusCode(200);
                    });
                } else {
                    Logger.info('Network token state is not Active');
                    res.setStatusCode(404);
                }
            }
            else{
                res.setStatusCode(404);
            }
        }
        else{
            Logger.info('Network token updates disabled');
            res.setStatusCode(404);
        }
    });

    function validator(digitalSignature, message, merchantId) {
        var signatureParts;
        var timestamp;
        var keyId;
        try {
            signatureParts = digitalSignature.split(';');
            timestamp = parseInt(signatureParts[0].split('=')[1]);
            keyId = signatureParts[1].split('=')[1];
            signature = signatureParts[2].split('=')[1];
        } catch (e) {
            Logger.error('Invalid digital signature format');
        }

        if (isValidTimestamp(timestamp)) {
            const regeneratedSignature = regenerateSignature(timestamp, message, merchantId);
            if (regeneratedSignature.toString() === Encoding.fromBase64(signature).toString()) {
                return true;
            }
            Logger.error('No match in signature');
            return false;
        }
    }

    function regenerateSignature(timestamp, message, merchantId) {
        const timestampedMessage = `${timestamp}.${message}`;
        const key = getSecurityKey(merchantId);
        try {
            var hmac = new Mac('HmacSHA256');
            return hmac.digest(new Bytes(timestampedMessage, 'utf8'), Encoding.fromBase64(key));
        } catch (e) {
            throw new Error('Failed to calculate hmac-sha256');
        }
    }

    function getSecurityKey(merchantId) {
        var obj = CustomObjectMgr.getCustomObject('Network Tokens Webhook', merchantId);
        return obj.custom.SecurityKey;
    }

    function isValidTimestamp(timestamp) {
        const tolerance = 60 * 60 * 1000;
        const currentTime = Date.now();
        return currentTime - timestamp < tolerance;
    }

module.exports = server.exports();
