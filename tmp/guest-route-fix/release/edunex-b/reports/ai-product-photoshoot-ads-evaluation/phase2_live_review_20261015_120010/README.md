# Skillomate Phase 2 live review package

New evaluation: `phase2_live_review_20261015_120010`, 2026-10-15T06:32:54.323Z–2026-10-15T06:33:30.959Z UTC.

## Environment and provider

Local Node v26.7.0 application execution via real loopback HTTP `/api/ai/chat`, Express and unchanged chatbot source. Synthetic authenticated learner/course/entitlement fixtures and in-memory conversation persistence avoid production data. Actual retrieval, prompt assembly, configured fal.run `google/gemini-2.5-flash` provider calls and response guards run. Non-course platform/account context is excluded at the outbound boundary after assembly. No environment file, key value, authorization header, personal learner data or unrelated project file is packaged.

## Counts and comparison

| Dataset | Cases | Passed | Failed | Skipped | Inconclusive | Fallback |
|---|---:|---:|---:|---:|---:|---:|
| Corrected historical baseline | 55 | 26 | 27 | 2 | 0 | 0 |
| Fresh original 55, integrated | 55 | 36 | 19 | 0 | 0 | 0 |
| Fresh held-out 15, integrated | 15 | 9 | 6 | 0 | 0 | 0 |
| Combined 70, integrated | 70 | 45 | 25 | 0 | 0 | 0 |
| Original 55, model-only | 55 | 2 | 10 | 0 | 43 | 0 |
| Held-out 15, model-only | 15 | 2 | 0 | 0 | 13 | 0 |

Combined integrated accuracy **64.3% (45/70)**. Original fresh result **36/55**, versus corrected historical **26/55**; the original rigid evaluator reported 18/55. The historical baseline and fresh model-only/integrated scopes use different origin mixes, so the +10 original passes are not a pure model-quality estimate. Earlier 55+10 evaluation artifacts are preserved and are not reused as these new responses.

Seventy scored cases cover 83 conversation turns: 22 live model answers, 61 local answers, zero semantic replacements, zero scored fallbacks. The preflight adds one real provider call outside scoring. Two explicit transport-fault drills add no external provider calls; bounded fallback diagnostics pass but generic response relevance remains weak. They are outside the 70-case score and are not provider successes or evidence of an actual outage.

## Critical failures and targets

**3 critical exact-template acceptance-gate failures**: `new15_002`, `new15_conv_001`, `new15_conv_005`. Known product slots are unresolved, malformed or replaced by an anaphoric phrase. Full-template fidelity **22/25 (88.0%)**. An additional exact troubleshooting instruction is incomplete in `ppads_039`. No affirmative advertising-safety violation or unauthorized cross-course disclosure was observed. Safety boundary checks pass within the sample; general safety is not established.

**Not production ready**: the ≥95% accuracy, 100% exact-output and zero-critical-failure targets are not met. Local regressions passed after evaluation: **117/117 Node and 25/25 evaluator tests**. Scores retain the frozen v2 output; semantic false failures and task-completion false passes are explained independently, with no retrospective score changes.

## Included reports

- `fresh_live_results.json`: all actual responses, expectations, origins, v2 dimensions, failure reasons, latency, independent flags and critical evidence.
- `fresh_live_summary.md`: results, history comparison, execution boundaries and limitations.
- `fresh_failure_analysis.md`: every failed/independently flagged case and complete 70-case ledger.
- `fresh_regression_results.md`: actual post-run commands, counts and source preservation.
- `held_out_test_results.json`: the 15 newly authored cases and all 20 held-out turns, separate from originals.
- `evaluation_readiness.md`: failed acceptance gates and evidence-based non-readiness decision.

The `evidence/` directory contains frozen test definitions, checkpointed raw application answers, v2 grades for both scopes, historical baseline, preflight and provider diagnostics, explicitly controlled fallback evidence, regression logs, source hashes and assessment scripts. None is an application change. The package integrity index records hashes. There are no new provider requests during grading, review, packaging or regression tests.

## Limitations

Synthetic authentication/database boundary; no production infrastructure testing. Only authorized course material is sent externally, with mixed-course/access checks also covered offline. One model sample per case, no observed live semantic replacement, no real outage induced. Finite v2 semantics remain imperfect and shared slot extraction misses two prompt-dimension failures. Some v2-passing answers never deliver the requested caption/angle; those are flagged instead of hidden. All prior evaluation files remain unchanged. No application fixes, deploy, commit, push, AWS change or production-readiness declaration occurred.
