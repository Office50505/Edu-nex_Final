# Phase 2 live evaluation

Run: 2026-10-15T06:22:42.989Z to 2026-10-15T06:23:04.546Z (UTC, 15 October 2026). Backend: `/Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b`. Provider: `fal.run`, model `google/gemini-2.5-flash`. No deployment, commit, push, production resource changes or chatbot code changes occurred.

All original **55 cases / 63 turns** and **10 held-out cases / 12 turns** completed. The held-out definitions were frozen before execution; they cover bamboo toothbrush, ceramic oil dispenser, soy candle jar, recycled-paper notebook and tea tin examples, Hindi/Hinglish paraphrases, truthful advertising and course context.

## Frozen v2.2 scores

| Scope | Cases | Passed | Failed | Skipped | Inconclusive | Provider fallback |
|---|---:|---:|---:|---:|---:|---:|
| Corrected historical baseline, model-only | 55 | 26 | 27 | 2 | 0 | 0 |
| Fresh original, integrated tutor | 55 | 38 | 17 | 0 | 0 | 0 |
| Fresh held-out, integrated tutor | 10 | 7 | 3 | 0 | 0 | 0 |
| Fresh original, model-only | 55 | 3 | 8 | 0 | 44 | 0 |
| Fresh held-out, model-only | 10 | 0 | 1 | 0 | 9 | 0 |

Integrated original score: **69.1%**, versus historical **47.3%** of all 55 cases: +12 passes / +21.8 percentage points. This compares delivered tutor behavior with saved historical model answers, with a materially different origin mix; it is **not a model-only improvement estimate**. Combined original plus held-out integrated result: **45 passed, 20 failed, 0 skipped, 0 inconclusive, 0 fallback**. The held-out score is 70.0% and is not part of the original 55-case comparison.

Historical-to-fresh case transitions: 21 pass→pass, 16 fail→pass, 11 fail→fail, 5 pass→fail, 1 skipped→pass, 1 skipped→fail. The five pass→fail IDs are `ppads_017`, `ppads_022`, `ppads_041`, `ppads_047`, `ppads_conv_004`; several include evaluator false negatives, described in the failure report. Scores remain unadjusted.

## Provenance and provider evidence

| Set | Cases | Turns | Live-model turns | Local-handler turns | Semantic replacements | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| Original | 55 | 63 | 16 | 47 | 0 | 0 |
| Held-out | 10 | 12 | 3 | 9 | 0 | 0 |
| Total | 65 | 75 | 19 | 56 | 0 | 0 |

All **19 real provider requests returned HTTP 200**, each on its first attempt. Fifteen raw model texts equal the delivered answer byte for byte; four (`ppads_018`, `ppads_022`, `ppads_040`, `ppads_047`) received the application's source-citation cleanup only. The raw upstream text and delivered text are both retained. No safety/language replacement of a provider answer was triggered. Local safety refusals are local rules under `course-knowledge-rule`, not model answers or post-provider replacements. The model-only rubric leaves local turns inconclusive; a failing live turn can still make a mixed conversation fail.

The initial, separately recorded connectivity probe encountered sandbox `ENOTFOUND` twice and returned a real fallback. It is excluded from evaluation scores. The authorized network run then succeeded. Both diagnostic records are retained; no fallback was promoted to live success.

Application latency, including route/retrieval/provider/validation: all-turn median 3 ms, maximum 4,449 ms. Local and live latency distributions are separate in `fresh_live_results.json`; local speed is not reported as model latency.

## Previously skipped conversations

`ppads_conv_003`: both turns completed as local knowledge answers; integrated v2 result **passed**. `ppads_conv_006`: local safety refusal then one live-model alternative; both turns completed; integrated v2 result **failed**. Its refusal/demo meaning is safe despite semantic scoring misses, while independent review identifies unsupported/reversed S1/S2 prompt labels. Neither conversation was skipped.

## Independent flags and remaining defects

Delivered-response review observed **0 affirmative advertising-safety violations, 0 actual language mismatches, 0 cross-course retrieval/scope failures**, and **1 exact-template slot failure** (`heldout_conv_001`, turn 2: “the a tea tin”). These findings are separate from the finite v2 language rubric, which falsely rejects two original Hinglish turns and one held-out turn. Exact-template and language results do not excuse the content failures.

Confirmed remaining issues include wrong Lesson 08 local workflow selection, undercomplete prerequisite/overview answers, missing lesson labels, repeated Hindi follow-up guidance, over-clarification instead of requested fact-limited ad copy, and generic FAQ selection for a dark-premium recovery request. Short Hinglish and several valid semantic paraphrases still produce evaluator false failures. The detailed report quotes all failed case responses, original expectations, source/debug evidence and recommended general corrections. No answers, grades, requirements or implementation code were changed after viewing results.

## Validation and boundaries

Post-run regressions: **117/117 Node tests** and **25/25 evaluator tests**, zero failures or skips. These include AI Influencer/AI Filmmaking retrieval behavior, product templates, multilingual/multi-turn responses, advertising guards, entitlement isolation and bounded provider error behavior. Tests used the deny-network guard or the offline Python evaluator. Logs and commands are in `fresh_regression_results.md`.

The actual registered chat route and middleware execute in-process with synthetic auth, a source-derived product course fixture, active synthetic entitlement and in-memory conversation persistence. Real routing, retrieval, prompt assembly, live provider adapter and response guards are unchanged. This is not a production HTTP/auth/database validation. To honor course-only provider authorization, the transport removes assembled static platform/payment context, learner summaries and platform retrieval before transmission; tutor instructions, course excerpts and test conversation remain. No real learner record, production database, credential value, unrelated file content or other-course lesson material was sent.

The evaluation is one sample per case. Safety/guard replacements were not triggered by the observed model outputs, so their replacement path is supported by offline regressions rather than fresh live replacement examples. Isolation is checked against product-only retrieval plus existing mixed-course offline tests; no other course material was sent to the provider. The evaluator remains a finite semantic rubric requiring human adjudication. Historical files and all hashed application/test sources match their pre-run hashes.

## Evidence

- `fresh_live_results.json`: actual answers, upstream texts, dimension grades, origins, latency, provider diagnostics, expectations and independent flags.
- `application_raw_results.json`: checkpointed application responses before grading.
- `original_test_cases.json`, `held_out_test_cases.json`: pre-run definitions.
- `original_end_to_end_grades.json`, `held_out_end_to_end_grades.json`, `original_live_model_grades.json`, `held_out_live_model_grades.json`: unchanged offline v2 outputs.
- `execution_manifest.json`, `preservation_verification.json`: fixtures, boundary disclosure and source/artifact hash evidence.
- `connectivity_probe.json`, `evaluation_runner.cjs`: sandbox diagnostic and actual assessment harness. The harness contains no key values.
