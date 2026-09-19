# Web Premium paywall - September 19, 2026

## Audit and changes
The repository and deployed payment bundle already used Razorpay Standard Checkout with Subscriptions. The supplied screenshot retained `/payment` in the browser. It showed an overlay, not an external navigation. The legacy non-Razorpay redirect fallback in PaymentPage is now removed from web checkout.

The default web paywall charges INR 499 monthly, uses Skillomate dark/gold styling, shows Complete Course Access, Nex AI and Premium AI Tools, and opens UPI checkout with the JavaScript SDK. Razorpay controls QR availability and mobile Intent app eligibility; no static QR, fabricated app buttons, or raw UPI payment links were introduced. Annual checkout remains available when configured. Existing explicitly advertised INR 1 trial links now use `plan=trial` to preserve their stated price.

Native success appears only after backend confirmation. Provider failures show a retry action on Skillomate. Once an authorization result has arrived, delayed or failed verification offers a status check instead of another charge. Google Play Billing and Apple IAP were not modified.

## Verification and remaining release checks
93 frontend tests and 19 Razorpay backend tests passed; frontend production build passed (existing large HLS chunk warning). Tests include no-redirect fallback handling, monthly/annual/trial selection, SDK handler parameters, payment failure, delayed verification and all requested webhook event names. These are mocked tests, not proof of real payments or phone app handoffs.

Rendered browser testing remains unverified per the user's earlier preference. Test a desktop QR subscription and mobile UPI Intent return in Razorpay test mode / an approved payment session before production release. No payment or mandate was created during this implementation. Local changes are not deployed.

## Razorpay dashboard webhook configuration
The existing backend endpoint is `/api/webhooks/razorpay`. It validates the raw-body HMAC with the mode-specific webhook secret, deduplicates events and refetches provider subscription/invoice/payment data. Paid access is based on captured, non-refunded payments and their paid period, not frontend assertions or the event name alone. Cancellation should preserve an already paid period.

Dashboard configuration was not accessed or changed. Before release confirm that the production HTTPS endpoint is enabled with the matching secret and these events:
- subscription.activated
- subscription.charged
- subscription.pending
- subscription.halted
- subscription.cancelled
- subscription.completed
- payment.failed

Check delivery/retry logs, including a payment.failed payload without a subscription entity. Some unassociated failures may not resolve to billing; the existing handler acknowledges these without granting access. Do not treat frontend tests as verification of dashboard event subscriptions.
