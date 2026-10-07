# App Store IAP QA Checklist

Use this checklist before marking iOS purchase verification complete. These cases require a real App Store sandbox or TestFlight build; simulator StoreKit tests are not enough for App Store submission confidence.

## Required Setup

- App Store Connect subscription product exists with product id `com.skillomate.premium.monthly`.
- The first subscription product is included in the same App Store submission as the app version when required.
- Backend production environment has:
  - `APPLE_BUNDLE_ID=com.alihussainkhan.edunexfinal`
  - `APPLE_APP_ID`
  - `APPLE_IAP_ISSUER_ID`
  - `APPLE_IAP_KEY_ID`
  - `APPLE_IAP_PRIVATE_KEY`
- Apple App Store Server Notifications V2 endpoint is configured:
  - `https://api.skillomate.in/api/apple-iap/notifications`
- TestFlight or App Store sandbox reviewer account can sign in to Skillomate and has no stale local entitlement before each purchase test.

## Purchase

1. Install the TestFlight/release candidate build on an iPhone or iPad.
2. Sign in with a valid learner account that has no active Skillomate entitlement.
3. Open the subscription screen.
4. Confirm the displayed Apple price is loaded from StoreKit.
5. Tap Subscribe and complete the Apple sandbox purchase.
6. Confirm Skillomate unlocks paid lessons only after backend verification.
7. Confirm backend `AppleSubscription` stores:
   - `originalTransactionId`
   - `latestTransactionId`
   - `entitlementState=ACTIVE` or `ACTIVE_CANCELS_AT_PERIOD_END`
   - future `expiresAt`
8. Confirm the app remains unlocked after force close and reopen.

## Restore

1. Delete and reinstall the app, or sign in on a second iOS device using the same Apple sandbox account.
2. Sign in to the same Skillomate learner account.
3. Tap Restore purchases.
4. Confirm the app displays a restored success message.
5. Confirm paid lessons unlock only when `/api/apple-iap/verify` or `/api/apple-iap/status` returns an active entitlement.

## Expiry

1. Use sandbox subscription accelerated renewal/expiry timing.
2. Let the sandbox subscription expire, or disable auto-renew and wait for the period to end.
3. Reopen the app or foreground it after expiry.
4. Confirm `/api/apple-iap/status` updates entitlement to `EXPIRED` or a non-active state.
5. Confirm paid lesson access is removed and the subscription prompt is shown again.

## Refund Or Revocation

1. Trigger refund/revocation from App Store sandbox/TestFlight tooling or App Store Connect test controls where available.
2. Confirm Apple sends the signed server notification to `/api/apple-iap/notifications`.
3. Confirm the backend refreshes current Apple status rather than trusting only the notification payload.
4. Confirm entitlement becomes `REVOKED` or `REFUNDED`.
5. Confirm stale user subscription fields cannot reactivate access.
6. Confirm the app removes paid access after refresh/foreground/relogin.

## Pass Criteria

#5 is complete only when all four live cases pass:

- Purchase grants access.
- Restore grants access only for an active Apple subscription.
- Expiry removes access.
- Refund/revocation removes access.

Record tester Apple ID, device, build number, timestamps, and any backend `AppleSubscription` state changes in the release QA notes.
