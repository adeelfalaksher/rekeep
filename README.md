# Rekeep

Rekeep is an installable merchant workspace for item-level refunds. Open a case with the customer’s complaint and the order lines, review the suggested item with its exact evidence, and record the refund. Each store account has its own private inbox.

[Open Rekeep](https://rekeep-app.vercel.app/) · [See how it works](https://rekeep-app.vercel.app/intro)

| Before | With Rekeep |
| --- | --- |
| Compare the complaint with an order across multiple tabs. | Read the complaint and see the evidence for the suggested item in one view. |
| Calculate the refund manually. | Review the selected item, refund amount, and amount kept. |
| Similar variants are easy to confuse. | Ambiguous cases require the merchant to select the line. |
| The refund reference lives in a separate tool. | Keep the payment-provider reference with the case. |

## Run locally

1. Use Node.js 22 or newer. Copy `.env.example` to `.env` and configure your Supabase URL and publishable key.
2. Apply the SQL migration in `supabase/migrations` to your project. Configure the Auth Site URL and allow your app’s `/confirm` redirect. Keep email confirmation enabled and configure a transactional SMTP sender to support sign-ups outside your Supabase project team.
3. Run `npm start` and open http://127.0.0.1:4173. Run `npm test` for the automated checks.

In Vercel set `APP_ORIGIN` to your deployment’s canonical HTTPS URL and set the two Supabase configuration values from step 1. Private data is protected by authenticated Supabase access and row-level security. The service worker caches only the public app shell and assets.

## Refunds

**Record refund** saves a refund you have already issued with your payment provider. It stores a reference and calculates the amount from the selected order line.

To use **Issue Sandbox refund**, configure the optional Braintree values from `.env.example` server-side. Bind the connection to a Rekeep user ID or an explicitly configured verified merchant email, use Sandbox-only API keys, and set a server-only Supabase secret key. Use a settled USD Braintree transaction whose order reference and amount match the case. The server records a pending attempt before submitting the partial refund, and a pending outcome blocks additional attempts for that case or transaction.

The matcher combines a small Naive Bayes classifier trained on synthetic English complaint examples with item and variant matching. Low-evidence or ambiguous messages require manual review. A merchant always chooses whether to proceed.

## Design references

The public and workspace UI share a design direction based on the [Altitude card page](https://mobbin.com/sites/sections/57e26228-53f2-4a69-ab19-b1ce00d4a374) and [Altitude product layout](https://mobbin.com/sites/sections/55360ea6-42d4-4647-8988-184af2b11aa6). Rekeep uses original order artwork and an inbox icon from Lucide.

Licensed under MIT. The Lucide inbox icon is distributed under the ISC license.
