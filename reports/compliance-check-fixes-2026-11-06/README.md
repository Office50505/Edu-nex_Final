# Compliance check reconciliation and build 34 verification

6 November 2026. **The six previously failing checks are fixed.** No application-runtime source was changed in this step, and no new build was created. This does not replace the remaining production/device/business verification.

## Corrected checks

1. Tablet layout: evaluates the actual style objects and responsive navigation-width expression across several iPad widths. Checks readable width and centering without rejecting additional harmless padding.
2. Player navigation: identifies the actual course/player render branch through its syntax tree, rather than a removed source comment. Keeps the route-aware destination and interactive-back wiring assertions. The adjacent course-detail navigation check uses the same correct branch.
3. Lesson downloads: evaluates the actual row's JSX property expressions with distinct lesson/course/progress values, and verifies that the screen is bound to the real downloader. Shared-button click handling, saved/busy/retry behavior and cancellation are exercised in the mobile suite.
4. Protected downloads: evaluates the account-scoped session and actual grant/lease/HLS arguments, including the cancellation signal and current user/course/video. Keeps the MP4-first and restricted iOS fallback checks. The old checks incorrectly demanded the removed unscoped session and omitted the cancellation context.
5. Plan answer: verifies the no-auto-renewal meaning for the current language output, while preserving price, duration, scope and one-time payment assertions. The old mixed-language fixture asserted one Hinglish phrase even when the existing classifier selected English.
6. Refund answer: checks that an ambiguous refund question asks whether it concerns Skillomate or the learner's business, then verifies that an explicit Skillomate question gives the platform refund/support information. This preserves the intentional billing-scope isolation instead of forcing platform billing into unrelated business questions.

Only `edunex-b/tests/app-store-mobile-compliance.test.cjs` and `edunex-b/tests/tutor-knowledge.test.cjs` changed for this reconciliation. Existing application behavior was preserved. Runtime file hashes still match the earlier prepared handoff; that comparison does not independently prove the contents of the IPA uploaded by DevOps.

## Results

- Previously failing broader pair: **56 passed, 0 failed**.
- Full mobile suite: **187 passed, 0 failed**.
- Combined selected backend compliance, tutor, privacy, consent, purchase, entitlement, session, guest access and deletion/billing suites: **246 passed, 0 failed**.
- `git diff --check`: passed.

These suite counts overlap and must not be added together as distinct tests. The 246-case selection is not represented as every test in the repository. Logs are in `evidence/`.

## Build 34 verified in App Store Connect

Version 1.0/build 34 finished processing and shows **Ready to Submit**. Build ID: `f855b4e9-2a6f-4d0b-ba2d-a33219975b61`. Metadata shows bundle `com.alihussainkhan.edunexfinal`, arm64, iPhone/iPad support, minimum iOS 16.4, symbols included, non-exempt encryption No and distribution entitlements with `get-task-allow: false`. The SDK build identifier displayed by Apple is `23F81a`; this raw identifier is not treated as independent proof of the exact Xcode/SDK version or the archive's full SDK privacy contents.

Processing success is not physical-device QA or Apple approval. No test case in the final-device matrix has been marked passed without results from DevOps. No new recording was attached and no App Review submission was sent.

## Deployment remains blocked here

The live privacy page was refreshed and still shows the September 2026 copy, including the old absolute profile-name claim. The revised policy source is not live. Backend consent/privacy deployment has not been verified with an authorized production test account.

This Mac has no AWS CLI, AWS credential environment/files or expected deployment SSH key. The repository's documented production workflow requires authorized AWS/SSM/SSH access and deploys a pinned GitHub main commit. It does not copy an uncommitted local working tree. The runtime fixes are now present in commit `975a24f59079f4f08d15afc0c4cdc49fc957dbb8` (observed while this task was running). DevOps must confirm which commit was deployed. Only the test reconciliation remains uncommitted locally. No bypass, replacement hosting service, credential creation or production change was attempted.

Deploy together through DevOps:
- Backend: User consent storage; consent API/guards; provider-attempt checks; minimal AI context and history boundary (policy 2026-11-06.2).
- Website: revised LegalPolicyPage and per-page legal-date support.
- Then verify the real API choice/payload behavior and the rendered privacy page before final App Review testing.

The test-only reconciliation does not by itself require a replacement for build 34. If DevOps discovers that build 34 omits the earlier runtime fixes, or further application code changes are required, produce another unused build number and repeat the final-device evidence for that actual artifact.

## Remaining gates

DevOps must provide final-build purchase/restore/lifecycle tests, guest/member playback, AI consent/withdrawal, account switching/deletion, supported physical iPhone/iPad/network/accessibility checks and the requested recording. Verify review-account access, screenshots, content/asset rights, selected countries versus India-only signup, minor-user/provider obligations and the archive's SDK/privacy/export requirements. The original account-registration objection remains subject to Apple review; no acceptance is claimed.

Only after these gates pass should the verified build replace build 29 and the matching draft notes/recording be saved and submitted. The updated source handoff includes this report and the corrected tests.

## Draft submission update

After build 34 became available, it was selected for the iOS 1.0 draft in place of build 29. A 3,643-character review-note draft was saved with an explicit opening status that production deployment confirmation, final-device QA and the updated recording are pending. The notes cover guest/member access, Apple IAP/restore, optional AI/reporting/history controls, deletion, audience, services, regional behavior and supporting content/metadata evidence. No Submit or Update Review action was taken. Finalize the pending evidence and replace the draft reminder before resubmission.

The user assigned the backend and website deployment to DevOps and will obtain the deployed commit. This task does not claim the deployment occurred.
