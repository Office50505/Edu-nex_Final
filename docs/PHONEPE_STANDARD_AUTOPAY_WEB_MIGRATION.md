# PhonePe Standard AutoPay web migration

## Scope

This migration changes only new Skillomate web subscriptions. Existing Razorpay mandates remain on Razorpay, and Google Play Billing and Apple IAP remain unchanged.

Commercial terms:

- Introductory setup payment: INR 1 (100 paise).
- First recurring payment: INR 499 (49,900 paise), after the provider-authorized waiting period targeted at 24 hours.
- Later recurring payments: INR 499 monthly.
- Mandate: fixed amount, monthly frequency, maximum INR 499.

PhonePe's returned `validAfter` value is authoritative. The scheduler never redeems before that timestamp.

## Standard Checkout endpoints

The integration uses only the Standard Checkout v2 AutoPay endpoints:

- Setup: `POST /checkout/v2/pay`
- Subscription status: `GET /checkout/v2/subscriptions/{merchantSubscriptionId}/status`
- Pre-debit notification: `POST /checkout/v2/subscriptions/notify`
- Redemption: `POST /checkout/v2/subscriptions/redeem`
- Cancellation: `POST /checkout/v2/subscriptions/{merchantSubscriptionId}/cancel`

## Required configuration

Set values in the backend environment without committing secrets:

```dotenv
PHONEPE_AUTOPAY_ENABLED=false
PHONEPE_AUTOPAY_WEB_ENABLED=false
PHONEPE_AUTOPAY_SCHEDULER_ENABLED=false
PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED=false
PHONEPE_AUTOPAY_MODE=sandbox
PHONEPE_AUTOPAY_BASE_URL=https://api-preprod.phonepe.com/apis/pg-sandbox
PHONEPE_AUTOPAY_AUTH_BASE_URL=https://api-preprod.phonepe.com/apis/pg-sandbox
PHONEPE_AUTOPAY_MERCHANT_ID=
PHONEPE_AUTOPAY_CLIENT_ID=
PHONEPE_AUTOPAY_CLIENT_SECRET=
PHONEPE_AUTOPAY_CLIENT_VERSION=1
PHONEPE_AUTOPAY_CALLBACK_URL=https://api.skillomate.in/api/webhooks/phonepe/autopay
PHONEPE_AUTOPAY_REDIRECT_URL=https://skillomate.in/dashboard
PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE=sha
PHONEPE_AUTOPAY_WEBHOOK_USERNAME=
PHONEPE_AUTOPAY_WEBHOOK_PASSWORD=
```

For production use:

```dotenv
PHONEPE_AUTOPAY_MODE=live
PHONEPE_AUTOPAY_BASE_URL=https://api.phonepe.com/apis/pg
PHONEPE_AUTOPAY_AUTH_BASE_URL=https://api.phonepe.com/apis/identity-manager
```

`PHONEPE_AUTOPAY_PARTNER_MERCHANT_ID` must stay empty for a direct merchant integration. Set it only if PhonePe has explicitly provisioned Skillomate as a partner/aggregator integration.

## Deployment sequence

1. Deploy the code with all four feature flags set to `false`.
2. Register `https://api.skillomate.in/api/webhooks/phonepe/autopay` in PhonePe Developer Settings with the same webhook authentication credentials as the backend.
3. Confirm the callback reaches the route and that invalid authentication is rejected without exposing credentials.
4. In sandbox, set `PHONEPE_AUTOPAY_ENABLED=true` and `PHONEPE_AUTOPAY_WEB_ENABLED=true`. Keep both scheduler flags disabled.
5. Complete one INR 1 sandbox mandate. Verify the setup order is completed, the mandate is ACTIVE, and its terms are fixed INR 499 monthly.
6. Enable `PHONEPE_AUTOPAY_SCHEDULER_ENABLED=true` in sandbox. Verify notification, provider `validAfter`, redemption, webhook reconciliation, and one-month access extension.
7. For production, switch the URLs and mode to `live`. Keep `PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED=false` while validating one INR 1 production setup and read-only status reconciliation.
8. After explicit business approval, enable `PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED=true`. This is the independent permission for real INR 499 notify/redeem processing.
9. Select PhonePe as the provider for new web checkouts only after the preceding checks pass.
10. Retain Razorpay credentials, webhook processing, cancellation, reconciliation, and jobs for existing Razorpay subscribers.

## Rollback

- Set `PHONEPE_AUTOPAY_WEB_ENABLED=false` to stop new PhonePe web checkouts.
- Set `PHONEPE_AUTOPAY_SCHEDULER_ENABLED=false` and `PHONEPE_AUTOPAY_LIVE_RECURRING_ENABLED=false` to stop new notifications and redemptions.
- Keep `PHONEPE_AUTOPAY_ENABLED=true` while any PhonePe mandates exist so status, webhook, and cancellation handling remain available.
- Switch the new-checkout provider back to Razorpay if necessary. Do not delete PhonePe billing records or reinterpret them as Razorpay subscriptions.

## Safety invariants

- A setup payment grants access only after PhonePe reports the order COMPLETED and the mandate ACTIVE.
- The mandate must be FIXED, MONTHLY, and capped at 49,900 paise.
- A renewal grants access only after PhonePe reports the INR 499 order COMPLETED.
- Every recurring order ID is unique and a completed order cannot extend access twice.
- Provider timeouts are treated as uncertain; the system reconciles status instead of blindly retrying a debit.
- No code path migrates or charges an existing Razorpay subscriber.
- No mobile-store subscription is modified.

## Verification performed locally

- Frontend checkout and recovery tests: 32 passed.
- Backend payment, onboarding, access, cancellation, and AutoPay tests: 96 passed.
- Frontend production build completed successfully.
- No live mandate or debit was created during implementation.

## Before production

- Rotate any webhook password that has appeared in a screenshot or chat before production use.
- Confirm PhonePe has enabled Standard Checkout AutoPay for the live client ID and merchant ID.
- Use a dedicated monitoring alert for failed notification, failed redemption, webhook authentication failures, and scheduler disablement.
- Obtain explicit approval before enabling the live recurring flag.
