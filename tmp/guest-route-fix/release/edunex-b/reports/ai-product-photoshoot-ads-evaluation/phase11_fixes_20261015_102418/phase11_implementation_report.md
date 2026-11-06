# Phase 11 implementation report

Implemented general product-course state, routing, literal-template and factual-advertising corrections. No external-provider evaluation, deployment, commit, push or production change occurred.

Structured state schema version 2 retains product identity, learner-declared attributes, target part/colour, price/channel, selected lesson, chosen angle, option labels, requested outputs, task parts/request, actor-free direction and response language. The existing authenticated user/course/session gate remains; explicit course/conversation identifiers reset mismatched state. Legacy flat sessions remain readable. Current structured state wins over stale client history; assistant option labels may resolve an ad-angle choice, but assistant text never establishes product facts. Source evidence for changed factual fields is retained separately.

Entity extraction supports declarations and replacement syntax across English, Hindi and Roman Hindi without a catalogue of product names. Known facts clear on a product switch. Hindi and cost-verb price forms and part/colour instructions persist. The task planner separates workflow, prompt location, comparison, decision and rationale; multi-lesson or compound requests bypass a single FAQ. Title words do not substitute a photo workflow for course identity. Descriptive colour alone cannot trigger recolouring.

Exact prompt bodies remain deterministic and source-owned. Every known slot is checked after full rendering; unknown actor/clothing/dialogue fields remain unknown. All eight lessons, 19 headings, source bodies, guidance facts and chunk IDs are preserved. Troubleshooting retrieves approved phone-camera wording, adds available source-backed natural lighting, and gives capture/upload/review steps when the learner asks to start from the beginning.

Legitimate simple hooks/scripts/captions and safe alternatives are completed from known facts. Requested hook counts accept intervening adjectives. Demonstration actions and spoken lines are concrete and keep actor-free constraints. Safety refusals can supply an actual neutral alternative instead of asking again for a supplied name. The model’s executable ad copy is checked against supplied facts plus neutral presentation language; unprovided benefits, specifications or accessories trigger a conservative factual draft. Compound grounding/completion errors can request one repair within the existing shared 25-second budget (at most three transport attempts including initial retries); failed grounding repair discloses incomplete reasoning and removes unsafe text. No provider or infrastructure configuration changed.

V7 is added alongside unchanged V6. New corrected Phase 10 definitions and a source-linked correction ledger fix confirmed authoring defects without replacing history. Full-template checks accept independently declared slots instead of assuming a parser omission means an unknown fact. Semantic language/reference corrections apply to prose only; complete literal source bodies and numeric settings stay strict.

Modified or added files (17):

- `services/productTutorKnowledge.js` (modified)
- `services/productTutorTasks.js` (modified)
- `services/productTutorIntent.js` (modified)
- `services/productTutorResponse.js` (modified)
- `services/tutorKnowledge.js` (modified)
- `services/aiTutorService.js` (modified)
- `models/AiTutorSession.js` (modified)
- `routes/ai.js` (modified)
- `tests/ai-chat-history.test.cjs` (modified)
- `services/productTutorState.js` (added)
- `services/productTutorGrounding.js` (added)
- `tests/product-tutor-phase11.test.cjs` (added)
- `tests/ai-tutor-fixture.cjs` (added)
- `tests/test_product_evaluator_v7.py` (added)
- `scripts/eval/grade_product_photoshoot_ads_results_v7.py` (added)
- `scripts/eval/product_photoshoot_ads_phase10_cases_v7.json` (added)
- `scripts/eval/README_v7.md` (added)

`source_diffs/phase11_changes.patch` compares the actual pre-remediation working tree with the delivered files, preserving earlier uncommitted work. The only adaptation in the existing route-test fixture is loading the new state dependency; existing assertions remain. New product categories/wording appear in test files, not routing/answer tables.

Actual local results: backend **351/351**, evaluator **167/167**, new targeted subset **75/75** (55 backend + 20 evaluator), independent complete-template replay **35/35**, and both saved critical advertising responses blocked **2/2**. The replay traverses updated local policy/state/retrieval for 80 historical cases; 76 local turns execute and 20 model-required turns are explicitly unexecuted. Twenty-one saved upstream texts are validated locally, never represented as new model answers.

The unchanged historical corpus regraded with V7 scores **51/80**, with 14 changed case outcomes. There is no fresh post-fix live score. Remaining limits are documented in phase11_remaining_issues.md.

