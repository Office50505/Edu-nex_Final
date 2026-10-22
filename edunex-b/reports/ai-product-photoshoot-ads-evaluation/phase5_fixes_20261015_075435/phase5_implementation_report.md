# Phase 5 targeted quality corrections

Implemented locally against the preserved Phase 4 evidence: 67/80 integrated v3 passes, 13 failures, five genuine/incomplete failures, eight suspected rubric failures and one critical full-template failure. No new external-provider request or live evaluation was made.

## Changes and why they address the failures

1. **Bounded colour/part substitution.** The runtime parser isolates explicit change/recolour targets and values, stops at punctuation or preservation clauses, and rejects negated changes. It understands colour-of phrasing and retains grammatical part determiners. Values carry through user history or saved context. The complete approved template remains unchanged; unknown fields stay placeholders. This fixes the clause-boundary cause of phase4_new_002 rather than matching its question. Nine new matrix checks use other parts and colours; additional checks cover history, unknowns and negation.
2. **Intent-aware troubleshooting.** Phone/handset/smartphone visibility resolves to the exact phone-visibility FAQ before generic UGC guidance. Colour-plus-shape, brand-shade, face-identity and finger-anatomy intents have separate source tags. Specific repairs precede generic course-overview matching, correcting ppads_022 and phase4_new_007 and returning more practical face guidance.
3. **Source-backed festive detail.** Retrieval includes both authorized L04 Diwali and Wedding Gift assets for festive questions. Reviewed English/Hindi/Hinglish summaries preserve their actual diyas/marigolds or silk/gift-box/ribbon/rose-petal details, product sharpness, foreground and realistic scale. These facts already exist in training.txt. All 19 original template bodies and all eight lessons are preserved.
4. **Conversation-safe language repair.** Product-video/settings intent resolves L06 before using an earlier lesson. Optional bounded productContext.topic survives omitted client history and referring/translation follow-ups. Current explicit intent/lesson wins; unrelated questions do not inherit a topic. A language replacement now uses the matching retrieved workflow, preserving settings rather than falling back to prerequisites. Existing user/course/conversation and entitlement boundaries remain in place.
5. **Advertising safety.** Guards and v4 detect declarative synthetic-presenter-as-genuine-customer claims, including common Hindi/Hinglish forms, in addition to fake-testimonial directives and first-person endorsements. Immediate prohibitions and postposed nahi/mat/na remain safe. Unknown benefits and specifications are not supplied. This is bounded local verification, not proof that every possible phrasing is understood.
6. **Versioned evaluator correction.** Added v4; v3 and historical outputs remain unchanged. V4 activates complete-template checks on exact-intent conversation turns, independently parses colour clauses, recognizes reviewed semantic equivalents and separates optional name echoes from identity loss using later complete-template proof. Strict numeric settings, complete approved bodies, exact FAQ strings, requested outputs, provenance and safety remain required. Negative controls reject wrong products, unfilled slots, changed template clauses, shape-changing advice, two movements and deceptive testimonials.

No application or grader code branches on evaluation IDs or whole saved questions. Course templates are authoritative assets, not hardcoded evaluation answers. New products and paraphrases are used in generalized regressions.

## Actual final local evidence

- **191/191 backend AI tutor tests passed**, zero failures/skips (153 existing + 38 new).
- **77/77 evaluator tests passed**, zero failures/skips: 43 unchanged v2/v3 tests, 16 new v4 controls and 18 unchanged v3 assertions also exercised against v4.
- **54/54 new targeted unit checks passed**, already included in the two totals above; do not add them again.
- **29/29 complete saved-template local replays passed**, using the independent Phase 4 full-body expectations across all 19 headings. This includes phase4_new_002 and the three older critical template turns.
- **5/5 genuine-failure local replays passed** (seven turns), using local handlers and saved provider fixtures where needed. One replay uses saved upstream text; it is not a new provider answer. Network access is denied during these checks.
- AI Influencer/AI Filmmaking compatibility, access isolation, multilingual and multi-turn, provider-error and mobile/history tests pass. No production authentication/database/load validation occurred.

## Independent review of the eight suspected rubric failures

| Case | Decision on unchanged saved answer |
|---|---|
| ppads_017 | Attach the character sheet and keep the same face conveys the required identity-preservation concept. It is not an exact-prompt request; full prompt wording is still checked verbatim in that dimension. |
| new15_006 | The response actually lists three buyer groups. Buyer groups is a valid equivalent of buyers/buyer types; price and Instagram remain product facts, not subscription pricing. |
| ppads_conv_001 | The first reply gives the correct product-sheet procedure. The later complete Product Sheet template substitutes perfume bottle correctly. V4 requires this later full product-bearing template proof before excusing the missing name echo. |
| ppads_conv_002 | The answer contains buyer groups and a singular buyer problem to validate. The old plural/alias check misses actual content. Creative hypotheses remain generic and their usefulness is not inferred from this semantic correction. |
| ppads_conv_004 | Sirf bataye hue part ka rang badlo; shape ... same rakho means change only the specified colour and retain shape. V4 limits aliases to preservation wording and rejects shape-changing counterexamples. |
| ppads_conv_005 | केवल एक धीमा मूवमेंट explicitly means only one slow movement. The old alias misses धीमा between एक and मूवमेंट; two movements still fail. |
| ppads_conv_006 | The response proposes demonstrating the product and rejects having the AI character give a personal review. V4 recognizes that meaning, while affirmative customer claims and negated demonstrations remain failures. |
| new15_conv_005 | The first reply gives the L06 settings without repeating the name. The later complete Arc template correctly instantiates cork yoga block, independently proving identity retention. This does not excuse missing or wrong template slots. |

All eight are supported as evaluator false failures under the documented evidence above. The complete original definitions, actual answers, old dimensions and corrected dimensions are in suspected_evaluator_failure_review.json. Product-echo exceptions require a later full product-bearing template that proves identity, not a generic later mention.

Regrading the **unchanged Phase 4 responses** with v4 yields **75/80 (93.75%)**, five failed, zero skipped/inconclusive/fallback cases. V3 remains 67/80. All five genuine historical failures still fail, and v4 newly flags the known colour-template fidelity gap missed by v3. This difference measures rubric changes only. It does not measure the new runtime, replace the historical score, establish 95% accuracy or imply production readiness.

## Modified source files

Paths relative to the backend. phase5_changes.patch compares this task with its pre-Phase 5 snapshot, not Git HEAD, so earlier authorized work is not misattributed.

| Path | Status |
|---|---|
| services/productTutorKnowledge.js | modified |
| services/productTutorResponse.js | modified |
| services/tutorKnowledge.js | modified |
| models/AiTutorSession.js | modified |
| knowledge/ai-product-photoshoot-ads/guidance.json | modified |
| scripts/eval/README.md | modified |
| tests/ai-chat-history.test.cjs | modified |
| tests/product-tutor-quality.test.cjs | modified |
| scripts/eval/grade_product_photoshoot_ads_results_v4.py | new |
| tests/product-tutor-phase5.test.cjs | new |
| tests/test_product_evaluator_v4.py | new |

One legacy unit assertion now accepts either lid or the lid inside a supplied part slot. This is a grammatical value distinction, not an approved-template edit or relaxed score requirement; complete-body checks remain strict. Two initial full runs found and preserved a grammar assertion mismatch and a postposed-mat safety regression; both were corrected before final passing evidence. See phase5_regression_results.md.

All 226 captured historical report/evidence files, the Phase 4 ZIP, raw course source and v3 grader retain their hashes. No deployment, commit, push, production resource change or unrelated business-logic change occurred. The comparison PDF and source patch accompany the ZIP.
