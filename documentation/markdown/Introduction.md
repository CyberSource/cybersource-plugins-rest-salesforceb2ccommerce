# Visa Acceptance for Salesforce B2C Commerce REST v2.0.0

## Introduction

The Visa Acceptance cartridge for Salesforce B2C Commerce allows merchants to connect their Salesforce B2C Commerce store to the Visa Acceptance Platform to directly take credit/debit card, digital wallet, Click to Pay, bank transfer, and Alternative Payment Method payments.

---

## Supported Features

The Visa Acceptance cartridge for Salesforce B2C Commerce supports various payment methods and features.

### Payment Methods

Through **Unified Checkout (v1)**, a single integration presents multiple payment methods:

- Credit/Debit cards (PAN entry)
- Click to Pay
- Digital wallets: Apple Pay, Google Pay, Paze, PayPal, Venmo
- Bank transfer (eCheck)
- Alternative Payment Methods (locale/currency-specific): iDEAL, Bancontact, Multibanco, MyBank, Tink Pay by Bank, Przelewy24, Dragonpay, Konbini

Through the **Salesforce default payment form (Direct API)**:

- Credit/Debit cards

**Standalone** (Salesforce B2C Commerce default):

- Apple Pay

### Security and Fraud Management

- Payer Authentication / 3-D Secure
- Tokenization
- Visa Acceptance Decision Manager and Fraud Management Essentials

### Additional Services

- Visa Acceptance Delivery Address Verification
- Visa Acceptance Tax Calculation

---

## Supported Versions

The Visa Acceptance extension is compatible with specific versions of Salesforce Store Front Reference Architecture (SFRA).

### Compatibility

Our Visa Acceptance extension is compatible with Salesforce Store Front Reference Architecture (SFRA) version 7.0 and below.

---

## Visa Acceptance Prerequisites

Before implementing the Visa Acceptance cartridge, ensure you have the required and optional Visa Acceptance products configured.

### Mandatory

You must have a REST Shared Secret Key. The cartridge authenticates to the Visa Acceptance REST APIs using your REST Shared Secret and Key ID.

### Optional

These Visa Acceptance products are optional, but need to be enabled and configured for your Merchant ID if you choose to use them:

- Unified Checkout
- Payer Authentication for 3-D Secure
- Tokenization
- Apple Pay (standalone or through Unified Checkout)
- Google Pay (through Unified Checkout)
- Paze, PayPal, and Venmo (through Unified Checkout)
- Click to Pay (through Unified Checkout only)
- Alternative Payment Methods (through Unified Checkout)
- Meta Key (for portfolio/account-level processing)
- Visa Acceptance Decision Manager
- Visa Acceptance Fraud Management Essentials

Message-Level Encryption (MLE) encrypts the API payload on top of TLS. Request MLE is mandatory and requires a REST Certificate; Response MLE is optional. See [Message Level Encryption](Message-Level-Encryption.md).

Rules based Payer Authentication is also supported and requires both Payer Authentication and Decision Manager to be enabled.

---

---

[Next: Release Notes →](Release-notes.md)
