# Phase 7 local regression results

Final execution: backend 2026-10-15T08:55:52.473890+00:00 to 2026-10-15T08:55:53.266700+00:00; evaluator 2026-10-15T08:55:52.474026+00:00 to 2026-10-15T08:55:52.699982+00:00. Both exited 0. Local macOS, Node v26.7.0, Python 3.14.6. Real networking denied for Node by `tests/helpers/deny-network.cjs`; Python graders have no network/provider imports or calls. No credentials are loaded by these checks.

## Actual totals

- Backend: **239 passed, 0 failed, 0 skipped**. All 191 existing checks preserved. The additional 48 comprise 46 service tests and two application-route tests.
- Evaluator: **111 passed, 0 failed, 0 skipped**. 77 historical checks, 18 new tests and 16 unchanged v4 assertions against v5. Compatibility executions are not new independent scenarios.
- New unique targeted assertions: **66 passed, 0 failed**; these are included in suite totals.
- Exact-template local replays: **36/36**, all 19 headings, normalized whitespace/quote style only. Frozen complete-body expectations are independent of runtime slot parsing.
- Five genuine failure local replays: **5/5**, six turns, each local_rule with liveModelAnswer=false; 0 live or saved-provider fixture turns.
- Historical saved-answer regrade: **95 passed, 5 failed, 0 skipped/inconclusive/fallback** under v5. Saved answers are unchanged; this is not fresh model quality.
- External provider requests: **0**.

## Executed final commands

The verified validation runner records exit codes, start/end, duration and every named test. For the Node command, the environment was `NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs`.

```sh
node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```

```sh
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

```sh
node /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/offline_replays.cjs /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/final_replays_v2
```

```sh
python3 -B scripts/eval/grade_product_photoshoot_ads_results_v5.py --tests /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/final_replays_v2/offline_root_cause_test_definitions.json --results /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/final_replays_v2/offline_root_cause_responses.json --scope end_to_end --out /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/final_replays_v2/offline_root_cause_grades.json
```

```sh
python3 -B scripts/eval/grade_product_photoshoot_ads_results_v5.py --tests /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase6_live_20261015_082922/all_test_cases_frozen.json --results /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase6_live_20261015_082922/application_raw_results.json --scope end_to_end --out /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase7_fixes_20261015_084551/phase6_saved_response_regrade_v5_verified.json
```

## Coverage

The backend run includes conversation history, paid access, user/course/session isolation, provider timeout/connection/fallback provenance, existing AI Influencer and AI Filmmaking retrieval, mobile course access/cache, 8 lessons/19 templates, substitutions, multilingual prose, context retention, safety and concrete deliverables. Route dependencies (auth/database/provider) are synthetic local fixtures; these are real route-handler checks, not production end-to-end verification.

## Earlier executions retained

- validation_attempt1: 229/231 backend; 107/108 evaluator. Two new overview assertions omitted an equivalent learning-outcome phrase; one new v5 unknown-slot control exposed fallback parsing that accepted unknown.
- validation_attempt2: 232/233 backend; 108/108 evaluator. The new named whole-course route test exposed title masking that left whole the course; fixed by masking to course.
- validation_attempt3: 233/233 backend and 109/109 evaluator. Added an independent anaphora control; all passed.
- final_validation: 238/238 backend and 109/109 evaluator. Added product-adjective/video, Hindi/Hinglish consistency and referring-tray controls; all passed.
- final_validation_v2: final 239/239 backend and 111/111 evaluator. Added informational-versus-deliverable and known-product demo controls; all passed.

The early saved-corpus v5 regrade was 94/100 because the independent grader stripped that before validating anaphora, incorrectly replacing a Hindi name with a clause about a clip. The new negative control fixed that evaluator defect; final regrade is 95/100. Earlier outputs remain available, unmodified. Tests were rerun only after source/test changes or unresolved failures.

No existing-course regression was observed locally. No external provider run, deployment or production modification occurred.
