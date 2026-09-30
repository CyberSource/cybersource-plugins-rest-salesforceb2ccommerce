# Message Level Encryption

Message Level Encryption (MLE) uses certificates that ensure each message is securely encrypted and tied to the sender's verified identity, without needing to share secret keys in advance.

This provides stronger authentication, easier key management, and better protection against fraud or tampering.

A shared secret uses the same key for both sending and receiving messages, meaning both parties must securely exchange and protect that key in advance. While it can be simpler, it offers less identity verification and can be more vulnerable if the key is compromised.

Using Message Level Encryption requires a .p12 certificate to be created.

MLE has two directions, each with its own key and its own preference:

- **Request MLE (outbound) — ** The cartridge encrypts the request payload it sends to Visa Acceptance, using the **Visa Acceptance** public certificate (`CyberSource_SJC_US`). Configure this before you transact.
- **Response MLE (inbound) — ** Visa Acceptance encrypts the response payload using your REST API Response MLE public certificate, and the cartridge decrypts it with the matching private key. The same key decrypts Unified Checkout webhook notifications, so it is required if you use those webhooks.

All fields below live in **Merchant Tools > Site Preferences > Custom Preferences > Message-Level Encryption Configuration**.

| Field | Required | Description |
|-------|----------|-------------|
| Request MLE Certificate Alias (Option 1 - Recommended) | Yes (or Option 2) | Alias of the `CyberSource_SJC_US` certificate imported under **Administration > Operations > Private Keys and Certificates** |
| Request MLE - P12 file path under IMPEX (Option 2) | Yes (or Option 1) | Path under IMPEX to the Visa Acceptance `.p12` bundle, e.g. `src/mle/visaacceptance.p12`. Used **only** when Option 1 is blank |
| Enable MLE | Yes | Master switch for both directions. **Off by default** — enable it once your certificates are configured, or no encryption happens at all |
| Private Key Alias for Response MLE and Webhooks | No | Alias of your merchant `.p12` (the REST API Response MLE key) imported under **Private Keys and Certificates** for response MLE and webhook decryption. This alias works for webhooks decryption even if Response MLE is disabled. |

> **Note:** MLE is the only feature that uses a P12/certificate. API authentication (including Meta Key) uses the REST Shared Secret and Key ID.

---

## Request MLE

Set up Request MLE with **either** the certificate alias (Option 1, below) **or** the single-file IMPEX setup (Option 2, further down). Option 1 is recommended.

### Create the key

Create the REST API Response MLE Key by following the steps mentioned in the link:
<https://developer.cybersource.com/docs/cybs/en-us/security-keys/user/all/ada/security-keys/keys-manage/keys-rest-mle-intro/keys-mle-response-task.html>

> **One key covers both directions.** Despite its name, the `.p12` this produces contains everything
> both directions need: the `CyberSource_SJC_US` certificate that encrypts requests, and your own
> private key that decrypts responses and webhooks.

### Extract Certificate

Convert the p12 certificate to .crt format using this command:

```bash
openssl pkcs12 -in <key filename>.p12 -cacerts -nokeys -out <key filename>.crt
```
Open this file in a text editor and make sure the CyberSource_SJC_US is the first certificate.

### Import Certificate

Go to **Administration > Operations > Private Keys and Certificates** and import the extracted .crt and make a note of the alias.

### Enable Request MLE

Go to **Merchant Tools > Site Preferences > Custom Preferences > Message-Level Encryption Configuration** and set:

| Field | Description |
|-------|-------------|
| Enable MLE | Enable this. It is off by default, and nothing is encrypted until it is on. |
| Request MLE Certificate Alias (Option 1 - Recommended) | Enter the alias you used when importing the `Cybersource_SJC_US` certificate. |

---

## Single-File Setup for Request MLE (Option 2)

Second approach have been added for Request MLE certificate management to simplify
onboarding: upload the Response MLE `.p12` itself and let the cartridge read the `CyberSource_SJC_US`
certificate straight out of it. This eliminates the OpenSSL command and the separate certificate
import — the file you already have covers Request MLE as it is.

1. Upload the `.p12` under **Administration > Site Development > Import & Export** (it lands in
   `IMPEX/src/`), or via WebDAV to `/on/demandware.servlet/webdav/Sites/Impex/src/mle/`.
2. Set **Request MLE - P12 file path under IMPEX (Option 2)** to the path under IMPEX where the file
   landed — e.g. `src/visaacceptance.p12` or `src/mle/visaacceptance.p12`.
3. Leave **Request MLE Certificate Alias (Option 1 - Recommended)** blank.

| Field | Description |
|-------|-------------|
| Request MLE - P12 file path under IMPEX (Option 2) | Path under IMPEX to the `.p12`. Used only when **Request MLE Certificate Alias** is blank; the request-MLE certificate and its key id are then read from this file. |

> **Option 1 takes priority.** If both fields are set, the keystore certificate is used and this
> file is ignored — the keystore is the platform's intended store for certificate material. Step 3
> is therefore required to use Option 2. Note this is a precedence, not a fallback: if the alias is
> set but its certificate cannot be read, the request fails with that error rather than quietly
> switching to the IMPEX bundle, so a mistyped alias can't masquerade as a working Option 1.


> **Still required for Response MLE:** if you use Response MLE or Unified Checkout webhooks, the
> merchant `.p12` must also be imported under **Administration > Operations > Private Keys and
> Certificates**, with its alias set in **Private Key Alias for Response MLE and Webhooks**.
> Response MLE decryption needs the private key, and it can only be referenced by keystore alias —
> a private key cannot be loaded from a file by script. This option removes the *separate
> certificate* export/import for Request MLE, not the keystore import.

> **Security note:** IMPEX is WebDAV-accessible (authenticated, but read access is granted per
> directory and org-wide) and the `.p12` contains your private key. The keystore-only setup above
> keeps the private key in Business Manager's protected store, where it cannot be read back or
> exported, so prefer it unless the single-file convenience is worth that tradeoff to you.

---

## Response MLE and Webhooks

Response MLE protects the return trip: Visa Acceptance encrypts the API **response** payload, and the
cartridge decrypts it with the private key from your `.p12`. Requests are already encrypted by Request
MLE above, so payment data is encrypted in both directions.

The same private key also decrypts Unified Checkout webhook notifications, so complete this section if
you use those webhooks — even if you leave Response MLE itself disabled.

**Step 1: Create the REST API Response MLE Key**

Create the REST API Response MLE Key by following the steps mentioned in the link:
<https://developer.cybersource.com/docs/cybs/en-us/security-keys/user/all/ada/security-keys/keys-manage/keys-rest-mle-intro/keys-mle-response-task.html>

This is the same key used for Request MLE — if you already created it for that, reuse the same `.p12`
and skip to Step 2.

**Step 2: Import the certificate into Business Manager**

1. In Business Manager, go to **Administration > Operations > Private Keys and Certificates**.
2. Import the `.p12` using the Export Password from Step 1.
3. Note the **Alias** you assigned — this same alias is used in Step 3.

**Step 3: Configure the MLE alias**

Go to **Merchant Tools > Site Preferences > Custom Preferences > Message-Level Encryption Configuration** and
set:

| Field | Description |
|-------|-------------|
| Enable MLE | Enable this if you have not already. It is the master switch for both directions and is off by default — with it off, responses arrive unencrypted even when the alias below is set. |
| Private Key Alias for Response MLE and Webhooks | Enter the alias of the imported `.p12` from Step 2. Used to decrypt encrypted API responses and Unified Checkout webhook payloads. |

> **Webhooks do not need Enable MLE.** Webhook payloads are decrypted with the alias directly, so
> Unified Checkout webhooks keep working even with **Enable MLE** off — that switch only controls
> whether requests are encrypted and whether *API responses* are encrypted.

Response MLE is requested only on the endpoints that support it, and only while this alias is set — leave it blank and responses come back in plain JSON. If the alias cannot be resolved, Response MLE is skipped and logged; the payment is not failed.

> **Webhooks:** this preference is the same value the Webhook Manager shows as **Webhook Response
> Decryption Key Alias**. If
> you are using Unified Checkout webhooks, open **Merchant Tools > Visa Acceptance Payment Services > Webhook
> Manager** and click **Update Advanced Settings** before syncing the Unified Checkout webhook subscription —
> that step registers your public certificate with Visa Acceptance and creates + activates the subscription.
> Until it is done, the Unified Checkout subscription fails with an error. See [Webhooks](Webhooks.md).

---

[Next: Optional Configuration →](Optional-Configuration.md)
