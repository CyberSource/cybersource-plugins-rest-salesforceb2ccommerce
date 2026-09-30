var server = require('server');
var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Encoding = require('dw/crypto/Encoding');
var Mac = require('dw/crypto/Mac');
var Bytes = require('dw/util/Bytes');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var OrderMgr = require('dw/order/OrderMgr');
var configObject = require('*/cartridge/configuration/index');
var secureResponseHelper = require('*/cartridge/scripts/helpers/secureResponseHelper');


/**
 * Modular decryption function using native platform APIs
 */
function decryptMLEPayload(jweString) {
    if (!jweString) return null;
    var JWE = require('dw/crypto/JWE');
    var KeyRef = require('dw/crypto/KeyRef');

    // Resolve the egress P12 alias from the cartridge configuration (site preference
    // VisaAcceptance_ResponseMLEPrivateKeyAlias, surfaced as configObject.responseMlePrivateKeyAlias).
    // The default lives in the site-preference default-value, so no default is hardcoded here.
    var alias = configObject.responseMlePrivateKeyAlias;


    // Pin the JWE header before handing the payload to dw/crypto/JWE — defense-in-depth
    // against algorithm-confusion and a clearer error when a misrouted webhook arrives.
    var trimmed = jweString.trim();
    var headerB64 = trimmed.split('.')[0];
    if (headerB64) {
        try {
            var b64 = headerB64.replace(/-/g, '+').replace(/_/g, '/');
            var padLen = b64.length % 4;
            if (padLen === 2) b64 += '==';
            else if (padLen === 3) b64 += '=';
            var header = JSON.parse(Encoding.fromBase64(b64).toString());
            if (header.alg !== 'RSA-OAEP-256' || header.enc !== 'A256GCM') {
                Logger.error('decryptMLEPayload: unexpected JWE algorithms — alg=' + header.alg + ', enc=' + header.enc + '. Expected RSA-OAEP-256 + A256GCM per Visa Acceptance webhook spec.');
                throw new Error('Unsupported JWE algorithms');
            }
        } catch (he) {
            if (he.message === 'Unsupported JWE algorithms') throw he;
            // Header parse failure — fall through; JWE.parse below will surface a clearer error.
        }
    }

    try {
        var jwe = JWE.parse(trimmed);
        jwe.decrypt(new KeyRef(alias));
        return jwe.getPayload();
    } catch (e) {
        // A padding error is a key MISMATCH, not a missing key: the alias resolved and RSA unwrap
        // ran, so pointing the merchant at the alias sends them the wrong way. It means the gateway
        // encrypted with a different public certificate than the keypair now at this alias - usually
        // the .p12 was re-imported after its certificate had been registered with KMS.
        var remedy = (e.message && e.message.indexOf('Padding error') !== -1)
            ? ' The keypair at this alias does not match the public certificate registered with Visa Acceptance; re-register it via Merchant Tools > Visa Acceptance Payment Services > Webhook Manager > Advanced Configuration > Update Advanced Settings.'
            : ' Verify the .p12 private key is uploaded under Administration > Operations > Private Keys and Certificates with this exact alias.';
        Logger.error('decryptMLEPayload failed for alias "' + alias + '": ' + e.message + '.' + remedy);
        throw e;
    }
}

/**
 * Defensive Signature Validation
 */
function validateSignature(req, customObjectKey) {
    var digitalSignature = req.httpHeaders.get('v-c-signature');
    if (!digitalSignature || !req.body) return false;
    try {
        // Header format: t=<timestamp>;keyId=<keyId>;sig=<hmac-sha256-base64>
        var signatureParts = digitalSignature.split(';');
        if (signatureParts.length < 3) return false;
        // Use slice(1).join('=') to preserve any '=' characters in the value (base64 padding in sig).
        var ts = signatureParts[0].split('=').slice(1).join('=');
        var keyId = signatureParts[1].split('=').slice(1).join('=');
        var s = signatureParts[2].split('=').slice(1).join('=');
        if (Math.abs(Date.now() - parseInt(ts)) > 300000) return false;

        var securityKey = '';
        var keyObj = null;
        if (keyId) {
            try {
                keyObj = CustomObjectMgr.getCustomObject('VisaAcceptanceWebhookSecurityKey', keyId);
            } catch (typeErr) {
                // VisaAcceptanceWebhookSecurityKey type not yet imported to sandbox — fail closed below.
                Logger.warn('validateSignature: VisaAcceptanceWebhookSecurityKey type not found (metadata not imported) for ' + customObjectKey + '; rejecting.');
            }
        }
        if (keyObj && keyObj.custom.Key) {
            securityKey = keyObj.custom.Key;
        } else {
            if (keyId) {
                Logger.error('validateSignature [' + customObjectKey + ']: no VisaAcceptanceWebhookSecurityKey record for keyId "' + keyId + '".');
            } else {
                Logger.error('validateSignature [' + customObjectKey + ']: v-c-signature header missing keyId segment.');
            }
            return false;
        }
        if (!securityKey) return false;

        var hmac = new Mac('HmacSHA256');
        var secret = Encoding.fromBase64(securityKey);

        // Visa Acceptance signs `{timestamp}.{raw_body}`.
        var regenerated = hmac.digest(new Bytes(ts + '.' + req.body, 'utf8'), secret);
        return regenerated.toString() === Encoding.fromBase64(s).toString();
    } catch (e) {
        Logger.error('Error in validateSignature: ' + e.message);
        return false;
    }
}

/**
 * Helper to decrypt payload if MLE is enabled
 */
function getDecryptedPayload(body) {
    var trimmed = body ? String(body).trim() : '';

    // A bare compact JWE body (5 dot-separated segments, no JSON envelope). The leading-'{' test
    // matters: '{"encData":"a.b.c.d.e"}' also splits into 5 parts on '.', and feeding that whole
    // envelope to JWE.parse produced the misleading 'Invalid JWE header: Invalid JSON: Unexpected
    // token <binary>' that used to mask the real decryption failure below.
    if (trimmed.charAt(0) !== '{' && trimmed.split('.').length === 5) {
        return JSON.parse(decryptMLEPayload(trimmed));
    }

    var payload = JSON.parse(trimmed);
    var encryptedData = payload.encData || payload.encryptedRequest;
    if (encryptedData) {
        // Deliberately not retried as plaintext on failure: an encrypted notification we cannot
        // decrypt must surface its own error, not a second, unrelated one.
        return JSON.parse(decryptMLEPayload(encryptedData));
    }
    return payload;
}

// A notification can arrive before its order finishes committing (a race), so on order-not-found we
// ask the gateway to retry (non-2xx) for the first few attempts. Once retryNumber reaches this
// threshold we log order-not-found and ack 200 — the subscription retryPolicy has deactivateFlag=true,
// so continuing to fail would suspend the webhook. 2 => retry on the initial delivery and the 1st
// retry, give up on the 2nd retry.
var MAX_ORDER_NOT_FOUND_RETRIES = 2;

/**
 * Respond to an order-not-found webhook: ask the gateway to retry until retryNumber reaches
 * MAX_ORDER_NOT_FOUND_RETRIES, then ack 200 so the subscription is not suspended.
 *
 * @param {Object} payload decoded webhook payload (carries retryNumber)
 * @param {Object} res response object
 * @param {Function} next route next()
 * @param {string} context log label (e.g. 'paymentNotification', 'dmNotification')
 * @param {string} orderRef order number / matching id we could not resolve (for logging)
 * @returns {void}
 */
function respondOrderNotFound(payload, res, next, context, orderRef) {
    var retryNumber = (payload && payload.retryNumber !== undefined && payload.retryNumber !== null)
        ? parseInt(payload.retryNumber, 10) : 0;
    if (isNaN(retryNumber)) retryNumber = 0;

    if (retryNumber < MAX_ORDER_NOT_FOUND_RETRIES) {
        res.setStatusCode(503);
        secureResponseHelper.secureJsonResponse(res, { success: false, message: 'Order not found, retrying...' });
    } else {
        Logger.warn(context + ': order ' + orderRef + ' not found after ' + retryNumber +
            ' retries; acknowledging to keep the subscription active.');
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: true });
    }
    return next();
}

function handleDmNotification(req, res, next) {
    if (req.httpMethod === 'GET') {
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: true });
        return next();
    }
    if (!validateSignature(req, 'fraudManagement')) {
        res.setStatusCode(401);
        secureResponseHelper.secureJsonResponse(res, { success: false });
        return next();
    }

    try {
        var payload = getDecryptedPayload(req.body);
        if (!payload) throw new Error('Decrypted payload is empty');

        // Normalize the DM/FM payload to its detail object. Case-management notifications nest the
        // data under payload.payload.data (an object); other shapes use transactionResult.details
        // or an array entry.
        var details = (payload.payload && payload.payload.transactionResult) ? payload.payload.transactionResult.details :
            (payload.payload && payload.payload.length ? payload.payload[0].data :
                (payload.payload && payload.payload.data ? payload.payload.data : payload));

        // The case-management payload carries the SFCC order number as referenceNumber (the merchant
        // reference number); other shapes use clientReferenceInformation.code. Prefer the latter, fall
        // back to referenceNumber so accept/reject and capture all resolve the order.
        var orderId = (details && details.clientReferenceInformation ? details.clientReferenceInformation.code : null)
            || (details ? details.referenceNumber : null);
        if (!orderId) throw new Error('Missing Order ID');

        var order = OrderMgr.getOrder(orderId);
        if (!order) {
            return respondOrderNotFound(payload, res, next, 'dmNotification', orderId);
        }

        var reversal = null;
        Transaction.wrap(function () {
            var eventType = payload.eventType || (payload.payload && payload.payload[0] ? payload.payload[0].eventType : null);
            if (eventType === 'risk.casemanagement.decision.accept') {
                // Replicates DMOrderStatusUpdate.js cron behavior on ACCEPT.
                OrderMgr.placeOrder(order);
                order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);
            } else if (eventType === 'risk.casemanagement.decision.reject') {
                // Replicates DMOrderStatusUpdate.js cron behavior on REJECT.
                // Case-management decisions carry the reviewer's reason in notes[0].comment
                // (no reviewerComments field); fall back to it so the cancel reason is captured.
                var reviewerComment = (details && details.riskInformation && details.riskInformation.reviewerComments)
                    || (details && details.reviewerComments)
                    || (details && Array.isArray(details.notes) && details.notes.length ? details.notes[0].comment : '')
                    || '';
                // Capture the authorization transaction id (set at auth time) BEFORE failing the
                // order, so the auth-only hold can be reversed once the transaction commits.
                var pis = order.getPaymentInstruments().toArray();
                for (var pIdx = 0; pIdx < pis.length; pIdx++) {
                    if (pis[pIdx].paymentTransaction && pis[pIdx].paymentTransaction.transactionID) {
                        reversal = {
                            requestId: pis[pIdx].paymentTransaction.transactionID,
                            total: order.totalGrossPrice.value,
                            currency: order.currencyCode
                        };
                        break;
                    }
                }
                OrderMgr.failOrder(order, false);
                order.cancelDescription = reviewerComment;
                Logger.info('dmNotification: Order ( ' + orderId + ' ) canceled via case-management REJECT');
            }
        });

        // Capture handling: when the merchant captures in EBC, the case-management notification
        // includes an _embedded.capture link but no captured amount. Fetch the amount via the
        // transaction-details API and reflect Captured / Partially Captured + AmountPaid + paymentStatus.
        var capture = details && details._embedded ? details._embedded.capture : null;
        if (capture) {
            try {
                var captureHref = capture._links && capture._links.self ? capture._links.self.href : null;
                var captureId = captureHref ? captureHref.substring(captureHref.lastIndexOf('/') + 1) : null;
                if (captureId) {
                    var dmStatusHelper = require('*/cartridge/scripts/helpers/webhookOrderStatusHelper');
                    var dmTransactionDetails = require('*/cartridge/scripts/http/transactionDetails');
                    dmStatusHelper.applyTransactionOutcome({
                        eventType: payload.eventType,
                        details: details,
                        transactionId: captureId,
                        order: order,
                        fetchCapturedAmount: dmTransactionDetails.getCapturedAmount
                    });
                } else {
                    Logger.error('dmNotification: capture present for order ( ' + orderId + ' ) but no capture id in href; cannot fetch amount.');
                }
            } catch (captureErr) {
                Logger.error('dmNotification: capture handling failed for order ( ' + orderId + ' ): ' + captureErr.message);
            }
        }

        // Reviewed orders are auth-only (capture is deferred until ACCEPT), so a REJECT must
        // release the authorization hold. The gateway call is made outside the DB transaction and
        // is best-effort — if the auth was already reversed/expired, log it and still ack the
        // webhook so Visa Acceptance does not keep retrying.
        //
        // It MUST go through authReversalHelper.reverseAuthorizationOnce: notification delivery is
        // at-least-once (retryPolicy numberOfRetries=3, plus the deliberate 503 above), and every
        // redelivery of risk.casemanagement.decision.reject still finds the failed order with its
        // authorization id intact — which reversed the same hold a second time.
        if (reversal) {
            var authReversalHelper = require('*/cartridge/scripts/helpers/authReversalHelper');
            if (authReversalHelper.payloadAlreadyReversed(details)) {
                Logger.info('dmNotification: notification for order ( ' + orderId + ' ) already carries a reversal; leaving the authorization to the gateway.');
            } else {
                authReversalHelper.reverseAuthorizationOnce({
                    order: order,
                    authTransactionId: reversal.requestId,
                    referenceCode: orderId,
                    amount: reversal.total,
                    currency: reversal.currency,
                    context: 'dmNotification'
                });
            }
        }

        
        
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: true });
    } catch (e) {
        Logger.error('dmNotification error: ' + e.message);
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: false });
    }
    return next();
}

// DM Notifications
server.use('dmNotification', handleDmNotification);



// Unified Checkout Notifications
//
// Architecture: the UC API *response* (handled inline at checkout) is the
// primary source of truth for order placement and confirmation status. This
// webhook is intentionally secondary — it serves two purposes only:
//
//   1. Enrichment: log additional transactional info (final settlement
//      status, risk decisions, network token info) that wasn't in the
//      synchronous response.

server.use('paymentNotification', function (req, res, next) {
    if (req.httpMethod === 'GET') {
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: true });
        return next();
    }

    if (!validateSignature(req, 'unifiedCheckout')) {
        Logger.error('paymentNotification: Signature validation failed');
        res.setStatusCode(401);
        secureResponseHelper.secureJsonResponse(res, { success: false });
        return next();
    }

    try {
        var payload = getDecryptedPayload(req.body);
        if (!payload) throw new Error('Decrypted payload is empty');

        var details = (payload.payload && payload.payload.transactionResult) ? payload.payload.transactionResult.details :
            (payload.payload && payload.payload.length ? payload.payload[0].data : payload);

        var orderId = details && details.clientReferenceInformation ? details.clientReferenceInformation.code : null;
        if (!orderId) throw new Error('Missing Order ID');

        var order = OrderMgr.getOrder(orderId);

        if (!order) {
            return respondOrderNotFound(payload, res, next, 'paymentNotification', orderId);
        }

        Transaction.wrap(function () {
            // Response is primary for confirmation status. Only *promote* an
            // unconfirmed order to CONFIRMED here as a safety net; never
            // demote a confirmed order back to NOTCONFIRMED.
            var currentStatus = order.getConfirmationStatus();
            if (currentStatus !== order.CONFIRMATION_STATUS_CONFIRMED &&
                ['COMPLETED', 'SETTLED', 'AUTHORIZED'].indexOf(details.status) > -1) {
                order.setConfirmationStatus(order.CONFIRMATION_STATUS_CONFIRMED);
            }
        });

        // Reflect the transaction's auth/capture status in BM via the shared status helper.
        try {
            var ucStatusHelper = require('*/cartridge/scripts/helpers/webhookOrderStatusHelper');
            var ucTransactionDetails = require('*/cartridge/scripts/http/transactionDetails');
            ucStatusHelper.applyTransactionOutcome({
                eventType: payload.eventType || 'uc.orders.transactionresults',
                details: details,
                transactionId: details && details.id ? details.id : null,
                order: order,
                fetchCapturedAmount: ucTransactionDetails.getCapturedAmount
            });
        } catch (statusErr) {
            Logger.error('paymentNotification: status helper failed for ' + orderId + ': ' + statusErr.message);
        }

        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: true });
    } catch (e) {
        Logger.error('paymentNotification error: ' + e.message);
        res.setStatusCode(200);
        secureResponseHelper.secureJsonResponse(res, { success: false });
    }
    return next();
});


module.exports = server.exports();
