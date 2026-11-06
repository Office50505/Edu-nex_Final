# Final pre-build recheck - 6 November 2026

> Follow-up: the six failing checks below have now been reconciled and pass (56/56). See [the current correction report](../compliance-check-fixes-2026-11-06/README.md). The policy deployment, final-device evidence and other release gates remain open. The remainder of this file preserves the earlier audit snapshot.

Decision: **NO full-compliance sign-off. Source preparation is not submission readiness. No new build was created.**

## Confirmed completed work

- AI explicit consent/enforcement and provider-data minimization are implemented locally; targeted regression evidence is in the fix reports.
- App Store privacy metadata: 13 configured types and corrected purposes/linkage, previously published and verified after reload.
- Age rating: 13+ override and eligibility link saved and verified after reload, with automatic regional equivalents.
- Build 34 configuration, cumulative source patch, reviewer-note draft, device-test/recording instructions and source handoff are prepared. All 27 source hashes still match the handoff; Expo and native build numbers agree at 34. Privacy manifest contains 13 types and the working diff passes whitespace checks.

## Still open

1. **Deployment and live verification.** The public privacy page was opened again during this recheck. It still shows September 2026 and the old absolute claim that the profile name is not sent. The revised policy is not live. Backend consent/privacy deployment has not been verified using an authorized production test account. Release the matching changes together and verify actual permission/payload behavior before final review testing.
2. **Six broader checks still fail.** A fresh run of app-store-mobile-compliance.test.cjs and tutor-knowledge.test.cjs returned 50 passed, 6 failed out of 56. Four are the previously documented brittle source-pattern checks (tablet styling, player navigation comment, per-lesson download component and prepared-download call). Two are older plan/refund expectations previously reproduced against the baseline service. These failures do not establish six new runtime bugs, but the suite is not green and must be reconciled with meaningful behavior checks for a clean sign-off. Do not delete tests or weaken assertions merely to produce a green count.
3. **Original registration rejection remains a review risk.** Guests browse metadata and paid lessons remain locked. That does not establish Apple's acceptance of the remaining account requirement for the specifically rejected video-course feature. Recheck necessity/minimization of registration data and the entitlement/account workflow; explain actual behavior honestly in the review notes. Do not make paid content free without the user's authorization or claim Apple has accepted the design before review.
4. **Final binary/runtime evidence.** No new signed artifact exists. DevOps still must create/upload the exact candidate, verify sandbox purchase/restore and lifecycle handling, guest/member access, AI controls, account switching/deletion, supported devices/accessibility/network behavior, and supply a physical-device recording. The final runtime matrix remains NOT_RUN. An older build-29 video exists but does not demonstrate the new fixes.
5. **Submission matching.** App Store Connect still shows selected 1.0 (29) and the older notes. Replace these only after the new candidate is uploaded and verified. Check real screenshots/previews, review account/entitlement and all seven written information requests. No reviewer reply or new attachment was sent in this task.
6. **Owner and archive verification.** Content/media rights, operator/developer authorization, India-only onboarding versus selected countries, minor-user obligations, actual SDK/provider collection/retention, required-reason declarations/signatures, and final export/build requirements still require evidence. A source scan and privacy label cannot certify these business/SDK facts. Preserve the existing release gates rather than treating them as already passed.

## Test status

Previous successful checks remain valid evidence for their stated scope: 187 mobile tests; 138 targeted AI/backend tests; 43 mobile and 52 backend review-readiness checks. Some suites overlap; these are not additive unique-test counts. None represents the full repository suite. This recheck specifically confirms the six broader failures above remain.

## Build versus submission

Final-device tests necessarily occur after a candidate is built; they cannot all be completed before build creation. Resolve the remaining source/test concerns and prepare/deploy the matched services, then create a test candidate. Complete the post-build runtime/archive evidence before selecting it and resubmitting. No guarantee of Apple approval is being made.

Official references rechecked: https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/news/upcoming-requirements/ . The current upload requirements list Xcode 26 or later and iOS 26 SDK or later. Verify the actual archive rather than inferring that from local build settings.
