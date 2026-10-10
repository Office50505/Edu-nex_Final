# Skillomate iOS submission guide

This guide describes the implementation present in the release candidate verified on 30 September 2026. The separate final checklist contains the remaining manual gates.

## Release identity

| Item | Current value |
| --- | --- |
| Display name | Skillomate |
| Bundle identifier | `com.alihussainkhan.edunexfinal` |
| Marketing version | `1.0` |
| Checked-in build number | `19` |
| URL scheme | `skillomate` |
| Supported devices | iPhone (`supportsTablet: false`) |
| Minimum native deployment target | iOS 16.4 |
| Production API / AI base | `https://api.skillomate.in` |
| Privacy policy | `https://skillomate.in/privacy` |
| Support email | `support@skillomate.in` |
| Apple subscription product | `com.skillomate.premium.monthly` |
| Intended India pricing | ₹499/month; no introductory offer or free trial |
| Server notification endpoint | `POST https://api.skillomate.in/api/apple-iap/notifications` |

ATS arbitrary loads remain disabled. The app does not contain an advertising identifier or tracking permission. First-party password/OTP authentication is used; no Google/Facebook primary login is present, so Sign in with Apple is not being added solely for review.

## Reviewer path

1. Launch Skillomate and choose Login.
2. Enter the review username and password supplied only in App Store Connect. Existing users can log in without requesting a new OTP.
3. Home and Courses show the live published catalog. Open a course to inspect its overview and curriculum.
4. Open **Profile → Subscription Details** to see the App Store product, localized price, auto-renewal disclosure, purchase control, Restore Purchases, Terms of Use, Privacy Policy, and Apple subscription-management control.
5. With an inactive account, the subscription popup appears once after login and entitlement refresh. Dismiss it to continue browsing; selecting a protected course or Downloads opens it again. It shows the same localized App Store price and can start the Apple purchase directly.
6. Use Apple's Sandbox purchase environment if premium access must be acquired. The app sends the signed StoreKit transaction to Skillomate's backend; premium access changes only after server verification.
7. Open a protected lesson from the course curriculum to test playback, progress, notes/resources, downloads where available, and lesson-scoped Nex AI.
8. Send an intentional Nex AI request and verify the response begins without an extra processing-consent prompt.
9. Open **Nex AI → chat menu → AI Data Controls** and verify that AI history can be deleted.
10. Open **Profile → Danger Zone → Delete Account**. Deletion requires the current password and explicit `DELETE` confirmation.

## Apple subscription behavior

The iOS app uses `react-native-iap` / StoreKit. It fetches product metadata from Apple and displays Apple's localized standard monthly price. The client does not check or present introductory-offer eligibility, a free trial, or a discounted first period. It does not direct iOS users to Razorpay or a website to buy digital access.

The intended India configuration is exactly one one-month auto-renewable subscription at ₹499/month. Remove or deactivate any introductory offer or free trial previously configured for this product in App Store Connect, because StoreKit product configuration is controlled by App Store Connect rather than by the application bundle. Android billing remains separate and may continue to present its configured new-subscriber offer.

The client never creates entitlement from an unverified callback. It binds the signed transaction to an app-account token, posts signed transaction data to the backend, waits for backend verification, and only then finishes the StoreKit transaction. The backend verifies Apple's certificate chain and signed data, exact bundle ID, exact product ID, environment, transaction ownership, and current subscription status. Original transaction IDs are unique across Skillomate accounts.

The entitlement contract distinguishes `ACTIVE`, `ACTIVE_CANCELS_AT_PERIOD_END`, `GRACE_PERIOD`, `BILLING_RETRY`, `EXPIRED`, `REVOKED`, `REFUNDED`, `NONE`, and `UNKNOWN`. Only active, paid-through cancellation, and grace-period states grant access. Billing retry, expired, revoked, refunded, unknown, and none fail closed. The backend supplies server time and verified expiration.

Restore Purchases enumerates StoreKit purchases, submits signed transactions for verification, refreshes backend status, and finishes only verified transactions. Reinstall/new-device status refresh occurs at app initialization, foregrounding, after purchase/restore, and periodically while the authenticated app is active. App Store Server Notification V2 processing is idempotent and an App Store Server API status refresh is available when credentials are configured.

## External links and platform separation

One URL policy classifies legal, support, learning-resource, account-management, purchase, and unknown URLs. On iOS, Skillomate purchase/checkout URLs and unknown domains are blocked even when supplied by backend course data. Exact approved destinations include Skillomate legal/support paths, expected YouTube/Google Drive learning resources, `mailto:support@skillomate.in`, and Apple's subscription-management page.

Web billing remains Razorpay-based. Android behavior remains separate. This separation prevents web billing from being exposed as an iOS digital-content purchase route.

## Nex AI and privacy

Before the first third-party AI request, the app explains that fal.ai, OpenRouter, and the selected Google Gemini model may receive the learner's question, up to 12 recent messages, and relevant course/lesson context. The learner name is not transmitted. Not Now sends no request. Consent is versioned and enforced by both UI and backend.

Input length, history roles/count, context, and response length are bounded. The service blocks obvious prompt-exfiltration/unsafe patterns, protects system/course context, logs no prompt body, applies per-user/IP abuse limits, and returns safe fallbacks. A learner can report a response as Incorrect, Harmful or unsafe, Inappropriate, Privacy concern, or Other; storage uses identifiers/reason and a response hash instead of unnecessary response text.

AI Data Controls support consent withdrawal and idempotent local/server history deletion. Account deletion also removes AI data associated with the account.

## Accounts, age, storage, and deletion

Signup deliberately requires an age from 13 through 80 on mobile, web, and backend. No age is silently defaulted to 18. Existing under-13 accounts can be audited/flagged with `npm run migration:flag-underage` in the backend after an operator-reviewed migration window.

Access/refresh tokens and session secrets are stored in iOS Keychain through Expo SecureStore. The migration reads a legacy AsyncStorage session, writes and verifies the secure copy, then deletes the plaintext copy. Logout/account deletion clears secure credentials.

Profile photos are user-initiated through the system picker, resized/compressed, validated by MIME/signature/size, and uploaded as bytes. Production fails closed without durable S3/CDN storage. Replacement and account deletion remove the previous object. No `file://` profile path is persisted. The iOS bundle includes a specific purpose string explaining that Photos access is used only to choose a profile photo.

Account deletion revokes sessions/push tokens first. Billing cancellation is attempted, but provider timeout or unsupported legacy PhonePe cancellation creates an operational retry record and does not indefinitely deny the user's deletion request. Personal data is deleted; financial records required for reconciliation/accounting are anonymized.

## Privacy manifest and permissions

The packaged privacy manifest declares no tracking. It lists account contact information, user ID, optional uploaded photo, purchase history, product interaction, user content/AI data, customer support, and other account/session data for app functionality/personalization. Required-reason API declarations are aggregated for UserDefaults, file timestamps, system boot time, and disk space.

App Store Connect privacy labels must still be completed manually from actual production configuration. If any production analytics, advertising, crash reporting, or other SDK is added/enabled, reassess both the manifest and the labels before upload.

## Account deletion and Apple billing

Deleting a Skillomate account does not cancel an Apple subscription. The deletion warning explains this and offers the exact Apple subscription-management URL. Immediate app-account deletion remains available. The reviewer can find the control under **Profile → Danger Zone**.

## Build verification recorded for this candidate

- Backend: 382/382 tests passed.
- Frontend: 264/264 tests passed across 35 files.
- Current App Store/mobile compliance coverage verifies one ₹499 monthly StoreKit product with no introductory offer, StoreKit price sourcing, AI-consent fail-closed behavior, and avatar fallback behavior.
- Expo Doctor: 20/20 checks passed.
- Frontend production build: passed; one non-blocking HLS chunk-size warning.
- Clean iOS Expo export: passed, 47 assets, one 2.5 MB Hermes bundle.
- Native simulator build: installed and launched on iPhone 17 Pro Max with iOS 26.5.
- Simulator smoke tests: Subscription Details and the protected-course popup exposed purchase, restore, legal, privacy, and subscription-management controls. The current sandbox product reports `$4.99/month`; configure and retest the India standard price of ₹499/month in App Store Connect/TestFlight.
- Unsigned arm64 Release archive: passed at `appcopyai/releases/ios/Skillomate-1.0-build19-unsigned.xcarchive`.
- Archive metadata: version 1.0, build 19, iOS SDK 26.5, minimum iOS 16.4, and packaged privacy manifests present.
- App/dSYM UUID: matched at `325182BC-8691-368F-B315-CCBF6EA3EDEA`.
- Plists, entitlement plist, privacy manifest, and Xcode project: parsed successfully.
- Release bundle scan: no mock/QA courses, purchase steering, localhost, or loopback production endpoints.

A signed archive cannot be produced on this Mac until the intended Apple Developer account is signed into Xcode and a valid Apple Distribution identity plus matching provisioning profile are installed. The unsigned archive validates Release compilation and packaging, but it cannot be uploaded to App Store Connect.

The native build produces normal third-party deprecation/nullability/generated-code warnings from React Native, Expo, WebView, and Nitro IAP. No app compile/link failure remains. The app dSYM is generated and matches the executable; verify symbol acceptance again on the signed App Store archive.

## Final submission order

1. Complete sections C–E of `docs/IOS_APP_STORE_FINAL_CHECKLIST.md`.
2. Confirm build `19` has not already been uploaded; increment again if App Store Connect reports a duplicate build number.
3. Deploy the backend with Apple credentials, notification URL, rate limiting, AI provider secrets, and durable profile storage.
4. Create the signed TestFlight build.
5. Run every physical-device scenario in the checklist against that build.
6. Capture final screenshots from the tested build.
7. Add `docs/APP_REVIEW_NOTES.txt` to App Review Notes, inserting credentials only in the dedicated App Store Connect fields.
8. Submit the app version and auto-renewable subscription together.
