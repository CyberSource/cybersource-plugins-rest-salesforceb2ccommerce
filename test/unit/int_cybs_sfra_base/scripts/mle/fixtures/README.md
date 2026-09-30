# PKCS#12 test fixtures

Base64-encoded `.p12` bundles used by `test/unit/int_cybs_sfra_base/scripts/mle/p12Parser.js`.

**These contain throwaway self-signed keys generated solely for unit tests. They are not real
credentials and are not used by any environment.** The subjects deliberately mirror a real Visa
Acceptance bundle so the parser is tested against the shapes it must handle in production.

| Fixture | Layout | Purpose |
|---------|--------|---------|
| `cybs.p12.b64` | MAC iteration 1, 3 certs in a **plaintext** `PKCS7 Data` bag, key in a 3DES Shrouded Keybag | Reproduces the real Visa Acceptance bundle. Proves the certificates are reachable with **no password and no PBE decryption**. |
| `cybs-certs-only.p12.b64` | 3 certs, **no key bag at all** | Only certificate bags are read, so a bundle with the private key stripped must still parse. |
| `plain.p12.b64` | 2 certs, cert bags unencrypted (`-certpbe NONE`) | Baseline walk of the PFX structure. |
| `rc2.p12.b64` | cert bags encrypted with `pbeWithSHA1And40BitRC2-CBC`, iteration 2048 | Asserts the parser surfaces the right PBE algorithm OID / salt / iteration count to `decryptFn`. |
| `pbes2.p12.b64` | modern OpenSSL default (PBES2 = PBKDF2 + AES) | Asserts we fail with a precise, actionable error, since SFCC has no PBKDF2 API. |

## Regenerating

Requires OpenSSL 3.x. On Git Bash, prefix with `MSYS_NO_PATHCONV=1` or the `/CN=...` subject gets
rewritten into a Windows path.

```bash
export MSYS_NO_PATHCONV=1
openssl req -x509 -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.crt -days 3650 \
  -subj "/CN=visa_acceptance_sfcc_rest/serialNumber=1785476370580482147934"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 \
  -subj "/CN=CyberSourceCertAuth"
openssl req -x509 -newkey rsa:2048 -nodes -keyout sjc.key -out sjc.crt -days 3650 \
  -subj "/CN=CyberSource_SJC_US/serialNumber=1763424170787064972884"
cat ca.crt sjc.crt > extra.crt

# cybs.p12 — the real-world layout
openssl pkcs12 -export -out cybs.p12 -inkey leaf.key -in leaf.crt -certfile extra.crt \
  -passout pass:testpass -certpbe NONE -keypbe PBE-SHA1-3DES -macalg sha1 -iter 1 -legacy \
  -name "serialNumber=1785476370580482147934,CN=visa_acceptance_sfcc_rest"

openssl base64 -A -in cybs.p12 > cybs.p12.b64

# cybs-certs-only.p12 - private key stripped
openssl pkcs12 -in cybs.p12 -passin pass:testpass -nokeys -legacy -out c.pem
openssl pkcs12 -export -nokeys -in c.pem -out cybs-certs-only.p12 -passout pass: -certpbe NONE
openssl base64 -A -in cybs-certs-only.p12 > cybs-certs-only.p12.b64
```

Verify a fixture's layout against a real bundle with:

```bash
openssl pkcs12 -in cybs.p12 -passin pass:testpass -info -nokeys -legacy
```
