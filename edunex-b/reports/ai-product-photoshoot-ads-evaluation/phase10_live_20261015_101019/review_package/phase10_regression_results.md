# Phase 10 regression execution

After both evaluation sets completed, the existing suites ran against unchanged Phase 9 sources. Backend: **296/296 PASS**, 0 failures/skips, exit 0. Evaluator: **147/147 PASS**, 0 failures/skips, exit 0.

Backend command:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```

Evaluator command:

```sh
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

Executed via `python3 -B reports/ai-product-photoshoot-ads-evaluation/phase10_live_20261015_101019/regression/run_verified_validation.py`. Started 2026-10-15T10:14:27.776032+00:00 (backend) / 2026-10-15T10:14:27.776875+00:00 (evaluator); completed 2026-10-15T10:14:28.574558+00:00 / 2026-10-15T10:14:28.050758+00:00. Raw JUnit XML, unittest output, stderr, commands and per-test statuses are included in regression/. Both exits are 0; regression runs made no external-provider calls. Backend network is denied by the existing test helper.

Existing AI Influencer/AI Filmmaking course access/history/knowledge/mobile behavior is covered by the existing suites; no local regression was detected. This does not mean fresh live answers for those courses were evaluated. Tests were not modified to fit Phase 10 results. Application code, v6, 566 historical evidence files and prior ZIPs remain unchanged as recorded in post_evaluation_integrity.json.

Live audit and local regression are different: seven of 35 precommitted full-template checks fail on fresh user-facing answers despite all local tests passing. Do not report the earlier Phase 9 35/35 local replay as a Phase 10 live result.

