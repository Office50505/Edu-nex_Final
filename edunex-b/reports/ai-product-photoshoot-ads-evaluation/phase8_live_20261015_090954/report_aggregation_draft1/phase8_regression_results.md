# Phase 8 post-evaluation regressions

Live execution completed 2026-10-15T09:13:33.117Z. Both regression suites started afterward. No tests or source were changed.

| Suite | Total | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|---:|
| node | 239 | 239 | 0 | 0 | 0 |

Started 2026-10-15T09:13:59.838425+00:00; finished 2026-10-15T09:14:00.688548+00:00; duration 0.850 seconds.

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```

| python | 111 | 111 | 0 | 0 | 0 |

Started 2026-10-15T09:13:59.838613+00:00; finished 2026-10-15T09:14:00.135997+00:00; duration 0.297 seconds.

```sh
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

Backend coverage includes all existing tutor, product-course, AI Influencer/Filmmaking, access/isolation, mobile/cache/history, multilingual, context, safety, exact-template and provider-fallback controls. There are 239 backend checks. The 111 evaluator executions comprise 77 historical checks, 18 v5 additions and 16 v4 compatibility assertions against v5; they are not 111 unique held-out scenarios.

Node real networking is denied by the existing preload. Evaluator discovery/grading performs no provider requests. Actual JUnit/unittest logs, every named outcome, timestamps and exit codes are packaged. Existing-course local regressions were not observed. No production account/database/load or other-course live evaluation occurred.

All 27 frozen source files and the runner still match their pre-response hashes. All frozen case/criteria hashes match. Historical artifact and ZIP hash preservation is recorded in evaluation_configuration.json and package integrity metadata. No code, evaluator, criteria, production resources, deploy, commit or push action occurred.
