# Post-evaluation regression evidence

Live evaluation finished at `2026-10-15T06:33:30.959Z`. Both local suites began afterwards and ran concurrently.

| Suite | Started UTC | Completed UTC | Passed | Failed | Skipped | Exit |
|---|---|---|---:|---:|---:|---:|
| Node AI tutor/retrieval/product/mobile | 2026-10-15T06:33:49.334080+00:00 | 2026-10-15T06:33:49.893568+00:00 | 117 | 0 | 0 | 0 |
| Python v2 evaluator | 2026-10-15T06:33:49.335273+00:00 | 2026-10-15T06:33:49.460883+00:00 | 25 | 0 | 0 | 0 |

Executed from `/Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b`:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p test_product_evaluator.py -v
```

Exact grading/regression orchestration is retained as `grade_and_run_regressions.py`. It calls the unchanged v2.2 `regrade` function for original/held-out packs and `end_to_end`/`live_model` scopes; approved full prompt bodies come from `templates_from_source(training.txt)`. These are offline saved-response grades, not extra provider requests. No evaluator rule or test expectation was modified after responses were observed.

Coverage includes AI Influencer/AI Filmmaking retrieval and follow-ups; product knowledge integrity, 8 lessons and 19 templates; exact known/unknown slots; English/Hindi/Hinglish and multi-turn behavior; advertising safety, course/entitlement isolation; mobile AI history/context; and bounded timeout/connection/rate-limit/invalid-response provider paths. The Node deny-network preload prohibits external provider calls. Python evaluator tests are offline. Regression external provider requests: **0**.

Two supplementary actual-HTTP fault drills separately validate fallback labeling, bounded retries, distinct diagnostics and the saved-guidance notice. Their generic answer relevance remains insufficient; their fault events are not actual fal.run outages.

Application, knowledge, original test pack, evaluator and regression source hashes match all 19 pre-run captured hashes. All 45 captured earlier evaluation/improvement files retain their hashes. No source code, production data or historical report was modified. Saved evidence: `node_test_output.log`, `evaluator_test_output.log`, execution metadata files and `preservation_verification.json`.

Passing regressions do not establish the requested live targets. The actual fresh integrated score remains 45/70, with 3 critical full-template gate failures and additional reported quality/evaluator defects. Production authentication/database infrastructure and full mixed-course live inference were outside this synthetic-data assessment.
