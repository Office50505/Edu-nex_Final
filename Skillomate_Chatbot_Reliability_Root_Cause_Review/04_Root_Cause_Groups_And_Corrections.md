# Root-cause groups

Case associations overlap and must not be added to obtain a defect total. RC1–RC7 are confirmed local mechanisms; RC8 is confirmed denial/accounting behavior, RC9 is an evaluation limitation, and RC10 records preserved security rather than a new defect.

## RC1 — Platform/account intent collisions before course handling

Status: CONFIRMED.

Account and billing matchers bind unrelated words across the whole message. My/mera plus paid/order can mean paid prompts or work order; bare plan can mean a video plan. The route accepts these replies before buildContext, so product intent, retrieval and product validation never run. Hindi private/platform replies also collapse into a two-language formatter.

Source:
- `edunex-b/services/aiTutorService.js:313–404` — isSkillomatePlanQuestion / skillomatePlatformDirectReply.
- `edunex-b/services/aiTutorService.js:713–777` — isLearnerContextQuestion / learnerContextDirectReply.
- `edunex-b/routes/ai.js:248–267` — handleTutorChat early reply selection.

Smallest coherent correction: Require an affirmative account/platform action with correctly bound referents; distinguish plan-the-ad from subscription-plan and work-order from payment-order. Resolve authorized product-course context before selecting overlapping course intents. Preserve actual personal-payment/profile requests and safe masked replies. Start with product-course-scoped disambiguation at the call site rather than changing unrelated course behavior.

Risks and dependencies: Global matchers serve other courses and account requests. Avoid a blanket product-word exemption that suppresses genuine billing questions. Never let a client course ID become authorization. Extra context resolution may add local DB reads.

Regression tests: Paired account-vs-item-name, paid-template-vs-my-payment, ad-plan-vs-plan-price, workflow-order-vs-my-order, quoted paid-comment, inactive restoration, Hindi restriction, unrelated-course platform controls.

Expected improvement: Remove demonstrated unrelated pricing/profile answers and complete legitimate access guidance. No numeric score forecast.

Verification: Offline actual route with synthetic users; assert selected route, reply contract, no unexpected provider call, masked own-user data only and no protected material for inactive users.

Associated failed cases: FRESH-EG-013, FRESH-EG-017, FRESH-SA-001, FRESH-SA-019, FRESH-SA-020, FRESH-SR-015.

## RC2 — Fragmented task intent and overconfident local guidance selection

Status: CONFIRMED.

Copy recognition depends on a small vocabulary and often requires prompt/template/text/body in addition to a named asset. Source/full/reproduce/paste/Hindi variants are missed. Conversely How do + prompts can look like imperative do; negated generation and Hinglish original generation are not consistently scoped. requestedProductOutputs confuses camera angle with advertising angle and misses scene/dialogue/buyer-brief verbs. A topic plus any available guidance is treated as enough for a local response; workflow+decision is not handled as a required compound task.

Source:
- `edunex-b/services/productTutorIntent.js:2–38` — productCopyIntent / productIntentSignals / productResponseSelection.
- `edunex-b/services/productTutorKnowledge.js:80–98` — wantsProductPrompt / wantsProductScene.
- `edunex-b/services/productTutorKnowledge.js:196–332` — requestedProductOutputs / productRequestContext.
- `edunex-b/services/productTutorResponse.js:54–159` — productTutorReply / selectProductGuidance.
- `edunex-b/services/tutorKnowledge.js:250–308` — retrieveKnowledge ranking and selection.

Smallest coherent correction: Build one transient request plan: copy-approved, explain, generate, troubleshoot, clarify or platform/account, with target asset, required parts, counts, negation and confidence. A complete affirmative request naming an approved asset can copy without magic words. Choose local guidance only when it answers every requested part. Keep course facts in approved references; route unsupported synthesis to provider or a truthful unavailable answer. Resolve named assets from the authorized same-course set, never an unrestricted global asset registry.

Risks and dependencies: Too many requests could shift to the provider, increasing cost/latency; too broad copy recognition can suppress education. Preserve negative controls, access gates and immutable source bodies. Do not fix this by hardcoding case questions or adding every symptom as a new exception.

Regression tests: All 19 assets with fresh copy paraphrases; retain-placeholders vs fill; exact vs meaning vs original scene; negated hooks; angle-of-camera vs ad-angle; buyer brief vs process; decision plus workflow; labels as data vs real blur; aspect-ratio vs lettering; final arrangement vs motion.

Expected improvement: Correct executed routing errors with the approved knowledge already available. All 19 failed exact cases contain their requested asset in retrieval; a retrieval-engine replacement is not justified by those cases.

Verification: Offline plan/route assertions independent of implementation regexes; actual route tests for deterministic completion and zero unauthorized retrieval; live testing only for the synthesis branch.

Associated failed cases: FRESH-EX-005, FRESH-EX-009, FRESH-EX-010, FRESH-EX-011, FRESH-EX-013, FRESH-EX-014, FRESH-EX-018, FRESH-EX-019, FRESH-EX-022, FRESH-EX-024, FRESH-ML-001, FRESH-ML-007, FRESH-ML-011, FRESH-ML-013, FRESH-ML-018, FRESH-MT-009, FRESH-MT-015, FRESH-MT-017, FRESH-MT-018, FRESH-MT-020, FRESH-EG-003, FRESH-EG-004, FRESH-EG-010, FRESH-EG-011, FRESH-EG-013, FRESH-EG-014, FRESH-EG-015, FRESH-EG-016, FRESH-EG-020, FRESH-SA-013, FRESH-SR-001, FRESH-SR-008, FRESH-SR-013.

## RC3 — Entity boundaries, naming syntax and incomplete attribute extraction

Status: CONFIRMED.

Two overlapping extractors recognize only selected declaration forms. Broad for/of/for-my fallbacks promote request prose or a presenter into a product. Quote-first, curly-quoted called names, Name:, named, bracket assignments and multilingual constructions are missed. Attributes mostly require colour/material/features is/are/: syntax; natural facts and negative constraints are not represented. Price scanning can consume a trailing comma. Missing extraction is not evidence that accents were normalized away.

Source:
- `edunex-b/services/productTutorState.js:19–92` — entity / extractEntity / productOperations / extraSlots.
- `edunex-b/services/productTutorKnowledge.js:129–179` — cleanProductName / productSlots.
- `edunex-b/services/productTutorKnowledge.js:218–264` — productFacts.

Smallest coherent correction: Use one conservative declaration/assignment parser with evidence spans. Separate exact display name, object description and supplied facts; prefer explicit name/slot declarations over referring phrases. Never promote arbitrary request prepositions or an actor into identity. Preserve original Unicode; use the existing separate NFKC security view for every naming path and reject unsafe names. Canonicalize numeric prices independently of punctuation and retain explicit negative facts. Keep an adapter to existing productContext fields; no persistence redesign or migration is needed for the first correction.

Risks and dependencies: Over-extraction can turn instructions into facts; under-extraction must ask a focused clarification. Preserve NFKC, bidi/default-ignorable and mixed-script checks; do not simply strip unsafe substrings. Distinguish delimiting quotes from legitimate internal punctuation.

Regression tests: Independent English/Hindi/Hinglish declarations, arbitrary accented/decomposed/Indic names, curly quotes, slash/apostrophe names, unnamed described objects, multiple-product ambiguity, actor clauses, request prose, negative features and numeric price separators; unsafe compatibility/mixed-script names at initial and switched turns.

Expected improvement: Prevent phantom identities and unnecessary requests for facts already supplied; preserve useful explicit attributes without inventing them.

Verification: Offline parser/reducer diagnostics using independently declared facts and evidence spans, plus actual-route generation contract tests; do not use runtime extraction as the test oracle.

Associated failed cases: FRESH-EX-002, FRESH-EX-003, FRESH-EX-004, FRESH-EX-006, FRESH-EX-008, FRESH-EX-012, FRESH-EX-015, FRESH-EX-025, FRESH-ML-001, FRESH-ML-003, FRESH-ML-005, FRESH-ML-007, FRESH-ML-008, FRESH-ML-011, FRESH-ML-017, FRESH-MT-001, FRESH-MT-002, FRESH-MT-003, FRESH-MT-006, FRESH-MT-010, FRESH-MT-016, FRESH-MT-017, FRESH-MT-019, FRESH-EG-004, FRESH-EG-009, FRESH-EG-011, FRESH-EG-020, FRESH-SA-013, FRESH-SR-001, FRESH-SR-009, FRESH-SR-013, FRESH-SR-015.

## RC4 — Template copy/fill contract lacks a complete per-asset slot schema

Status: CONFIRMED.

renderProductTemplate handles only PRODUCT, man/woman, recolour part and new colour. Source assets also contain woman/man, possessives, clothing, dialogue, brief details, price, channel and number slots. Explicit user assignments are not parsed. productTutorReply applies guessed/context slots even when the user says retain brackets, and its unresolved check only knows four slot categories. This is rendering/selection, not modified knowledge files.

Source:
- `edunex-b/services/productTutorKnowledge.js:141–188` — productSlots / renderProductTemplate.
- `edunex-b/services/productTutorResponse.js:143–159` — productTutorReply exact rendering and unresolved fields.
- `edunex-b/services/aiTutorService.js:439–449` — aiProductPhotoshootKnowledgeGuard.

Smallest coherent correction: Derive an allowlisted slot schema from each approved asset and represent raw-copy versus fill-copy explicitly. Parse bounded explicit assignments and use only user-supplied values for recognized slots. Preserve all brackets in raw mode and leave only genuinely unknown fields in fill mode. Render by literal span substitution; verify that every other source byte/word is unchanged. Align provider instructions with the same supported slot contract. Do not rewrite approved asset bodies.

Risks and dependencies: Gender/pronoun or clothing guesses could invent facts. Generic replacement could interpret dollar/backslash content or instructions. Every lookup must require verified owner and entitlement; a direct asset helper must not reopen the fixed global-registry bypass.

Regression tests: Every placeholder from all 19 assets, both pronoun orderings, prices/channels/number/dialogue/clothing, unknown and explicitly preserved slots, Unicode and replacement metacharacters, body-diff checks allowing only declared changes, unauthorized/other-course template denial.

Expected improvement: Eliminate confirmed unresolved-known-slot and invented-substitution failures; preserve approved wording. No future fidelity percentage is asserted.

Verification: Offline exact full-body oracle from immutable source plus explicit substitutions; inspect all executable blocks and negative unknown-slot controls separately from semantic generation.

Associated failed cases: FRESH-EX-002, FRESH-EX-003, FRESH-EX-004, FRESH-EX-005, FRESH-EX-006, FRESH-EX-008, FRESH-EX-009, FRESH-EX-010, FRESH-EX-011, FRESH-EX-012, FRESH-EX-013, FRESH-EX-014, FRESH-EX-015, FRESH-EX-018, FRESH-EX-019, FRESH-EX-021, FRESH-EX-022, FRESH-EX-024, FRESH-EX-025, FRESH-EG-011.

## RC5 — State changes depend on successful narrow identity recognition

Status: CONFIRMED.

Replacement operations cover limited product-to/with forms. Forget X; New product:, replace it completely, renames and natural corrections can leave the old identity. productFacts clears old bound facts only after a different identity is recognized, while new price is applied independently. Version-2 state suppresses history reparsing, so missed initial facts remain missing. This explains the old-coaster/new-price hybrid and unsupported follow-ups; it does not establish cross-user leakage.

Source:
- `edunex-b/services/productTutorState.js:49–96` — productOperations / scopeProductState.
- `edunex-b/services/productTutorKnowledge.js:218–264` — productFacts state update loop.
- `edunex-b/services/aiTutorService.js:294–298` — resolveProductHistory / resolveConversationState.
- `edunex-b/services/aiTutorService.js:530–555` — resolveConversationState.
- `edunex-b/routes/ai.js:54–93` — loadTutorState / persistTutorChat.

Smallest coherent correction: Reduce typed declare, replace, correct, rename, recolour and reset operations atomically. Explicit new-product intent with unresolved identity must invalidate the obsolete product and ask, not attach new price/material to it. Field corrections replace the affected fact and preserve only deliberate task context. Keep schema-v2 non-resurrection, user/course/conversation filtering and existing API/persistence. Decide legacy missing-conversation-ID semantics explicitly before changing them.

Risks and dependencies: Over-clearing loses deliberate inherited facts; under-clearing retains old price/material. Same-product rename differs from replacement. Do not reparse all assistant history or redesign the one-session-per-user/course storage to mask extraction defects.

Regression tests: Seed a known recognized product, verify its stored facts, then replace/correct in three languages; old price/material absent, deliberate actor-free task retained; renamed same object; conflicting correction; unknown new name; switch with malicious name; explicit reset, changed conversation and missing-ID legacy behavior; interleaved users and courses.

Expected improvement: Prevent confirmed stale identity and mixed old/new facts; make follow-ups reliable after accurate initial capture.

Verification: Offline reducer and actual multi-turn route tests with before/after state plus provider-payload inspection. Require nonvacuous initial-state assertions and real schema validation before any live evaluation.

Associated failed cases: FRESH-MT-001, FRESH-MT-002, FRESH-MT-006, FRESH-MT-010, FRESH-MT-018, FRESH-MT-020.

## RC6 — Inconsistent language, count and per-deliverable parsing

Status: CONFIRMED.

Product and generic language functions use different patterns; a Devanagari product name can set explanation language to Hindi. English please, language English kar do and short Hindi line are not consistently recognized. localizedReply and learnerContextDirectReply only have English-versus-Roman-Hinglish output branches even for detected Hindi. Hook count defaults to five when Hindi modifier sequences are unrecognized. There is no located translation/extraction service; localization is source translations plus regex tags.

Source:
- `edunex-b/services/productTutorIntent.js:41–51` — productResponseLanguage.
- `edunex-b/services/aiTutorService.js:564–598` — latestMessageLanguage / explicitLanguagePreference / localizedReply.
- `edunex-b/services/aiTutorService.js:739–776` — learnerContextDirectReply locale branches.
- `edunex-b/services/productTutorTasks.js:48–52` — requestedHookCount / draftProductAd.
- `edunex-b/services/productTutorKnowledge.js:196–215` — requestedProductOutputs.

Smallest coherent correction: Use one language decision for explanation after masking only validated identity spans; explicit latest preference wins. Represent separate languages for explanation, source body and dialogue. Parse counts and action morphology consistently in English, Hindi and Hinglish with no silent default when an explicit count is uncertain. Preserve original Unicode identities; keep exact approved bodies in source language.

Risks and dependencies: Changing generic localization affects other courses and account replies. Preserve currently passing language switches, quoted source and proper-name exceptions. Do not use NFKC as output normalization.

Regression tests: English requests with Indic names; English please and English kar do; Hindi platform restriction; Hinglish explanation plus Hindi dialogue; varied Hindi modifiers/counts; source-English template with Hindi instructions; legitimate and unsafe Unicode name controls.

Expected improvement: Correct observed wrong-language output and five-instead-of-two hooks while keeping safe original-script names.

Verification: Offline expected-language/count assertions independent of parser output; semantic assessment of live multi-part generation only after provider approval.

Associated failed cases: FRESH-EX-003, FRESH-EX-010, FRESH-EX-014, FRESH-EX-018, FRESH-EX-019, FRESH-EX-022, FRESH-ML-002, FRESH-ML-007, FRESH-ML-013, FRESH-ML-018, FRESH-ML-020, FRESH-MT-001, FRESH-MT-003, FRESH-MT-018, FRESH-MT-019, FRESH-EG-003, FRESH-EG-009, FRESH-EG-015, FRESH-SA-020, FRESH-SR-008.

## RC7 — Local responses bypass the completion/language validation path

Status: CONFIRMED.

validateProductReply is invoked only after successful provider generation. Local templates, drafts, safety alternatives and FAQs return before that path. A relevant translation can therefore stand in for a requested artifact, missing count, reference, scene or decision. Existing missingProductDeliverables covers selected outputs, not complete scene/comparison/decision contracts. Copy repair also reuses the same faulty parser/renderer, so it is not an independent fidelity oracle.

Source:
- `edunex-b/routes/ai.js:266–320` — handleTutorChat local versus provider branches.
- `edunex-b/services/productTutorResponse.js:98–223` — productTutorReply / validateProductReply.
- `edunex-b/services/productTutorTasks.js:55–144` — draftProductAd / missingProductDeliverables.
- `edunex-b/services/productTutorResponse.js:54–95` — selectProductGuidance / localizedGuidance.

Smallest coherent correction: Apply a bounded shared task-completion contract to every response origin before persistence. Validate required outputs/counts, approved-body fidelity and current facts; distinguish explanation from generation. If local capability cannot fulfill it, route to authorized inference or report honest partial/unavailable status. Keep security rejection terminal; do not force a benign deliverable through a blocked malicious request. Avoid recursive repair loops and a large set of new FAQ-specific rules.

Risks and dependencies: A validator using the same wrong parser can approve wrong output; an overly strict validator can reject valid paraphrases or require unnecessary name repetition. Preserve safe refusals and cap repair time/cost.

Regression tests: Valid complete local guidance stays unchanged; incomplete local captions/scenes/decisions are not accepted; unknown product clarification only when genuinely missing; alternative grounded to actual product; strict immutable-template checks; semantic equivalent educational answers and safety rejection negative controls.

Expected improvement: Stop relevant-but-incomplete local text from being labeled a completed task. Provider quality remains separately untested.

Verification: Offline origin-independent contracts, actual-route traces, no additional unapproved provider calls. Later measure live response completion, repair and fallback separately.

Associated failed cases: FRESH-ML-002, FRESH-ML-008, FRESH-ML-013, FRESH-ML-017, FRESH-ML-018, FRESH-ML-020, FRESH-MT-002, FRESH-MT-003, FRESH-MT-006, FRESH-MT-009, FRESH-MT-015, FRESH-MT-017, FRESH-MT-019, FRESH-MT-020, FRESH-EG-003, FRESH-EG-004, FRESH-EG-009, FRESH-EG-010, FRESH-EG-014, FRESH-EG-016, FRESH-SA-013, FRESH-SR-001, FRESH-SR-009, FRESH-SR-013.

## RC8 — Intentional provider denial is flattened into retryable connection error

Status: CONFIRMED OBSERVATION; NOT A LIVE PROVIDER FAILURE.

57 unique provider turns each throw PROVIDER_PAYLOAD_NOT_APPROVED in the evaluation guard before transport. errorCode maps the unrecognized code to connection_error and requestTutorProvider retries once. Thus 57 x 2 = 114 blocked adapter attempts, not 114 transmitted requests. The catch path returns saved guidance and an unavailable notice; it cannot establish generated-answer correctness.

Source:
- `edunex-b/services/tutorProvider.js:5–49` — errorCode / requestTutorProvider.
- `edunex-b/services/aiTutorService.js:1249–1274` — callFalOpenRouter.
- `edunex-b/routes/ai.js:298–331` — provider exception and fallback / outcome.

Smallest coherent correction: Future harness/accounting should distinguish intentional policy denial, transport failure, provider rejection, generation and final answer origin. Make deliberate local policy denial nonretryable at its typed boundary without disabling legitimate transient retries. Preserve unavailable/untested semantics and never inject fixtures as live model replies. Preserve old frozen artifacts and evaluator.

Risks and dependencies: Changing retry classification can mask real DNS/upstream failures; changing outcome fields can break clients. Prefer additive diagnostics and keep existing response keys. The source also marks provider-generated local replacements non-live; later accounting must retain provider invocation separately.

Regression tests: Local policy-denial control has no wire call; transient/429/5xx retry bounds unchanged; empty/invalid response, timeout, max attempts and shared repair budget; correct origin when provider succeeds then local validation replaces output.

Expected improvement: Accurate unavailable accounting and less needless waiting; no justified accuracy improvement or live-provider performance conclusion.

Verification: Offline injected transport unit tests only; controlled authorized real calls for latency, usage, finish reasons and repair quality.

Associated failed cases: FRESH-MT-016.

## RC9 — Question/rubric alignment and harness coverage limits

Status: EVALUATION LIMITATION.

Seven case failures need semantic completeness adjudication; one conflicts with the existing strict leakage rejection policy. Optional May wording was scored as mandatory, and some correct source explanations fail for omitted unstated sentences or repeated names. The synthetic VM uses memory models, two published courses, one unknown selector, global subscriptions and a subset of environment fields; it is not production DB/config behavior. Shared filesystem isolation was instructional, not OS-enforced. None of the confirmed local responses was shown to be caused by a VM artifact.

Source:
- `edunex-b/services/aiCompliance.js:7–27` — checkAiInput / PROMPT_LEAKAGE_PATTERN.
- `edunex-b/services/productTutorResponse.js:66–95` — localizedGuidance.

Smallest coherent correction: Retain all original grades and frozen criteria. Store this source-aware audit separately. Resolve these eight questions with explicit product/security policy and a human semantic adjudicator before future scoring; define completeness relative to the actual user request. Future harness should add purchase-only/trial, explicit cross-course multi-turn and schema-validating fixtures, and stronger author isolation where available.

Risks and dependencies: Post-hoc regrading could inflate results; changing tests to mirror implementation would hide defects. Do not recalculate blind accuracy from this audit or automatically convert disputed failures to passes.

Regression tests: Independent semantic-equivalence examples, mandatory-versus-optional criteria, safe hard refusal, no forced name repetition for generic education; fixture parity and nonvacuous state seeding; freeze future rubric before execution.

Expected improvement: More defensible validity claims; the original 18/67/35 remains unchanged.

Verification: Human-reviewed rubric examples, frozen new protocol and transparent per-case rationale; no current evaluator or question-set edits.

Associated failed cases: FRESH-ML-003, FRESH-ML-005, FRESH-MT-013, FRESH-MT-016, FRESH-EG-006, FRESH-EG-012, FRESH-SA-012, FRESH-SA-016.

## RC10 — Course isolation and entitlement guards must remain intact

Status: NO NEW CONFIRMED SECURITY DEFECT.

The archive records 153 ownership/payload inspections, 735 protected source references, 57 validated payloads and no critical finding. Source uses authenticated identity, unique server course resolution, subscription/purchase checks, owner-scoped retrieval, protected-text assertions and pre-provider validation. Global-course active subscriptions and sparse course-switch fixtures limit coverage. Full-body matching is defense in depth, not proof against every partial/transformed leakage path.

Source:
- `edunex-b/middleware/compatAuth.js:78–129` — authenticateCompatible / requireCompatibleAuth.
- `edunex-b/services/aiTutorService.js:962–1047` — buildContext authoritative scope and entitlement.
- `edunex-b/services/tutorKnowledge.js:112–166` — sameCourse / assertKnowledgeScope / scopeConversationHistory.
- `edunex-b/services/tutorKnowledge.js:217–247` — retrieveKnowledge owner/materialAccess.
- `edunex-b/services/aiTutorService.js:1244–1246` — scopedProviderPayload.
- `edunex-b/services/courseAccess.js:1–15` — activeCourseEntitlement.

Smallest coherent correction: No security relaxation is proposed. Treat ownership, entitlement and Unicode security as invariants for every planned correction. Reuse verified capabilities in any direct exact-asset path; fail closed on ambiguity. Add missing entitlement and explicit cross-course transition coverage before making a release-compliance claim.

Risks and dependencies: A direct global template lookup or relaxed safety rule can reopen the corrected vulnerability. Synthetic passing boundaries do not establish production readiness.

Regression tests: Known critical isolation regressions, unauthorized/expired/trial/purchase-only/forged selectors, missing scope, user and course changes, protected-template assembly, malicious names across turns, payload absence assertions and partial-fragment controls.

Expected improvement: Preserve the reviewed security correction while improving reliability; no new security score is asserted.

Verification: Offline actual route and provider-payload inspection first; stop on any confirmed security violation; only approved non-production inference later.

Associated failed cases: FRESH-SA-012.

