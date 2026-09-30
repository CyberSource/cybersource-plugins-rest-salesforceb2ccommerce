# Webhooks

Visa Acceptance sends asynchronous webhook notifications to your Salesforce B2C Commerce store for fraud decisions,and Unified Checkout events updates. Webhooks are the primary mechanism for keeping orders up to date; the Salesforce jobs remain available as a fallback.

Webhook subscriptions are managed from a Business Manager page provided by the `bm_cybs_sfra` cartridge.

---

## Prerequisites

- The `bm_cybs_sfra` cartridge is on the Business Manager cartridge path (see [Configuration](Configuration.md)).
- Navigate to **Administration > Sites > Manage Sites** and open the **Business Manager** site. Under **Cartridges**, add `bm_cybs_sfra:int_cybs_sfra:int_cybs_sfra_base:app_storefront_base` to the path.
- Navigate to **Administration > Organization > Roles & Permissions**, select the role, go to **Business Manager Modules**, select your required context, and enable **Webhook Manager** under **Visa Acceptance**.
- The site preferences for the webhooks you want to receive are enabled:
  - **Fraud Management:** Decision Manager and/or Fraud Management Essentials
  - **UC Webhook Events:** Unified Checkout
- For Unified Checkout webhooks, complete the Webhook MLE Certificate Configuration under Message Level Encryption before creating or updating webhook subscriptions.
 

---

## Webhook Groups and Events

The cartridge manages two webhook groups. Each notification is delivered to a controller route in the storefront cartridge.

| Group | Product | Event types | Notification route |
|-------|---------|-------------|--------------------|
| Fraud Management | Decision Manager | `risk.casemanagement.decision.accept`, `risk.casemanagement.decision.reject` | `WebhookNotification-dmNotification` |
| Fraud Management | Fraud Management Essentials | `risk.profile.decision.review`, `risk.casemanagement.decision.accept`, `risk.casemanagement.decision.reject` | `WebhookNotification-dmNotification` |
| UC Webhook Events | Unified Checkout | `uc.orders.transactionresults` | `WebhookNotification-paymentNotification` |

---

## Subscribe to Webhooks

1. Enable the site preferences for the webhooks you want (Decision Manager under Salesforce Default Acceptance Configuration; Unified Checkout under Secure Integration Configuration).

2. For Unified Checkout webhooks, verify that the Webhook MLE Certificate Configuration is completed before clicking Sync.

3. In Salesforce **Business Manager**, navigate to **Merchant Tools > Custom Modules > Visa Acceptance Webhook Manager** (or navigate to the route `WebhookManager-Show` in your browser).

4. Click **Sync**. The cartridge subscribes to (or updates) each enabled webhook based on your current site preferences and stores the subscription state.

5. Confirm each subscription shows a status of **ACTIVE**. A status of **PENDING_REVIEW**, **INACTIVE**, or **SUSPENDED** means the subscription is not yet live — resolve the reported issue and Sync again.

> **Note:** If Decision Manager is enabled but no fraud product is available for your Merchant ID, the Sync surfaces a "no fraud product" error and automatically disables the Decision Manager preference. Enable the product in the Visa Acceptance Business Center (EBC), then re-sync.

---

## Advanced Configuration

The **Advanced Configuration** section of the Webhook Manager binds your Webhook MLE Private Key Alias and Webhook Public Key so that inbound webhook payloads can be decrypted.

---

## Fallback: Salesforce Jobs

If webhook delivery is interrupted, the following jobs can be used to reconcile order state:

- **Payment: Decision Manager Order Update** — polls for Accept/Reject decisions on unconfirmed orders (fallback for Fraud Management webhooks).
- **Payment: Refresh Payment Status** — on-demand job; enter a comma-separated list of order numbers in the `OrderNumbers` parameter and use **Run Now** to refresh the Visa Acceptance payment status for those orders.

---

## Unified Checkout Webhooks: Notification Decryption Guide

This guide configures Asymmetric MLE for Unified Checkout (UC) Webhooks in Salesforce B2C Commerce.
Visa Acceptance uses the public certificate to encrypt inbound webhook notifications (JWE); the cartridge uses the private key (from a p12 imported into Business Manager) to decrypt them.
 
Reference: For the official Visa Acceptance webhook Message-Level Encryption documentation, see https://developer.visaacceptance.com/docs/vas/en-us/webhooks/implementation/all/rest/webhooks/wh-fg-mle-intro.html. 
 
Prerequisite: VisaAcceptance_Secure_Integration_Method must be set to Unified Checkout — the UC subscription is only created when UC is the active integration method. And the webhook MLE to be configured.
Webhooks - Message-Level Encryption
 
---

[Next: Order Management →](Order-Management.md)
