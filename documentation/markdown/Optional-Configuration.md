# Optional Configuration

---

## Digital Payment Methods

Digital wallets are offered through Unified Checkout, which presents card entry (PAN), Click to Pay, and the enabled wallets in a single widget. The wallets available through Unified Checkout are **Apple Pay, Google Pay, Paze, PayPal, and Venmo**.

> **Note:** Standalone Google Pay has been removed. Google Pay is now offered through Unified Checkout. Standalone Apple Pay (the Salesforce B2C Commerce default) remains available.
### Unified Checkout Configuration

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Secure Integration Configuration** and set the **Secure Integration Method** to **Unified Checkout**.

2. Go to **Merchant Tools > Ordering > Payment Methods** and confirm each method below has the correct **Payment Processor** mapping. Which wallets and methods are actually presented in Unified Checkout is controlled by what you enable for your Merchant ID in the Visa Acceptance Business Center (EBC).
   - **DW_APPLE_PAY** – Payment Processor `PAYMENTS_APPLEPAY`
   - **DW_GOOGLE_PAY** – Payment Processor `PAYMENTS_GOOGLEPAY`
   - **DW_PAZE** – Payment Processor `PAYMENTS_PAZE`
   - **PAYPAL** – Payment Processor `PAYMENTS_PAYPAL`
   - **VENMO** – Payment Processor `PAYMENTS_VENMO`
   - **CLICK_TO_PAY** – Payment Processor `PAYMENTS_CLICK_TO_PAY`

> **Important:** The digital payment methods you want to offer through Unified Checkout must be enabled for your Merchant ID in the Visa Acceptance Business Center (EBC) — that is where enablement is controlled, not in Business Manager.

### Unified Checkout Display Options

The following optional settings under **Custom Preferences > Secure Integration Configuration** control how Unified Checkout is presented:

| Field | Description |
|-------|-------------|
| Checkout Label for Unified Checkout | Label for the Unified Checkout tab on the payment page (up to 60 characters). Default: "Secure Payments powered by Visa Acceptance Solutions" |
| Enable Express Pay | Split Unified Checkout into separate wallet and non-wallet instances |
| Checkout Version (optional) | Pin a specific Unified Checkout 1.x version. Leave blank for the latest release |
| Card Prefix (BIN) in UC Response | Card prefix (BIN) length returned in the UC token response: Six-digit or Eight-digit |
| Non-Wallet UC Display Mode | Display mode for the card / non-wallet UC instance: Embedded or Sidebar |

---

### Apple Pay Standalone Configuration

To offer Apple Pay outside of Unified Checkout, follow these steps to enable Apple Pay in your Salesforce B2C Commerce store.

#### Salesforce Business Manager Configuration

1. Go to: **Merchant Tools > Site Preferences > Apple Pay**.

2. Check "Apple Pay Enabled?"

3. Fill in the "Onboarding" form:
   - Ensure "Apple Merchant ID" and "Apple Merchant Name" match settings in your Apple account.
   - Ensure all other fields match your supported Visa Acceptance settings.
   - **Country Code:** Enter the country code for the locale of your site. The country code is a two letter ISO 3166 country code (e.g. US).
   - **Merchant Capabilities:** Check box for 3-D Secure, leave other fields unchecked
   - **Supported Networks:** Select the types of payment you support: Amex, MasterCard, and Visa are supported by Visa Acceptance.
   - **Required Shipping Address Fields:** Select the fields that are required on the shipping form. Visa Acceptance recommends Email, Name, Phone, and Postal Address
   - **Required Billing Address Fields:** Select Name and Postal Address

4. Fill in the "Storefront Injection" form:
   - Select where Apple Pay buttons should be displayed on your site.

5. Fill in "Payment Integration" form:
   - **Use Commerce Cloud Apple Pay Payment API?** Checked
   - **Payment Provider URL:**
     - Test: `https://apitest.visaacceptance.com/partner/demandware/payments/v1/authorizations`
     - Production: `https://api.visaacceptance.com/partner/demandware/payments/v1/authorizations`
   - **Payment Provider Merchant ID:** Enter your Visa Acceptance merchant ID
   - **API Version:** v1
   - **Use Basic Authorization?** Unchecked
   - **Payment Provider User:** Not Applicable
   - **Payment Provider Password:** Not Applicable
   - **Use JWS?** Yes
   - **JWS Private Key Alias:** Merchant's .p12 Key Alias

   > The private key alias is created when a merchant uploads their .p12 key file (from Visa Acceptance self-serve) to Commerce Cloud's Salesforce Business Manager Module, Private Keys and Certificates (**Administration > Operations > Private Keys and Certificates**)

6. Click "Submit".

#### Domain Registration in Salesforce Business Manager

1. Go to: **Merchant Tools > Site Preferences > Apple Pay**.

2. Under Domain Registration section:
   - Click on **Register Apple Sandbox** under Apple Sandbox section to register Salesforce B2C to Apple Sandbox account.
   - Click on **Register Apple Production** under Apple Production section to register Salesforce B2C to Apple Production account.

#### Transaction Type

Go to **Merchant Tools > Site Preferences > Custom Preferences > Apple Pay Configuration** and choose Authorization or Sale.

---

## Alternative Payment Methods

Alternative Payment Methods (APMs) and bank transfer are offered through Unified Checkout. APMs are locale/currency-specific and must also be enabled for your Merchant ID in the Visa Acceptance Business Center (EBC).

### Supported Alternative Payment Methods

- iDEAL
- Bancontact
- Multibanco
- MyBank
- Tink Pay by Bank
- Przelewy24
- Dragonpay
- Konbini

For APMs, go to **Merchant Tools > Ordering > Payment Methods** and confirm the correct **Payment Processor** mapping:

- **ALT_PAYMENT_METHOD** – Payment Processor `ALT_PAYMENT`

The individual APMs presented to the shopper depend on their locale and currency and on what you have enabled for your Merchant ID in the Business Center.

### eCheck / Bank Transfer Configuration

eCheck is offered as a bank transfer option within Unified Checkout. Enable eCheck for your Merchant ID in the Visa Acceptance Business Center (EBC); in Business Manager you only need the correct payment-processor mapping.

1. Go to **Merchant Tools > Ordering > Payment Methods** and confirm the correct **Payment Processor** mapping:
   - **BANK_TRANSFER** – Payment Processor `BANK_TRANSFER`

---

## Payer Authentication/3D-Secure

Configure Payer Authentication/3D-Secure for enhanced transaction security.

> **Note:** These settings apply to the Salesforce default card form (Direct API) only. For Unified Checkout, configure Payer Authentication in the Visa Acceptance Business Center (EBC).

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Salesforce Default Acceptance Configuration**

2. Select **Payer Authentication Mode:**

   The "Payer Authentication Mode" setting now provides a dropdown with four options:

   | Option | Description |
   |--------|-------------|
   | Yes | All transactions will process with 3D-Secure. |
   | No | No transactions will process with 3D-Secure. |
   | Data Only + Yes | Data Only will be used for Visa and Mastercard/Maestro. All other card
   brands will process with 3D-Secure. |
   | Data Only + No | Data Only will be used for Visa and Mastercard/Maestro. All other card
   brands will process without 3D-Secure. |

3. **Enable SCA:** Set to Enable to enforce Strong Consumer Authentication (3D-Secure Challenge) when a customer is saving their payment card for future transactions

---

## Tokenization

Tokenization allows you to offer the ability for your customers to save their payment cards securely for future payments.

1. To enable tokenization, go to **Merchant Tools > Site Preferences > Custom Preferences > Tokenization Configuration**

| Field | Description |
|-------|-------------|
| Enable Tokenization Services | Set to Enable to turn on Tokenization |
| Enable Limiting Saved Card | Set to Enable to set the limits associated to saving cards |
| Saved Cards Allowed | Enter the number of cards a customer can save in the defined time limit |
| Reset Interval | The number of hours before the saved card limit resets |
| Network Token | Enable this to subscribe to token updates. Updated tokens are retrieved from the Token Management Service (TMS) via API. |

> **Note:** Token updates are now retrieved through the Token Management Service (TMS) API. The previous Network Token webhook and its "Network Tokens Webhook" custom object have been removed.

---

## Fraud Screening

Enabling Fraud Screening tells the cartridge to look for fraud screening responses. Fraud Screening profiles need to be set up in the Business Center.

> **Note:** Decision Manager settings apply to the Salesforce default card form (Direct API) only. For Unified Checkout, configure fraud controls in the Visa Acceptance Business Center (EBC).

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Salesforce Default Acceptance Configuration** and set these:

| Field | Description |
|-------|-------------|
| Enable Decision Manager Services | set to Enable to turn on |

2. Decision Manager order updates are delivered primarily through webhook notifications (see the [Webhooks](Webhooks.md) guide). The Decision Manager Update Job remains available as a fallback in case of webhook delivery issues.

   To enable the fallback job, go to **Administration > Operations > Jobs**, select **Payment: Decision Manager Order Update**, and set these values:

   | Field | Description |
   |-------|-------------|
   | ID | Enter a job ID |
   | Description | Enter the job description |
   | ExecuteScriptModule.Module | `int_cybs_sfra_base/cartridge/scripts/jobs/DMOrderStatusUpdate.js` |
   | ExecuteScriptModule.FunctionName | `orderStatusUpdate` |
   | ExecuteScriptModule.Transactional | True: All changes occur as a single atomic operation. If any error occurs during the job, the system rolls back all changes to maintain data consistency. False: No automatic rollback is applied. |
   | ExecuteScriptModule.TimeoutInSeconds | set the function timeout value |

---

## Device FingerPrint

Device FingerPrinting collects information about the device used when paying for an order and can assist in fraud screening decisions.

Go to **Merchant Tools > Site Preferences > Custom Preferences > Device Finger Print Configuration** and set these:

| Field | Description |
|-------|-------------|
| Enable DeviceFingerprint Service | set to Enable to turn on |
| Organization ID | Enter the Organization ID – contact support if you do not know this value |
| ThreatMetrix URL | This URL points to the JavaScript that generates and retrieves the fingerprint of the device |
| TTL (Time to Live) | Enter the amount of milliseconds to wait before generating a new fingerprint for any given customer session |

---

## Delivery Address Verification

To have the customers shipping address verified during checkout, configure Delivery Address Verification services.

Go to **Merchant Tools > Site Preferences > Custom Preferences > Delivery Address Verification Configuration** and set **Enable Delivery Address Verification Services** to Enable.

---

## Tax Calculation

To calculate local taxes once the customer has entered their address on the checkout, configure Tax Calculation services.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Tax Configuration** and set these:

| Field | Description |
|-------|-------------|
| Enable Tax Calculation | Set to Enable to turn on |
| List of Nexus States | List of states to calculate tax for |
| List of Nexus States to Exclude | List of states to not calculate tax for |
| Merchants VAT Registration Number | Enter your VAT registration number if you have one |
| Default Product Tax Code | Default tax code to use if products in the basket do not have a tax code |
| Purchase Order Acceptance City | City for purchase order acceptance |
| Purchase Order Acceptance State Code | State code for purchase order acceptance |
| Purchase Order Acceptance Zip Code | Zip code for purchase order acceptance |
| Purchase Order Acceptance Country Code | Country code for purchase order acceptance |
| Purchase Order Origin City | City of purchase order origin |
| Purchase Order Origin State Code | State code of purchase order origin |
| Purchase Order Origin Zip Code | Zip code of purchase order origin |
| Purchase Order Origin Country Code | Country code of purchase order origin |
| Ship From City | City shipping from |
| Ship From State Code | State code shipping from |
| Ship From Zip Code | Zip code shipping from |
| Ship From Country Code | Country code shipping from |

> **Important:** If you enable Tax Calculation and do not set List of Nexus States or List of Nexus States to Exclude, Tax Calculation will assume every state or province is taxable. You can only set List of Nexus States or List of Nexus States to Exclude, not both.

---

## Meta Key

Meta Key lets a portfolio or account process transactions on behalf of its child merchants using a single set of credentials. We can assign a single meta key to dozens or hundreds of transacting MIDs simultaneously. Follow the steps mentioned in [Create a Meta Key](https://developer.cybersource.com/docs/cybs/en-us/security-keys/user/all/ada/security-keys/keys-meta-intro.html) that you can use to authenticate requests.
Creating and Using Security Keys - Meta Key Creation and Management
 

Go to **Merchant Tools > Site Preferences > Custom Preferences > Visa Acceptance Cartridge configuration** and set these:

| Field | Description |
|-------|-------------|
| Enable Meta Key | Set to enable to turn on Meta Key |
| Meta Key Portfolio Merchant ID | The portfolio/account merchant ID that owns the Meta Key |

Meta Key authenticates with the REST Shared Secret and Key ID configured in Visa Acceptance Core; no certificate is required.

---

---

[Next: Webhooks →](Webhooks.md)
