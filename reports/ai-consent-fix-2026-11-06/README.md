# Fix 1: explicit AI data-sharing permission

> Follow-up: fix 2 is now implemented locally. Use [the combined deployment handoff](../ai-provider-privacy-fix-2026-11-06/README.md), whose cumulative backend patch supersedes this report's first-fix-only patch. The current consent policy is 2026-11-06.2. This report otherwise records the first-fix checkpoint.

Implemented locally on 6 November 2026 for audit finding A1 / guideline 5.1.2(i). **Not yet deployed or verified against the production backend. No App Store binary was built or uploaded.** The audit remains NOT READY until its other findings and release checks are closed.

## Behavior

- Both native Nex AI and lesson Course AI use the same guarded transport. On send, fetch the current authenticated account's permission. Show the server's complete disclosure before sending prompt/history. Only tapping **Allow AI**, followed by a successful server save, permits sending. **Not now**, dismissal, and opening the privacy policy do not grant permission.
- The disclosure identifies fal.ai, OpenRouter and the configured model provider, and describes prompts, up to 12 recent messages, course/lesson context and the profile/account summaries currently present in some backend requests. It explains optional AI, unaffected course access, withdrawal and history deletion. The public policy contradiction and removal of unnecessary profile data are audit finding A2, still pending as the next fix. When changing that data/disclosure, update the policy version and test it again.
- **Nex AI > Chat history > AI Data Controls > AI data sharing permission** allows reviewing the disclosure and withdrawing. Withdrawal is saved on the server and blocks future requests across devices. It cannot recall information already sent or cancel processing already in flight. Saved Skillomate chats have a separate Delete AI history control.
- No local permission shortcut is stored. Re-read on each send, enforce account/session identity around asynchronous decisions, and reject unavailable or old unconditional-grant responses. Network/save failure never permits a chat.
- Server permission is a private nested `User.aiConsent` record (choice, policy version, provider fingerprint, server timestamp). Users without a current explicit record default to off. No automatic consent migration or database backfill grants permission.
- `/api/ai/consent` GET/PUT remain authenticated and use `Cache-Control: no-store`. A grant must match both current versions and use a boolean decision. A refusal/withdrawal is accepted even with obsolete versions. Database failure returns a controlled error and blocks AI.
- Shared `handleTutorChat` gates native `/api/ai/chat` and legacy `/course-ai/chat`; untrusted request flags do not grant permission. Re-check persisted permission immediately before every provider attempt, including retries and answer-repair calls. No-consent calls return 403 `AI_CONSENT_REQUIRED` before chat processing. Permission storage errors return 503 without sending to providers.
- Provider/model/endpoint or disclosure changes alter the fingerprint and invalidate earlier grants. Bump `policyVersion` for any additional data-practice change. Custom provider routing must be reviewed against the named recipients before deployment.
- History deletion and response reporting remain usable after withdrawal. Paid course entitlements and guest media restrictions were not changed by this fix. Existing removal of the guest banner is preserved.

## Verification

- Full mobile suite: **186 passed, 0 failed** (including 9 new consent/permission-prompt tests).
- Selected backend AI/history/isolation/language/transport suites: **130 passed, 0 failed** (including 6 new server consent tests).
- Focused compliance wiring check: **1 passed**, 35 unrelated cases skipped. This is not a claim that the previously identified four stale assertions in the broader compliance suite have been fixed.
- Covered first use, explicit acceptance, refusal, withdrawal, missing/outdated policies, provider-version mismatch, malformed decisions, unavailable persistence, legacy handler enforcement, provider retry after withdrawal, account switching during a prompt, rejected saves, old backend responses, and native alert button/dismissal behavior. Synthetic fixtures/stubbed persistence/provider boundaries were used; no production AI payload or real purchase/deletion was performed.
- `git diff --check` and backend syntax checks pass. Mobile tests parse the actual JSX source.
- Simulator guest navigation remains available and AI remains account gated. The simulator is signed out; a signed-in end-to-end permission-screen check with the deployed consent API and final release binary is still required. No screenshot or runtime claim substitutes for that check.

Evidence logs are under `evidence/`. Existing tutor tests were updated to explicitly grant consent in fixtures. Retired tests asserting that permission was unnecessary were replaced. A previously incomplete history-test stub now loads the real selected-lesson summary helper; its English summary test checks the existing local-summary behavior and lesson isolation instead of incorrectly requiring an external provider call.

## Deployment and release order

1. Finish the next privacy-payload/policy fix (A2) before production release so consent, payload and policy agree. Do not treat this local change as approval to resubmit.
2. Deploy the backend files together: `models/User.js`, `routes/ai.js`, `services/aiConsent.js`, `services/aiTutorService.js`, `services/tutorProvider.js`. `backend-deployment.patch` contains these changes against the audited repository state. Run `git apply --check` in a matching checkout before applying; do not overwrite unrelated server changes. Restart the API and run normal health/readiness checks. Existing users default to no consent without a destructive migration.
3. Ship the matching mobile code: `services/aiConsent.js`, `services/aiConsentPrompt.js`, `services/aiClient.js`, and the permission control in `App.js`. No native dependency or build-number change was introduced. Production still needs a newly tested signed build before submission.
4. Rollout compatibility: new mobile code refuses the old always-granted backend. A new backend rejects AI from older clients without a valid saved consent record. The website and other older clients sharing this API also require a matching permission UI to obtain first-use consent; they must not bypass this gate. Their UI update is outside this native-app fix and must be included if they are released alongside the backend. A user's valid saved choice is account-wide, but each client must still respect changed versions and withdrawal.
5. With an authorized test account, verify GET initially false; direct chat 403; acceptance of the displayed exact versions; chat success; refusal/withdrawal then 403; local and server account changes; restored installation; provider/policy changes; network failures; retained history controls and unaffected paid-course playback. Do not log access tokens or real prompts.

Official source checked on the implementation date: https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing
