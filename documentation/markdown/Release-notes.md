## <ins>Release Notes

**Version 25.3.0 (May 2025)**
• Added Payer Authentication support for Google Pay.
• Added multi currency support for Google Pay
• Handled session variables in SCA flow.
• Removed encryption type from Microform v2 request.

**Version 25.2.0 (March 2025)**
• Added Message-Level Encryption (MLE) feature.  
• Added support for additional card types in flex microform. 

**Version 25.1.0 (January 2025)**
• Upgraded flex v0.11 to v2. 
• Added webhook subscription deletion from locale if subscription is deleted at Cybersource end and vice-versa 
• Handled undefined exception scenario in 3ds flow. 

**Version 24.4.0 (September 2024)**
• Added DMPA support. 
• Upgraded to jQuery v3.7.0.

**Version 24.3.0 (August 2024)**
• Upgraded the cartridge to support SFRA v7.0.
• Added Commerce Indicator MOTO.

**Version 24.2.1 (May 2024)**
• Checkmarx issues fixed. 
• Device fingerprint issue fixed.

**Version 24.2.0 (April 2024)**

**New Features**
• Implemented Payer Auth Direct integration.
• Enhanced SCA feature.
• Implemented Network Tokens feature.

**Version 24.1.0 (February 2024)**

**New Features**
• Upgrade the cartridge to support SFRA v6.3. 
• Updated cartridge to make it compatible with Salesforce B2C Commerce Release 22.7 . 
• Added Strong Customer Authentication for Credit Card.
• Renamed Visa SRC to Click to Pay
• Implemented Sale functionality for Credit Card, Google Pay, Click to Pay and Apple Pay. 
• Updated API header in Http Signature Authentication.


**Version 21.1.0 (June 2021)**

**New Features**
• Improved Payer authentication screen (modal).


**Bug Fixes**
•	Added descriptive error messages on certain fail cases and invalid inputs.
•	Reloading on final confirmation page does not result on failed authorization.



**Version 20.2.0 (Feb 2021)**

**New Features**
•	Support Google Pay payment method.
•	Support Visa SRC payment method.
•	Improved security on “My Account” page by adding Flex Microform approach to tokenize credit card. 

**Bug Fixes**
•	Improved security of keys by changing data type of password fields from “String” to “password”.
•	We added more security to exposed parameters of device fingerprint.

**Version 20.1.1 (Nov 2020)**

**Bug Fixes**
•	Improved security on accessing and modifying sensitive fulfillment-related actions on an order (e.g., order acceptance, canceling etc.).

**Version 20.1.0 (Aug 2020)**

**Initial Features**

•	Support Credit Card payment using CyberSource REST Payment API and Flex Microform v0.11
•	Support Apple Pay
•	Support PayerAuth/3D Secure using Cardinal Cruise API.
•	Support Tokenization on "My Account" and "Payment Page".
•	Support Delivery Address Verification service.
•	Support Tax Service.
•	Support Capture and Auth Reversal services.


---
