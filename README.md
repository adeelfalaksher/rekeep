# Rekeep

Rekeep is a responsive merchant website for item-level refunds. Open a case with the customer’s complaint and the order lines, review the suggested item with its exact evidence, and record the refund. Each store account has its own private inbox.

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

In Vercel set `APP_ORIGIN` to your deployment’s canonical HTTPS URL and set the two Supabase configuration values from step 1. Private data is protected by authenticated Supabase access and row-level security.

## Refunds

**Record refund** saves a refund you have already issued with your payment provider. It stores a reference and calculates the amount from the selected order line.

To use **Issue Sandbox refund**, configure the optional Braintree values from `.env.example` server-side. Bind the connection to a Rekeep user ID or an explicitly configured verified merchant email, use Sandbox-only API keys, and set a server-only Supabase secret key. Use a settled USD Braintree transaction whose order reference and amount match the case. The server records a pending attempt before submitting the partial refund, and a pending outcome blocks additional attempts for that case or transaction.

The matcher combines a small Naive Bayes classifier trained on synthetic English complaint examples with item and variant matching. Low-evidence or ambiguous messages require manual review. A merchant always chooses whether to proceed.

## Design references

The centered homepage, workflow tabs, stacked comparison panels, and footer draw from the [Humble homepage](https://mobbin.com/sites/sections/9e9b4f3e-380b-437c-b4fd-42a7667ac50b), [Humble feature layout](https://mobbin.com/sites/sections/f062f25a-e338-461a-8d6f-f13d3462046e), and [Humble footer](https://mobbin.com/sites/sections/07a09417-ce3c-4b74-a687-f11191cf3d0c). The product photograph and branding were created for Rekeep. The inbox icon is from Lucide.

Licensed under MIT. The Lucide inbox icon is distributed under the ISC license.
