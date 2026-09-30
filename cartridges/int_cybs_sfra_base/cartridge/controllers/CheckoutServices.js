'use strict';

var page = module.superModule;
var server = require('server');
var secureResponseHelper = require('~/cartridge/scripts/helpers/secureResponseHelper');
server.extend(page);

/**
 * CheckoutServices-PlaceOrderDirect
 *
 * Handles order placement for UC v1.x completeMandate flow where authorization
 * has already been performed by the SDK. This endpoint:
 * 1. Validates the completeMandate JWT response
 * 2. Creates the order from basket
 * 3. Maps transaction details to payment instrument (skips authorization since SDK already did it)
 * 4. Runs fraud detection based on SDK response status
 * 5. Places the order and redirects to confirmation
 *
 * @param {Object} req - Request object containing completeMandateJwt parameter
 * @returns {Object} JSON response with orderID, orderToken, continueUrl or error
 */
server.post('PlaceOrderDirect', server.middleware.https, function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var OrderMgr = require('dw/order/OrderMgr');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var Resource = require('dw/web/Resource');
    var Transaction = require('dw/system/Transaction');
    var URLUtils = require('dw/web/URLUtils');
    var Logger = require('dw/system/Logger');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
    var addressHelpers = require('*/cartridge/scripts/helpers/addressHelpers');
    var payments = require('*/cartridge/scripts/http/payments');
    var ucPaymentHelper = require('~/cartridge/scripts/helpers/ucPaymentHelper');
    var webhookOrderStatusHelper = require('~/cartridge/scripts/helpers/webhookOrderStatusHelper');
    var configObject = require('~/cartridge/configuration/index.js');

    var logger = Logger.getLogger('VisaAcceptance', 'PlaceOrderDirect');

    /**
     * Resolves the SFCC order number to create against, from the Visa Acceptance
     * clientReferenceInformation.code on the completeMandate JWT (authoritative - it is
     * the merchant reference the transaction was created against and the key webhooks
     * reconcile on), falling back to the order number reserved at capture-context time.
     *
     * Known issue: for PayPal the completeMandate result does not echo the merchant
     * reference we sent and returns 'default', hence the fallback.
     *
     * @param {Object} payload - decoded completeMandate JWT payload
     * @returns {string|undefined} the order number to create the order with
     */
    function resolveClientReferenceCode(payload) {
        var code = payload.details &&
            payload.details.clientReferenceInformation &&
            payload.details.clientReferenceInformation.code;
        if (!code || code === 'default') {
            var reservedOrderNo = session.privacy.ucOrderNo;
            if (reservedOrderNo) {
                code = reservedOrderNo;
                session.privacy.ucOrderNo = null;
            }
        }
        return code;
    }

    // Get the completeMandate JWT from request
    var completeMandateJwt = request.httpParameterMap.completeMandateJwt.stringValue;
    var transientToken = request.httpParameterMap.transientToken.stringValue;

    if (!completeMandateJwt) {
        logger.error('PlaceOrderDirect: Missing completeMandateJwt parameter');
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Decode and validate the JWT
    var jwtPayload = payments.decodeCompleteMandateJwt(completeMandateJwt);

    if (!jwtPayload) {
        logger.error('PlaceOrderDirect: JWT validation failed');
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Get current basket
    var currentBasket = BasketMgr.getCurrentBasket();
    if (!currentBasket) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    // Validate products in basket
    var validatedProducts = validationHelpers.validateProducts(currentBasket);
    if (validatedProducts.error) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        return next();
    }

    // Check fraud detection status from session
    if (req.session.privacyCache.get('fraudDetectionStatus')) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', '01').toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }



    // For minicart/cart flows: Populate addresses from transient token via getPaymentDetails API
    // UC widget captures billing/shipping via captureMandate when requestShipping=true, billingType='FULL'
    // The addresses are NOT in the completeMandate JWT - they come from the transient token API
    var paymentDetails = null;
    if (transientToken && (!currentBasket.billingAddress || !currentBasket.defaultShipment.shippingAddress)) {
        try {
            paymentDetails = payments.getPaymentDetails(transientToken);
            if (paymentDetails && paymentDetails.orderInformation) {
                // Populate addresses from API response
                ucPaymentHelper.populateBasketAddressesFromPaymentDetails(currentBasket, paymentDetails, Transaction);

                // Set default shipping method if not present
                ucPaymentHelper.setDefaultShippingMethod(currentBasket, Transaction);

                // // Recalculate basket totals with new addresses (for tax calculation)
                // Transaction.wrap(function () {
                //     basketCalculationHelpers.calculateTotals(currentBasket);
                // });
            }
        } catch (e) {
            logger.error('PlaceOrderDirect: Error getting payment details from transient token: {0}', e.message || e);
        }
    }

    // Check authorization status
    // Runs AFTER address population so the express (minicart/cart) flow persists the UC/wallet-collected
    // address to the basket even when authorization fails - the client redirects to Checkout-Begin on
    // failure, and the address must already be on the basket for the checkout page to show it.
    var authStatus = jwtPayload.status;
    if (!ucPaymentHelper.isValidAuthorizationStatus(authStatus)) {
        logger.error('PlaceOrderDirect: Authorization not successful. Status: {0}', authStatus);

        // Check if SCA (Strong Customer Authentication) is required
        // Expanded SCA detection for new Visa Acceptance response patterns
        var isSCARequired = false;
        var processorInfo = jwtPayload.details && jwtPayload.details.processorInformation;
        var reasonCode = processorInfo && processorInfo.responseCode;
        var reason = jwtPayload.reason;
        var message = jwtPayload.message;
        var outcome = jwtPayload.outcome;
        // SCA required indicators: response 478, authentication_required status, or new Visa Acceptance patterns
        var scaDetected = (
            reasonCode === '478' ||
            authStatus === 'AUTHENTICATION_REQUIRED' ||
            authStatus === 'PENDING_AUTHENTICATION' ||
            (reason && reason === 'CUSTOMER_AUTHENTICATION_REQUIRED') ||
            (message && typeof message === 'string' && message.toLowerCase().indexOf('strong customer authentication required') !== -1)
        );
        if (scaDetected) {
            if (session.privacy.scaChallengeSent) {
                session.privacy.scaRequired = false;
                session.privacy.scaChallengeSent = false;
            } else {
                isSCARequired = true;
                session.privacy.scaRequired = true;
                session.privacy.scaChallengeSent = true;
            }
        }

        // Decision Manager REJECT at authorization time: the issuer APPROVED the authorization and
        // Decision Manager then declined it, so a real hold is sitting on the shopper's card. This
        // is the only auth path that declines before an order exists, so nothing downstream (the
        // DM webhook, DMOrderStatusUpdate, BM) will ever reverse it — it has to happen here.
        // Mirrors the reversal every other auth path already performs on this status
        // (scripts/http/payments.js, hooks/payment/processor/applePay.js, PayerAuthentication.js).
        if (authStatus === 'AUTHORIZED_RISK_DECLINED') {
            var riskAmountDetails = jwtPayload.details
                && jwtPayload.details.orderInformation
                && jwtPayload.details.orderInformation.amountDetails;
            // Prefer what the gateway says it authorized. The basket total is only a fallback and
            // is read defensively: in the express (minicart/cart) flow totals may not have been
            // calculated yet, and Money.getValue() on an unavailable total throws.
            var reversalAmount = riskAmountDetails
                && (riskAmountDetails.authorizedAmount || riskAmountDetails.totalAmount);
            if (!reversalAmount) {
                var basketTotal = currentBasket.getTotalGrossPrice();
                reversalAmount = (basketTotal && basketTotal.available) ? basketTotal.getValue() : null;
            }
            var reversalCurrency = (riskAmountDetails && riskAmountDetails.currency)
                || currentBasket.getCurrencyCode();
            // Same merchant-reference resolution as the order-creation path below: the JWT code is
            // authoritative, except for PayPal which echoes 'default' — then use the order number
            // reserved at capture-context time (left in session for the retry).
            var riskReferenceCode = jwtPayload.details
                && jwtPayload.details.clientReferenceInformation
                && jwtPayload.details.clientReferenceInformation.code;
            if (!riskReferenceCode || riskReferenceCode === 'default') {
                riskReferenceCode = session.privacy.ucOrderNo;
            }
            require('~/cartridge/scripts/helpers/authReversalHelper').reverseAuthorizationOnce({
                order: null, // the order is only created further down; this request never gets there
                authTransactionId: jwtPayload.id,
                referenceCode: riskReferenceCode,
                amount: reversalAmount,
                currency: reversalCurrency,
                context: 'PlaceOrderDirect'
            });
        }

        // Return appropriate error message
        var errorMessage;
        if (isSCARequired) {
            errorMessage = ucPaymentHelper.getSCAErrorMessage();
        } else {
            errorMessage = ucPaymentHelper.getAuthorizationErrorMessage(authStatus) || Resource.msg('error.technical', 'checkout', null);
        }

        // A fresh SCA challenge is not a final failure - the shopper re-authenticates and
        // this endpoint runs again against the same basket, so no order should exist yet.
        // A plain decline (not SCA-related) is terminal: create the order so it is
        // visible/reportable in Business Manager, then fail it - mirroring how the
        // standard (non-UC) flow always has an order to fail.
        if (!isSCARequired) {
            // Attach the payment instrument to the basket BEFORE creating the order. UC never
            // goes through SubmitPayment, so the basket carries no payment instrument until the
            // Handle hook runs (further down, on the success path) - and an order with zero
            // payment instruments renders as "Payment information can't be displayed for the
            // payment method used with this order" on BM's Orders > Payment tab. Dispatching the
            // same Handle hook here means a failed order shows the same payment details a placed
            // one does. An unmapped method is not fatal: the order still has to be recorded.
            var declinedMethod = ucPaymentHelper.detectPaymentMethod(jwtPayload, transientToken);
            var declinedProcessorId = ucPaymentHelper.getProcessorIdForMethod(declinedMethod);
            if (declinedProcessorId) {
                hooksHelper(
                    'app.payment.processor.' + declinedProcessorId,
                    'Handle',
                    currentBasket,
                    {
                        jwtPayload: jwtPayload,
                        transientToken: transientToken,
                        paymentMethod: declinedMethod,
                        isDigitalWallet: declinedMethod === 'DW_GOOGLE_PAY' || declinedMethod === 'DW_APPLE_PAY' || declinedMethod === 'DW_PAZE',
                        paymentDetails: paymentDetails,
                        fromUC: true
                    },
                    require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit').Handle
                );
            } else {
                logger.warn('PlaceOrderDirect: no processor mapped for declined method {0}; failed order will carry no payment details', declinedMethod);
            }

            var failedOrder = COHelpers.createOrder(currentBasket, resolveClientReferenceCode(jwtPayload));
            if (failedOrder) {
                Transaction.wrap(function () {
                    var declinedInstruments = failedOrder.getPaymentInstruments();
                    if (declinedInstruments.length > 0) {
                        var declinedTransaction = declinedInstruments[0].paymentTransaction;
                        // Transaction ID: what a merchant needs to find this decline in the Visa
                        // Acceptance portal from the BM Payment tab.
                        if (jwtPayload.id) {
                            declinedTransaction.setTransactionID(jwtPayload.id);
                        }
                        // Processor is mandatory for display, not just for capture/refund: BM
                        // renders "The payment processor is unknown. The payment data can't be
                        // displayed." for a PaymentTransaction with none.
                        var declinedMethodRecord = PaymentMgr.getPaymentMethod(declinedMethod);
                        var declinedProcessor = declinedMethodRecord && declinedMethodRecord.getPaymentProcessor();
                        if (declinedProcessor) {
                            declinedTransaction.setPaymentProcessor(declinedProcessor);
                        }
                    }
                    OrderMgr.failOrder(failedOrder, true);
                });
            } else {
                logger.error('PlaceOrderDirect: Could not create order to record declined authorization. Status: {0}', authStatus);
            }
        }

        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: errorMessage,
            scaRequired: isSCARequired
        });
        return next();
    }

    session.privacy.scaRequired = false;
    session.privacy.scaChallengeSent = false;

    // Validate order
    var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);
    if (validationOrderStatus.error) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: validationOrderStatus.message
        });
        return next();
    }

    // Check shipping address exists
    if (currentBasket.defaultShipment.shippingAddress === null) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorStage: { stage: 'shipping', step: 'address' },
            errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null)
        });
        return next();
    }

    // Check billing address exists
    if (!currentBasket.billingAddress) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorStage: { stage: 'payment', step: 'billingAddress' },
            errorMessage: Resource.msg('error.no.billing.address', 'checkout', null)
        });
        return next();
    }

    // Detect payment type from completeMandate JWT (transient token is the fallback
    // signal for APMs whose result JWT is bare, e.g. Tink Pay by Bank).
    var detectedPaymentMethod = ucPaymentHelper.detectPaymentMethod(jwtPayload, transientToken);
    var isDigitalWallet = detectedPaymentMethod === 'DW_GOOGLE_PAY' || detectedPaymentMethod === 'DW_APPLE_PAY' || detectedPaymentMethod === 'DW_PAZE';

    // Bank transfer (eCheck) display details: routing number, masked account, holder.
    // Resolved ONCE here from the most reliable source available and reused for both the
    // Handle hook and the wallet save (no second getPaymentDetails call downstream).
    //
    // This is display-only enrichment — authorization already happened client-side — so a
    // lookup miss must NEVER block order placement. In the tokenized (save-card) flow the
    // transient token is consumed by tokenization, so getTransactionForTransientToken returns
    // 410 Gone; getEcheckBankDetails falls back to the TMS v1 payment-instrument retrieve.
    // The token that actually gets saved comes from the auth JWT (saveTokenToWallet), not here.
    var echeckBankDetails = null;
    if (detectedPaymentMethod === 'BANK_TRANSFER') {
        echeckBankDetails = ucPaymentHelper.getEcheckBankDetails(transientToken, jwtPayload, currentBasket.billingAddress);
    }

    // Delegate payment instrument creation to the registered Handle hook for
    // the resolved processor. Each hook owns its own Transaction.wrap and
    // method-specific instrument setup.
    var processorId = ucPaymentHelper.getProcessorIdForMethod(detectedPaymentMethod);
    if (!processorId) {
        logger.error('PlaceOrderDirect: No processor mapped for method {0}', detectedPaymentMethod);
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Resolve the dw.order.PaymentProcessor up-front so we can fail loudly here
    // (with the exact missing record name) rather than silently skipping
    // setPaymentProcessor inside the post-order Transaction.wrap, which would
    // leave PaymentTransaction.paymentProcessor null and break refund/capture
    // flows downstream. SFCC has no direct PaymentProcessor lookup, so we go
    // through the PaymentMethod — but routing is already decided by the static
    // map above; this lookup only resolves the dw.order.PaymentProcessor object
    // needed by setPaymentProcessor().
    var paymentMethod = PaymentMgr.getPaymentMethod(detectedPaymentMethod);
    if (!paymentMethod) {
        logger.error(
            'PlaceOrderDirect: PaymentMethod record "{0}" missing in BM. Create it under Merchant Tools > Site Preferences > Payment Methods.',
            detectedPaymentMethod
        );
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }
    var paymentProcessor = paymentMethod.getPaymentProcessor();
    if (!paymentProcessor) {
        logger.error(
            'PlaceOrderDirect: PaymentMethod "{0}" has no PaymentProcessor bound in BM. Bind it to a processor under Merchant Tools > Site Preferences > Payment Methods.',
            detectedPaymentMethod
        );
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    var ucPaymentInformation = {
        jwtPayload: jwtPayload,
        transientToken: transientToken,
        paymentMethod: detectedPaymentMethod,
        isDigitalWallet: isDigitalWallet,
        paymentDetails: paymentDetails,
        bankDetails: echeckBankDetails,
        fromUC: true
    };

    var handleResult = hooksHelper(
        'app.payment.processor.' + processorId,
        'Handle',
        currentBasket,
        ucPaymentInformation,
        require('app_storefront_base/cartridge/scripts/hooks/payment/processor/basic_credit').Handle
    );
    if (handleResult.error) {
        logger.error('PlaceOrderDirect: Handle hook failed for method {0} (processor {1})', detectedPaymentMethod, processorId);
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
        });
        return next();
    }

    // // Calculate basket totals
    // Transaction.wrap(function () {
    //     basketCalculationHelpers.calculateTotals(currentBasket);
    // });

    // Validate payment instruments
    // var validPayment = COHelpers.validatePayment(req, currentBasket);
    // if (validPayment.error) {
    //     secureResponseHelper.secureJsonResponse(res, {
    //         error: true,
    //         errorStage: { stage: 'payment', step: 'paymentInstrument' },
    //         errorMessage: Resource.msg('error.payment.not.valid', 'checkout', null)
    //     });
    //     return next();
    // }

    // Calculate payment transaction
    var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Create order from basket using the Visa Acceptance clientReferenceInformation.code
    // as the SFCC order number. That code is the merchant reference the transaction was
    // created against and the key the webhooks reconcile on (OrderMgr.getOrder(code)),
    // so the order number MUST equal it.
    var order = COHelpers.createOrder(currentBasket, resolveClientReferenceCode(jwtPayload));
    if (!order) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Extract transaction details from JWT payload
    var transactionId = jwtPayload.id;
    var processorInfo = jwtPayload.details && jwtPayload.details.processorInformation;

    // Set order status in session for fraud detection hook
    session.privacy.orderStatus = authStatus;

    // Carry eCheck bank details out of the Transaction.wrap so the TMS save block
    // below can reuse the same getPaymentDetails-enriched values without calling the
    // API twice. Stays null for non-eCheck flows.
    var enrichedBankDetails = null;

    // Update payment instrument with transaction details from SDK authorization
    try {
        Transaction.wrap(function () {
            var paymentInstruments = order.getPaymentInstruments();
            if (paymentInstruments.length > 0) {
                var paymentInstrument = paymentInstruments[0];

                // Set transaction ID and processor (paymentProcessor resolved up-front,
                // guaranteed non-null by the guard at line ~232).
                paymentInstrument.paymentTransaction.setTransactionID(transactionId);
                paymentInstrument.paymentTransaction.setPaymentProcessor(paymentProcessor);


                var isApmFlow = (
                    detectedPaymentMethod === 'PAYPAL' ||
                    detectedPaymentMethod === 'VENMO'
                );
                if (isApmFlow) {
                    // PayPal / Venmo carry no card/bank-account data. Record the
                    // scheme descriptor instead of card details.
                    var apmDescriptor = ucPaymentHelper.getApmDescriptor(jwtPayload) || { name: '', method: '' };
                    // Customer-facing scheme name (e.g. 'PayPal') for the confirmation /
                    // email payment section. paymentDetails is the reliably-imported
                    // PaymentTransaction attribute, so it must carry the readable label -
                    // the optional apm* instrument attributes may be absent in metadata.
                    var apmDetailsStr = ucPaymentHelper.getApmDisplayName(apmDescriptor);
                    if (apmDetailsStr === 'Alternate Payment') {
                        if (detectedPaymentMethod === 'PAYPAL') {
                            apmDetailsStr = 'PayPal';
                        } else if (detectedPaymentMethod === 'VENMO') {
                            apmDetailsStr = 'Venmo';
                        }
                    }
                    paymentInstrument.paymentTransaction.custom.paymentDetails = apmDetailsStr;
                    ucPaymentHelper.setInstrumentCustomAttribute(paymentInstrument, 'apmPaymentType', apmDetailsStr);
                    ucPaymentHelper.setInstrumentCustomAttribute(paymentInstrument, 'apmMethod', apmDescriptor.method);
                    ucPaymentHelper.setInstrumentCustomAttribute(paymentInstrument, 'apmMandateType', session.privacy.ucResolvedMandateType);
                } else if (detectedPaymentMethod === 'BANK_TRANSFER') {
                    // eCheck (ACH). Reuse the bank details resolved once above (via
                    // getEcheckBankDetails: transient token / TransientTokenData API / TMS v1
                    // retrieve) rather than calling getPaymentDetails a second time. Reuse the
                    // credit-card wallet slots so the SFRA payment summary, confirmation page,
                    // and email render eCheck in the same column as PAN entries.
                    var bankDetails = echeckBankDetails
                        || ucPaymentHelper.extractBankDetailsFromTransient(transientToken, order.billingAddress);
                    enrichedBankDetails = bankDetails;
                    if (bankDetails.accountHolder && !paymentInstrument.creditCardHolder) {
                        paymentInstrument.setCreditCardHolder(bankDetails.accountHolder);
                    }
                    if (bankDetails.last4) {
                        paymentInstrument.setCreditCardNumber('••••' + bankDetails.last4);
                    }
                    paymentInstrument.setCreditCardType('eCheck');
                    if (bankDetails.routingNumber) {
                        ucPaymentHelper.setInstrumentCustomAttribute(paymentInstrument, 'echeckRoutingNumber', bankDetails.routingNumber);
                    }
                    paymentInstrument.paymentTransaction.custom.paymentDetails =
                        ucPaymentHelper.buildEcheckPaymentDetailsString(bankDetails);
                } else {
                    // Extract and set card details (pass order billing address for cardholder name)
                    var cardDetails = ucPaymentHelper.extractCardDetails(jwtPayload, transientToken, order.billingAddress);
                    ucPaymentHelper.updatePaymentInstrumentCardDetails(paymentInstrument, cardDetails, isDigitalWallet);

                    // Set payment details string
                    var paymentDetailsStr = ucPaymentHelper.buildPaymentDetailsString(cardDetails);
                    paymentInstrument.paymentTransaction.custom.paymentDetails = paymentDetailsStr;
                }

                // Store optional processor info. Guard each field individually:
                // processorInfo may be present while approvalCode / networkTransactionId
                // are absent for some payment methods (e.g. Pay by Bank), and writing
                // undefined surfaces a literal "undefined" in the BM payment section.
                if (processorInfo) {
                    if (processorInfo.approvalCode) {
                        paymentInstrument.paymentTransaction.custom.approvalCode = processorInfo.approvalCode;
                    }
                    if (processorInfo.networkTransactionId) {
                        paymentInstrument.paymentTransaction.custom.networkTransactionId = processorInfo.networkTransactionId;
                    }
                }
                if (jwtPayload.details && jwtPayload.details.reconciliationId) {
                    paymentInstrument.paymentTransaction.custom.reconciliationId = jwtPayload.details.reconciliationId;
                }

                // Reconciliation fields per ISV Integration Guide Section 13.
                var clientRefCode = jwtPayload.details
                    && jwtPayload.details.clientReferenceInformation
                    && jwtPayload.details.clientReferenceInformation.code;
                // if (clientRefCode) {
                //     paymentInstrument.paymentTransaction.custom.clientReferenceCode = clientRefCode;
                // }
                if (processorInfo && processorInfo.transactionId) {
                    paymentInstrument.paymentTransaction.custom.processorTransactionId = processorInfo.transactionId;
                }
                // paymentInstrument.paymentTransaction.custom.authMethod = (configObject.authenticationType || '').toUpperCase();
                paymentInstrument.paymentTransaction.custom.resultTimestamp = new Date().toISOString();

                // Gateway transaction status (jwtPayload.status, e.g. AUTHORIZED / PENDING).
                // Normalized to the same Title Case the webhook status helper writes, so a later
                // settlement/capture webhook upgrades this value cleanly. Guarded so an absent
                // status doesn't surface a literal "undefined" in the BM payment section.
                if (authStatus) {
                    paymentInstrument.paymentTransaction.custom.cybsTransactionStatus =
                        webhookOrderStatusHelper.formatTransactionStatus(authStatus);
                }
            }
        });
    } catch (e) {
        logger.error('PlaceOrderDirect: Error updating payment instrument: {0}', e.message || e);
        Transaction.wrap(function () { OrderMgr.failOrder(order, true); });
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Run fraud detection hook
    var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
    if (fraudDetectionStatus.status === 'fail') {
        Transaction.wrap(function () { OrderMgr.failOrder(order, true); });
        req.session.privacyCache.set('fraudDetectionStatus', true);
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            cartError: true,
            redirectUrl: URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString(),
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Place the order
    var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
    if (placeOrderResult.error) {
        secureResponseHelper.secureJsonResponse(res, {
            error: true,
            errorMessage: Resource.msg('error.technical', 'checkout', null)
        });
        return next();
    }

    // Asynchronous/redirect alternate payment methods authorize as PENDING or
    // SETTLE_INITIATED in the result JWT and settle later. If no settlement webhook has
    // already confirmed the order above, leave it NOTCONFIRMED so it is not treated as
    // fully paid until the WebhookNotification reconciliation promotes it. (SFCC has no
    // request-time async to poll refresh-payment-status here.)
    if ((authStatus === 'PENDING' || authStatus === 'SETTLE_INITIATED') && order.getConfirmationStatus().getValue() !== order.CONFIRMATION_STATUS_CONFIRMED) {
        Transaction.wrap(function () {
            order.setConfirmationStatus(order.CONFIRMATION_STATUS_NOTCONFIRMED);
        });
    }


    // Save TMS token to customer wallet only when the consumer explicitly opted in
    // (transient token metadata.consumerPreference.saveCard === true), the auth response
    // returned tokenInformation, and the shopper is authenticated. Triple-gating lives
    // inside saveTokenToWallet — we just supply the display details.
    //
    // For eCheck (BANK_TRANSFER) the response has no card object, so we synthesize a
    // card-shaped record from the transient token's bank.account / bank.routingNumber.
    // Stored under METHOD_CREDIT_CARD with creditCardType="eCheck" so the same wallet
    // selector, GetSavedCards, and CreateUCTokenWithCard pipelines that handle PAN
    // automatically handle saved eCheck instruments too.
    var detailsForWallet;
    if (detectedPaymentMethod === 'BANK_TRANSFER') {
        // Reuse the bankDetails resolved once above (getEcheckBankDetails: transient token /
        // TransientTokenData API / TMS v1 retrieve). The JWT-only extractBankDetailsFromTransient
        // returns empty placeholders, so falling back to it here would re-introduce the null
        // routing-number tile bug — it stays only as a last-resort guard.
        var echeckDetails = enrichedBankDetails
            || ucPaymentHelper.extractBankDetailsFromTransient(transientToken, order.billingAddress);
        // Prefer a real last-4 ("••••1234"); otherwise show the masked account string TMS
        // returns (e.g. "XXXX" or "XXXXXX1234"), normalizing the mask characters to bullets
        // so the tile shows the masked account instead of a blank line.
        var echeckMaskedAccount = echeckDetails.last4
            ? ('••••' + echeckDetails.last4)
            : (echeckDetails.maskedAccount ? echeckDetails.maskedAccount.replace(/[Xx]/g, '•') : '');
        detailsForWallet = {
            cardHolderName: echeckDetails.accountHolder,
            cardTypeName: 'eCheck',
            maskedNumber: echeckMaskedAccount,
            expirationMonth: '',
            expirationYear: '',
            echeckRoutingNumber: echeckDetails.routingNumber || ''
        };
    } else {
        detailsForWallet = ucPaymentHelper.extractCardDetails(jwtPayload, transientToken, order.billingAddress);
    }
    var tokenSaved = ucPaymentHelper.saveTokenToWallet(jwtPayload, detailsForWallet, session.getCustomer(), transientToken);
    if (tokenSaved) {
        // Maintain the default saved card, mirroring PaymentInstruments-SavePaymentDirect
        // (My Account). saveTokenToWallet/upsertCreditCard only preserve an existing card's
        // default flag on replace; they never promote a brand-new card, so the controller
        // owns this invariant. Checkout has no "make default" checkbox, so the rule is simply:
        // the first (only) saved card becomes the default, with ensureSingleDefault as a guard.
        try {
            var defaultPaymentHelper = require('~/cartridge/scripts/helpers/defaultPaymentHelper');
            var CustomerMgr = require('dw/customer/CustomerMgr');
            var checkoutCustomer = CustomerMgr.getCustomerByCustomerNumber(req.currentCustomer.profile.customerNo);
            var defaultWallet = checkoutCustomer.getProfile().getWallet();
            var savedCards = defaultPaymentHelper.getCreditCardInstruments(defaultWallet);
            if (savedCards.length > 0) {
                // Identify the card we just saved/updated by its instrumentIdentifier (robust
                // against wallet ordering and against an upsert that replaced an existing card).
                var savedTokenInfo = ucPaymentHelper.extractTokenInformation(jwtPayload);
                var savedPI = (savedTokenInfo && savedTokenInfo.instrumentIdentifier)
                    ? ucPaymentHelper.findCreditCardByInstrumentIdentifier(defaultWallet, savedTokenInfo.instrumentIdentifier.id)
                    : null;
                if (savedPI && savedCards.length === 1) {
                    defaultPaymentHelper.setDefaultByUUID(defaultWallet, savedPI.UUID);
                } else {
                    defaultPaymentHelper.ensureSingleDefault(defaultWallet);
                }
            }
        } catch (defErr) {
            logger.warn('PlaceOrderDirect: default-card maintenance skipped: {0}', defErr.message || defErr);
        }
    }

    // Save addresses to address book for logged in customers
    if (req.currentCustomer.addressBook) {
        var allAddresses = addressHelpers.gatherShippingAddresses(order);
        allAddresses.forEach(function (address) {
            if (!addressHelpers.checkIfAddressStored(address, req.currentCustomer.addressBook.addresses)) {
                addressHelpers.saveAddress(address, req.currentCustomer, addressHelpers.generateAddressName(address));
            }
        });
    }

    // Send confirmation email
    if (order.getCustomerEmail()) {
        COHelpers.sendConfirmationEmail(order, req.locale.id);
    }

    // Reset multi-shipping flag
    req.session.privacyCache.set('usingMultiShipping', false);

    // Return success
    secureResponseHelper.secureJsonResponse(res, {
        error: false,
        orderID: order.orderNo,
        orderToken: order.orderToken,
        continueUrl: URLUtils.url('Order-Confirm').toString()
    });

    return next();
});

module.exports = server.exports();
