'use strict';
 
var Mac = require('dw/crypto/Mac');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var Site = require('dw/system/Site');
 
/**
 * Generate HMAC-SHA256 signature for data
 * @param {string} data - The data to sign
 * @returns {string} - Base64 encoded HMAC signature
 */
function generateHMAC(data) {
    var mac = new Mac(Mac.HMAC_SHA_256);
    var secret = getHMACSecret();
    var signature = mac.digest(data, secret);
    return Encoding.toBase64(signature);
}
 
/**
 * Verify HMAC-SHA256 signature using constant-time comparison
 * @param {string} data - The data that was signed
 * @param {string} signature - The signature to verify
 * @returns {boolean} - true if signature is valid
 */
function verifyHMAC(data, signature) {
    var expectedSignature = generateHMAC(data);
 
    // Constant-time comparison to prevent timing attacks
    if (!signature || signature.length !== expectedSignature.length) {
        return false;
    }
 
    var result = 0;
    for (var i = 0; i < expectedSignature.length; i++) {
        result |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
    }
 
    return result === 0;
}
 
/**
 * Get HMAC secret from site preferences
 * Reuses the existing Cybersource_MerchantKeySecret for HMAC signing
 * @returns {string} - The HMAC secret
 */
function getHMACSecret() {
    var currentSite = Site.getCurrent();
    // Reuse the existing CyberSource merchant secret key
    var secret = currentSite.getCustomPreferenceValue('Cybersource_MerchantKeySecret');
 
    if (!secret) {
        throw new Error('CyberSource Merchant Key Secret not configured. Please set Cybersource_MerchantKeySecret in site preferences.');
    }
 
    return secret;
}
 
module.exports = {
    generateHMAC: generateHMAC,
    verifyHMAC: verifyHMAC
};