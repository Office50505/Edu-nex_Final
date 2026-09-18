# Razorpay and MSG91 setup

## Backend environment

Use `OTP_PROVIDER=msg91` and `PAYMENT_GATEWAY_MODE=razorpay`. `OTP_DELIVERY_PROVIDER` remains a fallback alias. `RAZORPAY_ENABLED` is no longer the provider selector. `AUTO_VERIFY_OTP=false`; MSG91 mode cannot bypass OTP verification even in development. Existing secret values in `.env` were preserved.

Required MSG91 values: `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `MSG91_BASE_URL=https://control.msg91.com/api/v5`.

Legacy single-mode Razorpay values: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` (a separate secret matching the webhook dashboard setting).

Pricing: `TRIAL_AMOUNT_PAISE=100`, `SUBSCRIPTION_AMOUNT_PAISE=49900`, `TRIAL_DURATION_HOURS=24`, `SUBSCRIPTION_TOTAL_COUNT=120`. The checkout page gets these values from `/api/payment/config`. The plan must be monthly, interval 1, INR, and exactly match the configured monthly amount, without additional tax/quantity. A change in price requires a matching new provider plan for new subscriptions; existing attempts keep their recorded prices.

The selected gateway mode requires matching `rzp_test_` or `rzp_live_` keys, independently of `NODE_ENV`. Plans, subscriptions and webhook configuration are separate between test/live modes. Never put key secrets or MSG91 auth keys in frontend variables.

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

Skillomate's current OTP template is `6aad0fdca0b55cc6b0003083`, with sender
`SKLMTE` and DLT template `1777178964721923789`. Keep the real auth key in the
backend secret environment. `MSG91_TEMPLATE_ID` is sent to the v5 OTP API;
`MSG91_DLT_TEMPLATE_ID` and `MSG91_SENDER_ID` document the expected provider-side
mapping, rather than unsupported extra v5 send parameters. Keep
`OTP_PROVIDER=msg91` and `AUTO_VERIFY_OTP=false`. Presence checks cannot prove
template approval, account balance, key validity, or delivery.

Create/approve the OTP template and sender/DLT settings for your target country in MSG91, enable SMS routing, and fund the account. This integration uses the server-side OTP APIs (`/otp`, `/otp/verify`, `/otp/retry`), not the separate browser OTP Widget. Run a send/resend/verify test using a designated phone after credentials and templates are ready. No real SMS is sent by the automated suite.

MongoDB stores delivery cooldowns, expiry, verification attempt counts and one-time consumption; it does not store real MSG91 OTP values. Existing per-IP/phone route rate limits also apply. IP rate-limit buckets remain per-process; a multi-instance deployment should use shared edge/Redis IP throttling in addition to the persisted phone limits. OTPs expire locally after five minutes and permit five verification attempts. Match the MSG91 template's expiry to five minutes. Resend waits 60 seconds.

## Verification commands

- `npm run integrations:check`: check required variable presence without exposing values or contacting providers.
- `npm run test:integrations`: deterministic auth navigation, OTP, signature, entitlement and callback tests with fixture provider responses.
- `npm run test:ai`: existing AI regressions.
- Frontend: `npm run build`.

The browser tests and actual SMS/Checkout/mandate lifecycle must still be completed with working credentials/dashboard configuration before production rollout.


## Admin Test/Live gateway selection

Admin → Settings → Razorpay gateway selects the mode for all **new** checkouts.
Select Test or Live and Apply. The server checks credentials are configured,
verifies the plan through a read-only Razorpay request, then stores the choice in
MongoDB. No restart is needed for subsequent mode switches. Environment changes
still need a restart. Secrets never appear in the admin response.

Configure these four fields separately for each mode:
`RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_TEST_PLAN_ID`,
`RAZORPAY_TEST_WEBHOOK_SECRET`, and the corresponding `RAZORPAY_LIVE_*` fields.
Both webhook configurations point to `/api/webhooks/razorpay`; use distinct
webhook secrets so the server can authenticate the mode independently of the
current checkout selection. Test keys must begin `rzp_test_`, live keys `rzp_live_`.

The generic `RAZORPAY_KEY_ID/KEY_SECRET/PLAN_ID/WEBHOOK_SECRET` fields remain a
fallback only for the legacy mode. By default this is inferred from the generic
key ID; explicitly set `RAZORPAY_LEGACY_MODE=test` (or `live`, according to the
actual old subscriptions) before replacing generic keys. Preserve the original
credentials in that mode's scoped fields. Existing records without a mode are
interpreted using this legacy mode; **do not guess or change it after migration**.
The initial mode is `RAZORPAY_MODE` if supplied, otherwise the legacy mode. Once
saved by an administrator, the database selection takes precedence.

New billing records, subscriptions and orders store their originating mode.
Verification, reconciliation, cancellation and webhooks use that recorded mode,
not the current admin selection. Switching does not cancel existing mandates.
Users must cancel an unfinished checkout in the other mode before starting a new
one. Test payments can grant app access in this shared application: select Test
only when you intend to expose test checkout to all learners.

### Annual web checkout: ₹4,999/year

The annual pricing card links to `/payment?plan=annual`. Checkout sends
`paymentType: "annual"`; the server selects and validates the provider plan,
amount, INR currency, yearly period and interval 1. Client-provided prices and
plan IDs are ignored. Annual checkout has no trial add-on or delayed start.

Configure annual plans separately by mode:

```dotenv
RAZORPAY_LIVE_ANNUAL_PLAN_ID=plan_TdSoXLQTCRrb7P
RAZORPAY_TEST_ANNUAL_PLAN_ID=
ANNUAL_SUBSCRIPTION_AMOUNT_PAISE=499900
ANNUAL_SUBSCRIPTION_TOTAL_COUNT=10
```

The supplied plan was verified read-only as a Live INR 4,999 yearly plan on
18 September 2026. Create and validate a separate Test-mode plan before testing
provider checkout in that mode; never put the Live plan ID in Test configuration.
Without an annual plan in the selected mode, the annual checkout is unavailable.
No fallback to monthly or trial billing occurs. The default 10 annual cycles
match the existing monthly configuration's 10-year maximum schedule.

New billing records snapshot the recurring amount. Captured, non-refunded
payments with current invoices grant access through the provider's exact
`billing_end`, including annual renewals; existing monthly records retain their
previous interpretation. Cancelling stops renewal while retaining already-paid
access. Profile > Subscription History provides a confirmation step to cancel
renewal or an unfinished checkout. Signed callbacks and webhooks use the billing
record's originating mode even after the administrator switches modes.

Changing environment variables requires an API restart. Deploy the frontend and
primary API changes together. The older `appcopyai/backend` is not the annual
checkout target. No data migration or blanket update of existing subscriptions
is needed. Do not remove annual handling after accepting annual payments.

### Monthly trial configuration (unchanged)

Create a **₹499 INR plan, every one month**, independently in Test and Live.
The plan itself does not encode the trial. Set:

```dotenv
TRIAL_AMOUNT_PAISE=100
TRIAL_DURATION_HOURS=24
SUBSCRIPTION_AMOUNT_PAISE=49900
```

The backend adds the ₹1 upfront amount and schedules the first recurring payment
24 hours after **checkout creation** via `start_at`. Checkout expires after ten
minutes. This existing implementation does not promise a full 24 hours measured
from successful payment; completing checkout later shortens access by that delay.
Monthly renewal follows the provider's billing schedule. Mandate authorization
alone does not grant access; captured payments are verified. Bank collection
success and exact debit time are not guaranteed by a configured plan.

The old configuration used 50000 paise. Explicit `.env` values override the new
49900 default; update the deployed environment and use a matching plan before
switching. Previously created subscriptions retain their stored amount and plan.

### Verification and rollout

Run `node --test tests/payment-mode.test.cjs tests/razorpay.test.cjs
 tests/cancel-account-billing.test.cjs tests/system-health.test.cjs` from edunex-b
(as one command), plus the frontend payment settings component tests and build.
Deploy backend and frontend together, preserving `.env` and uploads. The new
`PaymentSettings` model needs normal application database write access. No
payment, mandate, or plan is created by saving the admin setting.
