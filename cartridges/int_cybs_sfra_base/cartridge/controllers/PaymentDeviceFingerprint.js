'use strict';

var server = require('server');
var configObject = require('../configuration/index');
/*
 * Controller that handles the Cybersource Device Fingerprint
*/

/**
 * Get fingertpringing url and outputs it to template
 */
if (configObject.cartridgeEnabled) {
    server.get('GetFingerprint', function (req, res, next) {
        var orgID = configObject.deviceFingerprintOrganizationId;
        var merchID = configObject.merchantID;
        // eslint-disable-next-line no-undef
        var sessionID = session.sessionID;
        var location = configObject.deviceFingerprintThreadMatrixUrl;
        var now = new Date().valueOf();
        var devicefingerprintTTL = parseInt(configObject.deviceFingerprintTimeToLive, 10);

        var getDeviceFingerprint = false;

         if (configObject.deviceFingerprintEnabled && configObject.fmeDmEnabled) {
            // eslint-disable-next-line no-undef
            if (empty(session.privacy.deviceFingerprintTime)) {
                // eslint-disable-next-line no-undef
                session.privacy.deviceFingerprintTime = now;
                getDeviceFingerprint = true;
            } else {
                // eslint-disable-next-line no-undef
                var timeSinceLastFingerprint = now - session.privacy.deviceFingerprintTime;
                if (timeSinceLastFingerprint > devicefingerprintTTL) {
                    // eslint-disable-next-line no-undef
                    session.privacy.deviceFingerprintTime = now;
                    getDeviceFingerprint = true;
                }
            }
        }
        var Cipher = require('dw/crypto/Cipher');
        var SecureRandom = require('dw/crypto/SecureRandom');
        SecureRandom = new SecureRandom();
        Cipher = new Cipher();
        var key = SecureRandom.nextBytes(32);
        var iv = SecureRandom.nextBytes(16);
        key = dw.crypto.Encoding.toBase64(key);
        iv = dw.crypto.Encoding.toBase64(iv);
        session.privacy.key = key;
        session.privacy.iv = iv;

        // eslint-disable-next-line no-undef
        var encryptedSessionID = Cipher.encrypt(key, session.privacy.key, 'AES/CBC/PKCS5Padding', session.privacy.iv, 0);

        var dfpSessionId = encryptedSessionID.replace(/[+/]/g, 'SF');
        var url = location + '/fp/tags.js?org_id=' + orgID + '&session_id=' + merchID + dfpSessionId;
        session.privacy.dfID = dfpSessionId;
        res.cacheExpiration(0);
        res.render('common/deviceFingerprint', {
            url: url,
            getDeviceFingerprint: getDeviceFingerprint
        });
        next();
    });
}

/*
 * Module exports
 */
module.exports = server.exports();
