# Phase 12 actual regression execution

Backend: **351/351 PASS**, 0 failed, 0 skipped, exit 0. Evaluator: **167/167 PASS**, 0 failed, 0 skipped, exit 0.

After both live sets completed, commands were executed through regression/run_verified_validation.py:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/product-tutor-phase11.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

Backend: 2026-10-15T11:04:39.315012+00:00 to 2026-10-15T11:04:40.240835+00:00. Evaluator: 2026-10-15T11:04:39.315978+00:00 to 2026-10-15T11:04:39.650258+00:00. Raw JUnit XML, unittest output/stderr and per-test status/commands are included. Node external networking is denied; injected provider fixtures test route behavior. Regression execution makes zero external-provider requests.

These are the unchanged Phase 11 suites, including existing AI Influencer/AI Filmmaking and mobile/access/history isolation controls. No existing-course local regression was observed. This is not live generation for the other courses, production database persistence, browser UI or load validation.

The local 35/35 Phase 11 template replay is historical local evidence. It is not the fresh Phase 12 result: 20/24 fresh requested-template checks pass. Passing evaluator unit tests also does not eliminate the independently observed scoring errors. No implementation, evaluator, test or historical artifact was changed during this run.

