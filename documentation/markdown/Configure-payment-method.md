## <ins>Configure the Payment method

### Payment Methods ###

1. Credit Card
2. Apple Pay
3. Google Pay

----

#### 1. Credit Card

In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **CREDIT_CARD**. And in **CREDIT_CARD details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**

 Cybersource Cartridge supports the following ways of processing Credit Card\
 a. Microform [link](https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex-api/developer/ctv/rest/flex-api/microform-integ-v2.html)\
 b. Direct Cybersource Payment API\
 c. Unified Checkout [link](https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex-api/developer/ctv/rest/flex-api/uc-intro.html)

 #### <ins>a. To Setup Microform v2

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/SecureIntegrationConfiguration.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > Secure Integration 
Configuration** and set values for the parameter:

 Field | Description | Value to Set
 ------------ | ------------- | -------
 Secure Integration Method | Type of Secure Integration Method to be used. | **Microform**
  AllowedCardNetworks  | Configure card types for Secure Integration Method  | VISA MAESTRO MASTERCARD AMEX DISCOVER DINERS CLUB JCB CUP CARTES BANCAIRES JCREW ELO EFTPOS MEEZA CARNET MADA
   Transaction Type  | Select Sale/Auth transaction type | Sale/Auth

 #### <ins>b. To Setup Direct Cybersource Payment API

 Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/SecureIntegrationConfiguration.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > VisaAcceptance_SecureIntegrationConfiguration** and set the value for following parameter:

 Field | Description | Value to Set
 ------------ | ------------- | -------
 Secure Integration Method | Type of Secure Integration Method to be used. | **None**
  Transaction Type  | Select Sale/Auth transaction type | Sale/Auth


 #### <ins>c. To Setup Unified Checkout
 **Create custom preference for Unified Checkout**

 Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/SecureIntegrationConfiguration.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > Secure Integration Configuration** and set the value for following parameter:

| Field | Description | Value to Set |
|-------|-------------|--------------|
| Secure Integration Method | Type of Secure Integration Method to be used. Select Unified Checkout (Unified_Checkout) | Unified Checkout |
| Payment Acceptance Location for UnifiedCheckout | Select Embedded/ Sidebar. The Embedded option appears directly on the Checkout page, whereas the Sidebar option displays alongside the main screen. | Embedded/ Sidebar |
| AllowedCardNetworks | Configure card types for UnifiedCheckout | VISA MAESTRO MASTERCARD AMEX DISCOVER DINERS CLUB JCB CUP CARTES BANCAIRES JCREW ELO EFTPOS MEEZA CARNET MADA JAYWAN |
| Digital Payment Methods in UnifiedCheckout | Select which Payment Method to be enabled. (If none selected, it will use Card) | • GOOGLEPAY<br>• APPLEPAY<br>• CLICKTOPAY |
| Checkout Label for Unified Checkout | Label for Unified Checkout Tab on the payment page | |
| Enable eCheck | Enable/Disable eCheck Payment | Yes/No |
| Enable Unified Checkout for Cart and Mini Cart | Enable or Disable Unified Checkout for digital payments on Cart and Mini Cart. | Yes/No |

Step 3: Payment Processor

   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **CREDIT_CARD**. In **CREDIT_CARD details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"** and is enabled.

  2. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_GOOGLE_PAY**. And in **DW_GOOGLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**

  3. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **CLICK_TO_PAY**. In **CLICK_TO_PAY details**, double check if **Payment Processor** = **"PAYMENTS_CLICK_TO_PAY"**.

  4. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_APPLE_PAY**. In **DW_APPLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_APPLEPAY"**.

  5. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **BANK_TRANSFER**. In **BANK_TRANSFER details**, double check if **Payment Processor** = **"BANK_TRANSFER"**.


 #### <ins>Payer Authentication (3D Secure)

**Prerequisite**
 If you wish to process card payments with Payer Authentication, please ensure your Cybersource account
 has been enabled for it. Please contact your Cybersource representative if you are unsure.

 Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/PayerAuthentication.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > Cybersource_PayerAuthentication**
 and set values for the following parameters:

 Field | Description
 ------------ | -------------
 Enable Payer Authentication | Enable or Disable Payer Authentication service

 #### <ins> Enforce Strong Consumer Authentication
When Payer Authentication is enabled, if a transaction gets declined with the reason as Strong Customer Authentication required, then another request will be sent from cartridge automatically for the same order and the customer will be 3DS challenged.

In case merchants would like the cardholder to be 3DS Challenged when saving a card, IsSCAEnabled
setting can be updated to enable it for credit cards.

Note: The scaEnabled setting is applicable only if Payer Authentication is enabled.

Site Preferences:
Step 1: Upload Cybersource metadata in Business Manager. If not follow “Upload metadata” or import "metadata/sfra_meta/meta/PayerAuthentication.xml" in Business Manager (Administration > Site Development > Import & Export)

Step 2: Go to Merchant Tools > Site Preferences   > Custom Preferences > Cybersource_PayerAuthentication and set values for the following parameters:
Field | Description
 ------------ | -------------
IsSCAEnabled  |  Enable Strong Customer Authentication

Set the value for IsSCAEnabled to yes to use Strong Customer Authentication feature.

#### <ins> Decision Manager with Payer Authentication
Decision Manager plus Payer Authentication allows pre-authentication rules to be configured before authentication takes place, providing EMV®3 3DS authentication and risk review from authentication to authorization. 

Note: Enable Decision Manager and Payer Authentication in custom preferences.

---

#### 2. Apple Pay


 #### <ins>Step 1: Create a merchant identifier in Apple portal:

 A merchant identifier uniquely identifies you to Apple Pay as a merchant who is able to accept payments. You can use the same merchant identifier for multiple native and web apps.

  1. Go to Apple portal : https://developer.apple.com

  2. In Certificates, Identifiers & Profiles, select Identifiers from the sidebar, then click the Add button (+) in the upper-left corner.

  3. Select Merchant IDs, then click Continue.

  4. Enter the merchant description and identifier name, then click Continue.

  5. Review the settings, then click Register.

  #### <ins>Step 2: Enrolling in Apple Pay in Cybersource

 To enroll in Apple Pay:

  1. Log in to the Business Center:
   - Test: https://ebctest.cybersource.com/ebc2/
   - Live: https://ebc2.cybersource.com/ebc2/

  2. On the left navigation pane, click the **Payment Configuration** icon.

  3. Click **Digital Payment Solutions**. The Digital Payments page appears.

  4. Click **Configure**. The Apple Pay Registration panel opens.

  5. Enter your Apple Merchant ID. (Created in Step 1.4)

  6. Click **Generate New CSR**.

  7. To download your CSR, click the **Download** icon next to the key.

  8. Follow your browser's instructions to save and open the file.

 #### <ins>Step 3 : Complete the enrollment process by submitting your CSR to Apple

 Create a payment processing certificate:
 A payment processing certificate is associated with your merchant identifier and used to encrypt payment information. The payment processing certificate expires every 25 months. If the certificate is revoked, you can recreate it.

  1. In Certificates, Identifiers & Profiles, select Identifiers from the sidebar.

  2. Under Identifiers, select Merchant IDs using the filter in the top-right.

  3. On the right, select your merchant identifier.
     Note: If a banner appears at the top of the page saying that you need to accept an agreement, click the Review Agreement button and follow the instructions before continuing.

  4. Under Apple Pay Payment Processing Certificate, click Create Certificate.

  5. Click Choose File.

  6. In the dialog that appears, select the CSR file downloaded from Step 2.7, then click Choose.

  7. Click Continue.

 #### <ins>Step 4:  Configure Apple Pay in SFCC Business Manager

 Business Manager Configuration

  1. Go to: **“Merchant Tools > Site Preferences > Apple pay**

  2. Check “Apple Pay Enabled?”

  3. Fill in the “Onboarding” form:

   - Ensure “Apple Merchant ID” and “Apple Merchant Name” match settings in your Apple account

   - Ensure all other fields match the your supported Cybersource settings

  4. Fill in the “Storefront Injection” form:

   - Selects where Apple Pay buttons should be displayed on your site.

  5. Fill in “Payment Integration” form:

   - Leave all form fields blank

   - Ensure “Use Basic Authorization” is checked
   6. Click "Submit"

   #### <ins>Step 5: Domain Registration in SFCC Business Manager

   1. Go to: **“Merchant Tools > Site Preferences > Apple Pay**
   2. Under **Domain Registration** section
      a. Click on **Register Apple Sandbox** under Apple Sandbox section for registering SFCC to Apple Sandbox account.
      b. Click on **Register Apple Production** under Apple Production section for registering SFCC to Apple Production account.

   #### <ins>Step 6: Payment Processor
   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_APPLE_PAY**. And in **DW_APPLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_APPLEPAY"**

   #### <ins>Site Preferences:
   Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/sfra_meta/meta/ApplePay.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

   Step 3: Go to **Merchant Tools > Site Preferences > Custom Preferences > Apple Pay**
   and set values for the following parameters:

   Field | Description
   ------------ | -------------
   ApplePayTransactionType | Select Sale/Auth transaction type

   ---
   #### 3. Google Pay
   #### <ins>Step 1: Create custom preferences for Google Pay
   1. Upload Cybersource metadata in Business Manager. If not follow “Step 2: Upload metadata” or import **metadata/payment_metadata/meta/GooglePay.xml** in Business Manager **(Administration > Site Development > Import & Export)**
   2. Go to **Merchant Tools > Site Preferences > Custom Preferences > Google Pay** and set values for the following parameters:

   Field  |  Description
   ------------ | -------------
   Enable Google Pay | Enable/Disable Google Pay on checkout page
   Enable Google Pay on Mini Cart | Enable/Disable Google Pay on mini cart
   Enable Google Pay on Cart | Enable/Disable Google Pay on cart page
   Google Pay Merchant Id | Merchant Id required for Live Environments
   Google Pay Environment | Environment details of Google Pay. Possible values are Test or Production
   Google Pay Transaction Type | Select Sale/Auth transaction Type

   #### <ins>Step 2: Payment Processor
   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_GOOGLE_PAY**. And in **DW_GOOGLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**
   
   #### <ins>Step 3: Request Production Access
   1. If you want to use Google Pay in **LIVE Environment**,then navigate to this link https://pay.google.com/business/console/ in order to get Google Pay merchant Id.

   Note: Please refer to Payer Authentication (3D Secure) section to configure Payer Authentication for Google Pay.

---



<div style="text-align: right;font-size: 20px" ><a href="Configure-features.md">Next Step: Configure Features</a></div>



---
