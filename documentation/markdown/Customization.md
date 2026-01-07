# Customization

---

The Cybersource cartridge for Salesforce B2C Commerce has built-in custom hooks that can be utilized to customize request data that is sent to each service.

These can be utilized to send additional custom data, for example, if you want to include Merchant Defined Data in your authorization requests.

---

## How Custom Hooks Work

After a request for a particular service is built, there is a check for any code registering to the hook `app.payment.modifyrequest`. If present, the hook will be called for that specific request and the request object is passed into the hook. The return value of the hook is sent to Cybersource as the final request object.

Through this process, you can inject your own data into the request object from the custom code you write in a separate cartridge.

---

## Implementation

To customize request objects, register the hook `app.payment.modifyrequest` in your cartridge's `hooks.json` file. An example would look like this, replacing the script path with your own script:

```json
{
    "name": "app.payment.modifyrequest",
    "script": "./cartridge/scripts/hooks/modifyRequestExample"
}
```

You can copy the `scripts/hooks/modifyRequestExample` script from this cartridge into your own to use as a template for extending and modifying service request objects.

> **Note:** Every hook must return a valid request object for the given service. Please refer to the Cybersource Developer Guide for any field you want to customize or add.

---

---

[Next: Support & Troubleshooting →](Support-Troubleshooting.md)
