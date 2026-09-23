# Skillomate iOS App Store submission checklist

This document covers the App Store Connect work that cannot be encoded in the app bundle. Complete these items before submitting build 12 (or a later build number) for review.

## App Review access

- Provide a working review account with access to representative protected lessons, downloads, certificates, subscription status, and Nex AI.
- In Review Notes, state that the iOS app supports existing Skillomate memberships and does not link to an external digital-content checkout.
- Explain where account deletion is located: **Profile → Danger Zone → Delete Account**.
- Keep the review backend, videos, and AI service available throughout review.

## App privacy

Set the required Privacy Policy URL to the public Skillomate privacy-policy page. The in-app Privacy screen does not replace this App Store Connect field.

Match App Store Connect privacy answers to `ios/ProtectedVideo/PrivacyInfo.xcprivacy` and the production backend:

| Data type | Linked to user | Tracking | Purpose |
| --- | --- | --- | --- |
| Name | Yes | No | App Functionality; Product Personalization |
| Email Address | Yes | No | App Functionality |
| Phone Number | Yes | No | App Functionality |
| User ID | Yes | No | App Functionality |
| Purchase History | Yes | No | App Functionality |
| Product Interaction | Yes | No | App Functionality; Product Personalization |
| Other User Content | Yes | No | App Functionality; Product Personalization |
| Customer Support | Yes | No | App Functionality |
| Other Data Types | Yes | No | App Functionality; Product Personalization |

Recheck these answers whenever analytics, advertising, crash reporting, payment, profile-photo upload, or other SDK behavior changes. App Store Connect disclosures must describe actual production behavior, including third-party SDK collection.

## Digital content and memberships

- This iOS build intentionally has no external web-checkout link or price/trial call to action.
- Existing members can sign in, refresh membership status, or contact support.
- To sell courses or subscriptions inside the iOS app, implement StoreKit/In-App Purchase and submit the products with the app.
- Do not restore the web-payment CTA on iOS unless the app and account qualify for, receive, and correctly implement an Apple-approved entitlement for that storefront.

## Listing and review metadata

- Upload current iPhone screenshots that show the real app UI and do not include the Metro development warning.
- Confirm the app icon and screenshots contain only content Skillomate owns or is licensed to use, including course thumbnails and people shown in artwork.
- Complete the age-rating questionnaire based on the course catalog, AI responses, and any user-generated content behavior.
- Keep `ITSAppUsesNonExemptEncryption` set to `false` only while the app uses exempt standard encryption and no custom/non-exempt cryptography.
- Increment `ios.buildNumber` for every new App Store Connect upload.

## Final preflight

- Archive with Xcode 26 or later and the iOS 26 SDK or later.
- Test sign-in, account creation, password reset, account deletion, membership restoration, protected video, downloads, sharing/export, and permission prompts on a physical iPhone.
- Run an App Store/TestFlight release build against `https://api.skillomate.in`; never ship the local development HTTP endpoint.
- Verify the public privacy policy, support URL, and support email are reachable without authentication.

## Apple references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Reader apps and external-link entitlement](https://developer.apple.com/support/reader-apps/)
- [Upcoming submission requirements](https://developer.apple.com/news/upcoming-requirements/)
