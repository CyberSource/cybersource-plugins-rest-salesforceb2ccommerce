## <ins>Configure the Payment method

### Payment Methods ###

1. Credit Card
2. Apple Pay
3. Google Pay
4. VISA SRC

----

#### 1. Credit Card

In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **CREDIT_CARD**. And in **CREDIT_CARD details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**

 Cybersource Cartridge supports the following ways of processing Credit Card
 a. Flex Microform 0.11
 b. Direct Cybersource Payment API

 #### <ins>a. To Setup Flex Microform 0.11

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/FlexMicroform.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > Cybersource_FlexMicroform** and set values for the parameter:

 Field | Description | Value to Set
 ------------ | ------------- | -------
 Enable Secure Acceptance - Flex Microform | Enable or Disable Cybersource Flex Microform Service | **Yes**

 #### <ins>b. To Setup Direct Cybersource Payment API

 Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/FlexMicroform.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 2: Go to **Merchant Tools > Custom Preferences > Cybersource_FlexMicroform** and set the value for following parameter:

 Field | Description | Value to Set
 ------------ | ------------- | -------
 Enable Secure Acceptance - Flex Microform | Enable or Disable Cybersource Flex Microform Service | **No**

---

 #### <ins>Payer Authentication (3D Secure)

**Prerequisite**
 Please contact your Cybersource Representative to sign up and receive your Payer Authentication credentials.

 Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/PayerAuthentication.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

 Step 3: Go to **Merchant Tools > Custom Preferences > Cybersource_PayerAuthentication**
 and set values for the following parameters:

 Field | Description
 ------------ | -------------
 Enable Payer Authentication | Enable or Disable Payer Authentication service
 Cruise Org Unit Id | GUID to identify the merchant organization within Payer Authentication systems
 Cruise API Key | A shared secret value between the merchant and Payer Authentication systems. This value should never be exposed to the public
 Cruise API Identifier | GUID used to identify the specific API Key
 Cruise End Point | Environment details of Cruise API

---

#### 2. Apple Pay


 #### <ins>Step 1: Create a merchant identifier in Apple portal:

 A merchant identifier uniquely identifies you to Apple Pay as a merchant who is able to accept payments. You can use the same merchant identifier for multiple native and web apps. It never expires.

  1. Go to Apple portal : https://help.apple.com/developer-account/#/devb2e62b839?sub=dev103e030bb

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
   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_APPLE_PAY**. And in **DW_APPLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**

   ---
   #### 3. Google Pay
   #### <ins>Step 1: Create custom preferences for google pay
   1. Upload Cybersource metadata in Business Manager. If not follow “Step 2: Upload metadata” or import **metadata/payment_metadata/meta/GooglePay.xml** in Business Manager **(Administration > Site Development > Import & Export)**
   2. Go to **Merchant Tools > Custom Preferences > Google Pay** and set values for the following parameters:

   Field  |  Description
   ------------ | -------------
   Enable Google Pay | Enable/Disable Google Pay on checkout page
   Enable Google Pay on Mini Cart | Enable/Disable google pay on mini cart
   Enable Google Pay on Cart | Enable/Disable google pay on cart page
   Google Pay Merchant Id | Merchant Id required for Live Environments
   Google Pay Environment | Environment details of Google Pay. Possible values are Test or Production

   #### <ins>Step 2: Payment Processor
   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **DW_GOOGLE_PAY**. And in **DW_GOOGLE_PAY details**, double check if **Payment Processor** = **"PAYMENTS_CREDIT"**
   
   #### <ins>Step 3: Request Production Access
   1. If you want to use google pay in **LIVE Environment**,then navigate to this link https://pay.google.com/business/console/ in order to get google pay merchant Id.

---

   #### 4. Visa SRC
   #### <ins>Step 1: Create custom preferences for Visa SRC
   1. Upload Cybersource metadata in Business Manager. If not follow “Step 2: Upload metadata” or import **metadata/payment_metadata/meta/VisaSRC.xml** in Business Manager **(Administration > Site Development > Import & Export)**
   2. Go to Merchant Tools > Custom Preferences > Visa SRC and set values for the following parameters:

   Field | Description
   ------------ | -------------
   Enable Visa SRC | Enable/Disable Enable Visa SRC on checkout page
   Visa SRC Key | Visa SRC Key Id obtained through EBC Digital payments
   True for production | Set to Yes for Production
   
   #### <ins>Step 2: Payment Processor
   1. In the Business Manager, go to **Merchant Tools > Ordering > Payment Methods** and select **VISA_SRC**. And in **VISA_SRC details**, double check if **Payment Processor** = **"PAYMENTS_VISA_SRC"**

   #### <ins>Notes:
   Currently Visa SRC is only available in checkout view.


---



<div style="text-align: right;font-size: 20px" ><a href="Configure-features.md">Next Step: Configure Features</a></div>



---
