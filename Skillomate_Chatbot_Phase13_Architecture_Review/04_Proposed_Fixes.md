# Minimal implementation proposal — not implemented

Scope is the existing product-course path. Keep approved knowledge bodies, APIs, provider, course isolation and safety/entitlement precedence. The proposal does not add model training, per-question rules, a new retrieval service, a database migration or unrelated-course changes. Exact assets should remain deterministic; reasoning and original generation should remain eligible for the model.

## One request interpretation, separate from asset availability

The current system has real structured state, reviewed translations and deterministic assets; a complete rewrite would discard working behavior. The smallest coherent adjustment is to distinguish **what the learner requests** from **which records happen to match**, then apply explicit fact mutations before rendering.

Proposed internal flow:

1. Keep authentication/input safety and material entitlement checks in place.
2. Extract original-language declaration/operation spans with evidence: identity, replace, recolour, correction, explicit reset. Preserve ambiguity instead of guessing.
3. Reduce the scoped previous state once: reset/replace, then current declarations/corrections, then permitted inherited task context. Exclude assistant assertions as facts.
4. Classify requested action and deliverables; resolve a heading candidate independently. Named-asset availability alone must not set exact intent. Exclude known identity spans from symptom inference; require a symptom assertion for troubleshooting.
5. Retrieve within the authorized course/lesson. A confident exact request should reserve its complete matching authorized record within the six-record budget; it must not bypass entitlement or global-scope rules.
6. Render the complete source asset for exact requests, use reviewed local guidance for genuinely matched simple instruction requests, and use fact-grounded drafts/model generation for original tasks and reasoning. Multi-part requests must keep every requested part.
7. Validate final rendered body/known slots, prose language, constraints and safety. Keep provenance for a clarification or fallback. A supplied-but-ambiguous fact is distinct from a genuinely absent fact.

Prefer an internal normalized request assembled in `productTutorKnowledge` using pure language signals from `productTutorIntent`, reused by retrieval/response. Do not add a circular dependency from `productTutorIntent` back to the knowledge module. The exact proposed function names are design suggestions, not located existing components.

## Selection policy

Safety blocks and entitlement precede this table.

| Request kind | Evidence needed | Preferred response | Do not infer |
|---|---|---|---|
| Exact approved asset | Affirmative copy/full/original-source intent bound to one recognized heading; generic “prompt” noun optional | Deterministic complete authorized body, substituting only declared slots; requested prose separately | Mentioning a heading or “original prompt” alone always means saved asset |
| Lesson education | Explain/why/compare/meaning/lesson workflow task | Reviewed guidance for a simple source-supported task; model for reasoning/compound questions | A matching asset means the learner wants it copied |
| Original product generation | Create/adapt/draft a new scene or ad, without source-copy intent | Clearly labelled practice generation from known facts; complete requested outputs; model for open reasoning | Generated text is an approved course template; scene props are product features |
| Follow-up | Explicit reference to last task, selected option, requested language, correction or repeat | Inherit only relevant task/entity; re-resolve requested output/heading and apply latest changes | All short utterances ask to repeat all prior outputs |
| Troubleshooting | Actual symptom/failed-result assertion linked to product/lesson | Source-backed cause/fix/check; model if reasoning needed | A word inside a product name is a symptom, or a negated/resolved symptom remains active |
| Ambiguous | Multiple headings, conflicting identity, unclear operation | One focused clarification that preserves safe context | A stale prior heading is an acceptable silent substitute |

Negation needs clause-aware handling in English/Hindi/Hinglish: a negative mention must not activate the positive action. Narrow syntactic recognition can cover these bounded course tasks without enumerating evaluation questions. A finite parser cannot guarantee unrestricted multilingual comprehension; unsupported/ambiguous cases should safely clarify or use the eligible reasoning path, never fabricate slots.

## Language-independent representation

Use language-independent **keys and operations**, retaining original-script values and evidence. Do not translate the entire request and then extract names. An illustrative internal request is:

```json
{
  "scope": {"courseId": "validated-id", "conversationId": "client-chat-id"},
  "language": {"prose": "hindi", "explicit": true},
  "action": "exact_asset",
  "asset": {"heading": "L04 Colour Variant Sheet", "lesson": 4},
  "operations": [
    {"type": "recolour", "targetPart": "बाहरी ढक्कन", "newColour": "हल्का नीला"}
  ],
  "declarations": {
    "product": {"value": "मिट्टी का दीपक", "source": "user", "span": [0, 0]},
    "material": {"value": "मिट्टी", "source": "user", "span": [0, 0]}
  },
  "constraints": [{"type": "preserve_other_attributes", "scope": "current_task"}],
  "unresolved": []
}
```

The example's `[0,0]` spans are schematic, not extracted evidence. Implementation must use real offsets before normalization. Product identity, material and target colour are different concepts: a recolour changes a requested variant, not all factual attributes. Keep unknown, explicitly cleared, ambiguous and known values distinct. Preserve diacritics, combining marks, Hindi postpositions inside names and multiword arbitrary colours. Never infer material or benefits solely from a product name.

**Compatibility/minimum scope:** this request object can be ephemeral. Adapt accepted fields back to the existing v2 productContext (`product`, `part`, `colour`, `attributes`, `evidence`, `currentTask`) for the four fixes. No new persisted schema is required for them. A comprehensive keyed attribute/constraint store, provenance offsets across turns or schemaVersion 3 would require a separate schema/migration design and approval; it is not silently included in this patch. Evidence strings already exist, although they currently capture whole-message text rather than exact spans.

## Four required corrections

**A. Asset request and topic precedence.** Recognize requests for a named approved asset's complete text, even without prompt/template nouns. Do not use topic product_photo as sufficient exact intent. Resolve negative copy requests before positive keyword checks. Prefer exact explicit intent over incidental symptom terms; use entity-span exclusion so identity words do not create a symptom. Preserve genuine troubleshooting and educational named-heading questions.

**B. Declarations.** Consolidate shared identity declaration handling for object/product/item terms and Hindi possessive/name forms; keep bounded general patterns, source spans, instruction guards and current name limits. Existing duplicate fallback paths must use the same accepted identity or safely abstain. Do not add evaluated names to a dictionary.

**C. Recolour.** Parse target part and new colour as a typed operation for active/passive and accepted multilingual constructions. Exclude its complete clause from generic `of/for` identity fallback. Retain exact part phrasing where the slot requires it. Respect negation and preserve all other source clauses. A recolour must not replace the product identity or carry price/material from another product.

**D. Replacement.** Parse explicit replacement and correction operations across languages. On successful new identity, clear old product-bound facts before accepting new same-turn declarations. Preserve only deliberate task-level constraints/language; define whether an angle is generic or product-bound rather than copying it by accident. If a switch is detected but cannot be resolved, do not fulfill a “new product” template with the old identity.

The guard “known field unresolved” must validate the normalized declared slots, not an independent second parser's accidental subset. Do not respond to uncertain values by removing all placeholders: approved placeholders are correct for genuinely unknown fields.

## Exact files to change after approval

| File | Required change | Scope |
|---|---|---|
| `edunex-b/services/productTutorState.js` | Shared declaration/replace/recolour parsing, evidence and scoped operations; retain validation/negation | Core |
| `edunex-b/services/productTutorKnowledge.js` | Integrate canonical extraction, restrict preposition fallback, explicit operation reduction, affirmative asset request recognition, entity-aware request context | Core |
| `edunex-b/services/productTutorIntent.js` | Separate exact-copy/generation/education/follow-up/troubleshooting signals, account for negation and deliberate inheritance | Core |
| `edunex-b/services/productTutorResponse.js` | Use resolved intent instead of template existence/topic; reuse canonical slots; preserve complete assets and requested explanations | Core |
| `edunex-b/services/tutorKnowledge.js` | Use the same resolved exact request for authorized template reservation/boost and topic signals | Core; product branch only |
| `edunex-b/tests/product-tutor-phase13.test.cjs` | New independently specified extraction/intent/rendering regression cases | New test file |
| `edunex-b/tests/ai-chat-history.test.cjs` | Route-level switch, same-ID reset semantics once approved, omitted-history and boundary checks | Extend existing tests |
| `edunex-b/tests/tutor-knowledge.test.cjs` | Entity-word symptoms, named educational requests, entitlement/course and retrieval invariants | Extend existing tests |

These are planned edits, not changes already made. Keep the new tests deterministic and meaningful: final full-body comparisons, state transitions and negative controls, not copies of implementation regexes.

## Staged related corrections

| Issue | Exact potential files | Recommendation |
|---|---|---|
| Exact-task repeat/language inheritance | `productTutorIntent.js`, `productTutorKnowledge.js`, `productTutorResponse.js`; tests above | Same small release if covered before the blind run; do not broaden all short messages |
| Explicit product reset | `productTutorState.js`, `productTutorKnowledge.js`; route tests | Small independent state-operation change; never DELETE all account history to implement a product reset |
| Missing web conversation ID | `edunex-f/js/nex-ai-widget.js:1840–1850`; new `edunex-b/tests/product-tutor-web-conversation.test.cjs` if a transport fixture is needed | Separate client-boundary patch after agreeing legacy behavior; product-course request only if preserving other-course scope is required |
| Missing-ID stale state/client-history authority | `edunex-b/routes/ai.js:54–94`, `services/aiTutorService.js:294–298,986–988`; route tests | Decide and test compatibility before changing; do not break installed clients that omit IDs |
| Independent durable A/B conversations | `models/AiTutorSession.js`, `routes/ai.js`, `services/aiTutorService.js`, migration tooling and tests | Defer. Requires an index/data-retention migration and separate approval; not necessary to fix F4 |
| Keyed multilingual attributes/constraints | State/knowledge/tasks/model schema as required | Stage separately from four-case patch. Raw prompt context currently retains some details; don't promise complete structured support yet |
| Evaluator defects | New versioned `scripts/eval/grade_product_photoshoot_ads_results_v8.py`, new `tests/test_product_evaluator_v8.py` | Separate evidence-driven evaluator change, approved and frozen before Phase 14; preserve v7 unchanged |

No core change is proposed for `server.js`, production environment files, authentication, subscriptions, provider URL/model, safety modules, course knowledge bodies or other courses. `aiTutorService.js` need not change for F1–F4 unless canonical-context plumbing proves necessary; review that diff separately instead of opportunistic refactoring.

## Implementation order and stop gates

1. Record the current **working-tree** baseline, including the user's staged/unstaged/untracked source. Add the four independent failing regressions and paired passing controls. Preserve Phase 12 files/hashes.
2. Repair declarations, recolour and replacement as pure parsing/state operations. Run focused extraction/state/full-template tests; maintain current negative-input guards.
3. Introduce the shared action classification and update retrieval/response selection together. Verify named education, original generation, genuine troubleshooting and negated copy requests.
4. Add final-output assertions and deliberate repeat/reset behavior in separately reviewable changes. Re-run all 351 baseline backend and 167 baseline evaluator tests plus new tests.
5. Review client/legacy conversation handling separately; decide whether it is in Phase 14 scope. Do not migrate session storage in the minimal patch.
6. Freeze any approved new evaluator, code, course content and expected slots. Run Phase 14 as defined in report 06. Report failures without score-driven retries or altered expectations.

At every stage, stop on course leakage, safety weakening, source wording changes, API changes or stale product facts. A passing focused test is not release permission. Deployment is prohibited in Phase 13 and is not authorized by approval to implement locally.
