# Razorpay and MSG91 setup

## Backend environment

Use `OTP_PROVIDER=msg91` and `PAYMENT_GATEWAY_MODE=razorpay`. `OTP_DELIVERY_PROVIDER` remains a fallback alias. `RAZORPAY_ENABLED` is no longer the provider selector. `AUTO_VERIFY_OTP=false`; MSG91 mode cannot bypass OTP verification even in development. Existing secret values in `.env` were preserved.

Required MSG91 values: `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_BASE_URL=https://control.msg91.com/api/v5`.

Required Razorpay values: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` (a separate secret matching the webhook dashboard setting).

Pricing: `TRIAL_AMOUNT_PAISE=100`, `SUBSCRIPTION_AMOUNT_PAISE=50000`, `TRIAL_DURATION_HOURS=24`, `SUBSCRIPTION_TOTAL_COUNT=120`. The checkout page gets these values from `/api/payment/config`. The plan must be monthly, interval 1, INR, and exactly match the configured monthly amount, without additional tax/quantity. A change in price requires a matching new provider plan for new subscriptions; existing attempts keep their recorded prices.

Development requires `rzp_test_` keys; production requires `rzp_live_` keys. Plans, subscriptions and webhook configuration are separate between test/live modes. Never put key secrets or MSG91 auth keys in frontend variables.

## Razorpay dashboard and plan

1. Enable Subscriptions for your Razorpay account and confirm which mandate methods are available. Checkout handles the customer's card/UPI authorization; the app does not collect bank credentials.
2. Create a monthly INR plan matching the configured amount. Alternatively, run `npm run payment:create-plan` once after setting test credentials; this explicitly creates a plan and prints the ID. Save it as `RAZORPAY_PLAN_ID`. Do not rerun blindly after a timeout: check the provider dashboard first.
3. Configure an HTTPS webhook URL: `https://YOUR_BACKEND/api/webhooks/razorpay` with your `RAZORPAY_WEBHOOK_SECRET`. For local development use a reachable HTTPS tunnel to port 3000. Do not set the webhook to localhost.
4. Enable the available subscription lifecycle events (authenticated, activated, charged, pending, halted, cancelled, completed, paused, resumed), `invoice.paid`, `payment.captured`, `payment.failed`, and `refund.processed`.
5. Test successful Checkout, closure, failed authorization, duplicate callbacks/webhooks, renewals, refunds and cancellation before switching modes. Dashboard approval and live payment-method availability cannot be configured with API keys alone.

References: https://razorpay.com/docs/api/payments/subscriptions/create-subscription/ and https://razorpay.com/docs/payments/subscriptions/workflow/ and https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/ .

## Trial and access rules

The ₹1 trial is an upfront add-on to a future-start monthly subscription. Checkout expires after ten minutes; first billing is scheduled 24 hours after checkout creation, so the exact available trial duration after authorization can be slightly shorter. The UI discloses that schedule. Razorpay may display a refundable mandate authentication charge; test the actual amount/method rather than assuming authorization always costs ₹1.

Only captured INR payments from paid subscription invoices grant access. A mandate/authorization alone does not grant a paid month. The current paid invoice's billing period determines monthly access. Status polling and signed webhook handling fetch fresh provider state and invoices, so old webhook payloads do not drive access changes. Payment status is rechecked for refunds. Full refunds revoke the associated period; partial refunds preserve the paid period. Refunds are issued by the operator through Razorpay Dashboard; no unauthenticated refund API is exposed.

Cancellation stops auto-renewal immediately but preserves already-paid trial/monthly access until expiry. The checkout offers only the trial with monthly auto-renewal. The cancellation API remains available; a self-service billing management screen is still needed. Account deletion is blocked until Razorpay billing is closed; unresolved create attempts require reconciliation first.

New schema fields preserve old PhonePe records and indexes. Razorpay order IDs use the namespaced compatibility transaction key `razorpay:pay_...`; no legacy identifiers are renamed or indexes dropped. Legacy PhonePe trials are no longer promoted just because a mandate exists.

## Delivery and recovery

The new `RazorpayBilling` record reserves one creation attempt per learner. Concurrent requests cannot create separate mandates. A timed-out POST remains `uncertain`: the provider may have created the subscription. Never delete that record to retry blindly. Compare its `attempt` with the provider subscription's `notes.checkout_attempt`. A signed subscription webhook recovers a matching uncertain attempt automatically. Otherwise an operator must verify and reconcile the provider subscription ID before reopening checkout.

Billing reconciliation takes a short database lease. Duplicate events are recorded only after successful processing; provider or database failures return an error so Razorpay can retry. The app does not fake successful verification when invoice/payment data is not yet available. Refresh the payment page to retry reconciliation; do not pay again while confirmation is pending.

## MSG91 dashboard

Create/approve the OTP template and sender/DLT settings for your target country in MSG91, enable SMS routing, and fund the account. This integration uses the server-side OTP APIs (`/otp`, `/otp/verify`, `/otp/retry`), not the separate browser OTP Widget. Run a send/resend/verify test using a designated phone after credentials and templates are ready. No real SMS is sent by the automated suite.

MongoDB stores delivery cooldowns, expiry, verification attempt counts and one-time consumption; it does not store real MSG91 OTP values. Existing per-IP/phone route rate limits also apply. IP rate-limit buckets remain per-process; a multi-instance deployment should use shared edge/Redis IP throttling in addition to the persisted phone limits. OTPs expire locally after five minutes and permit five verification attempts. Match the MSG91 template's expiry to five minutes. Resend waits 60 seconds.

## Verification commands

- `npm run integrations:check`: check required variable presence without exposing values or contacting providers.
- `npm run test:integrations`: deterministic auth navigation, OTP, signature, entitlement and callback tests with fixture provider responses.
- `npm run test:ai`: existing AI regressions.
- Frontend: `npm run build`.

The browser tests and actual SMS/Checkout/mandate lifecycle must still be completed with working credentials/dashboard configuration before production rollout.
