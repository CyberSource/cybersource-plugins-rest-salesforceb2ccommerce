# Cybersource for Salesforce B2C Commerce REST v26.1.0

## Introduction

The Cybersource cartridge for Salesforce B2C Commerce allows merchants to connect their Salesforce B2C Commerce store to the Visa Acceptance Platform to directly take credit/debit card, Apple Pay, Google Pay, Click to Pay, and eCheck payments.

---

## Supported Features

The Cybersource cartridge for Salesforce B2C Commerce supports various payment methods and features.

### Payment Methods

- Credit/Debit cards
- Apple Pay
- Google Pay
- Click to Pay
- eCheck

### Security and Fraud Management

- Payer Authentication / 3-D Secure
- Tokenization
- Cybersource Decision Manager and Fraud Management Essentials

### Additional Services

- Cybersource Delivery Address Verification
- Cybersource Tax Calculation

---

## Supported Versions

The Cybersource extension is compatible with specific versions of Salesforce Store Front Reference Architecture (SFRA).

### Compatibility

Our Cybersource extension is compatible with Salesforce Store Front Reference Architecture (SFRA) version 7.0 and below.

---

## Cybersource Prerequisites

Before implementing the Cybersource cartridge, ensure you have the required and optional Cybersource products configured.

### Mandatory

You must also have a REST Shared Secret Key

### Optional

These Cybersource products are optional, but need to be enabled and configured for your Merchant ID if you choose to use them:

- Unified Checkout
- Payer Authentication for 3-D Secure
- Tokenization
- Apple Pay (standalone or through Unified Checkout)
- Google Pay (standalone or through Unified Checkout)
- Click to Pay (through Unified Checkout only)
- Cybersource Decision Manager
- Cybersource Fraud Management Essentials

You can also choose to enable Message-Level Encryption (MLE) for additional security. A REST Certificate is required for MLE.

Rules based Payer Authentication is also supported and requires both Payer Authentication and Decision Manager to be enabled.

---

---

[Next: Release Notes →](Release-notes.md)
