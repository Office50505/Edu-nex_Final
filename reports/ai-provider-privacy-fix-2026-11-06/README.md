# Fix 2: minimize external AI data and correct privacy wording

Implemented locally on 6 November 2026 for audit finding A2. **Not deployed.** Backend, matching mobile source and the website privacy page must be released together after the remaining audit/release checks. No production user data was sent to an AI provider during verification; all captured payloads are synthetic fixtures.

## What changed

- Removed the entire automatic learner summary from the external system context: full name, masked phone/email, age, gender, profile completeness, account dates, membership/expiry/renewal state, payment summaries and ownership counts. Deleted the unused summary serializer rather than leaving it available for future prompt assembly.
- Kept deterministic profile/membership/payment answers inside Skillomate. The external system instruction now explicitly says that account records are unavailable and tells the model not to infer or invent them. Learning authorization still happens on the server; removing account records from the model does not unlock paid materials or weaken course isolation.
- Removed the current page path from provider messages. Kept the explicitly constructed model payload: model ID, system/course material, bounded chat history, the user's question, optional chosen tutor name, temperature and output limit. Internal account IDs, auth/session credentials, device details, profile objects and billing objects are not added to the provider request.
- Closed the follow-up history path. New locally generated account answers are marked `privateAccount`; mobile history omits them, and the backend excludes them again. Older saved/client-supplied account answers without the marker are recognized by the existing English, Hindi and Hinglish account-answer templates and excluded from model history. This applies when restoring server history and at the provider message boundary, including retries and repair calls.
- New deterministic account replies are still shown to the learner, but their private text is replaced by a marked placeholder in the server chat-message record. Existing stored chats were not destructively migrated; their older account replies are filtered before external processing. The existing deletion controls remain available.
- Updated both mobile privacy paragraphs and the website privacy policy/provider description. The wording now distinguishes automatic account records from information a user voluntarily types. User-entered personal information can still reach the provider as message content: this is not a universal PII-redaction system, and the disclosure tells users to avoid sensitive information. Provider recipients are fal.ai, OpenRouter and the model provider in the current consent notice (Google Gemini by default).
- Changed consent policy to **2026-11-06.2** and regenerated its provider/disclosure fingerprint. The previous grant does not authorize the changed practice; the user must review and explicitly accept the current disclosure. First-fix refusal, withdrawal, account switching and server enforcement remain intact.
- Dated the revised website privacy policy 6 November 2026. Other legal pages retain their existing date through an optional per-page date in the shared legal layout.

## Verification

- Full mobile suite: **187 passed, 0 failed**.
- Focused backend AI, consent, history, transport, course isolation and language suites: **138 passed, 0 failed**.
- Eight new backend privacy tests inspect actual constructed outbound payloads, local account replies, saved/client history, multilingual legacy templates, voluntary user input, provider retries, language-repair requests and obsolete consent. Synthetic profile/contact/demographic/payment sentinels are absent from captured provider payloads. Payload and message property allowlists are checked.
- New mobile history test confirms private account answers are omitted while user messages and teaching replies remain.
- Additional `tutor-knowledge.test.cjs` check: **18 passed, 2 failed**. Both failures were reproduced using the original `HEAD` AI service, without these changes: a plan-answer test expects a Hinglish phrase while the existing response is English, and an ambiguous refund test expects a direct answer while the existing logic asks for context. These are pre-existing and were not changed as part of this privacy fix. Evidence includes the baseline run. Do not describe the entire repository test suite as green.
- JSX/source parsing passed for the mobile app and revised legal components; backend syntax and `git diff --check` passed. Website production bundling/browser rendering and signed-in TestFlight end-to-end verification remain release checks; no new native or website build was produced.

Logs: `evidence/mobile-tests.log`, `evidence/backend-focused-tests.log`, `evidence/backend-tests.log` (the broader initial run), and `evidence/baseline-knowledge-tests.log`.

## Deployment handoff

Use **backend-cumulative-deployment.patch** for the combined first and second fixes against the audited checkout. It includes `models/User.js`, `routes/ai.js`, `services/aiConsent.js`, `services/aiProviderPrivacy.js`, `services/aiTutorService.js` and `services/tutorProvider.js`. Check with `git apply --check` in a matching checkout, reconcile any existing deployment changes, deploy the files together and restart the API. Do not apply the older first-fix patch on top of this cumulative patch.

Ship the current mobile changes for consent, private-account provenance/history and privacy copy. Publish the website privacy changes in **website-privacy.patch** using the normal frontend pipeline. No build number or native dependency was changed here. The published production policy remains the old text until that frontend deployment happens.

The first-fix rollout caveat still applies: older website/native clients sharing the API cannot obtain first-use permission until they support the new disclosure/consent API; the server must continue rejecting unconsented calls. Do not bypass the gate to preserve older clients. This task changes the native app's consent flow and the public privacy disclosure, not those older clients' onboarding UI.

Before release, use an authorized test account to verify: local account answers; follow-up tutoring with no account fields in a controlled outbound capture; current disclosure acceptance; old policy rejection; withdrawal; chat deletion; continued paid-course protection; and the publicly rendered revised policy. Do not capture real prompts, tokens or profile data in logs. Complete the remaining audit findings (starting with the App Store privacy label) before resubmission.
