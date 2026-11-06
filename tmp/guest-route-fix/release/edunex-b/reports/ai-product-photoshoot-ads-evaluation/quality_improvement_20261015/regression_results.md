# Local regression results

Completed: 2026-10-15T11:33:12+05:30. No external provider requests. All provider results are injected fixtures; the final Node command loads tests/helpers/deny-network.cjs, which blocks fetch, HTTP(S), net factories and direct socket connects.

## Final outcomes

- **117 Node tests passed; 0 failed, skipped or cancelled.** This includes the original 52 AI tests, 8 additional route tests, 52 new source/retrieval/template/language/safety/provider checks and 5 unchanged mobile forwarding/cache tests.
- **25 Python evaluator tests passed; 0 failed.** These include all nineteen complete templates, deliberately changed/missing template clauses, unresolved/incorrect slots, multilingual paraphrases, negation, numeric-setting correctness, source invariance, provenance/duplicate handling, and fallback/local replacement classification.
- Syntax: 8 changed/new JavaScript modules/test files checked with node -c; both Python implementation/test files parsed with ast.parse. PASS.
- git diff --check: PASS. Historical hashes and the pre-task staged diff remain unchanged. The original test pack, original grader, source transcript and original live/failure reports are byte-identical.

## Final test commands

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p test_product_evaluator.py -v
```

Full final output: node_test_output.log and evaluator_test_output.log. Tests require no live model key or remote database; the route harness stubs provider fetch, model lookups and authentication/session dependencies.

Syntax commands executed:

```sh
node -c services/productTutorKnowledge.js
node -c services/productTutorResponse.js
node -c services/tutorProvider.js
node -c services/tutorKnowledge.js
node -c services/aiTutorService.js
node -c routes/ai.js
node -c tests/product-tutor-quality.test.cjs
node -c tests/ai-chat-history.test.cjs
```

Both Python source/test files were also parsed with ast.parse. No compile step changed historical artifacts.

## Baseline and development checks actually executed

| Command/check | Actual outcome and resolution |
| --- | --- |
| Network-blocked npm run test:ai before edits | 52/52 passed. |
| npm run test:ai after initial retrieval changes | 51/52 passed. A product FAQ excerpt had lesson_7 metadata but lacked the readable Lesson 07 reference expected by the existing test. The source excerpt renderer was corrected; the assertion was retained. |
| npm run test:ai after metadata correction | 52/52 passed. |
| node --test tests/product-tutor-quality.test.cjs during development | Initial 47/47 passed; coverage subsequently expanded to 52 tests. |
| Python evaluator tests during development | Initial 20 passed / 1 error: the unseen-ID duplicate fixture omitted category. The grader now treats optional category as unspecified. Then 21/21, 22/22 and final 25/25 passed as adversarial checks were added. |
| Combined original + new Node tests | 107/107 passed; then 115/115 and 117/117 after mobile, multilingual, claim and provider edge cases. The final 117/117 were repeated with the checked-in comprehensive network guard. |
| Historical offline grading during calibration | Drafts produced 24/55 and 25/55 as false unit/plural/invariance matches were calibrated. Final: 26 passed / 27 failed / 2 skipped. No scores or responses were written to historical inputs. |

Early Node runs used the same injected fixtures and /private/tmp/skillomate-offline-guard.cjs to block fetch/HTTP/net factories. The final checked-in guard additionally blocks direct socket connects. Development logs are temporary; final complete logs are preserved here.

## Preservation and practical limits

The AI Influencer and AI Filmmaking regression assertions, entitlement/store-access boundaries, selected-video context, reference hiding, history sanitization, direct approved filmmaking prompts and mobile history/cache tests all pass. These tests are local fixtures and cannot prove every live conversation or all client behaviors. No live endpoint/browser/provider check was performed. A new live evaluation remains approval-gated.

Final scope calibration adds a 25th Python test: end-to-end local-rule quality is assessable without counting a model call. Default historical grading remains live_model-only; fallback is excluded in both scopes.
