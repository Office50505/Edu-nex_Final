# Skillomate iOS App Store final checklist

Last code verification: 30 September 2026.

The repository is code-ready for the next TestFlight build. Do not submit that build for App Review until every unchecked item in sections C, D, and E is completed with the same production backend used by the uploaded build.

## A. FIXED IN CODE

- [x] iOS digital access uses Apple StoreKit through `react-native-iap`; product identifiers are centralized and no iOS web checkout is offered.
- [x] Transactions are verified server-side from Apple's signed data before access is granted or the client finishes a purchase.
- [x] Purchase, cancellation, verification failure, retry, restore, reinstall/new-device refresh, expiration, refund, revocation, grace period, billing retry, notification idempotency, and cross-account replay are handled.
- [x] Premium access uses explicit entitlement states and verified server expiration rather than `status !== "none"` or the device clock alone.
- [x] After verified entitlement refresh, an inactive iOS learner sees the subscription popup once per login; dismissing it does not block navigation, and selecting protected content opens it again. It includes StoreKit's localized price, direct Apple purchase, Restore Purchases, renewal disclosure, Terms of Use, and Privacy Policy.
- [x] The iOS client exposes only the standard monthly StoreKit product and displays Apple's localized recurring price. It contains no introductory-offer eligibility or discounted first-period flow.
- [x] External URLs are classified; iOS blocks purchase/checkout and unknown destinations while allowing exact legal/support/resource destinations and Apple's subscription-management URL.
- [x] Nex AI asks for explicit third-party processing consent before transmission, omits the learner name, persists versioned consent, supports withdrawal/history deletion, and is enforced by the backend.
- [x] AI input/output limits, prompt-leak safeguards, non-sensitive logging, abuse throttling, safe fallback, and response reporting are implemented.
- [x] Account deletion revokes access first, deletes personal data, anonymizes retained transaction records, and queues billing-cancellation retry instead of blocking deletion indefinitely.
- [x] Age 13+ is enforced on mobile, web, and backend; no fabricated age-18 default remains; an under-age audit/flagging script is provided.
- [x] Mobile session secrets use Keychain-backed SecureStore with one-time verified migration away from AsyncStorage.
- [x] Download authorization uses short-lived, one-purpose, random, hashed, one-time grants; session credentials are not put into URLs.
- [x] Optional profile photos use the system picker, a specific photo-library purpose string, client compression, server validation, durable S3/CDN storage, safe replacement, and deletion.
- [x] IP geolocation lookup was removed; the backend retains only the IP/session security behavior described by the privacy policy.
- [x] Fake unread notifications and production QA/mock-course content were removed from the release path.
- [x] Privacy manifest, ATS, production URLs, native StoreKit/SecureStore pods, and Expo 57 / React Native 0.86 native bootstrap are aligned.
- [x] Login/OTP/password reset, AI, App Store verification, account deletion, and profile-upload endpoints have bounded abuse controls.

## B. VERIFIED BY TEST

- [x] Backend automated suite: 382/382 passed.
- [x] Frontend automated suite: 264/264 passed across 35 test files.
- [x] Current App Store/mobile compliance coverage verifies one ₹499 monthly StoreKit product with no introductory offer, StoreKit price sourcing, AI-consent fail-closed behavior, and avatar fallback behavior.
- [x] Frontend production build completed. The only build notice was the existing non-blocking HLS chunk-size warning.
- [x] Expo Doctor completed 20/20 checks.
- [x] Clean iOS Expo export completed: 47 assets and one Hermes iOS bundle.
- [x] Native simulator build installed and launched on iPhone 17 Pro Max with iOS 26.5.
- [x] Simulator smoke tests opened Subscription Details and the protected-course popup and verified purchase, restore, legal, privacy, and subscription-management accessibility controls. The current sandbox product returns `$4.99/month`; the India standard price must be set to ₹499/month in App Store Connect.
- [x] Unsigned native Release archive completed successfully for arm64 at `appcopyai/releases/ios/Skillomate-1.0-build19-unsigned.xcarchive`.
- [x] Built app metadata verified: `com.alihussainkhan.edunexfinal`, version `1.0`, build `19`, iOS SDK 26.5, minimum iOS 16.4, ATS arbitrary loads disabled, and packaged privacy manifests present.
- [x] App executable and app dSYM UUIDs matched: `325182BC-8691-368F-B315-CCBF6EA3EDEA`.
- [x] Release bundle scan found no QA fixtures, fake home courses, external-purchase steering, localhost, or loopback production endpoints.
- [x] Release bundle contains `https://api.skillomate.in`, `com.skillomate.premium.monthly`, Apple's subscription-management URL, and the exact Skillomate support mail link.

## C. REQUIRES APP STORE CONNECT

- [ ] Accept the latest Paid Applications Agreement and complete banking/tax setup for the seller account.
- [ ] Confirm App ID/bundle ID `com.alihussainkhan.edunexfinal` belongs to the intended seller and matches the provisioning profile used for upload.
- [ ] Create auto-renewable subscription `com.skillomate.premium.monthly` in one subscription group. Configure a one-month duration, territory availability, localized display name/description, India standard price of ₹499/month, tax category, and review screenshot. The in-app UI displays Apple's localized price, so other storefronts show their configured local price.
- [ ] Remove or deactivate every introductory offer, free trial, or discounted first period configured for this iOS subscription. The only iOS purchase option must be the standard ₹499/month auto-renewable plan.
- [ ] Submit the subscription with the app version and make it available to the Sandbox/TestFlight review account.
- [ ] Configure App Store Server Notifications V2 for Production and Sandbox to `https://api.skillomate.in/api/apple-iap/notifications`.
- [ ] Create a least-privilege App Store Connect In-App Purchase key and set the production deployment secrets: `APPLE_BUNDLE_ID`, numeric `APPLE_APP_ID`, `APPLE_SUBSCRIPTION_PRODUCT_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, and `APPLE_IAP_PRIVATE_KEY`. Never commit the `.p8` key.
- [ ] Configure durable profile-image storage using `PROFILE_IMAGE_S3_BUCKET`, `PROFILE_IMAGE_S3_REGION`, and `PROFILE_IMAGE_CDN_BASE_URL` (or the documented thumbnail-storage fallback) and verify the backend IAM policy permits only the required object operations.
- [ ] Ensure production rate limiting remains enabled and that `ALLOW_RATE_LIMIT_DISABLE_IN_PRODUCTION` is not enabled.
- [ ] Enter `https://skillomate.in/privacy` as the App Privacy Policy URL and a public support URL under `skillomate.in`.
- [ ] Complete App Privacy answers from actual production behavior. Expected non-tracking categories include contact information, user ID, optional profile photo, purchase history, product interaction/progress, AI prompts/user content, customer support, and other account/session data. Reconcile the final answers with every enabled production SDK; do not declare tracking unless production behavior actually tracks users.
- [ ] Complete the age-rating questionnaire for a 13+ educational app with open-ended generative AI. Base answers on the live course catalog and AI behavior, not only the source-code minimum-age rule.
- [ ] Add a normal durable review account in App Review Information. Put credentials only in App Store Connect. It must use password login without requiring a new Indian OTP during review, and must not be a hidden app backdoor.
- [ ] Give the review account representative published course/progress data. Apple can test purchase and restore with Sandbox IAP; explain that path in Review Notes rather than granting a fake client-side entitlement.
- [ ] Upload current iPhone screenshots following `docs/IOS_SCREENSHOT_PLAN.md`. This target has `supportsTablet: false`, so do not upload or advertise an iPad UI for this version.
- [x] Increment the iOS build number above `14` before the next uploaded build. The current candidate is version `1.0` build `19`.
- [ ] Sign in to the intended Apple Developer team in Xcode and install/create the Apple Distribution certificate and provisioning profile. This Mac currently reports zero valid code-signing identities and no matching profile.
- [ ] Upload a signed Archive/TestFlight build, allow processing to finish, check App Store Connect for privacy-manifest/API warnings, and verify that dSYMs are accepted.

## D. REQUIRES PHYSICAL IPHONE/IPAD TEST

This release supports iPhone only; iPad testing is not an advertised compatibility requirement for the current target.

- [ ] On at least one supported physical iPhone, install from TestFlight and test cold launch, signup for a 13-year-old and rejection of age 12, password login, logout, refresh-token rotation, reinstall, and new-device login.
- [ ] With an Apple Sandbox tester, test purchase success, user cancellation, delayed/network failure, retry, Restore Purchases, reinstall restore, two-device restore, auto-renew-off with paid access remaining, expiration, billing retry/grace, refund, and revoke. Confirm backend entitlement changes before premium UI changes.
- [ ] Confirm every India Sandbox tester sees only the localized ₹499/month plan, with no introductory price or trial. Also confirm the Apple product sheet, auto-renewal disclosure, Terms of Use, Privacy Policy, Restore Purchases, and Manage Apple Subscription.
- [ ] Exercise protected video, seek/resume, course progress, offline download/grant expiry, certificate creation/share, screenshot/screen-recording protection, and airplane-mode/error recovery.
- [ ] Exercise Nex AI first-use consent: no network request on Not Now, request after Allow, response report, consent withdrawal, history deletion, and re-consent only after an intentional AI action.
- [ ] Select, compress, upload, replace, and remove a profile photo; reinstall and sign into another device to confirm the durable URL still works. Confirm the Photos prompt uses the Skillomate-specific purpose string and appears only when the learner chooses a photo.
- [ ] Delete an account that has an Apple subscription. Confirm the warning and Apple management link, immediate app-account deletion, session invalidation, and that Apple subscription cancellation remains an explicit user action in Apple settings.
- [ ] Verify all legal/support/resource links and confirm a backend-supplied checkout, untrusted host, `javascript:`, `data:`, `file:`, or custom scheme does not open.
- [ ] Capture the final screenshots only from this tested production/TestFlight build with real approved content and no personal information.

## E. REQUIRES OWNER/LEGAL CONFIRMATION

- [ ] Confirm that the App Store seller/developer identity is authorized for the canonical operator stated on the site: Smartcart, a sole proprietorship owned by Insha Noor. Reconcile the EAS owner `office50505`, Apple team `LJ48CVC23W`, and bundle namespace `com.alihussainkhan...` with that authorization; do not change legal names in code without documentation.
- [ ] Confirm the privacy, terms, subscription, refund, retention, account-deletion, AI-provider, and 13+ statements with qualified counsel for the launch territories.
- [ ] Confirm ownership, commercial licenses, model releases, instructor releases, course rights, and trademark/nominative-use basis for every item marked `NEEDS OWNER CONFIRMATION` in `docs/IOS_CONTENT_RIGHTS_INVENTORY.md`.
- [ ] Confirm the live course catalog contains no unsupported earnings, employment, credential, medical, legal, financial, or guaranteed-results claims.
- [ ] Confirm `support@skillomate.in`, public policy pages, grievance details, and the listed business address/support hours are current and monitored throughout review.

## Authoritative Apple references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version / App Review information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Manage pricing for auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions/)
- [App Store pricing](https://developer.apple.com/in-app-purchase/)
