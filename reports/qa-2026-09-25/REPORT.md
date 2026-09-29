# Endpoint, admin and offer audit — 25 September 2026

## Result

The application is **not fully verified or fully functional**. Admin authentication and the checked data endpoints work, all ten offer component checks pass, and both web build variants compile. Readiness fails in this local environment, some admin controls are unfinished, and the existing test suites have failures.

Pulled `main` from `b5b6cdf` to `d8f9950` (`Fix Meta Pixel settings payload`) with `git pull --ff-only`. Pre-existing changes to admin components, styles, API helpers and animations, plus three untracked backend scripts, were preserved. Results apply to this working tree, including those local changes, rather than a pristine commit. No deployment was performed.

## Verification results

| Check | Result |
| --- | --- |
| Backend: `node --test tests/*.test.cjs` | 283 passed / 286; 3 failed |
| Existing frontend: `npx --no-install vitest run` | 226 passed / 231; 5 failed in 3 files |
| Added all-offer component checks | 10 / 10 passed |
| Combined frontend coverage across these runs | 236 passed / 241; 5 failed |
| Local API with configured MongoDB: login + 21 GET requests | 21 HTTP 200; readiness HTTP 503 |
| Anonymous requests to 13 admin GET endpoints | All returned HTTP 401 |
| Public Vite production compilation | Passed |
| Standalone-admin Vite production compilation | Passed |

Builds were generated in temporary directories using `vite build`, including `VITE_ADMIN_STANDALONE=true` for the admin variant. These verify compilation, not the full deployment/copy-assets pipeline. Both emit a chunk-size warning above 500 kB.

The first backend run also failed PDF extraction because `pdf-parse` was absent from installed dependencies. Installing the declared dependencies resolved that failure; the final backend results above include successful PDF extraction. No package manifest or lockfile was changed.

## Findings

1. **Readiness returns 503 locally.** `/api/ready` reports MongoDB connected and Redis disconnected. The local configuration has no Redis URL and uses in-memory cache fallback, but readiness requires Redis. This is a verified local configuration/readiness mismatch, not evidence of a production outage.
2. **Admin functionality is incomplete.** Orders exposes a disabled `View` button and recent analytics orders rather than a paginated order-management API. Subscriptions exposes disabled `Manage` buttons. Certificate `Reissue` has no click handler. Course Review explicitly lacks approval states, owners and review history. See `edunex-f/src/pages/admin/AdminOperationsPages.jsx` and `AdminCertificationsPage.jsx`.
3. **Course Review can show incorrect QA flags.** It requests `/api/admin/courses?summary=1`, but this projection returns lesson IDs/thumbnails rather than `videoUrl`, `embedUrl` or `bunnyVideoId`, and omits `totalStarted`. `courseQaFlags` treats those omitted fields as evidence of a missing intro and no enrollments. This is a source-confirmed frontend/API contract defect; it was not visually reproduced in a browser.
4. **Offer pages 5–10 lack their distinct video assets locally.** Their fallback to the main offer video passes component tests. They will not show six distinct videos until the files listed in `edunex-f/OFFER_VIDEOS.md` exist in the served asset directory. Offer 1–4 assets exist; the two MOV files are approximately 70 MB and 76 MB. Actual playback, codec compatibility and mobile loading performance remain unverified.

## Remaining test failures

| File | Failures | Evidence / interpretation |
| --- | --- | --- |
| Backend `annual-billing.test.cjs` | 2 | Tests expect annual checkout and annual/monthly conflict handling. Current controller maps all non-monthly values to trial, and the annual fixture does not mock `hasUsedIntroTrial`, resulting in HTTP 500 inside the test. The web payment page explicitly normalizes annual/yearly to monthly. This is a stale or unresolved annual-plan contract, not proof that normal monthly checkout returns 500. |
| Backend `mobile-player.test.cjs` | 1 | AST assertion expects an exact inline expression. The app now uses `hasConversation = messages.some(...) || loading` and renders suggestions in the alternate welcome branch. The exact-source assertion is stale. |
| Frontend `AdminReports.test.jsx` | 3 | Mock responses expose `json()` but omit `headers.get()` and `text()`, now required by the locally modified `adminJson`. Failure is `Cannot read properties of undefined (reading 'get')`. The authenticated reports endpoint itself returns 200. |
| Frontend `FrontendRegression.test.jsx` | 1 | Expects checkout to initiate automatically for a used-trial account. Current page presents a monthly subscription button requiring a click. The test does not click it. |
| Frontend `PaymentGatewaySettings.test.jsx` | 1 | Expects old wording `Test — simulated payments`; current UI says `Test — use Razorpay test payments`. |

The new Meta Pixel payload regression test passes. Existing offer payment recovery, onboarding and admin user/course tests were included in the frontend suite; only the failures listed above occurred. Application code and existing tests were not changed to suppress failures.

## Endpoint scope

Authenticated admin login and the following admin GET endpoints returned 200: analytics, user-management, courses (summary), payment-audit, payment-settings, marketing-settings, problem-reports, deletion-requests, certifications, certificate-template, video-providers, system-health and course-progress. Every one of these GET endpoints rejected anonymous access with 401.

Public GET endpoints returning 200: health, database health, courses, categories, marketing-config, onboarding/config and payment/config. Readiness returned 503 as described above. An isolated database-disabled smoke run also confirmed rejection of an incorrect admin password, anonymous video-library access and private image-proxy targets.

The server used the configured database through localhost:3101 with background jobs, automatic collection creation and automatic indexes disabled. The audit performed admin login and read requests only. It did not create learners, send OTPs, charge payments, change gateway settings, upload content, revoke access, or delete records. Credentials, tokens and learner records are not included in the retained endpoint log.

## Offer and admin UI coverage limits

Added `edunex-f/tests/player/AllOfferPages.test.jsx`: for `/offer` and `/offer2`–`/offer10`, render the correct video URL, trigger media failure and verify fallback, open the subscription CTA, check the phone-verification dialog, and ensure opening the dialog does not send a mutation request. Fetch and media playback are mocked; these are DOM/component tests, not real-browser playback tests.

Admin coverage combines existing component/unit tests, authenticated endpoint checks, source review of the admin page map and operational controls, and standalone-admin compilation. It does not establish that every button works end to end.

Browser automation could not initialize: its tool repeatedly failed with `codex/sandbox-state-meta: missing field sandboxPolicy`. Consequently desktop/mobile appearance, navigation, real media playback, live OTP delivery, real payment completion and admin mutation workflows remain unverified. The health endpoint likewise labels provider configuration as unverified rather than claiming successful provider transactions.

## Retained evidence

- `backend-tests.log`: final backend suite.
- `frontend-tests.log`: existing frontend suite and failure traces.
- `all-offers-tests.log`: ten added offer checks.
- `endpoint-audit.jsonl`: HTTP statuses, response shapes and safe health diagnostics.
- `public-build.log` and `admin-build.log`: compilation results.
