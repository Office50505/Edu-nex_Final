# Final review-readiness issue: pre-build checks and evidence

6 November 2026. **Pre-build checks completed; final-device/sandbox evidence remains pending DevOps. No new build was started.** The user explicitly assigned testing and physical-device recording to DevOps after the corrected build is installed.

The sixth item in the conversational audit summary was final purchase/restore testing and the physical-device recording. In the longer audit report these are A7; A6 separately tracks the remaining registration/paid-entitlement review risk. Neither Apple acceptance of that registration treatment nor final runtime evidence is being inferred from automated test results.

## Work completed

- Ran **43 mobile review checks: all passed**. They cover purchase recovery, duplicate/pending/cancelled transaction handling, signed-data recovery, restore, diagnostics/presentation and guest restrictions.
- Ran the expanded backend review selection: **52 passed, 0 failed**. These cover Apple verification/entitlement states and notifications, ownership/replay/refund protection, public-course denial, account access, deletion/billing checks and native session refresh.
- Found and fixed an outdated test loader in `edunex-b/tests/native-session.test.cjs`: the old data-URL import could not resolve the new consent dependency. Updated it to load the real consent core with an injected prompt boundary, preserved the expired-chat retry/history check, and added a case for expired credentials during permission lookup and refusal preventing chat transmission. This was a test-harness failure, not evidence of a failed real purchase. No purchase code was changed unnecessarily.
- Re-read the active Apple messages. The October 16 request contains seven information requirements, not just a video. Expanded the release-note draft with purpose/audience, external services, regional behavior, content-rights handling and an IAP overview. Owner/licence proof and runtime facts must be verified before posting it.
- Confirmed that the October 29 developer response already includes an MP4 attachment described as an approximately 9:25 physical-device recording for build 29. Its contents were not independently watched. That earlier evidence predates the new source changes and must not be presented as verification of the corrected candidate.
- Checked device availability: paired physical iPhones are currently unavailable; only a simulator is connected. Did not create a simulator recording as a substitute.
- Prepared `DEVICE_TEST_AND_RECORDING.md` and a 15-case `runtime-results.json` for DevOps. Every final-runtime case is honestly marked NOT_RUN. The sequence covers registration/login/deletion, guest/paid access, offer disclosures, sandbox purchase/restore, AI consent/refusal/withdrawal and response reporting.

## Status and next step

The candidate can now proceed to signed build creation, with the previously documented deployment/build-access requirements. **Issue 6 is not fully closed until DevOps tests that exact build, supplies the physical-device recording, and verifies the reviewer can access the evidence and account features.** Those checks cannot be completed before the candidate exists.

No live purchase, real charge, account deletion, reviewer reply, evidence upload or App Review submission was performed. TestFlight/sandbox transactions are the appropriate post-build test route; local/mock tests do not replace them.

The build-34 source handoff is refreshed to include the native-session test update, expanded draft notes and this recording/testing package. Its source patch, file hashes and comparison report must be used together. The current candidate number remains 34 and no newer binary has been built here. Recheck number availability before building.

Evidence logs: `evidence/mobile-review-tests.log`, `evidence/backend-review-tests.log`, `evidence/review-evidence-observations.json`. See `runtime-results.json` for the uncompleted final-build test matrix.
