# iOS App Review readiness audit

12 November 2026 (IST) - **NOT VERIFIED READY. Build 35 is already Waiting for Review.**

The live App Store Connect state supersedes the 6 November handoff. Version 1.0 currently selects build **35**, artifact ID `68c9309f-d4b4-4114-9e5e-1fdbd2b0770d`. Local Expo and native configurations still target build **34**. Passing current-source tests does not verify the contents or behavior of submitted build 35. No review submission, withdrawal, metadata edit, deployment, purchase or account deletion was performed during this audit.

## Findings that prevent a readiness sign-off

1. **Submitted notes are unfinished (2.1, 2.3.1).** The live version is Waiting for Review, but its notes call themselves DRAFT, say it has not been resubmitted, and say deployment confirmation, final-device QA and the new recording remain pending. They refer to an earlier build-29 recording and ask for a replacement. The observed version attachment area did not display a new attachment; review-thread attachment history was not independently revalidated today. This is a concrete metadata inconsistency, not proof that no evidence exists elsewhere.
2. **Submitted artifact is not tied to tested source (2.1, 2.5).** Local version is 1.0 (34), submitted version is 1.0 (35). Obtain the build-35 source commit, build logs and IPA/archive hashes; inspect its actual bundle, manifests, SDKs, signatures, entitlements and symbols. Do not increment or rebuild merely to make the local number match. The source baseline audited here is `ae22ac39d8d9cafca89cbcd4957fa47419067778`, followed by a test-only harness correction documented below.
3. **Final-device and StoreKit evidence remains unverified (2.1, 3.1.1, 3.1.2).** No available physical iPhone/iPad: both paired physical phones report unavailable. All 15 prior final-build runtime cases remain NOT_RUN in the handoff. No build-35 TestFlight session, sandbox purchase/restore, real lifecycle notification, device recording, reviewer-account login, disposable-account deletion or supported-device accessibility/network test was completed here. Historical records are not fresh execution evidence.
4. **Published policy is still the old version (5.1.1(i), 5.1.2(i)).** The production privacy page was read in Chrome and refreshed. It still says September 2026 and describes unnamed AI providers. It does not contain the named fal.ai/OpenRouter/Google Gemini recipients, explicit sharing choice and withdrawal explanation present in the new local consent notice and revised website source. Date alone is not the issue: the deployed wording is not aligned with the release disclosure. Confirm the matching backend deployment and provider configuration as well; unauthenticated endpoint checks cannot establish consent enforcement for signed-in users.
5. **Remaining registration/entitlement review risk (5.1.1(v)).** Guest catalogue browsing and paid-content protection pass source tests. This does not establish Apple's acceptance of requiring an account for the previously rejected course experience. Explain necessary account use, minimize required personal data, and verify purchase/restore access on the submitted binary. Do not expose paid material as a shortcut.
6. **Rights, storefronts and final presentation require evidence (2.3, 3.1.1(a), 5.1.4, 5.2).** Connect declares content rights but the local rights inventory still requires owner confirmation for courses and artwork. Current-source external URL filtering exists; the linked production privacy page exposes Pricing links. Verify the complete outbound flow on build 35 under each enabled storefront's rules; this observation alone is not a finding that every legal link violates payment rules. Confirm India-only phone registration against actual country availability, minor-user obligations, final screenshots/previews, offer eligibility/prices and provider retention.
7. **Native-test setup and handoff documents are stale.** Xcode lists only the ProtectedVideo application target. Its shared scheme references a nonexistent ProtectedVideoTests target, so no native XCTest suite was run. The older final checklist says iPhone-only and the submission guide refers to build 19, while current settings use device family 1,2 and support iPad. Reconcile these before relying on them for release execution. This audit does not rewrite historical evidence or claim a runtime crash from a stale scheme.

## Fresh verification

| Check | Result | Evidence |
|---|---|---|
| Full mobile suite, `node --test tests/*.test.js` in appcopyai | 188 passed; 0 failed; 0 skipped | evidence/mobile-tests.log |
| Selected backend review suite, 23 files | 220 passed; 0 failed; 0 skipped after harness correction | evidence/backend-tests-final.log |
| Player suite after correction, included in backend count | 13 passed; 0 failed | evidence/mobile-player-tests-final.log |
| Native Info.plist, privacy manifest, entitlements, Xcode project | All parsed successfully | evidence/config-validation.json |
| Expo/native version | Both 1.0 (34); mismatch with submitted 35 | evidence/config-validation.json |
| Privacy collection manifest | 13 unique categories; tracking false | evidence/config-validation.json |
| Native targets | Application only; scheme test target absent | evidence/xcode-targets.log |
| Host SDK | Xcode 27.2, iOS SDK 27.2 available | Host observation; not evidence of build-35 toolchain |
| Live Connect privacy | Published; 13 categories including Photos or Videos and Other Data Types | evidence/connect-observations.json |
| Live Connect age/category | Education; 13+ in 172 regions, regional equivalents and older-OS ratings | evidence/connect-observations.json |
| Live monthly IAP | `com.skillomate.premium.monthly`, one month; Waiting for Review | evidence/connect-observations.json |
| Production privacy | Old September wording confirmed after refresh | evidence/connect-observations.json |
| Physical devices | Paired physical phones unavailable | evidence/device-observations.json |
| Production health/readiness | Both 200; MongoDB and Redis connected | evidence/live-endpoints.json |
| Production consent endpoint without login | 401 Invalid session; signed-in behavior not exercised | evidence/live-endpoints.json |
| Public support/terms | Both HTTP 200; not proof of complete rendered/legal validation | evidence/live-endpoints.json |

The backend selection covers compliance, Apple verification/notifications/ownership, AI sharing consent/minimization/history, public paid-media denial, entitlements, account deletion/billing, profile-image storage, authentication/OTP/password reset, native sessions, reviewer seeding, rate limiting, capture policy, download grants/streaming and player navigation. These are local unit/fixture/source checks; mocked Apple transactions and providers do not constitute sandbox or production integration verification. The entire backend repository suite was not run.

Initial execution could not load missing backend dependencies. Restored the existing lockfile with `npm ci --ignore-scripts --no-audit --no-fund` (203 packages); install scripts remained disabled. One player test file also hardcoded the absent web frontend parser path and omitted the new OTP invalidation dependency from its VM. The test now resolves the mobile parser and executes the real OTP invalidation callback with its real reference/state shape. Navigation assertions remain; added assertions prove stale OTP work is invalidated. No production app/backend behavior, dependency lockfile, build number or release configuration changed. Initial failed logs are retained and are not disguised as runtime product failures.

No new app version or binary was requested or delivered. Consequently this is an audit report, not the project's required previous/new-build comparison. Available disk was under 1 GiB before dependency restoration; no archive was attempted. Existing archives are builds 11-14 and cannot validate submitted build 35.

## Complete guideline accounting

[GUIDELINE_MATRIX.md](GUIDELINE_MATRIX.md) accounts for every list clause under sections 1-5 of the official Apple page retrieved today, including numbered rules without HTML IDs, lettered/roman clauses and otherwise unnumbered bullets. Generated `bullet-N` suffixes identify positions in the source and are not Apple rule numbers. Parent paragraphs are reviewed with their containing rule. Apple-omitted rules remain marked omitted. Conditional N/A means no matching feature was found in inspected source/configuration; it does not establish the contents of the unavailable submitted binary. The matrix is a coverage record, not a declaration that every applicable requirement passed.

Coverage: **138 explicitly numbered entries; 271 total entries**. Status counts: 29 BLOCKED, 64 PARTIAL, 72 PENDING, 98 CONDITIONAL_NA, 8 OMITTED. Counts include parent and child clauses and are not independent defects. No percentage-compliant score is inferred. Apple leaves 4.6 absent; the eight explicitly omitted entries are retained rather than inventing requirements for them. The pre-submission checklist and operational/post-submission obligations are mapped in RUNTIME_CHECKLIST.md. Generate-audit validation checks that every encountered list clause has exactly one unique accounting entry.

Status meanings: **BLOCKED** = evidenced release/metadata gap; **PARTIAL** = source/automated control exists but runtime, metadata or operational proof is incomplete; **PENDING** = necessary evidence not obtained; **CONDITIONAL_NA** = absent feature/platform in inspected scope; **OMITTED** = Apple intentionally omitted the rule. No unresolved row is counted as a pass.

## Required closure sequence

1. Release owner reconciles the live Waiting for Review state with the draft notes, deployment facts and outstanding Apple requests. An audit finding is not authorization to withdraw the submission, and this audit leaves it unchanged.
2. Identify build 35's exact source/artifact and verify matched backend/website deployment. Publish the aligned public privacy wording through the normal deployment process, then test signed-in consent refusal/acceptance/withdrawal and outbound synthetic payloads against that deployed version.
3. Execute [RUNTIME_CHECKLIST.md](RUNTIME_CHECKLIST.md) on the exact submitted TestFlight artifact, including physical iPhone and supported iPad. Capture the requested physical-device recording and verify reviewer access to it and the account.
4. Validate archive SDK/privacy/signatures/entitlements/export/symbols, final localized metadata and screenshots, complete IAP eligibility/disclosures, country/age treatment, ownership/licences and business/account standing. Resolve every applicable PENDING/PARTIAL/BLOCKED matrix row with evidence or a defensible scope exclusion.
5. Only then record a readiness sign-off and finalize accurate reviewer notes. Passing automated tests alone is insufficient.

## Official sources checked today

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/) - page states iOS/iPadOS 13+ target since 9 September 2026 and Xcode 26+/iOS 26 SDK+ uploads since 28 April 2026. Local minimum 16.4 exceeds the target minimum; submitted archive SDK still needs verification.
- [Live version](https://appstoreconnect.apple.com/apps/6790396358/distribution/ios/version/inflight), [privacy](https://appstoreconnect.apple.com/apps/6790396358/distribution/privacy), [app information](https://appstoreconnect.apple.com/apps/6790396358/distribution/info), [subscription group](https://appstoreconnect.apple.com/apps/6790396358/distribution/subscription-groups/22420353) and [public privacy policy](https://skillomate.in/privacy).

Private reviewer credentials/contact details were not copied into audit artifacts. Only sanitized factual observations were saved.
