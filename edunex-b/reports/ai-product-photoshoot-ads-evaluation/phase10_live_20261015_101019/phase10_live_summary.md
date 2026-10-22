# Phase 10 blind live validation

Actual application-pipeline results: **51/80 PASS (63.75%)**, **29 FAIL**, **0 SKIPPED**, **0 INCONCLUSIVE**, **0 provider fallbacks**. All original frozen definitions were executed once. No response-informed changes, repeated trials, application fixes or evaluator edits were made.

| Set | Passed | Failed | Skipped | Inconclusive | Accuracy |
|---|---:|---:|---:|---:|---:|
| New unseen questions | 21/50 | 29 | 0 | 0 | 42.0% |
| Existing coverage regressions | 30/30 | 0 | 0 | 0 | 100.0% |
| Combined | 51/80 | 29 | 0 | 0 | 63.75% |

There are 96 user-facing turns: **75 local**, **20 live model**, **0 repaired model**, **1 validation replacement**, **0 fallback**. Of the 20 live-model-origin turns, 11 are byte-identical to the captured upstream text and nine have citation-marker cleanup. The replacement prepends Lesson 02 and preserves the complete model body; it is not counted as an unchanged live-model response. No language repair provider request occurred.

All 21 scored provider calls and the separate connectivity probe returned HTTP 200. These 22 calls, not 80, are the actual provider-call denominator. Median end-to-end turn latency is 8 ms (mostly local); range 2–9,928 ms. See raw per-turn latency for meaningful model comparisons.

The independent precommitted audit passed **28/35 complete requested templates (80.0%)**, failed seven. All 20 existing checks pass; eight of 15 unseen checks pass. Seven failures involve five unrecognized product declarations, one stale-product switch and one lost part/colour pair. V6 independently fails only one of these prompt dimensions: the seven whole-case FAILs must not conceal shared product-parser blind spots. Three extra full source quotations in workflow responses were also audited: two pass, one retains a known placeholder with an explicit manual-fill explanation. Across all 38 complete template exposures, 30 pass and eight fail; the extra three were discovered after execution and are reported separately from the frozen denominator.

Agent review identified **9 critical failure cases: 7 requested-template failures and 2 advertising-grounding failures** (unseen_027 and unseen_043 invent benefits or included items). No affirmative fake-customer testimonial, medical cure or earnings guarantee was observed. The v6 safety dimension passes 96/96; that is a false assurance for unverified product benefits and is not the manual safety conclusion.

V6 language checks pass **93/96 turns (96.875%)**: English 67/67, Hindi 13/13, Hinglish 13/16. All three recorded Hinglish failures are judged false failures of brief valid wrappers by semantic review. This does not prove unrestricted multilingual accuracy.

Of 30 turns predeclared as likely model tasks, 13 actually call the provider. Some local creative answers/refusals are appropriate, but several compound/ambiguous requests are wrongly captured by one local topic. See delegation_audit.json; all requests and debug selection reasons are preserved. All 15 turns that omit client history restore their server-side conversation history, yet structured entity/price/intent retention still fails in several cases. Restoration alone does not establish correct continuity.

Backend regressions: **296/296 PASS**. Evaluator tests: **147/147 PASS**. No existing-course regression was detected locally. All eight lessons and 19 source templates remain accessible with unique chunk identifiers.

Previous Phase 8: 86/100 with v5; saved Phase 8 answers regraded with v6 also 86/100. The matched 30-case subset is 30/30 both historically and freshly. The new 50-case set differs and is much more demanding; the headline score difference is not a controlled paired estimate. Historical scores and raw answers remain untouched.

Manual review separates 7 pure false failures, 3 mixed failures, 19 other genuine frozen failures, 6 false passes, 2 borderline passes and 43 reviewed passes. Two frozen new definitions incorrectly demand Veo settings where approved L06 uses Omni 1.1 Flash; these authoring errors are disclosed without altering the 51/80 score. There is no post-hoc adjusted headline score.

**Readiness: NOT READY.** Overall, unseen, template and advertising-grounding targets fail. No deployment, commit, push, infrastructure modification or new application build occurred. This is an agent-authored and agent-reviewed evaluation using unchanged actual route logic with synthetic account/course/entitlement fixtures and in-memory persistence, not a separate human blind panel or deployed production test.

