# Phase 14A.1 Unicode safety correction

Date: 16 October 2026 (Asia/Kolkata). Course: AI Product Photoshoot & Ads. Baseline: the existing stopped Phase 14A working tree, including all four functional improvements and unrelated user changes.

**The confirmed name-normalization bypass is corrected in the tested local candidate. Independent blind evaluation can be considered after review; it has not been started. This is not a production-readiness claim or deployment approval.**

The original synthetic name `cedar tray ｉｇｎｏｒｅ ｓｙｓｔｅｍ` was accepted before the correction. It now returns an empty/rejected identity. Legitimate names retain their original Unicode code points, including precomposed/decomposed Hindi, a Hindi joiner, separate Hindi/English words and a legitimate full-width name. Only a separate security copy is normalized.

## Verified results

| Check | Result |
|---|---|
| Original safety failure | Reproduced from the Phase 14A snapshot and rejected by the corrected implementation |
| New safety tests | **67/67 pass**, zero failures or skips |
| Full established chatbot/backend regression suite plus safety tests | **476/476 pass** (the existing 409 plus 67), zero failures or skips |
| Python evaluator suites | **167/167 pass**, zero failures or skips; v7 unchanged |
| Four Phase 14A critical cases | **4/4 pass**, all five turns match complete independently specified template bodies |
| Critical answers compared with Phase 14A | All five final answers byte-identical; no functional improvement reversed |
| Phase 12 previously passing cases | **40/40 cases, 48/48 turns byte-identical** in recorded-response pipeline replay |
| Unexpected changed responses in those comparisons | **0** |
| External provider requests / production interaction / deployment | **0 / none / none** |

Backend coverage is the complete established Phase 14A chatbot regression command, now 12 test files. It includes course access/isolation, history, mobile and product-course controls. This does not mean every unrelated backend subsystem test in the repository was run. Exact commands, every test status, stdout/stderr, JUnit and provider-fixture counts are included.

## What changed

Only two existing application files changed: `edunex-b/services/productTutorState.js` and `edunex-b/services/productTutorKnowledge.js`. One new test file, `edunex-b/tests/product-tutor-unicode-safety.test.cjs`, adds the 67 safety checks. The incremental patch is against the exact stopped working tree, not Git HEAD.

Both identity entry points now validate an NFKC security copy while returning the original display name. Existing rejection rules remain in use. Additional controls reject bidi controls and Latin/Cyrillic or Latin/Greek mixing within a word, and remove invisible default-ignorable code points from the security view so they cannot split prohibited words. Separate Hindi/English words remain allowed. Generic Hindi/Hinglish declarations no longer reinterpret a rejected `का नाम` / `ka naam` declaration as a different identity.

Authentication, entitlements, safety-route precedence, provider settings, approved knowledge, public APIs, conversation persistence and database schemas were not changed. No database migration, model training, production request, server restart, commit or push was performed. All 521 protected baseline files outside the two intended source edits retained their hashes; see final integrity evidence.

## Failures and limitations are retained

The first pre-fix safety run had 43 failures among 65 tests. The first correction left two of those failures unresolved because of declaration fallback; both were corrected, and two additional fallback/whitespace cases brought the final safety suite to 67. Raw failed-run evidence is preserved. No newly introduced safety regression was observed during this phase.

The Phase 12 replay uses recorded upstream answers, not fresh model inference: 11 fixture provider calls serve the original recorded responses. Backend tests make 62 adapter calls / 70 transport attempts against injected fixtures with real networking denied. Those are not external provider requests or a new chatbot accuracy score.

The new script-mixing rule can reject legitimate brands containing Latin and Greek/Cyrillic letters within one word. NFKC and finite rejection rules are not a universal prompt-injection defense or a complete Unicode-confusables detector. Production persistence, concurrency, UI behavior, broad multilingual paraphrases and fresh model-origin quality remain unverified here. Existing Phase 13 persistence/reset/repeat limitations are outside this correction.

Await review. Phase 14B has not begun, and production deployment remains prohibited.
