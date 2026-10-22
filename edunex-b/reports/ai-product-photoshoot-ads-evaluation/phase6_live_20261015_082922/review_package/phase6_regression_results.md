# Phase 6 post-live regression results

| Suite | Total | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|---:|
| node | 191 | 191 | 0 | 0 | 0 |

Started 2026-10-15T08:32:45.699323+00:00; completed 2026-10-15T08:32:46.518273+00:00; duration 0.819 seconds.

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```
| python | 77 | 77 | 0 | 0 | 0 |

Started 2026-10-15T08:32:45.699667+00:00; completed 2026-10-15T08:32:45.942806+00:00; duration 0.243 seconds.

```sh
python3 -B -m unittest discover -s tests -p test_product_evaluator*.py -v
```

Both suites started after live execution completed. The seven existing backend AI tutor files cover course compatibility/isolation, entitlement restrictions, conversation/history/mobile, provider diagnostics, multilingual behavior, safety and exact templates. Evaluator tests comprise the unchanged historical suites plus v4 controls and compatibility executions. No test was removed or changed during this run.

Node networking was denied with the existing preload; Python evaluator tests and grading make no provider calls. JUnit/unittest logs and per-case execution metadata are included. Current source hashes match preflight and the Phase 5 manifest.

All 191/77 unit checks pass, but ppads_001 is a demonstrated product-course behavior regression and new paraphrases reveal uncovered failures. Passing unit totals alone do not satisfy the no-functional-regression deployment target. No production account/database or load test ran.
