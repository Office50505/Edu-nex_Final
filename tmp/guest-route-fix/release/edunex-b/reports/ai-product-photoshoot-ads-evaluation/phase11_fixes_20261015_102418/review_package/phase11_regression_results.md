# Phase 11 actual local validation

| Check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Backend tutor/history/retrieval/mobile/course suites | 351 | 0 | 0 |
| Evaluators V1–V7 and independent controls | 167 | 0 | 0 |
| New targeted subset (already included above) | 75 | 0 | 0 |
| Complete approved-template local replay | 35 | 0 | 0 |
| Saved critical advertising guard replay | 2 blocked | 0 missed | 0 |

Commands actually executed for the delivered source:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/product-tutor-phase11.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
node reports/ai-product-photoshoot-ads-evaluation/phase11_fixes_20261015_102418/verified_local_replays/replay_policies.cjs
python3 -B scripts/eval/audit_product_templates.py --expectations reports/ai-product-photoshoot-ads-evaluation/phase10_live_20261015_101019/independent_template_expectations_frozen.json --results reports/ai-product-photoshoot-ads-evaluation/phase11_fixes_20261015_102418/verified_local_replays/phase10_local_policy_replay.json --knowledge knowledge/ai-product-photoshoot-ads/training.txt --out reports/ai-product-photoshoot-ads-evaluation/phase11_fixes_20261015_102418/verified_local_replays/independent_complete_template_audit.json
python3 -B scripts/eval/grade_product_photoshoot_ads_results_v7.py --tests scripts/eval/product_photoshoot_ads_phase10_cases_v7.json --results reports/ai-product-photoshoot-ads-evaluation/phase10_live_20261015_101019/application_raw_results.json --scope end_to_end --out reports/ai-product-photoshoot-ads-evaluation/phase11_fixes_20261015_102418/historical_phase10_v7_release_regrade.json
```

The two suites ran using `verified_local_validation/run_verified_validation.py`. Backend started 2026-10-15T10:36:06.014877+00:00, ended 2026-10-15T10:36:07.123593+00:00, exit 0. Evaluator started 2026-10-15T10:36:06.015029+00:00, ended 2026-10-15T10:36:06.450017+00:00, exit 0. Raw JUnit XML, unittest output, stderr, names/statuses and commands are preserved. Network is denied for Node validation; provider responses in route tests are injected fixtures. No `.env` or live key is loaded by validation.

The original 296 backend and 147 evaluator tests all still pass; 55 and 20 new tests respectively produce the current totals. Exact, retrieval, multilingual, safety, state, course isolation and AI Influencer/AI Filmmaking preservation checks are inside these totals, not additional independent tests to add again.

Early development attempts are preserved separately. Two old behavior regressions (colour-followup and festive comparison) and new task-decomposition/grounding misses were corrected in implementation; no historical test expectation was weakened. The final raw executions pass. The pure evaluator authoring defects are corrected only in a separate V7 definition set.

A saved-response regrade is not a model call. All 80 historical cases are accounted for; 20 model-required replay turns were not generated, and no new end-to-end live accuracy is claimed. Production persistence/UI/load and live other-course generations remain outside this local validation.

