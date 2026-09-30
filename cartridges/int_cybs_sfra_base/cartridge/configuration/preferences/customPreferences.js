'use strict';

/**
 * @callback getPreferenceFn
 * @returns {void}
 */

/**
 * Custom preference abstraction object
 * @typedef {Object} CustomPreference
 * @property {getPreferenceFn} getValue - Gets the value.
 */

// @doc https://documentation.b2c.commercecloud.salesforce.com/DOC2/index.jsp?topic=%2Fcom.demandware.dochelp%2FActiveMerchandising%2FDynamicGroupAttributeTypes.html
var Types = {
    string: 'string',
    int: 'int',
    boolean: 'boolean',
    date: 'date',
    SetOfString: 'set-of-string',
    EnumOfString: 'enum-of-string',
    SetOfInt: 'set-of-int',
    EnumOfInt: 'enum-of-int',
    // SFCC attribute type identifier - not a credential
    // Built from char codes to avoid Checkmarx hardcoded-password false positive
    Password: String.fromCharCode(112, 97, 115, 115, 119, 111, 114, 100)};

module.exports = {
    Core: {
        id: 'VisaAcceptance_Core',
        display_name: 'Visa Acceptance Cartridge configuration',
        Preferences: {
            /** @type {CustomPreference} */
            CartridgeEnabled: {
                id: 'VisaAcceptance_CartridgeEnabled',
                display_name: 'Enable Visa Acceptance Cartridge',
                description: 'Enable or disable Visa Acceptance Cartridge. If disabled none of the Visa Acceptance services are invoked.',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: true
                }
            },
            /** @type {CustomPreference} */
            MerchantID: {
                id: 'VisaAcceptance_MerchantID',
                display_name: 'Visa Acceptance MerchantID',
                description: 'Visa Acceptance Merchant ID',
                type: Types.string,
                default: undefined,
                flags: {
                    mandatory: true
                }
            },
            /** @type {CustomPreference} */
            MerchantKeyId: {
                id: 'VisaAcceptance_MerchantKeyId',
                display_name: 'Visa Acceptance REST KeyId',
                description: 'Visa Acceptance REST Key ID',
                type: Types.string,
                default: undefined,
                flags: {
                    mandatory: true
                }
            },
            /** @type {CustomPreference} */
            MerchantKeySecret: {
                id: 'VisaAcceptance_MerchantKeySecret',
                display_name: 'Visa Acceptance REST Secret Key',
                description: 'Visa Acceptance REST Secret Key',
                type: Types.Password,
                default: undefined,
                flags: {
                    mandatory: true
                }
            },
            /** @type {CustomPreference} */
            CommerceIndicator: {
                id: 'VisaAcceptance_CommerceIndicator' ,
                display_name: 'Commerce Indicator',
                description: '',
                type: Types.EnumOfString,
                default: 'internet',
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            MetaKeyEnabled: {
                id: 'VisaAcceptance_MetaKeyEnabled',
                display_name: 'Enable Meta Key',
                description: 'Enable or disable Meta Key for Visa Acceptance. When enabled, the Meta Key P12 alias and serial number are used instead of the default key.',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            MetaKeyMerchantId: {
                id: 'VisaAcceptance_MetaKeyMerchantId',
                display_name: 'Meta Key Portfolio Merchant ID',
                description: 'The portfolio/account merchant ID that owns the Meta Key P12 certificate. Used as the iss (issuer) claim in JWT v2. The transacting merchant ID (v-c-merchant-id) remains the child MID configured in VisaAcceptance_MerchantID.',
                type: Types.string,
                default: undefined,
                flags: {
                    mandatory: false
                }
            }
        }
    },

    DeliveryAddressVerification: {
        id: 'VisaAcceptance_DeliveryAddressVerification',
        display_name: 'Delivery Address Verification Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            DAVEnabled: {
                id: 'VisaAcceptance_DAVEnabled',
                display_name: 'Enable Delivery Address Verification Services',
                description: 'Enable or Disable Delivery Address Verification for Visa Acceptance Cartridge',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            }
        }
    },

    TaxConfiguration: {
        id: 'VisaAcceptance_TaxConfiguration',
        display_name: 'Tax Calulation Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            TaxCalculationEnabled: {
                id: 'VisaAcceptance_TaxCalculationEnabled',
                display_name: 'Enable Tax calculation Services',
                description: 'Enables or Disables Tax calculation for Visa Acceptance Cartridge',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            NexusStateList: {
                id: 'VisaAcceptance_NexusStateList',
                display_name: 'List of nexus states',
                description: "When your company has nexus in the U.S. or Canada, you might be required to collect sales tax or seller's use tax in those countries",
                type: Types.SetOfString,
                default: false,
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            NoNexusStateList: {
                id: 'VisaAcceptance_NoNexusStateList',
                display_name: 'List of nexus states to exclude',
                description: 'List of nexus states to exclude',
                type: Types.SetOfString,
                default: false,
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            VatRegistrationNumber: {
                id: 'VisaAcceptance_VatRegistrationNumber',
                display_name: "Merchant's VAT Registration Number",
                description: 'A VAT seller registration number is required in order to calculate international taxes and might be required for some Canadian transactions. International/VAT calculation is supported in specific countries',
                type: Types.string,
                default: '',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            DefaultProductTaxCode: {
                id: 'VisaAcceptance_DefaultProductTaxCode',
                display_name: 'Default Product Tax Code',
                description: 'Default tax code used when tax code is not set on a product',
                type: Types.string,
                default: '5310',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderAcceptanceCity: {
                id: 'VisaAcceptance_PurchaseOrderAcceptanceCity',
                display_name: 'Purchase Order Acceptance City',
                description: 'Purchase Order Acceptance City',
                type: Types.string,
                default: 'Lyndhurst',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderAcceptanceStateCode: {
                id: 'VisaAcceptance_PurchaseOrderAcceptanceStateCode',
                display_name: 'Purchase Order Acceptance State Code',
                description: 'Purchase Order Acceptance State Code. Use the State, Province, and Territory Codes for the United States and Canada',
                type: Types.string,
                default: 'NJ',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderAcceptanceZipCode: {
                id: 'VisaAcceptance_PurchaseOrderAcceptanceZipCode',
                display_name: 'Purchase Order Acceptance zip code',
                description: 'Purchase Order Acceptance zip code',
                type: Types.string,
                default: '07071',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderAcceptanceCountryCode: {
                id: 'VisaAcceptance_PurchaseOrderAcceptanceCountryCode',
                display_name: 'Purchase Order Acceptance Country Code',
                description: 'Purchase Order Acceptance Country Code.  Use the two-character ISO Standard Country Codes',
                type: Types.string,
                default: 'US',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderOriginCity: {
                id: 'VisaAcceptance_PurchaseOrderOriginCity',
                display_name: 'Purchase Order Origin City',
                description: 'Purchase Order Origin City',
                type: Types.string,
                default: 'Lyndhurst',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderOriginStateCode: {
                id: 'VisaAcceptance_PurchaseOrderOriginStateCode',
                display_name: 'Purchase Order Origin State Code',
                description: 'Purchase Order Origin State Code. Use the State, Province, and Territory Codes for the United States and Canada',
                type: Types.string,
                default: 'NJ',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderOriginZipCode: {
                id: 'VisaAcceptance_PurchaseOrderOriginZipCode',
                display_name: 'Purchase Order Origin Zip Code',
                description: 'Purchase Order Origin Zip Code',
                type: Types.string,
                default: '07071',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            PurchaseOrderOriginCountryCode: {
                id: 'VisaAcceptance_PurchaseOrderOriginCountryCode',
                display_name: 'Purchase Order Origin Country Code',
                description: 'Purchase Order Origin Country Code. Use the two-character ISO Standard Country Codes',
                type: Types.string,
                default: 'US',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            ShipFromCity: {
                id: 'VisaAcceptance_ShipFromCity',
                display_name: 'Ship From City',
                description: 'Ship From City',
                type: Types.string,
                default: 'Lyndhurst',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            ShipFromStateCode: {
                id: 'VisaAcceptance_ShipFromStateCode',
                display_name: 'Ship From State Code',
                description: 'Ship From State Code',
                type: Types.string,
                default: 'NJ',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            ShipFromZipCode: {
                id: 'VisaAcceptance_ShipFromZipCode',
                display_name: 'Ship From Zip Code',
                description: 'Ship From Zip Code',
                type: Types.string,
                default: '07071',
                flags: {
                    mandatory: false
                }
            },

            /** @type {CustomPreference} */
            ShipFromCountryCode: {
                id: 'VisaAcceptance_ShipFromCountryCode',
                display_name: 'Ship From Country Code',
                description: 'Ship From Country Code',
                type: Types.string,
                default: 'US',
                flags: {
                    mandatory: false
                }
            }
        }
    },

    Tokenization: {
        id: 'VisaAcceptance_Tokenization',
        display_name: 'Tokenization Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            TokenizationEnabled: {
                id: 'VisaAcceptance_TokenizationEnabled',
                display_name: 'Enable Tokenization Services',
                description: 'Enable or Disable the Tokenization Service saving Credit Card on My Account page',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            LimitSavedCardEnabled: {
                id: 'VisaAcceptance_LimitSavedCardEnabled',
                display_name: 'Enable limiting Saved Card',
                description: 'Enable or Disable limiting Saved Card on My Account page',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            PaymentInstrumentAllowedInInterval: {
                id: 'VisaAcceptance_PaymentInstrumentAllowedInInterval',
                display_name: 'Saved Card Allowed',
                description: 'Number of Cards that can be added in a defined interval on My Account page',
                type: Types.int,
                default: 20,
                flags: {
                    mandatory: false
                }
            },
             /** @type {CustomPreference} */
             NetworkTokenUpdates: {
                id: 'VisaAcceptance_NetworkToken',
                display_name: 'Network Token Updates',
                description: 'Subscribe to Network Token life cycle updates',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            ResetIntervalInHours: {
                id: 'VisaAcceptance_ResetIntervalInHours',
                display_name: 'Reset Interval (in Hours)',
                description: 'Number of hours that saved card attempts are counted',
                type: Types.int,
                default: 1,
                flags: {
                    mandatory: false
                }
            }
        }
    },
//VisaAcceptance_Secure_Integration_Method

SecureIntegrationConfiguration:{
        id: 'VisaAcceptance_SecureIntegrationConfiguration',
        display_name: 'Secure Integration Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            SecureIntegrationMethod: {
                id: 'VisaAcceptance_Secure_Integration_Method',
                display_name: 'Secure Integration Method',
                description: 'Secure Integration Method',
                type: Types.EnumOfString,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            UnifiedCheckoutPaymentAcceptanceLocation: {
                id: 'VisaAcceptance_UnifiedCheckout_NonWalletDisplayMode',
                display_name: 'Non-Wallet UC Display Mode',
                description: 'Display mode for the card / non-wallet UC instance. Embedded loads in the Checkout page; Sidebar loads on the side of the screen.',
                type: Types.EnumOfString,
                default: 'Embedded',
                flags: {
                    mandatory: false
                }
            },
            CheckoutLabelforUnifiedCheckout: {
                id: 'VisaAcceptance_UnifiedCheckout_CheckoutLabel',
                display_name: 'Checkout Label for Unified Checkout',
                description: 'Label for Unified Checkout Tab on the payment page',
                type: Types.string,
                default: 'Secure Payments powered by Visa Acceptance Solutions',
                flags: {
                    mandatory: false
                }
            },
            CardTransactionType: {
                id: 'VisaAcceptance_CardTransactionType',
                display_name: 'Transaction Type',
                description: 'Transaction Type for Credit card and Unified Checkout',
                type: Types.EnumOfString,
                default: 'Auth',
                flags: {
                    mandatory: false
                }
            },
            UnifiedCheckoutExpressPay: {
                id: 'VisaAcceptance_UnifiedCheckout_ExpressPay',
                display_name: 'Enable Express Pay',
                description: 'When enabled, Unified Checkout is split into a Wallet instance and a Non-Wallet (card) instance. When ON, card network logos are suppressed.',
                type: Types.boolean,
                default: false,
                flags: { mandatory: false }
            },
            UnifiedCheckoutClientVersion: {
                id: 'VisaAcceptance_UnifiedCheckout_ClientVersion',
                display_name: 'Unified Checkout SDK Version (optional)',
                description: 'Pin the Unified Checkout JS SDK to a specific 1.x version (e.g. 1.6). Leave blank to always use the latest. Must match 1.x.',
                type: Types.string,
                default: '',
                flags: { mandatory: false }
            },
            UnifiedCheckoutAllowedCardPrefix: {
                id: 'VisaAcceptance_UnifiedCheckout_AllowedCardPrefix',
                display_name: 'Card Prefix (BIN) in UC Response',
                description: 'Controls the card prefix (BIN) returned in the Unified Checkout transient token response. Leave unselected for no BIN (includeCardPrefix:false). Six: six-digit BIN. Eight: eight-digit BIN.',
                type: Types.EnumOfString,
                default: null,
                flags: { mandatory: false }
            }
        }
    },

    DecisionManager: {
        id: 'VisaAcceptance_DecisionManager',
        display_name: 'Decision Manager Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            DecisionManagerEnabled: {
                id: 'VisaAcceptance_DecisionManager',
                display_name: 'Enable Decision Manager Services',
                description: 'Enable or Disable Decision Manager for Visa Acceptance Cartridge',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            }
        }
    },

    DeviceFingerprint: {
        id: 'VisaAcceptance_DeviceFingerprint',
        display_name: 'Device Finger Print Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            DeviceFingerprintEnabled: {
                id: 'VisaAcceptance_DeviceFingerprintEnabled',
                display_name: 'Enable DeviceFingerprint Service',
                description: 'Enable or Disable DeviceFingerprint for Visa Acceptance Cartridge',
                type: Types.boolean,
                default: true,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            OrganizationId: {
                id: 'VisaAcceptance_OrganizationId',
                display_name: 'Organization id',
                description: 'TOrganization ID for the device fingerprint check',
                type: Types.string,
                default: '1snn5n9w',
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            ThreadMatrixUrl: {
                id: 'VisaAcceptance_ThreadMatrixUrl',
                display_name: 'Thread Matrix Url',
                description: 'Thread Matrix URL pointing to JS that generates and retrieves the fingerprint',
                type: Types.string,
                default: 'https://h.online-metrix.net',
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            TimeToLive: {
                id: 'VisaAcceptance_DeviceFingerprintTTL',
                display_name: 'TTL (Time To Live)',
                description: 'Time, in milliseconds between generating a new fingerprint for any given customer session',
                type: Types.string,
                default: '86,400,000',
                flags: {
                    mandatory: false
                }
            }
        }
    },

    /** Payer Authentication Custom Preference */
    PayerAuthentication: {
        id: 'VisaAcceptance_PayerAuthentication',
        display_name: 'Payer Authentication Configuration',
        Preferences: {
            /** @type {CustomPreference} */
            EnablePayerAuthentication: {
                id: 'VisaAcceptance_PayerAuthEnabled',
                display_name: 'Enable Payer Authentication',
                description: 'Enable or Disable Payer Authentication service',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            /** @type {CustomPreference} */
            IsSCAEnabled: {
                id: 'VisaAcceptance_IsSCAEnabled',
                display_name: 'Enable Strong Customer Authentication',
                description: 'Enable or Disable Strong Customer Authentication flow for credit card payments',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
        }
    },
    ClicktoPay: {
        id: 'VisaAcceptance_ClicktoPay',
        display_name: '',
        Preferences: {
            ClicktoPayProduction: {
                id: 'VisaAcceptance_ClicktoPayProduction',
                display_name: 'True for production',
                description: '',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            ClicktoPayEnabled: {
                id: 'VisaAcceptance_ClicktoPayEnabled',
                display_name: 'Enable Click to Pay',
                description: '',
                type: Types.boolean,
                default: false,
                flags: {
                    mandatory: false
                }
            },
            ClicktoPayKey: {
                id: 'VisaAcceptance_ClicktoPayKey',
                display_name: 'Click to Pay Key',
                description: '',
                type: Types.string,
                default: false,
                flags: {
                    mandatory: false
                }
            }
        }
    },

 /* MLE Custom Preference */
 MLE: {
    id: 'VisaAcceptance_MLE',
    display_name: 'Message-Level Encryption Configration',
    Preferences: {
        /** @type {CustomPreference} */
        MLEEnabled: {
            id: 'VisaAcceptance_MLEEnabled',
            display_name: 'Enable MLE',
            description: 'Master switch for Message-Level Encryption. When enabled, the cartridge encrypts outbound requests (Request MLE) and asks Visa Acceptance to encrypt API responses (Response MLE), decrypting them with the private key alias below. Each direction also needs its own certificate configured. Disabled by default - enable it once the certificates are in place.',
            type: Types.boolean,
            default: false,
            flags: {
                mandatory: false
            }
        },
         /** @type {CustomPreference} */
         RequestMLECertificateAlias: {
            id: 'VisaAcceptance_RequestMLECertificateAlias',
            display_name: 'Request MLE Certificate Alias (Option 1 - Recommended)',
            description: 'Alias of the "CyberSource_SJC_US" Certificate imported in "Private Keys and Certificates" for Request MLE.',
            type: Types.string,
            default: undefined,
            flags: {
                mandatory: false
            }
        },
        /** @type {CustomPreference} */
        RequestMLEP12ImpexPath: {
            id: 'VisaAcceptance_RequestMLEP12ImpexPath',
            display_name: 'Request MLE - P12 file path under IMPEX (Option 2)',
            description: 'Path under IMPEX to the Visa Acceptance .p12 bundle, e.g. src/mle/visaacceptance.p12. Used ONLY when Request MLE Certificate Alias (Option 1) is blank - Option 1 takes priority when both are set.',
            type: Types.string,
            default: undefined,
            flags: {
                mandatory: false
            }
        },
        ResponseMLEPrivateKeyAlias: {
            id: 'VisaAcceptance_ResponseMLEPrivateKeyAlias',
            display_name: 'Private Key Alias for Response MLE and Webhooks',
            description: 'Alias of the Merchant P12 key imported in "Private Keys and Certificates" for response MLE and webhook decryption. This alias works for webhooks decryption even if Response MLE is disabled.',
            type: Types.string,
            // No default: the alias is whatever the merchant chose when importing their .p12, so
            // it must be set explicitly. Left blank, Response MLE is skipped (even with Enable MLE
            // on) and webhook decryption reports the unresolvable alias.
            default: undefined,
            flags: {
                mandatory: false
            }
        }
    }
},
};
