# Configure Visa Acceptance for Salesforce B2C Commerce

Configure the Visa Acceptance cartridge in Salesforce B2C Commerce Salesforce Business Manager.

After installation, configure the cartridge through Salesforce Business Manager to enable payment processing capabilities.

---

## Base Configuration

### Set up cartridge path

1. In Salesforce Business Manager, go to **Administration > Sites > Manage Sites > [yourSite] > Settings**.

2. For Cartridges, enter `bm_cybs_sfra:int_cybs_sfra:int_cybs_sfra_base:app_storefront_base` and click **Apply**.

---

### Upload metadata

1. Go to the folder `Visaacceptance/metadata/payments_metadata/sites/`.

2. Rename folder `yourSiteID` with your site ID from Salesforce Business Manager (this can be found by looking up **Administration > Sites > Manage Sites**).

3. Zip `payments_metadata` folder.

4. Go to **Administration > Site Development > Site Import & Export** and upload `payments_metadata.zip` file.

5. Import the uploaded zip file.

Upon successful import, this metadata is created:

- **Site Preferences:** VisaAcceptance_Core, VisaAcceptance_SecureIntegrationConfiguration, VisaAcceptance_SalesforceDefaultAcceptance_Configuration, VisaAcceptance_ApplePay, VisaAcceptance_Tokenization, VisaAcceptance_DeviceFingerprint, VisaAcceptance_DeliveryAddressVerification, VisaAcceptance_TaxConfiguration, VisaAcceptance_MLE
- **Service:** PaymentHttpService
- **Payment Processor**
- **Payment Method**
- **Jobs:** Payment: Decision Manager Order Update, Payment: Refresh Payment Status

> **Note:** Payer Authentication, SCA, Decision Manager, and Transaction Type are now grouped under **Salesforce Default Acceptance Configuration** and apply to the Salesforce default card form (Direct API) only. Standalone Google Pay preferences have been removed.

---

## Minimum Configuration

### Visa Acceptance Core

Go to **Merchant Tools > Site Preferences > Custom Preferences > Visa Acceptance Cartridge configuration** and set these configuration parameters:

| Field | Description |
|-------|-------------|
| Enable Visa Acceptance Cartridge | Set to enable to enable the cartridge |
| Visa Acceptance Merchant ID | The transacting Merchant ID (MID) assigned to you |
| Visa Acceptance REST KeyId | The Key from your REST API Shared Secret Key |
| Visa Acceptance REST Secret Key | The Shared Secret from your REST API Shared Secret Key |
| Commerce Indicator | Use `internet` for eCommerce transactions. Set to `MOTO` if you are using the store for call center transactions only |
| Enable Visa Acceptance Test Endpoints | Enables the capture and auth reversal test endpoints (`ServiceFrameworkTest` controller). Disabled by default; enable only on a sandbox instance |
| Enable Meta Key | Set to enable to turn on Meta Key (portfolio/account-level processing). See Optional Configuration §8.10 |
| Meta Key Portfolio Merchant ID | The portfolio/account merchant ID that owns the Meta Key |

---

### Services

The target endpoint needs to be set to send transactions to test or production (live).

Go to **Administration > Operations > Services > Payment Credentials** and enter the appropriate URL:

| Environment | URL |
|-------------|-----|
| Test | `https://apitest.visaacceptance.com` |
| Production (live) | `https://api.visaacceptance.com` |

---

## Accept Payment Cards

### Prerequisite

Go to **Merchant Tools > Ordering > Payment Methods**, select **CREDIT_CARD** and check that Payment Processor is `PAYMENTS_CREDIT`.

### Select Card Capture Method

Our cartridge supports these card capture methods:

- **Unified Checkout**
- **Direct API** (the Salesforce default payment form)

If you choose to enable Apple Pay, Google Pay, and/or Click to Pay in Unified Checkout, these payment methods will be displayed in a single widget.

Unified Checkout may allow you to qualify for PCI-DSS SAQ:A as the card number is collected in secure fields and never touches your server.

If you need access to the card number, select Direct API. Note that this will increase your PCI burden.

To select the card capture method, go to **Merchant Tools > Site Preferences > Custom Preferences > Secure Integration Configuration**.

> **Important:** Business Manager preferences such as Payer Authentication (and SCA), Decision Manager, and Transaction Type apply to **Direct API only**. For Unified Checkout, these controls are configured by the merchant in the Visa Acceptance Business Center (EBC).

The Visa Acceptance cartridge is now configured with basic settings. Additional optional configurations can be applied based on your specific requirements.

---

---

[Next: Message Level Encryption →](Message-Level-Encryption.md)
