## <ins>Configure Features (OPTIONAL)
### **1. Token Management Service**

Refer to this [link](https://www.cybersource.com/en-us/solutions/payment-security/token-management-service.html) to learn about Cybersource's Token Management service

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/Tokenization.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

Step 2: Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_Tokenization** and set values for the following parameters:

Field Name | Description
------------ | -------------
Enable Tokenization Services | Enable or Disable the Tokenization Service saving Credit/Debit Card on "My Account" page
Enable limiting Saved Card | Enable or Disable limiting Saved Card on My Account page
Saved Card Allowed | Number of Cards that can be added in a defined interval on My Account page
Reset Interval (in Hours) | Number of hours that saved card attempts are counted

**NOTE:** If you want to utilize **"save card to account"** feature through "Payment flow/Checkout flow", make sure to set **"Enable tokenization Services"** to **"Yes"**

### **2. Network Tokens**

A Network Token is a card scheme generated token, that represents customer card information for secure transactions that references a customer’s actual PAN.

Your Cybersource Merchant ID needs to be enabled for Network Token’s before you can use this service.  Please contact your Cybersource representative to request enablement.

The Cybersource cartridge will subscribe to the Token Life Cycle web hook and make the necessary updates to the saved card details.

Step 1: Upload Cybersource metadata in Business Manager. If not follow “Step 2: Upload metadata” or import “metadata/payments_metadata/meta/Tokenization.xml” and “metadata/payments_metadata/meta/custom-objecttype-definitions.xml” in Business Manager (Administration > Site Development > Import & Export)

Step 2: Go to Merchant Tools > Site Preferences > Custom Preferences > Cybersource_Tokenization and set values for the following parameters:
Field Name | Description
------------ | -------------
Enable Tokenization Services | Enable or Disable the Tokenization Service saving Credit/Debit Card on "My Account" page
Network Token Updates | Subscribe to Network Token life cycle updates

Step 3: Go to Merchant Tools > Custom objects > Custom Object Editor and check if the custom object type "Network Tokens Webhook" exists without any object.

A custom object of this type would be created only if the Network Tokens webhook is subscribed.

### **3. Delivery Address Verification**

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/DeliveryAddressVerification.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

Step 2: Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DeliveryAddressVerification** and set values for the parameter:

Field | Description
------------ | -------------
Enable Delivery Address Verification Services | Enableor Disable Delivery Address Verification for Cybersource Cartridge



### **4. Tax Calculation**

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/TaxConfiguration.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

Step 2: Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_TaxConfiguration** and set values for the following parameters:

Field | Description
------------ | -------------
Enable Tax calculation Services | Enable or disable Cybersource tax service for Cybersource Cartridge
List of nexus states | When your company has nexus in the U.S. or Canada, you might be required to collect sales tax or seller's use tax in those countries
List of nexus states to exclude | List of nexus states to exclude
Merchant's VAT Registration Number | A VAT seller registration number is required in order to calculate international taxes and might be required for some Canadian transactions. International/VAT calculation is supported in specific countries
Default Product Tax Code | Default tax code used when tax code is not set on a product
 Purchase Order Acceptance City | Purchase order acceptance city
Purchase Order Acceptance State Code | Purchase Order Acceptance State Code. Use the [State, Province, and Territory Codes](https://developer.cybersource.com/library/documentation/sbc/quickref/states_and_provinces.pdf) for the United States and Canada
Purchase Order Acceptance zip code | Purchase Order Acceptance zip code
Purchase Order Acceptance Country Code | Purchase Order Acceptance Country Code.  Use the two-character [ISO Standard Country Codes](https://developer.cybersource.com/library/documentation/sbc/quickref/countries_alpha_list.pdf)
Purchase Order Origin City | Purchase Order Origin City
Purchase Order Origin State Code | Purchase Order Origin State Code. Use the [State, Province, and Territory Codes](https://developer.cybersource.com/library/documentation/sbc/quickref/states_and_provinces.pdf) for the United States and Canada
Purchase Order Origin Zip Code | Purchase Order Origin Zip Code
Purchase Order Origin Country Code | Purchase Order Origin Country Code. Use the two-character [ISO Standard Country Codes](https://developer.cybersource.com/library/documentation/sbc/quickref/countries_alpha_list.pdf)
Ship From City | Ship From City
Ship From State Code | Ship From State Code
Ship From Zip Code | Ship From Zip Code
Ship From Country Code | Ship From Country Code



### **5. Fraud Management Solutions**

Refer to this [link](https://www.cybersource.com/en-us/solutions/fraud-and-risk-management/decision-manager.html) to learn about Cybersource's Decision Manager and Fraud Management Essentials. Both services use the same cartridge settings and fields, to access the service a retailer has signed up for with Cybersource. . 

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/DecisionManager.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

Step 2: Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DecisionManager**
and set values for the following parameter:

Field | Description
------------ | -------------
Enable Decision Manager Services | Enable or Disable Decision Manager for Cybersource Cartridge


Step 3: To enable **Decision Manager Order Update Job**:
Decision Manager Order Update Job uses a REST API to retrieve order decisions from Cybersource and update the order confirmation status in SFCC.

To Integrate this job into your site, follow the below steps:

Step 3.1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/jobs.xml"** in Business Manager (**Administration > Operations > Import & Export**)
 
Step 3.2: Open Business Manager. Go to  **Administration > Operations > Jobs** and select **Payment: Decision Manager Order Update**. Make sure following values are filled in:
 
 Field | Description
 ------------ | -------------
 ID | ID
 Description | Description
 ExecuteScriptModule.Module | int_cybs_sfra_base/cartridge/scripts/jobs/DMOrderStatusUpdate.js
 ExecuteScriptModule.FunctionName | orderStatusUpdate
 ExecuteScriptModule.Transactional | Indicates if the script module's function requires transaction handling.
 ExecuteScriptModule.TimeoutInSeconds | The timeout in seconds for the script module's function
 
Step 3.3: Go to **Merchant Tools > Site Preferences > Custom Preferences > cybersource_DecisionManager** and set values for the following parameter:

 Field | Description
 ------------ | -------------
 Conversion Detail Report Lookback time | Number of hours the job will look back for new decisions. CS does not support lookbacks over 24 hours. Do not set above 24.



### **6. Device FingerPrint**

Device FingerPrint is a powerful feature of Decision Manager and Fraud Management Essentials It is always recommended to send a Device Fingerprint when using a Cybersource fraud management service. 

Step 1: Upload Cybersource metadata in Business Manager. If not follow "Step 2: Upload metadata" or import **"metadata/payment_metadata/meta/DeviceFingerprint.xml"** in Business Manager (**Administration > Site Development > Import & Export**)

Step 2: Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_DeviceFingerprint**
and set values for the following parameters:

Field | Description
------------ | -------------
Enable DeviceFingerprint Service | Enable or Disable the Device Fingerprint Service.
Organization Id | Organization ID for the device fingerprint check
Thread Matrix URL | Thread Matrix URL pointing to JS that generates and retrieves the fingerprint.
TTL (Time To Live) | Time, in milliseconds between generating a new fingerprint for any given customer session



### **7. Capture Service**

A single function is available to make capture requests. Please note that these functions are not available
to use in the Salesforce B2C Commerce UI without customisation.

    httpCapturePayment(requestID, merchantRefCode, purchaseTotal, currency)

This function can be found in the script **‘scripts/http/capture.js’**. A working example of how to use this function can be found in the **ServiceFrameworkTest-TestCaptureService** controller. You will first get an instance of the capture.js object, and make the call as follows:

    var captureObj = require("~/cartridge/scripts/http/capture.js");
    var serviceResponse = captureObj.httpCapturePayment(requestID, merchantRefCode, paymentTotal, currency);

The resulting serviceResponse object will contain the full response object generated by the request. The contents of this object will determine your logic in handling errors and successes. For detailed explanations of all possible fields and values, refer this [link](https://developer.cybersource.com/api-reference-assets/index.html#payments_capture) .

**Capture Request Parameters**

Parameter Name | Description
------------ | -------------
requestID | Transaction ID obtained from the initial Authorization
merchantRefCode | SFCC Order Number
purchaseTotal | Order Total
currency | Currency code (ex. ‘USD’)



### **8. Auth Reversal Service**

A single function is available to make auth reversal requests.

    httpAuthReversal(requestID, merchantRefCode,  amount, currency)

This function can be found in the script **‘scripts/http/authReversal.js’**. A working example of how to use this function can be found in the **ServiceFrameworkTest- TestAuthReversal** controller. You will first get an instance of the AuthReversal.js object, and make the call as follows:

    var reversalObj = require("~/cartridge/scripts/http/authReversal.js");
    var serviceResponse = reversalObj.httpAuthReversal(requestID, merchantRefCode, paymentTotal, currency);

The resulting serviceResponse object will contain the full response object generated by the request. The contents of this object will determine your logic in handling errors and successes. For detailed explanations of all possible fields and values, refer this [link](https://developer.cybersource.com/api-reference-assets/index.html#payments_reversal_process-an-authorization-reversal)

**Authorization Reversal Request Parameter**

Parameter Name | Description
------------ | -------------
requestID | Transaction ID obtained from the initial Authorization
merchantRefCode | SFCC Order Number
amount | Order Total
currency | Currency code (ex. ‘USD’)



### **9. Advanced Customization**

The Cybersource SFRA cartridge has built-in custom hooks that can be utilized to customize request data being sent to each Service.  This can be utilized to send additional custom data that the core cartridge cannot account for.  For example, if you want to include Merchant Defined Data in your Credit Card Authorization Requests, you can use these hooks to achieve this.  

The hooks are called in the **‘scripts/http/capture.js’** and **‘scripts/http/AuthReversal.js’** scripts.  After a request for a particular service is built, but before it is sent to CS, a check for any code registering to the hook ‘app.payment.modifyrequest’ is done.  If present, the hook will be called for that specific request.  The request object is passed into the hook and the return value of the hook is sent to CS as the final request object.  Through this process, you can inject your own data into the request object from custom code you write in a separate cartridge.

**Implementation:**

To customize request objects, register the hook **‘app.payment.modifyrequest’** in your cartridges **‘hooks.json’** file.  An example would look like this, replacing the script path with your own script :

``` JSON
    {
        "name": "app.payment.modifyrequest",
        "script": "./cartridge/scripts/hooks/modifyRequestExample"
    }
``` 

You can copy the **‘scripts/hooks/modifyRequestExample’** script from this cartridge into your own to use as a template for extending and modifying service request objects.  Note, every hook must return a valid request object for the given service.  It is recommended that you reference the CybserSource documentation for details on the exact nature of any fields you wish to customize or add. The following hooks are available for you to define in this file:

**Modify Request hooks**

Hook Name | Service Request to modify
------------ | -------------
AuthReversal | Credit Card Authorization Reversal
Capture | Credit Card Capture

<div style="text-align: right;font-size: 20px" ><a href="Test-golive.md">Next Step: Test and Go Live</a></div> 


### **10. Message-Level Encryption (MLE)**

Refer to this [link](https://developer.cybersource.com/docs/cybs/en-us/platform/developer/all/rest/rest-getting-started/restgs-jwt-message-intro/restgs-mle-intro.html) to learn about Cybersource’s MLE feature.

#### Step 1: Upload Cybersource metadata in Business Manager
If not, follow “4.2: Upload metadata” or import **metadata/payment_metadata/meta/MLE.xml** in Business Manager (Administration > Site Development > Import & Export).

#### Step 2: Configure Cybersource MLE
Go to **Merchant Tools > Site Preferences > Custom Preferences > Cybersource_MLE** and set values for the following parameters according to the **documentation -> Cybersource for Salesforce B2C Commerce REST-Message-Level Encryption Guide**.

#### Field Description

Field Name | Description
------------ | -------------
Enable Message-Level Encryption | Enable or Disable Message-Level Encryption.
Alias of the Certificate | Alias of the "CyberSource_SJC_US" Certificate imported in "Private Keys and Certificates".
Certificate Serial Number | Serial Number of "CyberSource_SJC_US" certificate extracted from p12 file.


---