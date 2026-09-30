'use strict';

/*
 * Merchant configuration properties are taken from Configuration module
 */

// logging parameters
var EnableLog = false;
var LogFileName = 'cybs';
var LogDirectory = '../log';
var LogfileMaxSize = '5242880'; // 10 MB In Bytes

// Partner Information

/** SolutionId
 * Identifier for the partner that is integrated to Visa Acceptance.
 * Send this value in all requests that are sent through the partner solution. Visa Acceptance assigns the ID to the partner.
 * Note When you see a partner ID of 999 in reports, the partner ID that was submitted is incorrect.
 */
var SolutionId = '7114dw8t';

var CruiseDDCEndPoint = {
    Stage: 'https://centinelapistag.cardinalcommerce.com/V1/Cruise/Collect',
    Production: 'https://centinelapi.cardinalcommerce.com/V1/Cruise/Collect'
};

/**
 * @param {*} config *
 * @returns {*} *
 */
function getConfig(config) {
    // eslint-disable-next-line no-param-reassign
    config = (config) || {};
    var customPreferences = require('./preferences/index');
    var secureIntegrationMethod = config.secureIntegrationMethod || customPreferences.SecureIntegrationConfiguration.Preferences.SecureIntegrationMethod.getValue();
    
    return {
        // Api Client config
        // Auth mechanism is no longer merchant-selectable: ApiClient.callApi uses shared-secret
        // JWT for every REST call, including /uc/v1/sessions. This value is informational only
        // (recorded as the payment transaction's authMethod).
        authenticationType: 'jwt',
        runEnvironment: 'cybersource.environment.SANDBOX',
        enableLog: EnableLog,
        logFilename: LogFileName,
        logDirectory: LogDirectory,
        logFileMaxSize: LogfileMaxSize,
        solutionId: SolutionId,
        cruiseDDCEndPoint: CruiseDDCEndPoint,

        // CORE
        cartridgeEnabled: config.cartridgeEnabled || customPreferences.Core.Preferences.CartridgeEnabled.getValue(),
        merchantID: config.merchantID || customPreferences.Core.Preferences.MerchantID.getValue(),
        merchantKeyId: config.merchantKeyId || customPreferences.Core.Preferences.MerchantKeyId.getValue(),
        merchantsecretKey: config.merchantSecretKey || customPreferences.Core.Preferences.MerchantKeySecret.getValue(),
        CommerceIndicator: config.CommerceIndicator || customPreferences.Core.Preferences.CommerceIndicator.getValue(),

        // Meta Key
        metaKeyEnabled: config.metaKeyEnabled || customPreferences.Core.Preferences.MetaKeyEnabled.getValue(),
        metaKeyMerchantId: config.metaKeyMerchantId || customPreferences.Core.Preferences.MetaKeyMerchantId.getValue(),


        // Delivery address verification
        davEnabled: config.davEnabled || customPreferences.DeliveryAddressVerification.Preferences.DAVEnabled.getValue(),

        // Tokenization
        tokenizationEnabled: config.tokenizationEnabled || customPreferences.Tokenization.Preferences.TokenizationEnabled.getValue(),
        tokenizationPaymentInstrumentAllowedInInterval: config.tokenizationPaymentInstrumentAllowedInInterval || customPreferences.Tokenization.Preferences.PaymentInstrumentAllowedInInterval.getValue(),
        tokenizationResetIntervalInHours: config.tokenizationResetIntervalInHours || customPreferences.Tokenization.Preferences.ResetIntervalInHours.getValue(),
        tokenizationLimitSavedCardEnabled: config.tokenizationLimitSavedCardEnabled || customPreferences.Tokenization.Preferences.LimitSavedCardEnabled.getValue(),
        networkTokenizationEnabled: config.networkTokenizationEnabled || customPreferences.Tokenization.Preferences.NetworkTokenUpdates.getValue(),

        // Tax configuration
        taxServiceEnabled: config.taxServiceEnabled || customPreferences.TaxConfiguration.Preferences.TaxCalculationEnabled.getValue(),
        taxServiceNexusStateList: config.nexusStateList || customPreferences.TaxConfiguration.Preferences.NexusStateList.getValue(),
        taxServiceNoNexusStateList: config.noNexusStateList || customPreferences.TaxConfiguration.Preferences.NoNexusStateList.getValue(),
        taxServiceVatRegistrationNumber: config.taxServiceVatRegistrationNumber || customPreferences.TaxConfiguration.Preferences.VatRegistrationNumber.getValue(),
        taxDefaultProductTaxCode: config.taxServiceVatRegistrationNumber || customPreferences.TaxConfiguration.Preferences.VatRegistrationNumber.getValue(),
        taxPurchaseOrderAcceptanceCity: config.taxPurchaseOrderAcceptanceCity || customPreferences.TaxConfiguration.Preferences.PurchaseOrderAcceptanceCity.getValue(),
        taxPurchaseOrderAcceptanceStateCode: config.taxPurchaseOrderAcceptanceStateCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderAcceptanceStateCode.getValue(),
        taxPurchaseOrderAcceptanceZipCode: config.taxPurchaseOrderAcceptanceZipCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderAcceptanceZipCode.getValue(),
        taxPurchaseOrderAcceptanceCountryCode: config.taxPurchaseOrderAcceptanceCountryCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderAcceptanceCountryCode.getValue(),
        taxPurchaseOrderOriginCity: config.taxPurchaseOrderOriginCity || customPreferences.TaxConfiguration.Preferences.PurchaseOrderOriginCity.getValue(),
        taxPurchaseOrderOriginStateCode: config.taxPurchaseOrderOriginStateCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderOriginStateCode.getValue(),
        taxPurchaseOrderOriginZipCode: config.taxPurchaseOrderOriginZipCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderOriginZipCode.getValue(),
        taxPurchaseOrderOriginCountryCode: config.taxPurchaseOrderOriginCountryCode || customPreferences.TaxConfiguration.Preferences.PurchaseOrderOriginCountryCode.getValue(),
        taxShipFromCity: config.taxShipFromCity || customPreferences.TaxConfiguration.Preferences.ShipFromCity.getValue(),
        taxShipFromStateCode: config.taxShipFromStateCode || customPreferences.TaxConfiguration.Preferences.ShipFromStateCode.getValue(),
        taxShipFromZipCode: config.taxShipFromZipCode || customPreferences.TaxConfiguration.Preferences.ShipFromZipCode.getValue(),
        taxShipFromCountryCode: config.taxShipFromCountryCode || customPreferences.TaxConfiguration.Preferences.ShipFromCountryCode.getValue(),
        calculateTaxOnRoute: [{
            route: 'CheckoutShippingServices-SubmitShipping'
        },
        {
            route: 'CheckoutServices-SubmitPayment'
        },
        {
            // Non-UC place-order path: SFRA CheckoutServices-PlaceOrder recalculates the
            // basket (calculateTotals) right before createOrder/handlePayments. Without this
            // route the recalc falls back to SFCC default tax, so the order, the authorization
            // request, the payer-auth request, and the confirmation page all use the wrong tax.
            // (UC PlaceOrderDirect is unaffected — it reconciles from the transient-token amount.)
            route: 'CheckoutServices-PlaceOrder'
        }
        ],
        taxCookieId: '_taxvalue',
       
        // DecisionManager
        fmeDmEnabled: config.fmeDmEnabled || customPreferences.DecisionManager.Preferences.DecisionManagerEnabled.getValue(),

        // Device Fingerprint
        deviceFingerprintEnabled: config.deviceFingerprintEnabled || customPreferences.DeviceFingerprint.Preferences.DeviceFingerprintEnabled.getValue(),
        deviceFingerprintOrganizationId: config.deviceFingerprintOrganizationId || customPreferences.DeviceFingerprint.Preferences.OrganizationId.getValue(),
        deviceFingerprintThreadMatrixUrl: config.deviceFingerprintThreadMatrixUrl || customPreferences.DeviceFingerprint.Preferences.ThreadMatrixUrl.getValue(),
        deviceFingerprintTimeToLive: config.deviceFingerprintTimeToLive || customPreferences.DeviceFingerprint.Preferences.TimeToLive.getValue(),

        enableCapture: config.EnableCapture || false,

        // PayerAuthentication
        payerAuthenticationEnabled: config.payerAuthenticationEnabled || customPreferences.PayerAuthentication.Preferences.EnablePayerAuthentication.getValue(),
        isSCAEnabled: config.isSCAEnabled || customPreferences.PayerAuthentication.Preferences.IsSCAEnabled.getValue(),

        //MLE
        requestMleCertificateAlias: config.requestMleCertificateAlias || customPreferences.MLE.Preferences.RequestMLECertificateAlias.getValue(),
        responseMlePrivateKeyAlias: config.responseMlePrivateKeyAlias ||customPreferences.MLE.Preferences.ResponseMLEPrivateKeyAlias.getValue(),
        // Master MLE switch, gating BOTH request and response encryption. Off unless explicitly
        // enabled, so an unset preference (an instance whose metadata predates this field) is
        // treated the same as unticked.
        //
        // Coerced via String(): getValue() returns the raw site-preference value, which on this
        // engine can be a Java-backed Boolean. Those are ALWAYS truthy in JavaScript, so a plain
        // `||`/`&&` on the raw value would read an unticked checkbox as enabled.
        mleEnabled: typeof config.mleEnabled === 'boolean'
            ? config.mleEnabled
            : String(customPreferences.MLE.Preferences.MLEEnabled.getValue()) === 'true',
        // Single-file MLE: when set, the .p12 in IMPEX supplies the request-MLE certificate and
        // its key id (see scripts/mle/p12Reader.js). Response MLE is not affected — it is gated
        // on responseMlePrivateKeyAlias alone.
        requestMleP12ImpexPath: config.requestMleP12ImpexPath || customPreferences.MLE.Preferences.RequestMLEP12ImpexPath.getValue(),

        //SecureIntegrationConfiguration
        secureIntegrationMethod: secureIntegrationMethod,
        UnifiedCheckoutPaymentAcceptanceLocation: config.unifiedCheckoutPaymentAcceptanceLocation || customPreferences.SecureIntegrationConfiguration.Preferences.UnifiedCheckoutPaymentAcceptanceLocation.getValue(),
        unifiedCheckoutLabel: config.unifiedCheckoutLabel || customPreferences.SecureIntegrationConfiguration.Preferences.CheckoutLabelforUnifiedCheckout.getValue(),
        cardTransactionType: config.cardTransactionType || customPreferences.SecureIntegrationConfiguration.Preferences.CardTransactionType.getValue(),
        unifiedCheckoutExpressPay: typeof config.unifiedCheckoutExpressPay === 'boolean' ? config.unifiedCheckoutExpressPay : customPreferences.SecureIntegrationConfiguration.Preferences.UnifiedCheckoutExpressPay.getValue(),
        unifiedCheckoutClientVersion: config.unifiedCheckoutClientVersion || customPreferences.SecureIntegrationConfiguration.Preferences.UnifiedCheckoutClientVersion.getValue(),
        unifiedCheckoutAllowedCardPrefix: config.unifiedCheckoutAllowedCardPrefix || customPreferences.SecureIntegrationConfiguration.Preferences.UnifiedCheckoutAllowedCardPrefix.getValue(),

        unifiedCheckoutEnabled: secureIntegrationMethod == 'Unified_Checkout',
        // None = any selection other than Unified Checkout (the explicit "Salesforce Default
        // Credit Card Payment Acceptance" enum value, or a blank/legacy preference). The
        // cartridge falls back to SFRA's native card form path with the cartridge handling
        // auth / DM / Payer Auth / TMS in the back-end. Settings for this flow live in the
        // VisaAcceptance_SalesforceDefaultAcceptance_Configuration BM group.
        noneIntegrationEnabled: secureIntegrationMethod !== 'Unified_Checkout',
    };
}
module.exports = getConfig();
