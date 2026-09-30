# Google Play subscription setup

The Android Play Store build (`appcopyai`, package `com.skillomate.app`) now uses Google Play Billing for premium access. It does not use Razorpay or a web checkout inside the Play-distributed app.

## Required Play Console product

Create and activate this subscription in **Play Console → Monetize → Products → Subscriptions**:

- Product ID: `skillomate_premium_monthly`
- Auto-renewing base plan ID: `monthly`
- Billing period: monthly
- India base-plan price: ₹499/month
- New-customer offer ID: `new-subscriber-1rs-24h`
- Offer eligibility: new customer acquisition
- Offer phase type: **Single payment**
- Offer phase duration: **1 day** (`P1D`)
- India offer price: ₹1, only if Play Console accepts it as at least the current regional minimum
- Following phase: the ₹499/month auto-renewing base plan until cancelled

This is one Google Play subscription, not a separate ₹1 purchase plus a custom mandate. The customer accepts both phases in Google's purchase sheet. Google Play charges the localized one-day offer price, grants the Play-reported access period, and then moves the subscription to its ₹499/month base plan unless the customer cancels.

The app never hard-codes the displayed ₹1 or ₹499 values. It accepts only the eligible `new-subscriber-1rs-24h` offer with a paid `P1D` phase followed by a `P1M` recurring phase, displays the localized prices returned by Google Play, and passes that offer's token to the billing sheet. If Play does not return that exact offer for an account, the account sees and purchases the regular recurring plan only. Google Play rejects a configured offer price below the minimum allowed for a region; if ₹1 is rejected for India, use the lowest price Play Console accepts rather than fabricating ₹1 in the app.

## Backend verification

Create a least-privilege Google Cloud service account, enable the Android Publisher API, and grant that service account access to the Skillomate app in Play Console. Configure production with:

```env
GOOGLE_PLAY_PACKAGE_NAME=com.skillomate.app
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=skillomate_premium_monthly
GOOGLE_PLAY_INTRODUCTORY_OFFER_ID=new-subscriber-1rs-24h
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={...service-account JSON...}
GOOGLE_PLAY_RTDN_AUDIENCE=https://api.skillomate.in/api/google-play-iap/notifications
GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL=play-rtdn-push@YOUR_PROJECT.iam.gserviceaccount.com
```

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` can be used instead of the raw JSON variable. Never commit the service-account key.

The client sends only the purchase token. The backend checks the current subscription with Google, verifies the exact package/product and the obfuscated Skillomate account identifier, prevents a token being linked to another account, persists the expiry/state, and only then lets the client acknowledge the transaction.

## Real-time renewal notifications

Create a Google Cloud Pub/Sub topic for Google Play Real-time developer notifications and configure it in Play Console. Create an authenticated push subscription targeting:

`https://api.skillomate.in/api/google-play-iap/notifications`

Use a dedicated push-authentication service account. Set the push audience to the exact HTTPS endpoint above, grant the Pub/Sub service agent permission to create identity tokens for that account, and set `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL` to its exact email address. The backend verifies the OIDC token audience and sender, decodes only subscription notifications for `com.skillomate.app`, fetches the authoritative purchase from Google, and refreshes the stored entitlement. Unknown tokens are acknowledged without granting access.

The Android client also schedules a status refresh just after Google's reported expiry. This prevents a stale one-day entitlement from being extended by a device timer and picks up the ₹499 renewal when the app is active. Google Play's `expiryTime` remains the authority for both phases.

## Test checklist

1. Upload a signed Android App Bundle to an Internal testing track, add the tester, complete the opt-in flow, and install from Google Play. A sideloaded debug APK can also use test billing only when its package name matches the Play app and the Google account signed into that device is registered as a Play Console license tester; the Internal testing install is the recommended end-to-end check.
2. Sign in with a new Skillomate account and a Play account eligible for the offer.
3. Confirm the popup shows the Play-localized one-day offer (₹1 only if Play accepted that India price) and the ₹499/month renewal disclosure.
4. Complete a license-test purchase. Confirm Premium unlocks only after backend verification.
5. Open **Profile → Subscription Details**, then test Restore Purchases, Refresh Status, and Manage Google Play Subscription.
6. Test an ineligible Play account. It must see only the normal recurring price.
7. Send a Pub/Sub test notification and confirm the endpoint returns HTTP 204.
8. Test the one-day phase transition. Confirm Google extends `expiryTime` into the monthly phase after the renewal, and that the app/backend never calculate 24 hours locally.
9. Test cancellation before renewal, renewal success, renewal payment failure, expiry, grace period, account mismatch, pending payment, and refund/revocation behavior before production rollout.

The code cannot create or activate the Play Console product. Until the product, offer, tester account, and backend credentials are configured, the Android UI will show that the Google Play subscription is unavailable and will not fabricate a price or entitlement.
