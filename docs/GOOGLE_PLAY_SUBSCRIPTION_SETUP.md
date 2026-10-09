# Google Play subscription setup

The Android Play Store build (`appcopyai`, package `com.skillomate.app`) now uses Google Play Billing for premium access. It does not use Razorpay or a web checkout inside the Play-distributed app.

## Required Play Console product

The following configuration was confirmed active by the product owner. Verify it in **Play Console → Monetize → Products → Subscriptions** before release; this document is not a live Console check:

- Product ID: `skillomate_premium_monthly`
- Auto-renewing base plan ID: `monthly`
- Billing period: monthly
- India base-plan price: ₹499/month
- Introductory offer ID: `intro-9rs-3days`
- Offer eligibility: confirm the intended new-customer rule in Console; only use offers Google returns for the account
- Offer phase type: **Single payment**
- Offer phase duration: **3 days** (`P3D`)
- India offer price: ₹9
- Following phase: the ₹499/month auto-renewing base plan until cancelled
- Configured grace period: 0 days (Google's silent payment-retry period still applies)

The customer accepts both phases of one subscription in Google's purchase sheet. Google Play charges the localized introductory price, reports the access period, and attempts the regular monthly renewal unless the customer cancels. Skillomate does not create a mandate, schedule a ₹499 collection, or calculate expiry from signup time.

The app displays the localized prices returned by Google Play. It accepts the configured introductory offer on the `monthly` base plan with a paid single-payment `P3D` phase followed by a `P1M` recurring phase and passes its returned token to the billing sheet. Customers without an eligible introductory offer see the regular monthly terms. Before checkout the app refreshes the product: changed or unavailable terms must be displayed and require another purchase action, rather than silently replacing an introductory checkout with the regular plan.

Expected India disclosure: **₹9 for the first 3 days, then ₹499/month. Automatically renews until cancelled.** Actual app prices and durations come from Play metadata. Apple IAP, Razorpay's ₹1/24-hour web offer, PhonePe and Skillomate Direct retain their independent billing terms.

## Backend verification

Create a least-privilege Google Cloud service account, enable the Android Publisher API, and grant that service account access to the Skillomate app in Play Console. Configure production with:

```env
GOOGLE_PLAY_PACKAGE_NAME=com.skillomate.app
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=skillomate_premium_monthly
GOOGLE_PLAY_INTRODUCTORY_OFFER_ID=intro-9rs-3days
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={...service-account JSON...}
GOOGLE_PLAY_RTDN_AUDIENCE=https://api.skillomate.in/api/google-play-iap/notifications
GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL=play-rtdn-push@YOUR_PROJECT.iam.gserviceaccount.com
```

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` can be used instead of the raw JSON variable. Never commit the service-account key.

When `SKILLOMATE_CONFIG_SOURCE=ssm`, the bootstrap reads `/skillomate/prod/` recursively. It now fails closed unless these parameters are present and nonblank:

- `/skillomate/prod/GOOGLE_PLAY_PACKAGE_NAME` = `com.skillomate.app`
- `/skillomate/prod/GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID` = `skillomate_premium_monthly`
- `/skillomate/prod/GOOGLE_PLAY_INTRODUCTORY_OFFER_ID` = `intro-9rs-3days`
- `/skillomate/prod/GOOGLE_PLAY_RTDN_AUDIENCE` = `https://api.skillomate.in/api/google-play-iap/notifications`
- `/skillomate/prod/GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` = the dedicated Pub/Sub push identity
- One of `/skillomate/prod/GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` or `/skillomate/prod/GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`

The existing loader expects these values as `SecureString`. `REDIS_URL` is already required and is used by the distributed reconciliation lock. `DISABLE_BACKGROUND_JOBS=false` is the normal worker setting; it is optional and defaults to enabled when absent. `SKILLOMATE_CONFIG_SOURCE=ssm` belongs to the process bootstrap environment, rather than inside the loaded parameter set. The Android release profiles set `EXPO_PUBLIC_API_BASE=https://api.skillomate.in`; local builds may use the documented development host variables. Do not print service-account contents during validation.

The client sends only the purchase token. The backend checks the current subscription with Google, verifies the configured package/product and obfuscated Skillomate account identifier, prevents a token being linked to another account, and persists the expiry/state. It then acknowledges a verified active purchase through the official Google API. Already-acknowledged purchases are idempotent; an ambiguous acknowledgement error is checked against a fresh Google snapshot. Pending or invalid purchases are never acknowledged or granted access.

A short database lease limits concurrent server acknowledgement attempts. Temporary acknowledgement failures remain queued for retry. The Android client skips acknowledgement when the backend reports it acknowledged and retains its fallback for a verified active purchase. See the [Google acknowledgement API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/acknowledge).

The router is mounted once at `/api`; its own paths already include `/google-play-iap`. The client-facing endpoints are authenticated `GET /api/google-play-iap/config`, `GET /api/google-play-iap/status`, and `POST /api/google-play-iap/verify`. The notifications endpoint uses Pub/Sub identity-token authentication instead of a user session. Mobile account access is refreshed separately through authenticated `GET /api/user/:id/subscription`, which resolves Razorpay, Apple, Google Play, and legacy/admin records for that exact Skillomate user. Platform store status cannot overwrite another provider's valid access.

The default product is `skillomate_premium_monthly` and the default package is `com.skillomate.app`. Nonblank `GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID`, `GOOGLE_PLAY_PACKAGE_NAME`, and `GOOGLE_PLAY_INTRODUCTORY_OFFER_ID` environment values override these defaults at backend startup; surrounding whitespace is removed. The Android client uses the configuration response's product and offer IDs, with the same built-in defaults. A previously stored purchase cannot replace the configured product in `/config`.

To verify a deployed configuration, request `/api/google-play-iap/config` with a valid Skillomate session. Expect HTTP 200 with the exact product, package, offer, and an `obfuscatedAccountId`. An unauthenticated request should return HTTP 401 when the database is ready. HTTP 404 means the route is not exposed by that deployment; it does not confirm the deployed environment values. Local code changes do not update the production API.

## Real-time renewal notifications

Create a Google Cloud Pub/Sub topic for Google Play Real-time developer notifications and configure it in Play Console. Create an authenticated push subscription targeting:

`https://api.skillomate.in/api/google-play-iap/notifications`

Use a dedicated push-authentication service account. Set the push audience to the exact HTTPS endpoint above, grant the Pub/Sub service agent permission to create identity tokens for that account, and set `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` to its exact email address. The backend verifies the OIDC token audience and sender and accepts subscription and subscription-voided notifications for `com.skillomate.app`. It obtains entitlement state from a fresh Google API response, never the notification label alone. A refund without revocation does not remove access if Google's current subscription state still permits it.

The `GooglePlayReconciliation` inbox persists tokens and retry state before responding successfully to a notification. Its token hash is the unique key; raw tokens are excluded from normal model selection and logs. Authenticated verification also records an unverified candidate user before contacting Google, so interruption of that request can be recovered. The candidate is not ownership: the worker must validate a fresh Google response's product and account binding before persisting an entitlement or acknowledging it. Known Google-linked predecessors also allow verified account association.

Remaining recovery limitation: if the app closes before it ever submits `/verify` and no known linked purchase exists, the backend has no recorded candidate or invertible account mapping. The notification is retained unresolved without granting access or acknowledging it. The customer must restore/verify in the app; otherwise Google's acknowledgement deadline can lead to automatic refund. Fully automatic recovery of this case needs a separately reviewed durable account-binding registry and its account-deletion lifecycle. Do not claim unattended first-purchase recovery is complete.

The Google reconciliation worker runs every five minutes, considers up to 50 due retries plus 50 stale known subscriptions, and uses the existing distributed Redis job lock. It starts no new token after a two-minute work budget; remaining records stay eligible for later runs. Google HTTP requests have a 15-second timeout. Retry backoff grows from two minutes to six hours; after 24 attempts the inbox item is blocked for investigation, and a new delivery can reopen it. Known subscriptions are independently eligible for refresh after 15 minutes, including relevant pending/hold/paused states and subscriptions within Google's token-validity window. Production Redis, worker scheduling, credentials, queue depth and blocked items must be monitored. `DISABLE_BACKGROUND_JOBS` disables the worker along with the existing jobs; missing Google credentials also skips this worker.

Subscription revision checks reject stale concurrent writes and retry from fresh Google data. Inbox generation checks prevent an older attempt from clearing newer work. These checks complement the database's existing unique user/token indexes. They are not a substitute for validating real MongoDB and multi-instance behavior before release.

The Android client refreshes on foreground, periodically, and shortly after Google's reported expiry. These are provider-status refreshes, not local trial-extension or collection timers. Google Play's `expiryTime` remains the authority for both phases, including its silent payment-retry period when configured grace is zero.

## Test checklist

1. Upload a signed Android App Bundle to an Internal testing track, add the tester, complete the opt-in flow, and install from Google Play. Use the release package `com.skillomate.app`. This project's native debug build appends `.debug`, so it does not match the production Play package and cannot validate that package's subscription configuration.
2. Sign in with a new Skillomate account and a Play account eligible for the offer.
3. Confirm every shared paywall and Subscription Details shows the Play-localized ₹9/3-day offer and ₹499/month renewal disclosure. Confirm the purchase sheet uses the same terms and returned offer token.
4. Complete a license-test purchase. Confirm Premium unlocks only after backend verification.
5. Open **Profile → Subscription Details**, then test Restore Purchases, Refresh Status, and Manage Google Play Subscription.
6. Test an ineligible Play account. It must see only the normal recurring price.
7. Send a Pub/Sub test notification and confirm the endpoint returns HTTP 204.
8. Test the three-day phase transition. Confirm Google extends `expiryTime` into the monthly phase after renewal, and that the app/backend never calculate introductory expiry locally. Keep historical one-day purchases restorable under their verified existing expiry.
9. Test cancellation before renewal, renewal success, renewal payment failure, expiry, grace period, account mismatch, pending payment, and refund/revocation behavior before production rollout.

The code cannot create or activate the Play Console product. Google must return an available subscription and monthly base plan before the app can offer a purchase. The introductory offer is optional: eligible accounts receive its returned token; other accounts use the monthly base-plan token. Backend credentials are required to verify purchases. The app does not fabricate prices or entitlements.

## Local regression tests

Run from `edunex-b`:

```sh
node --test tests/google-play-routes.test.cjs tests/google-play-iap.test.cjs tests/google-play-worker.test.cjs tests/google-play-account-deletion.test.cjs tests/google-play-mobile.test.cjs tests/subscription-access.test.cjs tests/subscription-consistency.test.cjs tests/apple-iap.test.cjs tests/razorpay.test.cjs tests/offer-billing-schedule.test.cjs
```

The route tests use a temporary localhost HTTP listener, real Express routing/session authentication, and mocked database/provider boundaries. The other tests cover environment overrides, account/token ownership, renewals, paid access after cancellation, grace, account hold, recovery, expiry, authenticated notifications, and Android offer-token selection and restore verification. They do not make real purchases or prove native Play eligibility.

Google's `expiryTime` is authoritative: grace preserves access until that expiry; account hold removes access; cancellation preserves the paid period. See the [Google subscription lifecycle reference](https://developer.android.com/google/play/billing/lifecycle/subscriptions). Mocked tests do not establish real store eligibility, payment success, deployed API permissions or notification delivery.

## Deployment checklist — preparation only

No deployment, provider configuration change, database migration or mobile build is part of the local implementation.

1. Review the local diff and test results, including pre-existing failures. Confirm Apple purchasing, Razorpay's ₹1/24-hour billing, PhonePe and Skillomate Direct remain unchanged.
2. Verify production's actual configuration source. In SSM mode, `.env.example` does not update runtime values. Plan `GOOGLE_PLAY_INTRODUCTORY_OFFER_ID=intro-9rs-3days`, preserving package/product IDs. The existing SSM loader expects these parameters as `SecureString`; inspect existing values/types before any later authorized update. Restart/reload is needed for startup constants.
3. Verify the Google service account can read subscriptions and acknowledge purchases for this app. Confirm API enablement, the dedicated Pub/Sub push identity/audience and Play Console RTDN topic. Do not print private keys or tokens.
4. Review the additive database changes: `GooglePlaySubscription` revision/acknowledgement-lease/reconciliation-attempt fields and the new `GooglePlayReconciliation` collection/index, including unverified candidate versus verified owner. Existing rows tolerate absent new fields; no historical price, offer or expiry backfill is required. Verify existing unique user/token indexes and arrange the inbox `state,nextAttemptAt` index through the normal authorized database process. Verify deletion of an account removes its new reconciliation records and cannot recreate access from a retry.
5. Deploy the backend first in a later authorized release. Confirm exactly one `/api` mount, authenticated config HTTP 200 with the expected product/package/offer/account binding, unauthenticated rejection, and verified purchase/status behavior. A 404 means the deployment still does not expose the route. Validate the worker/Redis lock and retry monitoring.
6. Perform a real MongoDB concurrency/retry test in a nonproduction environment. Exercise duplicate, reordered and simultaneous notifications, token replacement, interrupted writes, unknown ownership, acknowledgement outages, refunds and revocations. Verify valid access from another provider survives Google or legacy expiration.
7. Build a new signed Android AAB only in a separately authorized build step. Use a version code above every uploaded Play artifact. Version-16 source enforces `P1D` and cannot acquire this new introductory offer; changing backend environment values alone cannot upgrade that client. Existing verified purchases remain restorable.
8. Upload to an internal Play track only when authorized. License-test eligible/ineligible India accounts, fresh offer-token selection, changed-term reconfirmation, restore, interruption/acknowledgement recovery, pending payments, renewal, cancellation, hold, recovery and expiry. Explicitly exercise app termination before `/verify` and resolve the remaining account-association limitation before claiming automatic recovery. Do not infer real device success from mocked tests.
9. Publish the scoped web help/legal changes with the coordinated release. Release Android gradually only after these gates pass. Monitor verification errors, acknowledgement age, unresolved/blocked inbox entries, renewal refresh and course access.

## Rollback checklist — preparation only

- Halt further Android rollout if purchase terms, verification or entitlement behavior is incorrect. Installed clients cannot be downgraded remotely; prepare a higher-version corrective build when necessary.
- Restore a reviewed backend artifact only if it preserves verification, acknowledged purchases, existing paid access and the new inbox data. Do not blindly roll back to the deployment that returned 404.
- Restore configuration only to a compatible, actually available offer. Reverting to the obsolete Offer ID does not make `P3D` work in version 16 and can change customer-visible availability.
- Do not delete reconciliation records, rewrite old Offer IDs, recalculate paid expiries, refund customers automatically, or alter Apple/Razorpay/PhonePe settings as a rollback shortcut.
- Preserve authenticated RTDN delivery and reconciliation during rollback. If a worker must be disabled, track the backlog and acknowledgement deadlines and arrange a safe recovery path; disabling all background jobs also affects other providers.
- Re-run configuration, restore, entitlement-isolation and acknowledgement checks after the later authorized rollback.
