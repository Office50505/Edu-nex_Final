# Skillomate Chatbot Failure Analysis — Independent Review

Packaged: 2026-10-15T11:05:15+05:30
Course: AI Product Photoshoot & Ads. Saved live run: 14 October 2026, approximately 18:28–18:46 IST, including two retry passes. Provider label: fal-openrouter; configured model: google/gemini-2.5-flash.

## Verified counts

- All 55 unique evaluation IDs are accounted for: 47 single-turn and 8 two-turn cases.
- Original rubric: 18 passed; 37 failed **including the 2 skipped cases**; reported score 32.7% (18/55).
- Mutually exclusive execution outcomes: **18 passed + 35 completed failures + 2 skipped = 55**.
- Skipped: ppads_conv_003 and ppads_conv_006. Each has a recorded fallback on turn 1; turn 2 was never executed.
- Inconclusive root-cause attribution: **2 cases**, ppads_038 and ppads_043, already included in the 35 completed failures. This is not an additional execution outcome. The two skipped cases also have unobserved live model behavior.
- Of 63 planned turns, 59 have provider-labeled live answers, 2 have fallback answers and 2 were not executed.
- Recorded local regression evidence: **52 passed, 0 failed, 0 skipped**. This packaging task did not rerun it.

## Included files

| File | Role |
| --- | --- |
| failure_analysis_detailed.md | Existing full per-case analysis, questions, actual answers, expected behavior, causes and proposed corrections. |
| failure_categories.json | Existing machine-readable categories, 37 non-passing case records, all-55 coverage index, source hashes and attribution limits. |
| recommended_fixes.md | Existing recommendations only; no implementation was performed. |
| live_merged_raw_results.json | Canonical 55-case application-returned answer corpus after retries, with provider/status/debug metadata. Start here. |
| live_raw_results.json | Original first-run attempt evidence; includes duplicate bookkeeping records. |
| live_retry_raw_results.json | First retry evidence; also includes some duplicate bookkeeping records. |
| live_retry2_raw_results.json | Second retry evidence. |
| live_merged_graded_results.json | Original rubric outcomes and failed checks, preserved unchanged. |
| product_photoshoot_ads_test_cases.json | Original questions, conversation turns and expected checks for all 55 cases. |
| grade_product_photoshoot_ads_results.py | Original grader source for inspection; it was not run for this packaging task. |
| knowledge/ai-product-photoshoot-ads/training.txt | Current approved-source transcript used to inspect course facts and templates; not a historical model-request snapshot. |
| live_evaluation_summary.md | Historical run summary; its safety/isolation aggregates are qualified by the later analysis. |
| live_evaluation_summary_data.json | Historical machine-readable run/regression summary. |
| regression_evidence.md | Historical recorded 52/52 local test outcome. |
| provider_connectivity_report.md | Historical connectivity/timeout observations, without credentials. |
| README.md | Packaging scope, counts, inventory and limitations. |
| evidence_manifest.json | Original source locations, SHA-256 hashes, byte sizes and verification summary; includes all other files, excluding itself. |

## Evidence provenance and verification

The three requested reports were found under:
`edunex-b/reports/ai-product-photoshoot-ads-evaluation/live_20261014_182739/`

Older top-level evaluation reports and previous review ZIPs describe an earlier blocked run and were excluded. The newer merged corpus contains nonempty saved application answers labeled fal-openrouter for 53 completed cases, plus explicitly marked fallback evidence for the two skips. Every original question and graded answer matches its raw record; every merged result matches its declared original/retry source. All 37 non-passing analysis records preserve the corresponding raw response text. Existing source hashes in the analysis were also verified. These consistency checks support saved live-evaluation evidence, rather than placeholder-only results; no new answers or outcomes were fabricated. They do not independently authenticate the external provider calls.

All copied source files are byte-for-byte unchanged. The ZIP contains only the explicit inventory above. No environment files, API keys, credentials or learner-data exports were collected. Selected text was scanned for credential formats and contact data; the saved course/object identifiers are evaluation fixture identifiers. Report text may name credential environment variables, but contains no credential values.

## Missing evidence and known limitations

- No live model response exists for the two skipped conversations, and their follow-up turns were not executed. These gaps were not filled or invented.
- Raw upstream provider request/response envelopes, full historical model prompts/excerpts, token usage/finish reasons and detailed upstream error logs are unavailable. Saved application HTTP 200 may represent fallback, not provider success.
- No immutable evaluation-time application-code/configuration snapshot is included. Current source/transcript inspection cannot prove exactly which excerpt bytes reached the model. Two source-availability failures therefore retain inconclusive causal attribution.
- The historical summary has literal-scoring errors. The later analysis identifies seven clear false failures plus mixed cases; no corrected global pass rate or production-readiness claim is made.
- Initial/retry files contain duplicate bookkeeping records; they are not additional test cases. Use the 55-ID merged corpus and preserve attempt provenance.
- The 52/52 regression result is a saved mocked/local test report, not a newly observed test execution or proof of live model quality. Original console output is not included.

Packaging only: no chatbot/evaluator/knowledge edits, failure fixes, test or evaluation reruns, provider requests, deployment, commit or push. Existing reports were not overwritten.
