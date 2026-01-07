# Configure Cybersource for Salesforce B2C Commerce

Configure the Cybersource cartridge in Salesforce B2C Commerce Salesforce Business Manager.

After installation, configure the cartridge through Salesforce Business Manager to enable payment processing capabilities.

---

## Base Configuration

### Set up cartridge path

1. In Salesforce Business Manager, go to **Administration > Sites > Manage Sites > [yourSite] > Settings**.

2. For Cartridges, enter `int_cybs_sfra:int_cybs_sfra_base:app_storefront_base` and click **Apply**.

---

### Upload metadata

1. Go to the folder `Cybersource/metadata/payments_metadata/sites/`.

2. Rename folder `yourSiteID` with your site ID from Salesforce Business Manager (this can be found by looking up **Administration > Sites > Manage Sites**).

3. Zip `payments_metadata` folder.

4. Go to **Administration > Site Development > Site Import & Export** and upload `payments_metadata.zip` file.

5. Import the uploaded zip file.

Upon successful import, this metadata is created:

- **Site Preferences:** Cybersource_Core, Cybersource_DeliveryAddressVerification, Cybersource_DeviceFingerprint, Cybersource_PayerAuthentication, Cybersource_TaxConfiguration, Cybersource_Tokenization, Cybersource_DecisionManager, Cybersource_MLE, Cybersource_ApplePay, Cybersource_GooglePay, VisaAcceptance_SecureIntegrationConfiguration
- **Service:** PaymentHttpService
- **Payment Processor**
- **Payment Method**
- **Job:** Payment: Decision Manager Order Update

---

## Minimum Configuration

### Cybersource Core

Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource Core** and set these configuration parameters:

| Field | Description |
|-------|-------------|
| Enable Cybersource Cartridge | Set to enable to enable the cartridge |
| Cybersource Merchant ID | The transacting Merchant ID (MID) assigned to you |
| Cybersource REST KeyId | The Key from your REST API Shared Secret Key |
| Cybersource REST Secret Key | The Shared Secret from your REST API Shared Secret Key |
| Commerce Indicator | Use `internet` for eCommerce transactions. Set to `MOTO` if you are using the store for call center transactions only |

---

### Services

The target endpoint needs to be set to send transactions to test or production (live).

Go to **Administration > Operations > Services > Payment Credentials** and enter the appropriate URL:

| Environment | URL |
|-------------|-----|
| Test | `https://apitest.cybersource.com` |
| Production (live) | `https://api.cybersource.com` |

---

## Accept Payment Cards

### Prerequisite

Go to **Merchant Tools > Ordering > Payment Methods**, select **CREDIT_CARD** and check that Payment Processor is `PAYMENTS_CREDIT`.

### Select Card Capture Method

Our cartridge supports these card capture methods:

- **Unified Checkout**
- **Microform**
- **Direct API**

If you choose to enable Apple Pay, Google Pay, and/or Click to Pay in Unified Checkout, these payment methods will be displayed in a single widget.

Unified Checkout and Microform may allow you to qualify for PCI-DSS SAQ:A as the card number is collected in secure fields and never touches your server.

If you need access to the card number, select Direct API. Note that this will increase your PCI burden.

To select the card capture method, go to **Merchant Tools > Site Preferences > Custom Preferences > Secure Integration Configuration**.

The Cybersource cartridge is now configured with basic settings. Additional optional configurations can be applied based on your specific requirements.

---

---

[Next: Optional Configuration →](Optional-Configuration.md)
