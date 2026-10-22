# Post-evaluation local regression results

Executed after evaluation completed at `2026-10-15T06:23:04.546Z`. Working directory: `/Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b`. These are actual new local test executions, not copied historical counts.

| Suite | Started (UTC) | Exit | Passed | Failed | Skipped |
|---|---|---:|---:|---:|---:|
| Node tutor, retrieval, product quality and mobile AI | 2026-10-15T06:23:18.711995+00:00 | 0 | 117 | 0 | 0 |
| Python v2 evaluator regression | 2026-10-15T06:23:18.711965+00:00 | 0 | 25 | 0 | 0 |

Exact Node command:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```

Exact Python command:

```sh
python3 -B -m unittest discover -s tests -p test_product_evaluator.py -v
```

Node duration reported by wrapper: 0.558s. Python wrapper duration: 0.130s. Independent commands ran concurrently after live evaluation. Logs: `fresh_node_test_output.log`, `fresh_evaluator_test_output.log`; execution metadata: `fresh_node_execution.json`, `fresh_evaluator_execution.json`.

Coverage includes the existing tutor/history behavior, AI Influencer and AI Filmmaking course retrieval and follow-ups, paid-content restrictions and mixed-course isolation; product knowledge record/template integrity, all eight lessons and nineteen templates, known/unknown product slots, Hindi/Hinglish behavior, follow-up state, safe advertising and bounded provider retry/error outcomes. The Node deny-network preload prevents external provider calls; Python evaluator tests use saved fixtures and no provider API. Real provider request count for these regressions: **0**.

## Offline evaluation commands

The saved raw responses were graded offline using the unchanged `scripts/eval/grade_product_photoshoot_ads_results_v2.py` module (`regrade(..., scope='end_to_end')` and `regrade(..., scope='live_model')`) against the frozen original and held-out packs, using `templates_from_source(knowledge/ai-product-photoshoot-ads/training.txt)`. The exact executed offline grading code is retained in `offline_grading_command.py`. Four result files retain the full v2 outputs. No external judge or additional provider calls were used for grading.

## Preservation checks

Pre-run source hashes: `execution_manifest.json`. Post-run verification: `preservation_verification.json`. All 19 captured application, knowledge, grader, original-test and regression-source hashes match. All 23 captured historical/improvement artifacts match. No historical report was overwritten. No chatbot source was modified. The new assessment harness and this report directory are assessment artifacts only.

These passing regressions do not eliminate live quality defects: the integrated v2 evaluation still has 17 original and 3 held-out failed cases, with tutor defects and evaluator false negatives separated in `fresh_failure_analysis.md`. Production HTTP/auth/database behavior, other-course live provider generations and real-world provider outage reliability were not exercised by this run.
