# Recommendation and remaining risks

**Recommendation: the local candidate can be submitted for independent blind evaluation after this safety review is accepted. Phase 14B has not started. Production readiness is not established, and deployment remains prohibited.**

The four functional regressions and the confirmed Unicode normalization bypass have executed passing checks. The 409 prior test cases retain their passing statuses, 67 safety tests pass, 167 evaluator tests pass, and the 40-case recorded-response comparison is unchanged. This is sufficient to recommend the next independent evaluation step, not to infer its outcome.

## What remains uncertain

1. The name gate remains a conservative finite parser and rejection policy. NFKC does not solve every Unicode-confusable, multilingual imperative or prompt-injection form. Mixed Latin/Greek or Latin/Cyrillic words are rejected, so some legitimate brands may need clarification. Separate mixed-language words and the tested legitimate Hindi/English/Hinglish names remain valid.
2. Accepted names retain their original code points, but established whitespace compaction and leading English-article handling remain. This is not a promise that every input byte, whitespace sequence or every script is accepted unchanged.
3. Rejected replacement names are not promoted. Existing safe identity remains in the tested sequence; a focused user-facing clarification for every rejected/ambiguous switch is a separate product-behavior decision. Do not describe a rejected switch as completed.
4. Remembered identity and renderer checks prevent tested unsafe names from being inserted into executable bodies. They do not erase or certify every arbitrary value in old conversation history. Existing history-as-untrusted-data instructions, scope/access enforcement, input safety, output filtering and advertising guards remain necessary.
5. Phase 13's explicit-reset, exact-repeat, missing conversation ID and single-row-per-user/course limitations are not redesigned. No persistence/schema/index migration was performed. Fixture success does not establish production storage durability or race safety.
6. No fresh model response was requested. The 40-case comparison intentionally reuses recorded provider text. New multilingual model quality, safety, latency and repair behavior require independent authorized evaluation.
7. All 19 approved source assets are covered by the existing Phase 14A full-body tests, and knowledge hashes remain unchanged. Other backend subsystems outside the established chatbot regression command were not newly tested here.

## Proposed review gates before Phase 14B

- Review the two-file incremental patch, shared normalized security view, script-mixing trade-off and negative declaration fallback.
- Accept the full passing regression and source-integrity evidence without treating known diagnostic examples as unseen questions.
- Freeze this candidate's exact source/test/content hashes and an independently authored rubric/question set before any answers are collected. Preserve v7; any future evaluator change must be separately versioned and validated, not tuned to raise scores.
- Use the Phase 13 evaluation design as the starting point: fresh questions independent of implementation rules, exact-source checks across all 19 assets, Hindi/Hinglish/English extraction, product replacement/correction/follow-up scenarios, safety/access/isolation cases and adequate identified model-origin coverage.
- Include fresh compatibility-character, mixed-script, invisible-character and remembered-state negative controls plus real positive names. Do not copy this review's synthetic strings into the blind denominator.
- Publish every failure, changed answer, fallback, repair, skip and provider invocation. Do not select retries by score or rewrite expected slots after seeing responses.

Any newly discovered safety regression requires an immediate stop and separate evidence. No deployment, production request or Phase 14B run is authorized or performed by this review.

## Workspace and package integrity

The baseline contains hashes for 523 existing files, including the prior Phase 14A evidence/ZIP, Phase 12/13 artifacts, source, tests and configuration files. Only the two intended existing source files changed; the other 521 protected files retained their hashes. The one new source-tree file is the safety test. The repository index and unrelated user changes are preserved. Review files and temporary PDF tooling are separate artifacts.

`evidence/changed_files.json` and `evidence/code_changes.patch` identify the exact incremental change. `evidence/final_integrity.json` verifies the protected files, final source hashes and test evidence. `integrity_manifest.json` records bundle-member hashes; the external ZIP SHA-256 file avoids self-referential archive hashing. The bundle includes complete logs, before/after safety evidence, final source/test copies and the local comparison PDF required by `AGENTS.md`.

Stop point: review packaged. Await review before any next phase.
