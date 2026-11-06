# Fix 4: App Store age rating versus the app's minimum age

**Saved in App Store Connect on 6 November 2026 and verified after a browser reload.** The previous 4+ display is replaced by an **Override to Higher Age Rating: 13+**, matching Skillomate's minimum-age terms. The Age Suitability URL now points to https://skillomate.in/terms#eligibility.

App Information states that changes are released with the next app version. This correction is saved submission metadata; no new binary was built, no app was submitted, and this is not review approval.

## What was reviewed

The existing mobile signup check, server signup validation and User schema require age 13 or above. The published/source terms also specify a 13+ minimum. No age-validation or terms changes were needed for this rating correction.

All seven questionnaire sections were inspected: Features; Mature Themes; Medical or Wellness; Sexuality or Nudity; Violence; Chance-Based Activities; Additional Information. Existing feature/content answers were retained; the calculated content rating remains 4+. The explicit higher-age override aligns the displayed rating with the contractual minimum without inventing content descriptions.

The questionnaire defines User-Generated Content as broad distribution and Messaging and Chat as users communicating with one another. Private AI tutoring does not by itself establish those features. No public social feed, user-to-user chat, parental-control system, unrestricted in-app browser or paid advertising placement was identified in the reviewed app implementation. The existing No selections were retained. Self-entered signup age was not relabeled as robust Age Assurance or as an implementation of Apple's Declared Age Range API.

A targeted scan of available course knowledge/training text did not establish a need to change the existing mature-content frequencies; the occurrences reviewed included safety exclusions and camera terminology. This was not a frame-by-frame review of every course video, nor exhaustive live AI-output testing. The content owner must still verify all shipped lesson/media content and moderation against the questionnaire before resubmission and whenever content changes. Do not interpret the retained answers as certification of unseen media.

## Saved results

| Region/platform | App Store Connect result |
|---|---|
| Global override / 172 countries or regions | 13+ |
| Brazil | 14+ |
| Republic of Korea | 12+ |
| Vietnam | 12+ |
| Operating systems earlier than version 26 | Global rating 12+ with regional exceptions |

These are Apple's automatic regional and legacy equivalents of the selected 13+ override. The app's own eligibility terms and signup minimum remain 13; a regional rating is not a change to those terms. The app was not placed in the Made for Kids category.

## Verification and scope

- Saved the selected 13+ override and eligibility URL in the age-rating dialog.
- Reloaded App Information and confirmed the rating and URL persisted.
- Opened View Details and read back the global/regional ratings above.
- Checked the source minimum-age requirements. Evidence: `evidence/age-policy-source-checks.json` and `evidence/connect-verification.json`.
- No application code, dependency, entitlement or build configuration changed for this step. No functional test suite was rerun for this metadata-only correction.

This closes the evidenced rating/terms mismatch in audit finding A4. It does not implement a new age-verification service or resolve all jurisdiction-specific minor-user obligations. The remaining audit/release checks still apply. Fixes 1 and 2 require deployment, and the updated privacy manifest from fix 3 must be included in the final archive.

Next audit item: replace the stale selected build/review notes after the final corrected release build is ready; include the requested device recording and purchase/restore verification.

Official source checked on 6 November 2026: [Apple's age-rating and override instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/). These require an override when the app's minimum-age terms exceed the calculated content rating and explain regional equivalents.
