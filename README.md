# PayPal

Receive payments on your Medusa commerce application using PayPal.

[PayPal Plugin Documentation](https://docs.medusajs.com/v2/resources/commerce-modules/payment/payment-provider/paypal) | [Medusa Website](https://medusajs.com/) | [Medusa Repository](https://github.com/medusajs/medusa)

## Features

- Authorize payments on orders from any sales channel.
- Capture payments from the admin dashboard.
- View payment analytics through PayPal's dashboard.
- Ready-integration with [Medusa's Next.js starter storefront](https://docs.medusajs.com/starters/nextjs-medusa-starter).
- Support for Webhooks.

---

## Prerequisites

- [Medusa v2](https://docs.medusajs.com/v2)
- [PayPal account](https://www.paypal.com)

---

## How to Install

1\. Run the following command in the directory of the Medusa backend:

  ```bash
  npm install @medusajs/payment-paypal
  ```

2\. Set the following environment variables in `.env`:

  ```bash
  PAYPAL_SANDBOX=true
  PAYPAL_CLIENT_ID=<CLIENT_ID>
  PAYPAL_CLIENT_SECRET=<CLIENT_SECRET>
  PAYPAL_AUTH_WEBHOOK_ID=<WEBHOOK_ID>
  ```

3\. In `medusa-config.js` add the following at the end of the `plugins` array:

  ```ts
  //...
  import { Modules } from "@medusajs/utils"

  //...

  export default defineConfig({
    // ...
    modules: {
        // ...
        [Modules.PAYMENT]: {
            resolve: "@medusajs/payment",
            options: {
                providers: [
                    {
                        resolve: `@medusajs/payment-paypal`,
                        options: {
                            sandbox: process.env.PAYPAL_SANDBOX,
                            client_id: process.env.PAYPAL_CLIENT_ID,
                            client_secret: process.env.PAYPAL_CLIENT_SECRET,
                            auth_webhook_id: process.env.PAYPAL_AUTH_WEBHOOK_ID,
                        },
                    },
                ],
            },
        },
    },
  })
  ```

---

## Test the Plugin

TODO

---

## Additional Resources

- [PayPal Plugin Documentation](https://docs.medusajs.com/v2/resources/commerce-modules/payment/payment-provider/paypal)