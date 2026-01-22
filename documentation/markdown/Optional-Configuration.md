# Optional Configuration

---

## 8.1 Digital Payment Methods

You can offer Apple Pay and Google Pay as standalone options, or you can offer them alongside Click to Pay within Unified Checkout.

You can configure digital payment methods in two ways: through Unified Checkout or as standalone options.

### Unified Checkout Configuration

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Secure Integration Configuration** and set these parameters:
   - **Digital Payment Methods in Unified Checkout:** Choose from Apple Pay, Google Pay and/or Click to Pay
   - **Enable Unified Checkout for Cart and Mini Cart:** Enable this to display digital payment methods for quick checkout on the cart and mini cart pages

2. Go to **Merchant Tools > Ordering > Payment Methods** and confirm these are set/enabled for the methods you want to accept:
   - **DW_APPLE_PAY** – check Payment Processor is `PAYMENTS_APPLEPAY`
   - **DW_GOOGLE_PAY** – check it is enabled and Payment Processor is `PAYMENTS_CREDIT`
   - **CLICK_TO_PAY** – check Payment Processor is `PAYMENTS_CLICK_TO_PAY`

> **Important:** If you are using Unified Checkout for digital payment methods, they must be enabled for your Merchant ID in Business Center.

---

### 8.1.1 Apple Pay Standalone Configuration

To offer Apple Pay outside of Unified Checkout, follow these steps to enable Apple Pay in your Salesforce B2C Commerce store.

#### Salesforce Business Manager Configuration

1. Go to: **Merchant Tools > Site Preferences > Apple Pay**.

2. Check "Apple Pay Enabled?"

3. Fill in the "Onboarding" form:
   - Ensure "Apple Merchant ID" and "Apple Merchant Name" match settings in your Apple account.
   - Ensure all other fields match your supported Cybersource settings.
   - **Country Code:** Enter the country code for the locale of your site. The country code is a two letter ISO 3166 country code (e.g. US).
   - **Merchant Capabilities:** Check box for 3-D Secure, leave other fields unchecked
   - **Supported Networks:** Select the types of payment you support: Amex, MasterCard, and Visa are supported by Cybersource.
   - **Required Shipping Address Fields:** Select the fields that are required on the shipping form. Cybersource recommends Email, Name, Phone, and Postal Address
   - **Required Billing Address Fields:** Select Name and Postal Address

4. Fill in the "Storefront Injection" form:
   - Select where Apple Pay buttons should be displayed on your site.

5. Fill in "Payment Integration" form:
   - **Use Commerce Cloud Apple Pay Payment API?** Checked
   - **Payment Provider URL:**
     - Test: `https://apitest.cybersource.com/partner/demandware/payments/v1/authorizations`
     - Production: `https://api.cybersource.com/partner/demandware/payments/v1/authorizations`
   - **Payment Provider Merchant ID:** Enter your Cybersource merchant ID
   - **API Version:** v1
   - **Use Basic Authorization?** Unchecked
   - **Payment Provider User:** Not Applicable
   - **Payment Provider Password:** Not Applicable
   - **Use JWS?** Yes
   - **JWS Private Key Alias:** Merchant's .p12 Key Alias

   > The private key alias is created when a merchant uploads their .p12 key file (from Cybersource self-serve) to Commerce Cloud's Salesforce Business Manager Module, Private Keys and Certificates (**Administration > Operations > Private Keys and Certificates**)

6. Click "Submit".

#### Domain Registration in Salesforce Business Manager

1. Go to: **Merchant Tools > Site Preferences > Apple Pay**.

2. Under Domain Registration section:
   - Click on **Register Apple Sandbox** under Apple Sandbox section to register Salesforce B2C to Apple Sandbox account.
   - Click on **Register Apple Production** under Apple Production section to register Salesforce B2C to Apple Production account.

#### Transaction Type

Go to **Merchant Tools > Site Preferences > Custom Preferences > Apple Pay** and choose Authorization or Sale.

---

### 8.1.2 Google Pay Standalone Configuration

To offer Google Pay outside of Unified Checkout, follow these steps to enable Google Pay in your Salesforce B2C Commerce store.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Google Pay**

2. Configure Google Pay settings:

| Field | Description |
|-------|-------------|
| Enable Google Pay | set to Enable to enable Google Pay |
| Enable Google Pay on Mini Cart | set to Enable to show Google Pay as a checkout option in the mini cart |
| Enable Google Pay on Cart | set to Enable to show Google Pay as a checkout option in the cart |
| Google Pay Merchant Id | Enter your Google Pay merchant ID (for live processing only) |
| Google Pay Environment | Set to Test for testing and Production for live |
| Google Pay Transaction Type | Choose Authorization or Sale |

---

## 8.2 Alternative Payment Methods

Configure alternative payment methods such as eCheck for your Salesforce B2C Commerce store.

### eCheck Configuration

eCheck can be enabled as a payment option within Unified Checkout.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Secure Integration Configuration**

2. **Enable eCheck:** set to Yes to enable eCheck

3. Go to **Merchant Tools > Ordering > Payment Methods** and confirm this is set/enabled:
   - **BANK_TRANSFER** – check Payment Processor is `BANK_TRANSFER`

---

## 8.3 Payer Authentication/3D-Secure

Configure Payer Authentication/3D-Secure for enhanced transaction security.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_PayerAuthentication**

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

3. **IsSCAEnabled:** Set to Enable to enforce Strong Consumer Authentication (3D-Secure Challenge) when a customer is saving their payment card for future transactions

---

## 8.4 Tokenization

Tokenization allows you to offer the ability for your customers to save their payment cards securely for future payments.

1. To enable tokenization, go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_Tokenization**

| Field | Description |
|-------|-------------|
| Enable Tokenization Services | Set to Enable to turn on Tokenization |
| Enable Limiting Saved Card | Set to Enable to set the limits associated to saving cards |
| Saved Cards Allowed | Enter the number of cards a customer can save in the defined time limit |
| Reset Interval | The number of hours before the saved card limit resets |
| Network Token Updates | If your Cybersource MID is configured for Network Tokens, enabling this will inform the cartridge to subscribe for Token Life Cycle Updates webhooks |

2. Go to **Merchant Tools > Custom objects > Custom Object Editor** and check the custom object type "Network Tokens Webhook" exists

---

## 8.5 Fraud Screening

Enabling Fraud Screening tells the cartridge to look for fraud screening responses. Fraud Screening profiles need to be set up in the Business Center.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DecisionManager** and set these:

| Field | Description |
|-------|-------------|
| Enable Decision Manager Services | set to Enable to turn on |
| Conversion Detail Report Lookback Time | If you are using REVIEW rules and configure the Decision Manager Update Job, set the number of hours to look back for updates to transactions in REVIEW status. The maximum is 24 hours. |

2. To enable the Decision Manager Update Job to poll for updates to the reviewed transactions:

   Go to **Administration > Operations > Jobs** and select **Payment: Decision Manager Order Update** and set these values:

   | Field | Description |
   |-------|-------------|
   | ID | Enter a job ID |
   | Description | Enter the job description |
   | ExecuteScriptModule.Module | `int_cybs_sfra_base/cartridge/scripts/jobs/DMOrderStatusUpdate.js` |
   | ExecuteScriptModule.FunctionName | `orderStatusUpdate` |
   | ExecuteScriptModule.Transactional | True: All changes occur as a single atomic operation. If any error occurs during the job, the system rolls back all changes to maintain data consistency. False: No automatic rollback is applied. |
   | ExecuteScriptModule.TimeoutInSeconds | set the function timeout value |

---

## 8.6 Device FingerPrint

Device FingerPrinting collects information about the device used when paying for an order and can assist in fraud screening decisions.

Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DeviceFingerprint** and set these:

| Field | Description |
|-------|-------------|
| Enable DeviceFingerprint Service | set to Enable to turn on |
| Organization ID | Enter the Organization ID – contact support if you do not know this value |
| ThreatMetrix URL | This URL points to the JavaScript that generates and retrieves the fingerprint of the device |
| TTL (Time to Live) | Enter the amount of milliseconds to wait before generating a new fingerprint for any given customer session |

---

## 8.7 Delivery Address Verification

To have the customers shipping address verified during checkout, configure Delivery Address Verification services.

Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DeliveryAddressVerification** and set **Enable Delivery Address Verification Services** to Enable.

---

## 8.8 Tax Calculation

To calculate local taxes once the customer has entered their address on the checkout, configure Tax Calculation services.

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_TaxConfiguration** and set these:

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

## 8.9 Message Level Encryption

Message Level Encryption uses certificates that ensures each message is securely encrypted and tied to the sender's verified identity, without needing to share secret keys in advance.

This provides stronger authentication, easier key management, and better protection against fraud or tampering.

A shared secret uses the same key for both sending and receiving messages, meaning both parties must securely exchange and protect that key in advance. While it can be simpler, it offers less identity verification and can be more vulnerable if the key is compromised.

Using Message Level Encryption requires a .p12 certificate to be created.

### Extract Certificate

Convert the p12 certificate to .pem format using this command:

```bash
openssl pkcs12 -in <key filename>.p12 -cacerts -nokeys -out <key filename>.crt
```

Make a note of the Serial Number of the `Cybersource_SJC_US` certificate.

### Import Certificate

Go to **Administration > Operations > Private Keys and Certificates** and import the extracted .crt and make a note of the alias.

### Enable Message Level Encryption

1. Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_MLE**

| Field | Description |
|-------|-------------|
| Enable Message-Level Encryption | set to Enable |
| Alias of the Certificate | enter the Alias from when the certificate was imported |
| Certificate Serial Number | enter the Serial Number from the Cybersource_SJC_US certificate |

---

---

[Next: Order Management →](Order-Management.md)
