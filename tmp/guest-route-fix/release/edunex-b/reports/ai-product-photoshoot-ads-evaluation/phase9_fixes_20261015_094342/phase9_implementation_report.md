# Phase 9 implementation report

Implementation and local validation completed 2026-10-15T10:03:07.628433+00:00. No new live evaluation or provider request.

## Actual verification

| Check | Result |
|---|---:|
| Backend AI tutor regressions | 296/296 passed; 0 failures/skips |
| Evaluator regressions | 147/147 passed; 0 failures/skips |
| New targeted checks | 75/75 (57 backend + 18 evaluator/auditor) |
| Additional v5 compatibility executions against v6 | 18/18, included in evaluator total |
| Independent full-template local replay | 35/35, all 19 headings |
| Three Phase 8 critical templates | 3/3 corrected locally |
| Independent audit of unchanged Phase 8 template text | 32/35; same three historical failures |
| Historical Phase 8 text regraded with v6 | 86 passed / 14 failed; not new runtime quality |
| External provider requests | 0 |

## Implemented changes

- Explicit source-aware response selection keeps literal templates, access/safety boundaries, recorded facts and simple conservative drafts local. Open reasoning and compound/full-journey questions go to the existing model with the relevant source set.
- Complete/original request recognition and overlapping product candidates correct all three critical literal failures. Known names are substituted in every product slot; actor/clothing unknowns remain placeholders. Unknown asset headings prompt clarification rather than an unrelated summary.
- Phone enters-shot and Hinglish visibility paraphrases return the exact recorded FAQ. Colour-changing intent is separated from descriptive colour. Exact settings no longer choose arbitrary troubleshooting FAQ. Recall shortcuts require past-fact intent. No new course facts were added.
- Same-user/course/conversation message restoration occurs only after current entitlement and product scope are validated. It supports legacy sessions, omits expired/foreign history, and retains reasoning context when client history is absent. Known user facts remain separate from untrusted assistant context. Optional stored language supports minimal continuations; fresh explicit language wins.
- Validation retains safe relevant content, recognizes scoped prohibitions, preserves a supported lesson on referring alternatives, and uses one bounded language repair when local source text cannot express the task. Failure is explicit and retains the original as reference; v6 cannot score it as complete. Repaired/replaced answers remain non-live provenance.
- New v6 fixes documented scoring implementation errors while preserving v5 and historical criteria. The independent auditor validates complete original source bodies and predeclared slots without reusing runtime parsing.

## Modified and added source files

- `routes/ai.js` (modified)
- `services/aiTutorService.js` (modified)
- `services/tutorKnowledge.js` (modified)
- `services/productTutorKnowledge.js` (modified)
- `services/productTutorResponse.js` (modified)
- `models/AiTutorSession.js` (modified)
- `tests/ai-chat-history.test.cjs` (modified)
- `scripts/eval/README.md` (modified)
- `services/productTutorIntent.js` (added)
- `scripts/eval/grade_product_photoshoot_ads_results_v6.py` (added)
- `scripts/eval/audit_product_templates.py` (added)
- `tests/product-tutor-phase9.test.cjs` (added)
- `tests/test_product_evaluator_v6.py` (added)

`phase9_changes.patch` is against captured pre-Phase-9 workspace snapshots, not repository HEAD. It excludes unrelated existing work. All before/after hashes are in phase9_validation_manifest.json. The source package includes changed files and necessary references. The only existing regression assertion adapted is the ambiguous wrong-language fixture: it now checks one bounded repair and truthful incomplete-reference behavior instead of assuming one transport call and discarding all original text. No safety/access/other-course requirement was removed.

## Critical repair evidence

- phase8_unseen_001: full Product Sheet body now contains the supplied obsidian ring dish in every product slot.
- phase8_unseen_005: complete Character Sheet body is returned with the man slot; no short workflow substitute.
- phase8_unseen_006: complete Hands close-up body contains the supplied quilted binocular wrap; legitimately missing actor/clothing details stay unset.

These IDs occur only in evidence/report replay selection, never runtime branches. The 35 independent literal comparisons preserve the pre-Phase-8 expectations and original training source. Generalized tests use different products and phrasings.

## Historical scoring investigation

| Case | Frozen v5 | New v6 on same old text |
|---|---|---|
| phase8_unseen_001 | passed | failed |
| phase8_unseen_006 | passed | failed |
| phase8_unseen_016 | failed | passed |
| phase8_unseen_024 | passed | failed |
| phase8_unseen_040 | failed | passed |
| phase8_unseen_047 | failed | passed |

Three cases improve because they were false failures; three drop because they were false passes. Both totals are 86/100. Missing lesson requirements and all complete-template/FAQ constraints remain valid. No score inflation or historical output rewrite occurred. The initial v6 draft incorrectly treated entire in a negated saved-prompt request as literal intent; an independent corpus review and new negative control fixed it. That early 85/100 draft output is retained as development evidence.

## Preserved scope

All eight lessons, nineteen template bodies, raw training text and guidance facts remain unchanged in 53 unique records. V5 is unchanged. All 432 captured historical artifacts and 7 prior review ZIPs retain their hashes. AI Influencer and AI Filmmaking regression coverage passes. No production infrastructure, endpoint, secret, business pricing or entitlement rule was changed.

## Remaining boundary

Seventeen previously reviewed cases have local routing diagnostics. Model-required turns are explicitly not executed, so these dispositions are not scored as repaired live answers. Fresh generation quality, model repair success under real latency, production auth/database/load and broader unseen generalization remain unmeasured. See phase9_remaining_issues.md.
