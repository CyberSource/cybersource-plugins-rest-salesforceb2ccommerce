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

        if (configObject.deviceFingerprintEnabled) {
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
        // eslint-disable-next-line no-undef
        if (!session.privacy.key || !session.privacy.iv) {
            var key = SecureRandom.nextBytes(32);
            var iv = SecureRandom.nextBytes(16);
            // eslint-disable-next-line no-undef
            key = dw.crypto.Encoding.toBase64(key);
            // eslint-disable-next-line no-undef
            iv = dw.crypto.Encoding.toBase64(iv);
            // eslint-disable-next-line no-undef
            session.privacy.key = key;
            // eslint-disable-next-line no-undef
            session.privacy.iv = iv;
        }
        // eslint-disable-next-line no-undef
        var encryptedSessionID = Cipher.encrypt(sessionID, session.privacy.key, 'AES/CBC/PKCS5Padding', session.privacy.iv, 0);

        var url = location + '/fp/tags.js?org_id=' + orgID + '&session_id=' + merchID + encryptedSessionID;

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
