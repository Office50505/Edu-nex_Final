# Whole-app audit - 12 November 2026

**Update: all originally identified local code/test failures are fixed.** The final backend run passes 1,786 tests and the mobile run passes 217. Deployment, physical-device and submitted-build readiness remain unverified. Original audit totals below are historical, before the fixes.

## Sixth item and final local regression

The viral-hook accounting tests now generate fresh, isolated offline sessions using the real gate's current local environment. They bind the source revision to the current viral-hook service rather than copying a historical session with another workspace path and an empty source manifest. The approval gate, four-attempt cap, durable accounting and refusal of unapproved calls remain intact. A regression verifies that even a correctly checksummed session from another workspace is rejected. The original three failures are recorded in `evidence/f6-before.log`.

Final full backend verification: **1,786 passed, 0 failed** (`evidence/backend-after-all-fixes.log`). Full mobile verification: **217 passed, 0 failed** (`evidence/mobile-after-all-fixes.log`). The backend run used `USE_REDIS_CACHE_IN_DEVELOPMENT=true`, restored locked marketing dependencies and the official locked FFmpeg package binary, and local HTTP access outside the shell sandbox. Earlier restricted runs hit missing dependency/binary and loopback permission errors; those were test-environment prerequisites, not additional source fixes. Frontend tests were not rerun in this step; their earlier result remains historical.

All **26 historical viral-hook QA files are byte-identical**, including the gate, approval and ledger (`evidence/f6-historical-verification.json`). No live provider request or deployment was performed.

Runtime follow-up: current device discovery reports both paired physical iPhones unavailable, with an iPhone 17 Pro simulator booted. Device Hub shows the existing app's course page; this does not verify the changed source or submitted artifact. Local configuration still reports iOS build 34. Browser access is currently unavailable, so App Store Connect metadata and the public privacy wording were not revalidated here. The next runtime step requires a connected, unlocked physical device and identification of the exact artifact being tested; final StoreKit, authenticated flows and release metadata remain pending.

### Subsequent iOS runtime attempt

On the user's instruction to continue, device discovery again reported both paired physical iPhones unavailable. The booted iPhone 17 Pro simulator runs iOS 26.5. Read-only inspection of its installed development app (`com.alihussainkhan.skillomate.dev`) identifies **version 1.0, build 33**, which differs from local configuration build 34 and the previously observed submitted build 35. This installed binary cannot establish verification of the latest source fixes.

Device Hub UI checks on that existing build: the guest course-detail screen displays the eight-lesson AI Cartoon Series list; selecting a premium lesson opens the membership/sign-in screen without starting lesson playback; Back to browsing returns to course details. Opening course notes shows the course description and “No prompts shared for this course yet.” This is an observation of public content, not proof that protected notes are correctly denied for every course. No authenticated session, paid playback, download or StoreKit transaction was exercised.

The user was asked to connect and unlock a physical iPhone. Physical exact-artifact checks remain pending that device and artifact identification. No app build, deployment, credentials entry, purchase or App Store metadata change was performed.

### Continued simulator guest checks (user-selected scope)

The user chose to continue simulator checks. On the installed build 33 / iOS 26.5, course notes close back to details, and course details return to the catalogue. A literal `Cartoon` search filters the catalogue; a literal unmatched query displays “No matching courses” and a clear-search action restores the catalogue. Initial keyboard typing used the host's transliteration input; the result was retested with literal accessibility field entry rather than treated as a product defect.

Downloads, Nex AI and Profile each show the guest sign-in gate. Opening sign-in without entering credentials shows a disabled Log in action for blank fields and accessible guest, terms, privacy and support controls. Terms and Help & Support render in the app and close back to sign-in. Continue as Guest restores Home. No login, consent change, AI request, purchase or message to support was submitted.

The privacy control opens Safari at the public Skillomate policy. It initially appeared blank, then rendered after a reload; the visible page shows Privacy Policy and “Last updated: September 2026.” Only the visible heading/date and successful navigation were checked in this continuation; the full policy's disclosure adequacy was not re-audited. No confirmed new guest-flow defect was established by these checks. Premium playback, signed-in account features, StoreKit and latest-source/exact-submitted-artifact verification remain pending.

### Current JavaScript loaded in the simulator

On the subsequent fix request, local Expo Metro was started on port 8081 and the existing app's React Native development menu was used to configure the local bundler. Metro confirmed `iOS Bundled 338ms index.js (908 modules)`, followed by runtime thumbnail fallback logs from this project. Home rendered, the AI Filmmaking course loaded 15 premium lessons, and selecting a premium lesson opened the membership sign-in gate. The blank sign-in screen is prepared for the next checks. Source hashes and scope are recorded in `evidence/current-js-simulator.json`.

This closes the inability to load current JavaScript for local simulator testing. It does not produce or validate a new native binary: installed version remains 1.0 (33). The API still targets the deployed backend, so these runtime observations do not validate the undeployed backend fixes. No binary build or deployment was performed. Signed-in playback/progress/download/AI-consent checks await the pending explicit test-account sign-in authorization, requested because an earlier automatic approval review rejected entering those credentials without authorization. No credentials have been entered in this continuation. Physical-device, StoreKit and exact-submitted-artifact checks remain pending.

### Authorized test-account session and runtime blockers

The user explicitly authorized signing into Skillomate with the existing App Review test account. The credentials were read from the existing authenticated App Store Connect review fields and entered only into Skillomate; they are not reproduced in this report. Sign-in completed without an OTP step. App Store Connect was also freshly observed to show version 1.0 build 35 Waiting for Review, with the draft/pending-evidence review notes still present. No App Store Connect fields were changed.

After sign-in, the app displayed its dismissible membership popup. The App Store product failed to load, and one product-load retry returned the same unavailable-price state. Refresh Access returned “No active membership found for this account.” Downloads reopened the membership popup. Thus premium playback, seek/progress and download execution remain blocked by the account's missing verified entitlement. The simulator's unavailable product is an observed runtime limitation; its root cause has not been isolated to application code, StoreKit session configuration or storefront configuration. No entitlement was fabricated, granted or bypassed, and no purchase or restore transaction was attempted.

Signed-in Nex AI opens using the default tutor name. Chat history exposes AI Data Controls. Reading the sharing permission shows the named fal.ai, OpenRouter and Google Gemini disclosure. Choosing Not now successfully returned “AI data sharing off.” A subsequent built-in prompt again requested permission; declining returned the local “AI data sharing is off. You can continue using your courses.” message without a model answer. The test account was left with AI sharing off. This verifies the visible decline path and matches the consent-aware client source; it is not a network-capture proof or live model evaluation. No AI acceptance, history deletion, account deletion or support message was performed.

Remaining runtime prerequisites: an account with verified active premium access for member playback/download checks, a working sandbox or Xcode StoreKit session for transaction scenarios, and physical devices for final exact-artifact/device checks. Current JavaScript remains served by the local Metro process. Available disk is below 1 GiB, so no native archive/new binary was attempted.

## Fifth item: task-preserving accounting fixtures fixed

The task-preserving response tests now generate independent offline sessions with fresh UUIDs and the gate's current local environment, rather than copying a historical session from another workspace. Each test retains its temporary source revision, checksums, durable ledger, approval lifecycle and cleanup. The actual gate implementation and historical sessions were not changed. Network access remains denied by the test harness.

The four original accounting failures are reproduced in `evidence/f5-before.log`. The corrected file passes **25 tests**, including a regression verifying that a different workspace is still rejected as `manual_qa_invalid_session`. Approved generation/repair accounting, awaiting approval, attempt-budget exhaustion and debit on failed repair all pass (`evidence/f5-regression.log`). Related task-preserving, business response and consent tests pass **144 tests, 0 failures** (`evidence/f5-related-regression.log`).

SHA-256 comparison confirms all **27 historical QA files remain byte-identical**, including gates, approvals and accounting (`evidence/f5-historical-verification.json`). No app production code, deployment, new binary or live provider request was involved. The three previously identified viral-hook copied-session failures remain for the next item; they were outside this targeted run.

## Fourth item: historical approval fixture dependency fixed

The CS-11 v2 fixture test now owns a temporary report directory, copies the existing frozen case manifest into it, and checks that this isolated offline report has no provider approval. It no longer assumes an historical run's approval file must be absent. Cleanup removes the temporary directory and unregisters the test's synthetic in-process course pack. Network access is denied by the test harness; no app production code or provider gate changed.

Before the change, the original test failed (`evidence/f4-before.log`). Afterward, the fixture and Cartoon Series tests pass **42 tests, 0 failures** (`evidence/f4-regression.log`). SHA-256 comparison verifies all **19 historical report files are byte-identical**, including provider approval (`evidence/f4-historical-verification.json`).

This closes the fourth item. The seven previously identified copied-QA-session fixture failures remain outside this step. No deployment, new app binary, provider call or historical approval edit was performed.

## Third item: stale mobile AI maintenance test fixed

The maintenance test now resolves the real mobile consent module and invokes the current `requestTutor({session, user, ...})` API through the real `createNativeSession` transport with an injected offline fetcher. Only the React Native permission-dialog import is replaced with an unexpected-prompt guard; the consent logic remains active. No app production code changed in this step.

The regression checks verify consent GET before chat POST, authentication headers, filtering and limits of 12 history entries/2000 characters per entry, HTTP 401 ending an unrefreshable session, and HTTP 503 preserving the signed-in account and provider error details. The old test failed on its unresolved relative import (`evidence/f3-before.log`). Maintenance, system-health, native-session, mobile tutor and backend/mobile consent checks now pass **41 tests, 0 failures** (`evidence/f3-regression.log`).

The original nine test/fixture failures below are historical: this closes the stale mobile AI loader/API item, leaving the eight historical-fixture failures for separate work. No deployment or new app binary was created.

## F2 fix verification

Product grounding validation now includes the detected violation list as `repairRequest.issues`, matching the provider payload contract. The actual outbound repair prompt contains the complete JSON violation list rather than `undefined`. The original learner request and answer remain available to the correction, and corrected output still passes final validation.

Regression checks verify the validator metadata, actual outbound payload, successful compound response, rejection of an unsafe correction and safe fallback after a provider failure. The two metadata/payload checks failed before the source fix (`evidence/f2-before.log`). After the fix, the broader AI/product/context/consent suite passes **625 tests, 0 failures** (`evidence/f2-context-regression.log`), including the F1 regressions.

No deployment, new app binary or live provider call was performed. The nine historical test/fixture failures and release/device limitations below were outside this step and were not rechecked by this targeted suite.

## F1 fix verification

The unavailable-provider path now saves authorized product conversation state and user turns without adding a fabricated assistant message. Consent is revalidated before saving, and persistence is limited to successfully built, accessible product-course context. The unavailable response remains HTTP 503 (504 for timeouts).

The original phase11 regression now passes. Eight new offline route regressions cover a missing provider key, transport failures, product replacement clearing stale attributes/price, account/course/conversation isolation, consent revalidation, missing consent, expired access, failed context loading and unauthenticated requests. Broader AI/product/context/consent checks: **623 tests, 622 passed, 1 failed**. The remaining failure is the already identified F2 grounding-repair wording assertion. Evidence: `evidence/f1-context-regression.log`.

No deployment, new app binary or live provider call was performed. F2 and the other historical audit findings have not been fixed in this step.

The existing mobile changes for paused seeking, inactive-lesson accessibility and thumbnail fallback were preserved. Source baseline is commit `ae22ac39d8d9cafca89cbcd4957fa47419067778` plus the current working-tree fixes/tests. This is a source/local-test audit, not verification of the submitted App Store binary.

## Identified app findings

### F1 - Product context is lost across unsuccessful AI turns

Reproduction: with a synthetic authorized Product Photoshoot course session and no configured AI provider, send (1) a product declaration, (2) an explicit replacement product, then (3) a request for the complete White Studio template for the same product. The first turns cannot produce a provider answer and do not persist their product context. The later deterministic template returns `[PRODUCT]` rather than the replacement product. The existing route regression test expects the scoped product to survive these turns and fails.

Impact: a learner who supplied or changed product details during provider unavailability can receive a generic template on a follow-up and must supply the details again. This reproduction is specifically about unsuccessful/provider-unavailable turns; it does not prove that all successful conversations lose context. No real provider or production account was used.

Evidence: `evidence/ai-reproductions.json`; `edunex-b/tests/product-tutor-phase11.test.cjs:87`; context loading/persistence and failure handling in `edunex-b/routes/ai.js`.

Suggested next fix: retain authorized, conversation-scoped learner product state through the unavailable-response path without storing a fabricated assistant answer, weakening consent or leaking context across accounts/courses/conversations.

### F2 - Product grounding repairs omit the detected violations

The actual constructed second provider request contains `Correct only these unsupported factual propositions: undefined`. `productTutorResponse.js` returns `groundingViolations` alongside a `repairRequest` that lacks an `issues` field; `aiTutorService.js` formats the grounding instruction using `repair.issues`.

Impact: the correction request lacks the concrete unsupported claims it is meant to repair. This may reduce correction reliability. The injected provider supplied a safe replacement in the reproduction, so the audit does not establish that an unsafe live response was delivered. One existing test also expects older repair wording; its failed string assertion alone is not proof of this payload defect. The captured request independently demonstrates the missing data.

Evidence: `evidence/ai-reproductions.json`; `edunex-b/services/productTutorResponse.js:243`; `edunex-b/services/aiTutorService.js:1358`; `edunex-b/tests/product-tutor-phase11.test.cjs:98`.

Suggested next fix: carry the structured violation list into the grounding repair request, verify the outbound payload, preserve the requested compound task and keep final-output validation in place.

## Final verification results

| Area | Result | Evidence |
|---|---|---|
| Full mobile suite | 217 passed, 0 failed | evidence/mobile-tests.log |
| Full web frontend suite | 42 files, 309 tests passed | evidence/frontend-tests.log |
| Main web production compilation | Passed; existing large HLS chunk warning | evidence/web-compile.log |
| Marketing website TypeScript | Passed; exit 0, no diagnostics | evidence/verification-summary.json |
| Marketing checkout storage checks | 5 passed after installing its locked TypeScript dependency | evidence/marketing-storage-tests.log |
| Initial full backend run | 1,754 passed, 15 failed out of 1,769 | evidence/backend-initial.log |
| Final full backend run | **1,762 passed, 11 failed out of 1,773** | evidence/backend-final.log |
| FFmpeg/CloudFront recheck | 12 passed after restoring the package's expected native binary | evidence/cloudfront-recheck.log |
| Readiness recheck | 11 passed with explicit development Redis opt-in | evidence/readiness-recheck.log |
| Source syntax selection | 292 mobile/backend/main-web files parsed; no syntax errors | evidence/source-syntax.json |
| Native plist/project checks | Passed earlier in this audit sequence | Prior iOS audit evidence |
| Production readiness | MongoDB and Redis connected in the completed public check | evidence/production-readiness.json |

Counts overlap: the targeted rechecks are included in the final backend suite and are not extra independent coverage. The initial failed marketing test file becomes five individual passing tests once its dependency is present, changing the total. Marketing TypeScript validation is separate from a complete Next.js production build; only the main Vite web build was compiled. The HLS chunk-size warning did not fail compilation.

Commands: `node --test appcopyai/tests/*.test.js`; `vitest run --maxWorkers=2` in `edunex-f`; `vite build --outDir <temporary-RAM-output> --emptyOutDir`; `tsc --noEmit --incremental false` in `marketing-web`; final backend command `USE_REDIS_CACHE_IN_DEVELOPMENT=true node --test --test-concurrency=4 tests/*.test.cjs`. The Redis flag was scoped to the test process, not saved into application configuration.

## The remaining 11 backend failures

| Failures | Classification | Detail |
|---|---|---|
| 1 | F1 behavior regression | Product context through unavailable-provider turns |
| 1 | F2 payload finding plus stale wording assertion | Missing concrete violations independently reproduced |
| 1 | Stale mobile AI test loader/API | `admin-maintenance.test.cjs:87` imports `aiClient.js` via a data URL, cannot resolve its new consent imports, and still calls the retired fetcher/baseUrl API instead of a session |
| 1 | Non-isolated historical fixture assumption | `cartoon-cs11-v2-fixture.test.cjs:20` expects no `provider_approval.json` in an existing historical report directory, but that file exists |
| 4 | Stale copied QA environment | `task-preserving-response.test.cjs` copies a historical session whose workspace path belongs to another checkout; the real gate correctly rejects it with `manual_qa_invalid_session` |
| 3 | Stale copied QA environment | `viral-hook-grounding.test.cjs` has the same workspace-path mismatch |

The nine test/fixture failures do not establish nine additional user-facing bugs. Historical approval files, ledgers and gates were not reset, rewritten or bypassed. Those tests need properly generated isolated fixtures using the current workspace; the consent test must exercise the real current client contract.

## Environment failures resolved during the audit

The physical disk initially prevented restoring dependencies. A disposable 1 GiB RAM disk held exact lockfile dependency installs for backend, frontend and marketing tests. Install scripts were disabled. The official binary specified by the locked `ffmpeg-static` package was then restored explicitly into that temporary area; its version check and offline-video tests passed. The missing FFmpeg file was therefore an audit installation gap, not a demonstrated production download failure.

The readiness singleton test initially omitted the development Redis opt-in now required by `cacheService.js`. It passes with that explicit test configuration. The marketing storage file initially lacked TypeScript and passes after the matching dependency install. No production configuration or payment/provider account was changed.

The disk later filled again and prevented command approval logs and browser screenshots. After the user freed space, the final results were recovered and saved. Temporary dependency links were removed and the RAM disk was unmounted after saving the evidence; restoring dependencies through the normal project install is needed for subsequent local backend/web test runs.

## Remaining release and runtime limitations

- Authenticated iOS flows were not retested on the changed source. Earlier automatic review refused entering credentials without explicit sign-in authorization. No workaround was used.
- No physical-device matrix, real StoreKit sandbox lifecycle, real paid purchase, destructive account deletion or live AI provider evaluation was performed. Local fixture passes do not prove those integrations.
- The earlier App Store audit found unfinished review notes, a public privacy wording mismatch, and a build/source provenance gap. Those are not closed by these local player fixes. Current App Store submission state must be rechecked before action; the earlier observation was build 35 Waiting for Review while local configuration said 34.
- Missing original lesson JPGs still require correcting the source assets/metadata if exact lesson-specific artwork is desired. The mobile fallback fix handles unavailable artwork without treating video playlists as images.
- No App Store submission, release, deployment, production data edit, account deletion or reviewer message was sent.

Priority: fix F1 and F2 with focused regression evidence, repair the isolated test fixtures, then complete authenticated exact-build/device and submission checks. This audit makes no claim that every possible feature, territory or device combination has been verified.
