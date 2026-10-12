# PhonePe Standard AutoPay test harness

This harness is deliberately separate from Skillomate's real `Order`, `Subscription`,
`SubscriptionEvent`, and `User` records. It never grants access or changes a production
subscription. It accepts only 100 paise for mandate setup and debit, has no scheduler,
and its routes return 404 when `NODE_ENV=production`.

This harness uses PhonePe **Standard Checkout AutoPay**, not Custom Checkout. Its outbound
API paths are:

- Setup: `POST /checkout/v2/pay`
- Subscription status: `GET /checkout/v2/subscriptions/{merchantSubscriptionId}/status`
- Notify redemption: `POST /checkout/v2/subscriptions/notify`
- Execute redemption: `POST /checkout/v2/subscriptions/redeem`

The setup payload uses `SUBSCRIPTION_CHECKOUT_SETUP` with the mandate fields nested under
`paymentFlow.subscriptionDetails`, and PhonePe's hosted approval page is read from the
`redirectUrl` response field.

## Required configuration

Start in `mock`, then use PhonePe sandbox credentials. Use `live` only for a deliberate,
consenting ₹1 production-rail test.

```dotenv
NODE_ENV=development
PHONEPE_AUTOPAY_TEST_ROUTES_ENABLED=true
PHONEPE_AUTOPAY_ENABLED=true
PHONEPE_AUTOPAY_MODE=sandbox
PHONEPE_AUTOPAY_LIVE_TEST_ENABLED=false
PHONEPE_AUTOPAY_BASE_URL=https://api-preprod.phonepe.com/apis/pg-sandbox
PHONEPE_AUTOPAY_AUTH_BASE_URL=
PHONEPE_AUTOPAY_MERCHANT_ID=M2323C4M624GH
PHONEPE_AUTOPAY_CLIENT_ID=<PhonePe AutoPay client ID for this environment>
PHONEPE_AUTOPAY_CLIENT_SECRET=<PhonePe AutoPay client secret for this environment>
PHONEPE_AUTOPAY_CLIENT_VERSION=<PhonePe client version>
PHONEPE_AUTOPAY_REDIRECT_URL=https://skillomate.in/dashboard
PHONEPE_AUTOPAY_CALLBACK_URL=https://<public-backend>/api/webhooks/phonepe/autopay
PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE=sha
PHONEPE_AUTOPAY_WEBHOOK_USERNAME=<dashboard webhook username>
PHONEPE_AUTOPAY_WEBHOOK_PASSWORD=<dashboard webhook password>
PHONEPE_AUTOPAY_SALT_KEY=
```

For a live ₹1 verification, make all three deliberate changes below. The backend must
still run with `NODE_ENV` other than `production`:

```dotenv
PHONEPE_AUTOPAY_MODE=live
PHONEPE_AUTOPAY_LIVE_TEST_ENABLED=true
PHONEPE_AUTOPAY_BASE_URL=https://api.phonepe.com/apis/pg
PHONEPE_AUTOPAY_AUTH_BASE_URL=https://api.phonepe.com/apis/identity-manager
```

The redirect URL is the customer-facing page PhonePe opens after mandate approval. It is
not the webhook URL. Current v2 OAuth does not use a salt key. For a SHA webhook, configure the same webhook
username and password in PhonePe Developer Settings. If PhonePe configured an HMAC webhook
instead, set `PHONEPE_AUTOPAY_WEBHOOK_AUTH_TYPE=hmac`, `PHONEPE_AUTOPAY_HMAC_KEY_ID`, and
`PHONEPE_AUTOPAY_HMAC_SECRET` from that webhook configuration.

## Manual test

1. Configure the environment above. In PhonePe Developer Settings, set the webhook URL to
   `https://<public-backend>/api/webhooks/phonepe/autopay` and enable setup, notification,
   and redemption events.
2. Start the backend from `edunex-b` with `npm run dev`.
3. Create the ₹1 test mandate with an authenticated admin token:

   ```bash
   curl -X POST http://localhost:3000/api/admin/phonepe-autopay/test/create-mandate \
     -H 'Authorization: Bearer <ADMIN_TOKEN>' \
     -H 'Content-Type: application/json' \
     -d '{"userId":"<CONSENTING_TEST_USER_ID>","amount":100}'
   ```

4. Copy `test.approvalUrl` and open it on the test phone. Approve only the ₹1,
   fixed, on-demand test mandate.
5. Wait for `checkout.order.completed`. Confirm the webhook response has `matched: true`,
   or inspect the `PhonePeAutoPayTest` record. Its status should become `ACTIVE`.
6. Check PhonePe and local status using the returned `merchantSubscriptionId` (the route
   also accepts `testId` or PhonePe's mandate ID):

   ```bash
   curl http://localhost:3000/api/admin/phonepe-autopay/test/status/<MERCHANT_SUBSCRIPTION_ID> \
     -H 'Authorization: Bearer <ADMIN_TOKEN>'
   ```

7. Submit the ₹1 pre-debit notification. This first call cannot debit because the harness
   sends `autoDebit: false`:

   ```bash
   curl -X POST http://localhost:3000/api/admin/phonepe-autopay/test/debit \
     -H 'Authorization: Bearer <ADMIN_TOKEN>' \
     -H 'Content-Type: application/json' \
     -d '{"mandateId":"<MERCHANT_SUBSCRIPTION_ID>","confirmTestDebit":true,"amount":100}'
   ```

8. Wait for `subscription.notification.completed` and any returned `validAfter` time.
   Repeat the exact debit request once to call PhonePe's redeem endpoint and initiate the ₹1 debit.
9. Verify `subscription.redemption.order.completed` or
   `subscription.redemption.transaction.completed`, then call the status endpoint again.
   The isolated record's `debit.redeemState` should be `COMPLETED`.

Never substitute `49900` or another amount: both request builders and the database schema
reject anything other than 100 paise.
