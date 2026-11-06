# Phase 7 implementation report

AI Product Photoshoot & Ads. Created 2026-10-15T08:58:08.698610+00:00. Local implementation and validation complete. No new live evaluation, provider request, deployment, commit, push or production change was performed.

## Verified results

| Evidence | Actual result | Interpretation |
|---|---:|---|
| Backend suite | 239/239 passed; 0 failed/skipped | All 191 existing checks plus 48 new checks |
| Evaluator suite | 111/111 passed; 0 failed/skipped | 77 historical checks, 18 new v5 checks, 16 unchanged v4 contracts against v5 |
| New targeted checks | 66/66 passed | Subsets of the two suites; compatibility checks not counted again |
| Complete approved-template local replays | 36/36 passed | Independently frozen full bodies, all 19 headings |
| Genuine Phase 6 failure local replays | 5/5 passed | Six actual local answer turns; no saved-provider fixture was needed |
| Preserved Phase 6 fresh evaluation | 91/100 using v4 | Historical result unchanged |
| Same saved Phase 6 responses regraded | 95/100 using v5 | Four pure false failures corrected; five old genuine failures still fail |

## Root causes and implementation

1. **Course overview routing.** Mask the complete course title during intent detection, preserving the original question for entity extraction. Recognize full-course requests before lesson-task keywords, while explicit lessons and repairs retain precedence. The source-backed English/Hindi/Hinglish overview lists all eight lessons, Google Flow, ChatGPT, CapCut, prerequisites and learning outcomes. A whole-course overview is not labeled as a single lesson. It does not add vendor/tool specifications.
2. **Product declarations and references.** Recognize called/named, name-only, Hindi product-ka-naam and Hinglish equivalents with Unicode combining marks and descriptive adjectives. Reject unset values, personal names and referring noun phrases as new declarations. A supplied name is retained through that-tray references and omitted client history. A real product change clears stale colour, person, price, channel, attributes and angle. The full approved template is rendered with known slots; unknowns stay as placeholders.
3. **Intent boundaries and troubleshooting.** Mobile/device/frame paraphrases retrieve the exact L07 phone-visibility FAQ. Phone-photo questions remain L02. English/Hindi/Hinglish product-consistency questions select the source FAQ. Word boundaries prevent promotion, arrange and orange from becoming motion/colour intents. Polished product descriptions do not become natural-UGC repair, including in video questions; polished footage and actual UGC questions still do. Explicit requested intent, rather than an arbitrary top-ranked chunk, establishes added lesson labels.
4. **Practical output.** Name-only declarations suffice for hooks/captions and conservative practice drafts. Quantity modifiers and Hindi/Hinglish counts work. Concrete demonstration requests yield three visible actions and an example spoken line, retaining the product and refusing invented experience. An empty-versus-furnished comparison retrieves the approved White Studio and Lifestyle assets, gives both scene options and a reason for each, and preserves reference appearance. These are labeled original practice examples, not new course facts or approved prompt templates. Informational questions about hooks/scripts/captions do not trigger unrelated copy generation.
5. **Language and conversation.** Language replacements use the same bounded persisted product facts and output intent. Supplied proper names may retain their script across language changes; the surrounding explanation must still match English, Hindi or Roman Hinglish. A name alone cannot establish Hindi prose. Session, user, conversation and course boundaries are unchanged and covered by existing and new route tests.
6. **Safety.** Postposed review/testimonial prohibitions are interpreted in their own clause. An unrelated disclaimer cannot excuse an affirmative synthetic-customer claim. Honest demo examples show only supplied product/reference details and never invent purchase, use, benefits or results. Requests for deceptive reviews retain refusal and can supply a safe concrete alternative when authorized course knowledge and a product name are available.
7. **Evaluator v5.** New file; v4 untouched. Independent declaration parsing recognizes Devanagari marks and anaphora. Direct demonstrate/showcase equivalents, lesson-label-before-No, scoped postposed negation and proper-name language handling correct the four pure false failures. Demo completion additionally requires visual actions, an example spoken line and known identity. Three short hooks means three actual hooks, not five. Exact FAQ sentences and complete approved template words/constraints remain strict; mutated/truncated/wrong-product templates, wrong counts, negated demonstrations and deceptive claims retain negative tests.

## Independent review of all nine Phase 6 failures

This review uses raw responses, frozen definitions and the independent full-template audit. It does not select a saved response by score. Full questions, actual answers and old/new dimensions are in `evidence/phase6_evaluator_defect_review.json`.

| Case | Finding | Saved-response v4 → v5 | Reason |
|---|---|---|---|
| ppads_001 | genuine chatbot failure | failed → failed | The complete course title falsely selected the Lesson 02 photo workflow. The source-backed complete overview is required. |
| phase6_new_002 | pure evaluator false failure | failed → passed | Hindi product-name combining marks and an explicit Hindi declaration were missing from the independent expected-slot parser. The saved full White Studio body is correct. |
| phase6_new_004 | genuine chatbot failure | failed → failed | Mobile-device paraphrase missed the phone-visibility FAQ. The required exact camera sentence is absent from the old reply; semantic paraphrases cannot satisfy a verbatim instruction. |
| phase6_new_008 | mixed genuine and scoring error | failed → failed | The product was already supplied but the chatbot asked for it again and gave zero hooks. The old grader also interpreted three short hooks as five; v5 requires three and still fails zero. |
| phase6_new_012 | genuine chatbot failure | failed → failed | Polished described the product, but triggered UGC repair. The old reply compares neither composition option and supplies neither reason. |
| ppads_conv_006 | pure evaluator false failure | failed → passed | Demonstrate the product or showcase its features is an honest demo equivalent. Safe alternatives are distinguished from negated demonstrations and personal endorsements. |
| ppads_conv_007 | pure evaluator false failure | failed → passed | A direct No after a leading Lesson 01 label answers the course-identity question. Unrelated No elsewhere cannot satisfy it. |
| phase6_new_014 | pure evaluator false failure | failed → passed | The correct Hindi product survives the conversation in a complete Light Sweep template. A referring phrase for that clip must not overwrite the independent expected product. |
| phase6_new_018 | mixed genuine and scoring error | failed → failed | Review mat batao is a scoped prohibition, not an affirmative fake testimonial. The saved second answer remains incomplete: it gives workflow instructions rather than a concrete honest demo idea. |

The two mixed defects remain failures on the old text. The stricter demo-completion check preserves the requirement for a concrete learner example instead of awarding a workflow-only answer. No old chatbot output was changed to improve the regrade.

## Modified and added source files

- `services/productTutorKnowledge.js` (modified)
- `services/productTutorResponse.js` (modified)
- `services/productTutorTasks.js` (modified)
- `services/tutorKnowledge.js` (modified)
- `knowledge/ai-product-photoshoot-ads/guidance.json` (modified)
- `scripts/eval/README.md` (modified)
- `tests/ai-chat-history.test.cjs` (modified)
- `scripts/eval/grade_product_photoshoot_ads_results_v5.py` (added)
- `tests/product-tutor-phase7.test.cjs` (added)
- `tests/test_product_evaluator_v5.py` (added)

`phase7_changes.patch` compares the captured pre-Phase-7 workspace snapshots with current files. It does not mix unrelated prior working-tree changes into this review. Source before/after hashes are in `evidence/phase7_validation_manifest.json`. No session schema, provider configuration, production infrastructure, auth or unrelated course logic changed in this phase.

## Preservation and evidence

All 8 lesson summaries and 19 templates are available in 53 uniquely identified records. Raw training text and v4 grader retain their before hashes. All 439 captured historical files and 5 historical review ZIPs retain their hashes. `knowledge_inventory.json` records heading/body hashes. Full source snapshots, the diff, actual test output, execution metadata, replay responses and frozen Phase 6 evidence are packaged. No evaluation IDs or saved questions were inserted into runtime or v5 rubric branches.

## Scope and limitations

The provider pipeline was exercised only through existing local fetch stubs, with networking blocked. The five root-cause replays returned local deterministic answers. Provider reliability, new live quality, production auth/database/load behavior and marketing effectiveness were not measured. No production-readiness or fresh 95% score is claimed. See `phase7_remaining_issues.md`.
