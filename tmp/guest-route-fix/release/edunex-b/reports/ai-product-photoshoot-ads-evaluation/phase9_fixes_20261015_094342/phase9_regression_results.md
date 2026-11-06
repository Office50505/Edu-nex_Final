# Phase 9 executed local regressions

All provider interactions are local fixtures; Node real networking is denied by the existing preload. Python graders/auditor are offline.

| Suite | Total | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|---:|
| Backend | 296 | 296 | 0 | 0 | 0 |

2026-10-15T10:00:22.174491+00:00 to 2026-10-15T10:00:22.939999+00:00; 0.765 seconds.

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```

| Evaluator | 147 | 147 | 0 | 0 | 0 |

2026-10-15T09:57:59.021343+00:00 to 2026-10-15T09:57:59.171630+00:00; 0.150 seconds.

```sh
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

The 57 new backend cases comprise 45 service contracts and 12 route contracts. The 147 evaluator executions comprise 111 existing checks, 18 new Phase 9 checks and 18 unchanged v5 checks run against v6. New unique targeted cases: 75/75, included in the suite totals. No sum combines unit tests with replay bodies.

## Offline replay/audit commands

```sh
node /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/offline_phase8_replays.cjs /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/verified_replays
python3 -B scripts/eval/audit_product_templates.py --expectations /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954/independent_template_expectations_frozen.json --results /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/verified_replays/offline_template_responses.json --knowledge knowledge/ai-product-photoshoot-ads/training.txt --out /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/verified_replays/independent_local_template_audit.json
python3 -B scripts/eval/audit_product_templates.py --expectations /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954/independent_template_expectations_frozen.json --results /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954/application_raw_results.json --knowledge knowledge/ai-product-photoshoot-ads/training.txt --out /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/independent_historical_template_audit.json
python3 -B scripts/eval/grade_product_photoshoot_ads_results_v6.py --tests /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954/all_test_cases_frozen.json --results /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954/application_raw_results.json --scope end_to_end --out /Users/arslanalimansoori/Desktop/hrhrhrrhrhr/Untitled/edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase9_fixes_20261015_094342/phase8_saved_response_regrade_v6_final.json
```

Actual outcomes: local full bodies 35 passed / 0 failed; historical full bodies 32 passed / 3 failed; historical v6 regrade 86 passed / 14 failed / 0 skipped/inconclusive. Seventeen-case routing diagnostics include model_required_not_executed; no actual future model answer is invented.

## Coverage and retained development evidence

Existing suites cover AI Influencer/Filmmaking, access, course/session isolation, mobile/cache/history, provider timeout/connection/fallback, multilingual, safety and exact prompts. Added checks cover nested product phrases, complete Character Sheet requests, full-body mutation, source/known-slot independent audits, compound/model routing, complete workflow references, malformed-asset clarification, saved reasoning messages, access expiry, cross-user/conversation/course boundaries, legacy sessions, current language and context-aware replacement.

Earlier local executions remain in their own directories: attempt1 237/239 backend and 111/111 evaluator; attempt2 280/285 backend and 142/143 evaluator; attempt3 285/285 and 144/144; attempt4 288/290 and 145/145. Subsequent passing stages add security, intent and completion controls. final_backend_validation had one failure from adding a lesson label to a fresh comparison merely because a language phrase appeared; it was corrected to require actual inherited lesson context. Final backend 296/296 and final evaluator 147/147 evidence supersede these earlier executions. No existing report was overwritten.

The early failures exposed actual policy/negation/priority gaps and two new test-definition mistakes (a no-op mutation and an obsolete transport-count assumption). Numeric, full-template, access and safety requirements remain. Final suite components were rerun after their corresponding source changes; backend was not rerun after evaluator-only edits or vice versa. All final outcomes use current source hashes.

No fresh provider evaluation, deployment, commit, push, production data mutation or unrelated business-logic edit occurred. Passing local fixtures does not establish new live accuracy.
