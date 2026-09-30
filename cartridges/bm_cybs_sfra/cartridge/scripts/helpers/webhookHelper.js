'use strict';

var Logger = require('dw/system/Logger').getLogger('webhookHelper');

/**
 * Derive the egress MLE public certificate (base64 DER, not PEM) from the .p12 imported in BM under
 * `alias` — the same alias WebhookNotification decrypts with. Must be an RSA keypair. Returns '' on failure.
 *
 * @param {string} alias keystore alias of the merchant .p12 (private key entry)
 * @returns {string} base64-DER X.509 certificate, or '' on failure
 */
function deriveEgressCertificateB64(alias) {
    if (!alias) {
        Logger.error('deriveEgressCertificateB64: no egress alias configured.');
        return '';
    }
    try {
        var CertificateUtils = require('dw/crypto/CertificateUtils');
        var KeyRef = require('dw/crypto/KeyRef');
        var cert = CertificateUtils.getCertificate(new KeyRef(alias));
        if (!cert) {
            Logger.error('deriveEgressCertificateB64: no certificate for alias "' + alias + '".');
            return '';
        }
        var b64 = CertificateUtils.getEncodedCertificate(cert);
        var clean = b64 ? String(b64).replace(/\s+/g, '') : '';
        if (!clean || !/^[A-Za-z0-9+/=]+$/.test(clean)) {
            Logger.error('deriveEgressCertificateB64: getEncodedCertificate returned empty/non-base64 for alias "' + alias + '".');
            return '';
        }
        return clean;
    } catch (e) {
        Logger.error('deriveEgressCertificateB64 failed for alias "' + alias + '": ' + ((e && e.message) || e) + '. Verify the RSA .p12 is imported under Administration > Operations > Private Keys and Certificates with this exact alias.');
        return '';
    }
}

module.exports = {
    deriveEgressCertificateB64: deriveEgressCertificateB64
};
