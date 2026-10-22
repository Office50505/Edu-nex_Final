# Phase 5 local regression evidence

| Final suite | Total | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|---:|
| Backend AI tutor | 191 | 191 | 0 | 0 | 0 |
| Evaluators | 77 | 77 | 0 | 0 | 0 |

The final backend run is in verified_validation/. The final evaluator run after tighter negative controls is in evaluator_verified/. No backend code changed after its passing run. The 54 new targeted checks are subsets of these totals; 18 additional v4 compatibility executions reuse unchanged v3 assertions.

## Actual test commands

From the backend:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p test_product_evaluator*.py -v
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/product-tutor-phase5.test.cjs
python3 -B -m unittest discover -s tests -p test_product_evaluator_v4.py -v
node reports/ai-product-photoshoot-ads-evaluation/phase5_fixes_20261015_075435/offline_replays.cjs
```

Backend started 2026-10-15T08:05:46.847638+00:00, completed 2026-10-15T08:05:47.570706+00:00 (exit 0). Final evaluator started 2026-10-15T08:07:42.169422+00:00, completed 2026-10-15T08:07:42.294018+00:00 (exit 0). JUnit, unittest output and per-test metadata are included.

The recorded run_verified_validation.py commands invoke the two full-suite commands above; the three saved full-run directories are the root run folder, final_validation/ and verified_validation/. evaluator_verified/ reruns only Python after evaluator-only negative-control changes.

## Earlier development outcomes retained

| Execution | Backend | Evaluator | Explanation |
|---|---|---|---|
| Initial targeted tool invocation | 33/34 | import error | New festive test incorrectly assumed scene order; new Python pattern had a missing quote. Both corrected. These exploratory console outputs were not persisted as separate raw logs. |
| Targeted repeat | 34/34 | 31/31 | Passed before later controls were added; not the final suite totals. |
| First saved full run | 189/190 | 74/74 | Legacy test rejected grammatical the lid. Raw logs retained in this run directory. |
| Second saved full run (final_validation) | 190/191 | 76/76 | New multilingual guard falsely flagged AI ko asli customer mat batao. Raw logs retained. |
| Verified full run | 191/191 | 77/77 | Both issues fixed; no skipped tests. |
| Evaluator-only final verification | unchanged 191/191 | 77/77 | Tightened shape/colour/demo negative controls; latest v4 saved-response regrade also retained. |

## Offline evidence checks

Complete-template replay: **29 passed, zero failed**. This compares all saved template bodies against independent Phase 4 expectations, not isolated keywords. Genuine-failure local replay: **5 passed, zero failed**, seven turns. Both are local checks separate from the 54 new unit checks and do not create a fresh live score.

The saved-response grader command uses the unchanged Phase 4 all_test_cases_frozen.json and application_raw_results.json, --scope end_to_end, the new grade_product_photoshoot_ads_results_v4.py, and an exclusive new output phase4_saved_response_regrade_v4_reviewed.json. The five-root-case grading similarly writes offline_root_cause_grades_verified.json. Neither command calls a provider.

Networking is denied by tests/helpers/deny-network.cjs for Node checks; evaluator grading/tests have no provider calls. Real credentials are not loaded for test execution. Source/course/historical hashes are in phase5_validation_manifest.json and before_manifest.json.
