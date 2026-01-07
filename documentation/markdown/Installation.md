# Install Cybersource for Salesforce B2C Commerce

Download and install the Cybersource cartridge for Salesforce B2C Commerce.

---

## Prerequisites

Before beginning installation, ensure you have:

- Access to your Salesforce B2C Commerce instance
- Node.js installed on your development machine
- Appropriate IDE (VSCode recommended with Prophet Debugger extension)

---

## Download

Download Cybersource cartridge for Salesforce B2C Commerce from GitHub.

---

## Set up workspace

1. Create a "Cybersource" folder in your Salesforce workspace and copy the downloaded cartridge (`int_cybs_sfra` and `int_cybs_sfra_base`) to the workspace.

2. If the project's base path is different from the one available in Cybersource's package.json, open the file `/package.json` and modify the `paths.base` value to point to your `app_storefront_base` cartridge. This path is used by the JS and SCSS build scripts.

---

## Configure IDE (VSCode)

If you use VSCode, install the extension Prophet Debugger and include these lines in `dw.json`:

```json
{
    "hostname": "your-sandbox-hostname.demandware.net",
    "username": "yourlogin",
    "password": "yourpwd",
    "version": "version_to_upload_to",
    "cartridge": [
        "int_cybs_sfra",
        "int_cybs_sfra_base",
        "app_storefront_base",
        "modules"
    ]
}
```

If you are using a different IDE, please refer to the respective guide to set up your workspace.

---

## Build and Upload Code

### Step 1: Install Node Dependencies

Install the node in the "Cybersource" folder.

Install sgmf-scripts and copy-webpack-plugin with this command:

```bash
npm install sgmf-scripts && npm install copy-webpack-plugin
```

### Step 2: Compile JS and SCSS

Compile JS and SCSS with this command:

```bash
npm run compile:js && npm run compile:scss
```

### Step 3: Upload the Code

Upload the code to Salesforce Commerce Cloud instance:

```bash
npm run uploadCartridge
```

The Cybersource cartridge is now installed and ready for configuration in your Salesforce B2C Commerce environment.

---

---

[Next: Configure Cybersource for Salesforce B2C Commerce →](Configuration.md)
