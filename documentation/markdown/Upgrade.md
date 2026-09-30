# Upgrade

---

To upgrade to a later version of our cartridge please follow these steps:

1. Download the code from GitHub

2. Zip `payments_metadata` folder

3. Go to **Administration > Site Development > Site Import & Export** and upload `payments_metadata.zip` file

4. Import the uploaded zip file

5. Please check [Release Notes](Release-notes.md) for any configuration parameters that may have changed

The cartridge has been successfully upgraded to the latest version.

---

## Migrating to v2.0.0

Version 2.0.0 is a major release (the first under the Visa Acceptance brand). When upgrading from an earlier Cybersource-branded release, review the following:

1. **Add the new Business Manager cartridge.** Add `bm_cybs_sfra` to the Business Manager cartridge path (it provides the Webhook Manager page). See [Configuration](Configuration.md).

2. **Update the service endpoint.** The endpoints changed to `https://apitest.visaacceptance.com` (test) and `https://api.visaacceptance.com` (production). Update the **Payment Credentials** service URL under **Administration > Operations > Services**.

3. **Re-check site preferences.** Preference groups were renamed to `VisaAcceptance_*` and regrouped. Payer Authentication, SCA, Decision Manager, and Transaction Type now live under **Salesforce Default Acceptance Configuration** and apply to the Salesforce default card form (Direct API) only — for Unified Checkout, configure these controls in the Visa Acceptance Business Center (EBC). Confirm your settings after importing metadata.

4. **Removed features:**
   - **Flex Microform** — card capture is now Unified Checkout or the Salesforce default payment form (Direct API).
   - **Standalone Google Pay** — Google Pay is now offered through Unified Checkout. Standalone Apple Pay remains.
   - **Network Token webhook** — token updates are now retrieved through the Token Management Service (TMS) API.

5. **Set up webhooks.** Order updates are now driven primarily by webhook notifications. Subscribe using the new Webhook Manager (the Salesforce jobs remain as a fallback). See [Webhooks](Webhooks.md).

6. **Authentication.** API authentication continues to use your REST Shared Secret and Key ID. Only Message-Level Encryption (MLE) uses a P12/certificate.

7. **MLE.** The MLE preferences were renamed (`VisaAcceptance_CertificateAlias` → `VisaAcceptance_RequestMLECertificateAlias`, and `VisaAcceptance_CertificateSerialNo` was removed — the key id is now derived from the certificate. Added a new option for Request MLE. Also added new: **Enable MLE** (master switch for both directions, **off by default** — enable it or no encryption happens) and the response MLE key alias. See [Message Level Encryption](Message-Level-Encryption.md).

---

[← Back to Introduction](Introduction.md)
