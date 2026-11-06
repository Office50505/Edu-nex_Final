# Fix 3: App Store privacy label

**Published in App Store Connect on 6 November 2026 and verified after reloading the page.** Skillomate now has 13 configured data types, with no unfinished photo or Other Data setup. This is an actual App Store metadata update, not just a proposed checklist. No app version was submitted or released.

The matching local iOS privacy manifest was updated and validated. That file will take effect in the next signed archive; an already uploaded binary is unchanged. Fixes 1 and 2 still need their backend/mobile/website deployments.

## Published answers

All entries are declared **not used for tracking**. Existing non-tracking answers were retained; No was explicitly selected during every edited category's setup.

| Data type | Linked to user | Purposes |
|---|---|---|
| Name | Yes | App Functionality; Product Personalization |
| Email Address | Yes | App Functionality |
| Phone Number | Yes | App Functionality |
| User ID | Yes | App Functionality; Product Personalization; Analytics |
| Photos or Videos | Yes | App Functionality |
| Purchase History | Yes | App Functionality |
| Product Interaction | Yes | App Functionality; Product Personalization; Analytics |
| Other User Content | Yes | App Functionality; Product Personalization |
| Customer Support | Yes | App Functionality |
| Other Data Types | Yes | App Functionality |
| Crash Data | No | App Functionality |
| Performance Data | No | App Functionality |
| Other Diagnostic Data | Yes | App Functionality |

## Changes and evidence

- Added **Photos or Videos**, linked, for optional profile-photo uploads. `routes/mobileCompat.js` uploads the selected image, stores its URL/storage key on the user record and removes the previous stored image. Using the system picker and making uploads optional does not make this a purely on-device feature.
- Added **Other Data Types**, linked, for stored age and optional gender in `models/User.js`. They were not covered by the existing Contact Info or Other User Content categories. No personalization purpose was assigned to age/gender because the inspected code did not establish that use; the manifest's old personalization tag was removed for this category.
- Added **Product Personalization** for Name and Other User Content to represent the existing profile/certificate presentation and personalized course-aware conversations. These purposes already appeared in the source manifest but were missing from Connect.
- Added **Analytics** and **Product Personalization** for User ID and Product Interaction. Learning/video/download activity is account-linked, retained through `models/AnalyticsEvent.js` / `services/mobileCompatibilityService.js`, used for most-watched analysis and personalized learning/progress presentation. Account IDs support that association.
- Corrected **Other Diagnostic Data** to linked. In-app technical/problem reports retain device/app/viewport/route context alongside the authenticated user's ID/contact information (`App.js` problem-report context, `models/ProblemReport.js`, `routes/problemReports.js`). Such reports do not support the old blanket unlinked declaration.
- Preserved existing Crash Data and Performance Data declarations and purposes; this change does not assert newly implemented crash/performance collection. Final archive/SDK collection and anonymization still require the release audit below. Added their existing declarations to the local manifest so its collection inventory matches Connect.
- Preserved the published privacy-policy URL. The optional Privacy Choices URL was not changed. The earlier revised policy text from fix 2 is still a source change awaiting website deployment.

## Verification

- App Store Connect displayed **Published**, all 13 categories, the purposes above and account-linking answers after a browser reload. No new-category setup warning remains.
- Compared the published answers to `privacy-inventory.json` and the plist: 13 unique categories, matching purposes/linking, tracking false.
- `plutil -lint` passed for `appcopyai/ios/ProtectedVideo/PrivacyInfo.xcprivacy`.
- Focused existing privacy-manifest check: **1 passed, 0 failed**, 35 unrelated tests skipped. No functional app code was changed for this step, so the full app/backend suites were not unnecessarily repeated.
- Confirmed that the Xcode project includes PrivacyInfo.xcprivacy in its Resources phase. No signed archive was generated, and no claim is made about the contents of a future archive before it is inspected.
- `git diff --check` passed.

Evidence: `evidence/published-connect-observations.json`, `evidence/verification.json`, `evidence/privacy-manifest-test.log`. The manifest change is in `privacy-manifest.patch`.

## Remaining release checks

Inspect the final archive's aggregated privacy report, SDK manifests/signatures and actual production processing, including whether any crash/performance SDK links data to accounts. If actual practices differ from the retained crash/performance declarations, correct those answers before upload. Recheck third-party provider retention and tracking uses; ordinary course analytics and AI processing are not automatically advertising tracking. Purely on-device search history is not an off-device collection merely because it is saved locally.

This closes the evidenced missing-photo/demographic categories and purpose/linking mismatches in audit finding A3. It does not certify all SDK behavior or close the other audit findings. The next issue is the 4+ store rating versus the app's 13+ terms.

Official guidance checked: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/). Connect page: [Skillomate App Privacy](https://appstoreconnect.apple.com/apps/6790396358/distribution/privacy).
