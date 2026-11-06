# Skillomate App Store submission audit

Audit date: 6 November 2026. Decision: **NOT READY FOR RESUBMISSION.**

Scope: current mobile and backend source, relevant automated tests, production health and guest-access evidence, published legal pages, and authenticated read-only App Store Connect inspection. Apple guidance was checked online on the audit date. This is a technical submission audit, not an Apple approval or legal certification. Source inspection cannot establish that an older uploaded binary behaves like current source.

No product code, App Store metadata, production configuration, purchases, or accounts were changed by this audit. Existing working-tree changes were preserved. Current source is based on commit `c79e212`, with an existing mobile change removing the guest exploration banner.

## Confirmed findings and acceptance criteria

### A1 - Critical: AI sharing has no real consent gate (5.1.2(i))

`edunex-b/routes/ai.js:43` defines a legacy response with `granted: true` and `providerVersion: 'consent-not-required'`. Lines 142-151 intentionally prevent the retired consent UI from opening; both consent endpoints report consent granted without recording a genuine choice. The mobile AI client sends prompts/history and the backend calls external AI providers. A privacy-policy paragraph does not constitute explicit permission before sharing personal data.

Required: show a clear disclosure identifying actual recipients and data before the first external AI request; offer accept and decline; persist a versioned decision; enforce it on the server for all AI routes and older clients; support withdrawal; keep non-AI learning available after declining. Test first use, decline, acceptance, withdrawal, reinstall/account switch and provider/disclosure changes. An old client must not bypass the gate. Existing compliance test at `edunex-b/tests/app-store-mobile-compliance.test.cjs:101` incorrectly asserts the absence of consent integration and must be replaced.

### A2 - High: AI privacy claims contradict a backend request path (5.1.1, 5.1.2)

The published policy and `appcopyai/App.js:757` say the profile name is not sent. However, `edunex-b/services/aiTutorService.js:719` builds a learner context containing the full profile name, masked phone/email, age, gender and account information. Its summary at line 755 includes profile, entitlement and payment summaries. `buildContext` at line 1133 can include that summary; the route passes `knowledge.context` to `callFalOpenRouter`, which constructs provider messages around line 1363. Some contract-specific paths replace this context, so this finding is about a reachable code path, not every AI request. No real user's prompt was sent to prove it.

Required: remove unnecessary profile/account/payment context from external model requests, use an explicit minimal allowlist, and verify captured outbound payloads with synthetic fixtures. Align the app policy, public policy, consent disclosure and privacy labels with actual remaining data and recipients. Do not fix this solely by renaming the data as "safe" or "masked". Confirm the actual fal.ai/OpenRouter/model-provider chain, retention and subprocessors.

### A3 - High: published privacy label omits profile photographs

App Store Connect currently lists 11 data types: Performance Data, User ID, Phone Number, Other Diagnostic Data, Customer Support, Crash Data, Name, Purchase History, Other User Content, Product Interaction and Email Address. Photos or Videos is absent. The app has optional profile-photo selection and backend upload/storage; the bundled privacy manifest already declares Photos or Videos. Apple's privacy guidance specifically requires the dedicated photo category for a photo feature rather than folding it into Other User Content.

Required: reconcile the entire label against a data inventory, including linked Photos or Videos, age/gender under the applicable data type, purpose of personalization, AI requests/provider processing, diagnostics and actual retention. Other Data Types and personalization appear in the source manifest but not the published label; determine their actual applicability rather than copying declarations blindly. Review search history as well as product interaction. Confirm all SDK collection and whether data is linked, used for tracking, or shared. A manifest does not update the App Store privacy label automatically.

### A4 - High: 4+ store rating conflicts with the app's 13+ terms

App Store Connect shows 4+ for 172 regions, plus local all-age equivalents. The published terms/privacy policy and signup flow set a minimum age of 13. Apple's age-rating instructions require an override when the EULA's minimum age exceeds the calculated rating.

Required: complete the current questionnaire truthfully, assess AI/content and access controls, and apply a rating compatible with the minimum-age terms. Do not assume that merely having an AI feature determines a particular rating. Review minor-user consent requirements in the intended countries. Exact age is currently required and capped at 80: reconsider whether an age threshold/band can meet the purpose with less data; gender is already optional.

### A5 - High: selected submission is still build 29 with stale notes (2.1, 2.3)

The rejected iOS 1.0 submission currently selects build 29. Local configuration/native project use build 33. The current review notes begin with signing in and do not explain guest browsing, paid-content restrictions, restore, or AI permission. Changes running in a simulator do not update a submitted binary.

Required: after remediation, archive a signed release using an unused build number, upload and select that exact build; update truthful screenshots, description and notes. Explain optional guest entry and paid entitlement behavior, provide a valid review account for protected features, and ensure it does not depend on inaccessible OTP. Review account credentials exist in Connect but their validity was not verified during this audit. Never include them in public reports.

### A6 - Review risk: the original 5.1.1(v) rejection is not conclusively closed

Guests can browse course descriptions and lesson lists. All currently published courses remain paid, including their introduction lessons. The live policy marker is `explicit-free-v1`; the current evidence covers 8 courses and 104 locked lessons without protected source leakage. Only explicitly free content should become playable for guests. Signing in alone must not unlock paid lessons.

Paid lessons do not need to be made free. However, a catalogue-only guest path is not proof that Apple accepts the remaining registration requirement for the specifically rejected video-course feature. Explain why account-based purchase/access requires an account, and review whether StoreKit purchase/restore can operate without mandatory unrelated personal information. If Apple still considers the requirement unnecessary, redesign entitlement/account association or obtain review clarification; do not claim the rejection is fixed solely because browsing is available. Never use the superseded free-introduction resubmission notes.

### A7 - Submission evidence remains incomplete (2.1)

An earlier Apple message requested a physical-device screen recording on the latest OS showing launch and the typical flow. This audit did not establish that an attached recording satisfies that request. The exact final signed release has not been tested through TestFlight for sandbox purchase, restore, cancellation, renewal, refund/revocation, account switching, playback or deletion. In-app purchase product/group are Ready for Review, not approved.

Required: fulfil every outstanding review-message request, record the real final build on a physical device, attach/link the recording in review notes, and complete the release test matrix below. Do not use a simulator recording as a substitute for a specifically requested physical-device recording.

## Guideline coverage matrix

Status meanings: **Finding** = evidenced issue; **Partial** = source/configuration evidence but final runtime or business proof missing; **Conditional N/A** = no matching feature identified, reassess if features change. No row means guaranteed approval.

| Area | Status | Evidence and remaining check |
|---|---|---|
| 1.1 objectionable content; 1.2 user/AI content | Partial | AI input/output filtering, reporting UI/API and chat deletion exist. Exercise unsafe/minor-sexual/self-harm/abuse prompts and false-positive cases in a controlled test; establish report handling. No public user feed was identified; blocking other users is conditional on adding social interactions. |
| 1.3 Kids; 1.4 physical harm | Partial / conditional N/A | Education, not Kids Category; 13+ terms conflict with store rating (A4). No medical-device or physical-control features found. Verify course/AI claims and minor privacy practices. |
| 1.5 developer support; 1.6 data security | Partial | Published support route redirects to a rendered help page with contact/hours. TLS, SecureStore/session handling and account-scoped access present. Perform final auth/privacy tests; source inspection is not a penetration test. |
| 1.7 crime reporting | Conditional N/A | No crime-reporting feature identified. |
| 2.1 completeness; 2.2 beta | Finding | A5/A7. Backend health/readiness live; no final signed release verification. Ship complete flows with no placeholders or debug-only dependencies. |
| 2.3 accurate metadata, screenshots, rating | Finding / partial | A4/A5. Audit all final localized screenshots, previews, descriptions, support URLs and paid-feature disclosures against the final binary; image-by-image screenshot validation remains open. No misleading earnings/AI capability claims or implied Apple endorsement. |
| 2.4 hardware; 2.5 software, public APIs, background behavior | Partial | iPad support enabled; native course playback/offline features present. Verify all supported sizes, multitasking/orientations, interruptions, minimum OS, memory, IPv6-only network and offline/error recovery. Validate final archive for private APIs, executable downloads and SDK declarations. No OTA app-code system identified in reviewed dependencies. |
| 3.1.1 digital purchases; 3.1.2 subscriptions | Partial | Apple IAP client and server receipt/transaction verification present; matching monthly product/bundle IDs; restore, localized price and renewal disclosures in source. Complete sandbox matrix; inspect every iOS outbound support/legal link for unintended web-purchase steering under the applicable storefront rules. Web payment providers existing on the website do not establish an iOS violation by themselves. |
| 3.1.3 other purchase methods; 3.1.4 hardware; 3.1.5 crypto | Partial / conditional N/A | Existing cross-platform memberships require a documented entitlement strategy. No hardware unlocking or crypto product identified. Do not assume the reader-app exemption or a regional payment entitlement automatically applies. |
| 3.2 business models, subscriptions value | Partial | Paid ongoing learning catalogue fits an identifiable service. Verify ongoing subscription value, no duplicate charge for existing members, honest trials, and cancellation/refund handling. No loan, trading, fundraising, gifting or regulated-finance feature found. |
| 4.1 copying; 4.2 minimum functionality; 4.3 spam | Partial | Video learning, progress, downloads, AI and certificates provide native functionality. Ownership, uniqueness, asset rights and app quality still need owner/reviewer assessment. |
| 4.4 extensions; 4.5 Apple services | Conditional N/A / partial | No app extensions, Apple Music, Game Center, HomeKit, HealthKit, Siri or related integration identified. Verify final entitlements and any Apple API use before signing. No push capability identified in the inspected iOS entitlements; do not promise unsupported push behavior. |
| 4.6 omitted; 4.7 hosted software | Conditional N/A | No mini-app/game platform, emulator or remotely hosted executable app marketplace found; video WebViews are not evidence of such a platform. |
| 4.8 login services | Conditional N/A | Own phone/password/OTP authentication; no third-party social login identified, so adding Sign in with Apple is not presently required on that basis. Reassess if social login is added. |
| 4.9 Apple Pay; 4.10 monetizing capabilities | Conditional N/A / partial | Digital content uses StoreKit; no Apple Pay commerce or monetization of OS capabilities identified. Verify final paywall and permission flows. |
| 5.1.1 privacy, minimization, account access/deletion | Finding / partial | A2/A3/A6. In-app delete-account UI and server cleanup exist; reauthentication is supported. Test using a disposable authorized account, including active Apple subscription warning/manage link and immediate deletion availability. Check actual data retention, deletion queues, backups and privacy contact. Do not delete a real account as an audit shortcut. |
| 5.1.2 sharing; 5.1.3 health; 5.1.4 minors; 5.1.5 location | Finding / conditional N/A | A1/A2/A4. No health collection or GPS API found. No tracking/advertising SDK found in inspected source; explicit AI consent and ATT are different requirements. Confirm all actual SDK/server processing before declaring no tracking. |
| 5.2 intellectual property | Partial | Connect declares third-party rights. Owner must verify courses, downloads, music, voices, faces, trademarks and instructor/AI asset licences; offline media must be authorized. Public representations must match the rights holder/developer relationship. |
| 5.3 gambling; 5.4 VPN; 5.5 MDM | Conditional N/A | No gambling, VPN or mobile-device-management feature identified. |
| 5.6 developer conduct, review integrity | Partial | No review manipulation flow identified. Keep reviewer access, explanations, privacy representations, support and metadata accurate. Owner must verify business/account standing. |
| Submission rules outside review text | Partial | Confirm current Xcode/SDK minimums, privacy manifests/required-reason APIs and SDK signatures in the actual archive; export compliance, agreements, tax/banking, country availability, EU trader status where relevant, content rights and App Store product submission. These were not fully verified through account/business records. |

## Positive controls verified in source or live evidence

- Paid media: public lists contain locked metadata; protected playback/download routes deny unauthenticated requests. Legacy preview flags do not make an intro free. Production catalogue/public-list checks pass; health and readiness return 200 with connected database/cache.
- Apple billing: `com.skillomate.premium.monthly` and bundle `com.alihussainkhan.edunexfinal` match client/server configuration. StoreKit purchase and restore paths exist. Backend verifies Apple transactions, ownership and notifications; production/sandbox notifications URLs are set in Connect. This does not substitute for a real sandbox test.
- Account deletion: profile UI, password confirmation, immediate access revocation, account-related cleanup and billing-cancellation retries are implemented. Apple subscription management/warning exists. Some payment records may lawfully be retained/anonymized; validate policy and operational retention.
- Data permissions: optional system photo picker, no core requirement for contacts, microphone or GPS; ATS arbitrary loads disabled; source manifest declares no tracking. Final bundled SDK practices remain to verify.
- Legal pages: privacy page rendered publicly and describes operator, data, photo upload, deletion and support. `/support` redirects to a functioning help page; `/terms` responds. AI disclosure mismatch remains A2; HTTP 200 alone was not treated as proof of complete legal compliance.

## Verification results and limitations

Mobile automated suite: **177 passed, 0 failed**. Selected backend suites: **97 passed, 4 failed out of 101**. Logs are in `evidence/`. Four failures are brittle source-pattern checks in `app-store-mobile-compliance.test.cjs`: tablet content styling (extra padding), a renamed navigation comment, per-lesson download component refactoring, and account-scoped prepared-download call refactoring. These failures do not by themselves establish the corresponding runtime bugs; replace them with meaningful behavioral checks and rerun before release. Passing other tests does not establish Apple compliance, particularly where an existing test enforces removal of AI consent.

Production guest evidence: `../paid-guest-access-2026-11-06/live-verification.json`. Endpoint results from this audit: `evidence/endpoint-checks.json`. No production purchase, AI transmission with real user data, destructive deletion or App Store edit was performed. No new signed release build was produced. Public legal pages, private Connect observations and source could change after this audit.

## Release test and submission gate

1. Close A1-A4 with code, privacy/legal/Connect alignment and regression tests; decide and document the remaining registration/paid-entitlement treatment in A6.
2. Replace stale compliance assertions and run relevant mobile/backend suites. Validate actual outbound AI payloads with synthetic data; verify no provider call before consent or after withdrawal.
3. Produce a signed release archive with an unused build number using the required Xcode/iOS SDK. Inspect the generated privacy report, embedded manifests, required-reason declarations, SDK signatures, entitlements, permission text and export settings. Current requirements page says Xcode 26/iOS 26 SDK or later for uploads since April 28, 2026; recheck at archive time.
4. Physical iPhone and supported iPad: fresh install and guest browsing, locked paid media, signup/login/OTP/password recovery, logout/account switch, expired session, denied photo selection, catalogue errors/retry, playback seeking/fullscreen/interruption, offline downloads and revoked entitlement. Test VoiceOver, larger text, contrast, keyboard/safe areas and orientation. Check IPv6-only and poor/offline connections.
5. TestFlight/sandbox: product loading and localized price, eligible/ineligible intro offers, successful/cancelled/pending purchase, interrupted purchase, restore after reinstall/new device, account association, existing web subscriber without duplicate charging, renewal, grace period, expiry, refund/revocation and server notifications. Confirm full access follows verified entitlement and is removed appropriately. Do not perform a real paid transaction for an audit.
6. Authorized disposable-account deletion: cancel/manage Apple subscription warning, immediate delete even with active subscription, failed billing-provider cleanup retry, profile image/chat/learning cleanup, all sessions invalidated, retained records and backup retention documented. Separately test AI history deletion and report workflow.
7. Business owner sign-off: content/media/AI provider rights, correct operator/developer relationship, country availability versus India-only phone onboarding, minor-user consent, provider processing/retention, current privacy inventory, agreements/tax/banking, export compliance and regional trader disclosures. A technical code scan cannot certify these facts.
8. Upload/select the tested build; update final screenshot set and accurate paid/AI feature metadata; set age rating and privacy answers; include the matching IAP in submission. Rewrite review notes for guest entry, protected member access, restore and AI consent. Verify the demo account works for the reviewer without OTP obstruction; include a physical-device recording satisfying Apple's outstanding request. Preserve all previous reviewer questions and answer each explicitly.
9. Repeat a short production smoke check immediately before submission: health/readiness, guest catalogue and lesson lists, paid-media denial, authenticated paid playback and review-account entitlement. Record the exact binary, server revision and test date. Only then resubmit. Apple may still ask for additional changes.

## Official sources checked

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Privacy-label definitions and photo-feature guidance: https://developer.apple.com/app-store/app-privacy-details/
- Age rating and EULA override: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- In-app account deletion: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion
- Subscriptions: https://developer.apple.com/app-store/subscriptions/
- Current submission requirements: https://developer.apple.com/news/upcoming-requirements/
- SDK privacy requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Required-reason APIs: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api

Private App Store Connect pages inspected: app 6790396358, iOS 1.0, App Information/age ratings, App Privacy and review messages. Findings above describe the account state observed on the audit date; credentials and private account contact information are deliberately excluded.
