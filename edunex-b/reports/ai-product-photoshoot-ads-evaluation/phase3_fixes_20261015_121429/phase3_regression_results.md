# Phase 3 local regression results

Final validated source state: `2026-10-15T07:04:11.336576+00:00`. No live provider evaluation was run.

| Suite | Actual outcome | Exit | Skipped |
|---|---:|---:|---:|
| Node tutor, course retrieval, product quality, Phase 3 and mobile/history | 153/153 passed | 0 | 0 |
| Python evaluator v2 + v3 | 43/43 passed | 0 | 0 |
| Complete saved-template local replay | 25/25 passed | 0 | 0 |
| New targeted checks within those suites | 54/54 passed | 0 | 0 |

The 54 targeted unit checks are 36 Node checks (33 in the new Phase 3 file plus 3 route/persistence checks) and 18 v3 evaluator checks. They are subsets of the full suites, not additional tests to add twice. The template replay is a separate local verification of 25 source-derived bodies and all three confirmed critical inputs.

## Commands executed from the backend

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
node reports/ai-product-photoshoot-ads-evaluation/phase3_fixes_20261015_121429/offline_template_replay_final.cjs
```

`run_verified_validation.py` captures the final suite execution and parses JUnit/Python outcomes. Node ran 2026-10-15T07:04:10.602794+00:00–2026-10-15T07:04:11.336576+00:00 UTC, duration 0.734s; Python ran 2026-10-15T07:04:10.602950+00:00–2026-10-15T07:04:10.753601+00:00 UTC, duration 0.151s. `node_verified_output.xml`, `python_verified_output.log` and execution JSON retain the actual evidence. No full-suite check is hidden behind an assumed success count.

Earlier development iterations ran the same suite subsets to resolve selector, determiner, provider-origin, motion-follow-up, contextual-negation and `showcase` false-positive failures. Saved development logs and the earlier 151/152-check runs are separate from the final 153-check results. The last added case prevents a saved product context from another active course being reused; the full suite was rerun after that change.

## Coverage and preservation

Critical root-cause tests use unseen products and independently compare complete template bodies. Additional tests cover attributes and new-product resets, selected ad angle, price/channel memory without client history, new-conversation and user/course boundaries, Lesson 08, prerequisites, exact phone instructions, Hindi movement follow-up, language switching, requested hook counts/scripts/captions/Flow prompts, honest advertising and unknown facts. Existing AI Influencer/AI Filmmaking/access/provider-error checks remain passing.

Both original v2 and new v3 evaluators are tested. The unchanged Phase 2 corpus is optionally regraded offline into a new file to demonstrate scoring differences; no saved answer or historical score is overwritten. A regrade is not a runtime or provider evaluation.

Network calls: **0 external provider requests**. The deny-network Node preload blocks actual fetch/HTTP/socket use; fixtures still exercise provider success/error/retry guards. No runtime database connection, production migration or server deployment occurred. All captured historical hashes and immutable core input hashes match. See `phase3_validation_manifest.json` and `phase3_targeted_test_results.json`.
