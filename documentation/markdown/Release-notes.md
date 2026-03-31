# Release Notes

Release history and updates for the Cybersource Salesforce B2C Commerce cartridge.

---
## Version 26.2.0 (March 2026)
 
**Enhancements:**
- Updated Payer Authentication flow to align with SFRA best practices.
- Added fallback device data capture for Payer Authentication.
- Updated Mastercard 3-D Secure Data Only transactions.
- Updated Cardinal Commerce URLs for Data Center Migration.
- Modified subscription creation during the authorization call in checkout.
- Decision Manager support for Apple Pay Transactions.
- Apple Pay address handling improvements:
  - Checkout page: collect address from checkout page.
  - Cart/Mini Cart page: collect address from Apple Pay.
 
**Bug Fixes:**
- Corrected page routing for failed Apple Pay scenarios.
- Fetch the total amount from the server side instead of capturing it on the frontend to avoid issues for different currencies across different locales.
- Correct handling of AUTHORIZED_RISK_DECLINED response for post authorization scenarios.
- CheckoutServices Error Fix: Resolved TypeError occurring when the cartridge is disabled.
- Fixed issue where the Unified Checkout capture context did not refresh when the Delivery Address Verification is enabled.
- Corrected page redirection issue for Decision Manager reject scenarios.
- Fixed bug causing "setAddress1" of null when performing follow-up transactions with a registered customer after updating shipping address.
- Fixed issue where the eCheck transient token exceeded the session.privacy 2000-character limit.
 
---
## Version 26.1.0 (January 2026)

**New Features:**
Added support for 3D-Secure Data Only
---

## Version 25.4.0 (December 2025)

**New Features:**
- Added support for Unified Checkout v0.32 (Card Payments, Apple Pay, Google Pay, Click to Pay, and eCheck)
- End of support for Click to Pay legacy

---

## Version 25.3.0 (May 2025)

**New Features:**
- Added Payer Authentication support for Google Pay.
- Added multi-currency support for Google Pay

**Bug Fixes:**
- Handled session variables in SCA flow.
- Removed encryption type from Microform v2 request.

---

## Version 25.2.0 (March 2025)

**New Feature:**
- Message-Level Encryption (MLE).

**Enhancement:**
- Added support for Cartes Bancaires, Elo, China Union Pay, and JCrew

---

## Version 25.1.0 (January 2025)

**New Feature:**
- Replaced Microform v0.11 with v2.

**Bug Fixes:**
- Added webhook subscription deletion if subscription is deleted at Cybersource or Salesforce custom object.
- Handled undefined exception scenario for 3-D Secure transactions.

---

## Version 24.4.0 (September 2024)

**New Feature:**
- DMPA support.

**Enhancement:**
- Upgraded to jQuery v3.7.0.

---

## Version 24.3.0 (August 2024)

**Enhancements:**
- Upgraded the cartridge to support SFRA v7.0.
- Added MOTO Commerce Indicator

---

## Version 24.2.1 (May 2024)

**Bug Fixes:**
- Checkmarx issues fixed.
- Device fingerprint bug fixed.

---

## Version 24.2.0 (April 2024)

**New Features:**
- Network Token support

**Enhancements:**
- Implemented Direct API integration for Payer Authentication, adding Payer Auth Setup and Device Data Collection.
- Enhanced Strong Consumer Authentication (SCA).

---

## Version 24.1.0 (February 2024)

**New Features:**
- Added Strong Customer Authentication retries for card payments

**Enhancements:**
- SFRA v6.3 support
- Salesforce B2C Commerce Release 22.7 support
- Renamed Visa SRC to Click to Pay.
- Implemented Sale functionality for Credit Card, Google Pay, Click to Pay and Apple Pay.
- Updated flex script referring to from v0.11.0 to v0.11.
- Updated API header in Http Signature Authentication.

---

## Version 21.1.0 (June 2021)

**Enhancements:**
- Improved Payer Authentication screen (modal).

**Bug Fixes:**
- Added descriptive error messages on certain fail cases and invalid inputs.
- Reloading on final confirmation page does not result on failed authorization.

---

## Version 20.2.0 (Feb 2021)

**New Features:**
- Google Pay
- Visa Secure Remote Commerce payment method
- Improved security on "My Account" page by adding Microform to tokenize payment cards.

**Bug Fixes:**
- Improved security of keys by changing data type of password fields from "String" to "password".
- Added more security to exposed parameters of device fingerprint.

---

## Version 20.1.1 (Nov 2020)

**Bug Fixes:**
- Improved security on accessing and modifying sensitive fulfilment-related actions on an order (e.g., order acceptance, cancelling etc.).

---

## Version 20.1.0 (Aug 2020)

**Initial release supporting:**
- Credit/Debit cards
- Apple Pay
- Payer Authentication / 3D Secure
- Delivery Address Verification service
- Tax Calculation service
- Authorization, Capture, Authorization Reversal

---

---

[Next: Install Cybersource for Salesforce B2C Commerce →](Installation.md)
