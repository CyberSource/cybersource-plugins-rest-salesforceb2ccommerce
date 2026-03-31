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

/** DeveloperId
 * Identifier for the developer that helped integrate a partner solution to CyberSource.
 * Send this value in all requests that are sent through the partner solutions built by that developer. CyberSource assigns the ID to the developer.
 * Note When you see a developer ID of 999 in reports, the developer ID that was submitted is incorrect.
 */

/** SolutionId
 * Identifier for the partner that is integrated to CyberSource.
 * Send this value in all requests that are sent through the partner solution. CyberSource assigns the ID to the partner.
 * Note When you see a partner ID of 999 in reports, the partner ID that was submitted is incorrect.
 */
var SolutionId = 'AWRA0PP7';

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
        authenticationType: 'http_signature',
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
        developerId: config.developerId || customPreferences.Core.Preferences.DeveloperId.getValue(),
        CommerceIndicator: config.CommerceIndicator || customPreferences.Core.Preferences.CommerceIndicator.getValue(),

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
            route: 'CheckoutServices-GetGooglePayToken'
        },
        {
            route: 'CheckoutServices-SubmitPaymentGP'
        },
        {
            route: 'CheckoutServices-SubmitPayment'
        }
        ],
        taxCookieId: '_taxvalue',
       
        // DecisionManager
        fmeDmEnabled: config.fmeDmEnabled || customPreferences.DecisionManager.Preferences.DecisionManagerEnabled.getValue(),
        fmeDmConversionDetailReportLookbackTime: config.ConversionDetailReportLookbackTime || customPreferences.DecisionManager.Preferences.ConversionDetailReportLookbackTime.getValue(),

        // Device Fingerprint
        deviceFingerprintEnabled: config.deviceFingerprintEnabled || customPreferences.DeviceFingerprint.Preferences.DeviceFingerprintEnabled.getValue(),
        deviceFingerprintOrganizationId: config.deviceFingerprintOrganizationId || customPreferences.DeviceFingerprint.Preferences.OrganizationId.getValue(),
        deviceFingerprintThreadMatrixUrl: config.deviceFingerprintThreadMatrixUrl || customPreferences.DeviceFingerprint.Preferences.ThreadMatrixUrl.getValue(),
        deviceFingerprintTimeToLive: config.deviceFingerprintTimeToLive || customPreferences.DeviceFingerprint.Preferences.TimeToLive.getValue(),

        enableCapture: config.EnableCapture || false,

        // PayerAuthentication
        payerAuthenticationEnabled: config.payerAuthenticationEnabled || customPreferences.PayerAuthentication.Preferences.EnablePayerAuthentication.getValue(),
        isSCAEnabled: config.isSCAEnabled || customPreferences.PayerAuthentication.Preferences.IsSCAEnabled.getValue(),

        // GooglePay
        googlePayEnabled: config.googlePayEnabled || customPreferences.GooglePay.Preferences.EnableGooglePay.getValue(),
        googlePayMerchantId: config.googlePayMerchantId || customPreferences.GooglePay.Preferences.GooglePayMerchantId.getValue(),
        enableGooglePayOnMiniCart: config.enableGooglePayOnMiniCart || customPreferences.GooglePay.Preferences.EnableGooglePayOnMiniCart.getValue(),
        googlePayEnvironment: config.googlePayEnvironment || customPreferences.GooglePay.Preferences.GooglePayEnvironment.getValue(),
        enableGooglePayOnCart: config.enableGooglePayOnCart || customPreferences.GooglePay.Preferences.EnableGooglePayOnCart.getValue(),

        //MLE
        mleEnabled: config.mleEnabled || customPreferences.MLE.Preferences.EnableMLE.getValue(),
        mleCertificateSerialNumber: config.mleCertificateSerialNumber || customPreferences.MLE.Preferences.MLECertificateSerialNumber.getValue(),
        mleCertificateAlias: config.mleCertificateAlias || customPreferences.MLE.Preferences.MLECertificateAlias.getValue(),

        //SecureIntegrationConfiguration
        secureIntegrationMethod: secureIntegrationMethod,
        UnifiedCheckoutPaymentAcceptanceLocation: config.unifiedCheckoutPaymentAcceptanceLocation || customPreferences.SecureIntegrationConfiguration.Preferences.UnifiedCheckoutPaymentAcceptanceLocation.getValue(),
        allowedCardNetworks: config.allowedCardNetworks || customPreferences.SecureIntegrationConfiguration.Preferences.AllowedCardNetworks.getValue(),
        digitalPaymentMethods: config.digitalPaymentMethods || customPreferences.SecureIntegrationConfiguration.Preferences.DigitalPaymentMethods.getValue(),
        eCheckEnabledForUnifiedCheckout: config.eCheckEnabledForUnifiedCheckout || customPreferences.SecureIntegrationConfiguration.Preferences.ECheckEnabledforUnifiedCheckout.getValue(),
        unifiedCheckoutLabel: config.unifiedCheckoutLabel || customPreferences.SecureIntegrationConfiguration.Preferences.CheckoutLabelforUnifiedCheckout.getValue(),
        minicartEnabled: config.VisaAcceptance_UnifiedCheckout_Cart_Minicart || customPreferences.SecureIntegrationConfiguration.Preferences.VisaAcceptance_UnifiedCheckout_Cart_Minicart.getValue(),
        cardTransactionType: config.cardTransactionType || customPreferences.SecureIntegrationConfiguration.Preferences.CardTransactionType.getValue(),

        flexMicroformEnabled: secureIntegrationMethod == 'Microform',
        unifiedCheckoutEnabled: secureIntegrationMethod == 'Unified_Checkout',
    };
}
module.exports = getConfig();
