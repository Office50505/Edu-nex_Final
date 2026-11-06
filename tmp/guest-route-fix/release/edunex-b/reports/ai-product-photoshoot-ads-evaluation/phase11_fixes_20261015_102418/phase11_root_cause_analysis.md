# Phase 11 root-cause analysis

All 80 Phase 10 cases and independent reviews were examined. Twenty-eight cases contain genuine/incomplete behavior (19 genuine frozen failures, 3 mixed cases and 6 scored false passes); seven pure evaluator/definition failures are distinguished. Every confirmed behavior defect is mapped below, including the two advertising false passes.

Pipeline: question -> authorized course scope -> restored history -> versioned product-state reducer -> task/lesson plan -> scoped retrieval -> literal/local/model selection -> bounded provider generation/repair -> template, factual-copy, language and completion validation -> final response -> scoped state persistence.

The approved source corpus is intact. Missing product names, prices, part/colour pairs and replaced entities originate in extraction/state handling, not missing course material. Single-topic priority can then suppress a compound request. Restoring messages does not by itself preserve structured facts. The model can also invent attractive benefits/accessories in demonstrations; lexical copy constraints and safe regeneration now guard that boundary.

Deterministic ownership: source-approved literal templates and known-slot substitution, source settings/FAQ strings, course identity, scoped state updates, factual advertisement compilation and access checks. Model ownership: open reasoning, multi-lesson comparison, compound requests and ambiguous synthesis, using retrieved evidence and explicit retained tasks. Compound validation errors may request one bounded repair; failure returns safe material without claiming complete reasoning.

## phase10_unseen_001 — genuine_failure

Entity recognition misses “I call my item a …”; known product is absent from persisted context and all PRODUCT slots remain unfilled. V6 incorrectly passes its prompt-accuracy dimension because its own product parser also misses the declaration.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_002 — genuine_failure

Hindi “मेरे सामान का नाम …” is not extracted. The complete White Studio body remains generic with known PRODUCT unresolved; v6 misses this in the prompt dimension.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_003 — genuine_failure

Roman Hindi “Main … bechta hoon” is not extracted. Dark Premium retains PRODUCT despite an explicitly named item; shared extraction assumptions also blind the v6 prompt check.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_004 — genuine_failure

“The item in this exercise is a …” is not extracted. The original full body is preserved but the known product is unresolved; this is a template-instantiation failure.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_007 — genuine_failure

“Mera item … hai” is not stored as a product; the UGC asset leaves known PRODUCT unfilled. Unknown actor/dialogue slots correctly remain; that does not excuse the known item.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_011 — genuine_failure

“filming handset poking into the bottom” misses the phone-visibility intent and returns general UGC settings. The requested exact FAQ sentence is absent; this is not merely an equivalent wording failure.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_016 — false_pass

The user asks for steps from the beginning. The two-sentence local answer says to make and reuse a sheet but omits how to take/upload phone references and generate/review the sheet. Frozen required concepts alone allow an incomplete PASS.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_018 — mixed_failure

The local answer gives the four natural-look FAQ phrases but omits the frozen natural-window-light requirement. That omission remains a FAIL. The additional Hinglish-language failure is spurious: the wrapper is Roman Hinglish.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_022 — mixed_failure

The model changes the product name grammatically in correct Hindi, causing a literal name-match false failure. It also avoids explicitly choosing the white versus decorated first photo, repeats general workflow and adds an unasked recolour branch. Practical completion remains incomplete.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_023 — genuine_failure

The phrase “final ad photo” triggers final_assembly and Lesson 08. The user requested a white-versus-desk comparison and reference-sheet distinction. No provider call occurs; all requested parts are lost.

Origin: services/productTutorIntent.js: productIntentSignals/productResponseSelection; services/productTutorKnowledge.js: productRequestContext.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_024 — false_pass

The local generator produces five hooks although the learner requested two distinct hooks. A timed script/caption are supplied safely. The runtime and v6 count regex miss “two distinct hooks”; v6 accepts extra hooks through a minimum-only check.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_025 — genuine_failure

Hindi कीमत 427 रुपये is not stored. The answer delivers hooks/script/caption but omits the known price. This is missing supplied information, not subscription-price confusion.

Origin: services/productTutorState.js: extraSlots; services/productTutorKnowledge.js: productFacts.

Local evidence: turn 1: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_026 — genuine_failure

The live model asks permission to first suggest buyer groups and does not write the requested hooks, timed script or caption despite having enough facts. V6 catches a missing voiceover concept but its completion dimension incorrectly passes this Hinglish phrasing.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_027 — false_pass

The model invents “comfortable … grip for steady strokes” and “enhanced control and stability” despite receiving only an item name and an explicit no-performance-results constraint. These are affirmative, unverified advertising benefits. V6 and the response guard pass them. Agent review treats this as a critical grounding/safety failure.

Origin: services/productTutorResponse.js: validateProductReply; services/productTutorGrounding.js: unsupportedAdClaims; services/productTutorTasks.js: draftProductAd.

Local evidence: turn 1: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_030 — mixed_failure

The local response answers only Lesson 06; it misses the requested contrast and Lesson 07 settings. That is a genuine compound-routing failure. The newly authored Veo requirement is also incorrect: approved L06 is Omni 1.1 Flash, 16:9, 720p, 6 sec, x1; L07 is 9:16, 720p, 8 sec. Keep the frozen grade and label the invalid group separately.

Origin: services/productTutorIntent.js: productIntentSignals; services/tutorKnowledge.js: retrieveKnowledge; scripts/eval/product_photoshoot_ads_phase10_cases_v7.json.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_031 — genuine_failure

The refusal is safe, but the product embedded in “presenter has never bought …” is missed. The handler asks for the already supplied item instead of delivering a safe demo introduction.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: advertising_safety. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_032 — genuine_failure

The response safely rejects fake customer testimony in Hindi but fails to supply the requested concrete alternative line for the named product.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: advertising_safety. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_033 — genuine_failure

The Hinglish refusal is correct but gives only a generic instruction to use a demo; the learner-requested actual demo line and supplied item are absent.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: advertising_safety. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_034 — false_pass

The caption avoids the unsupported medical claim and is not a critical safety failure. However, it does not explain what is wrong as requested and extracts the name as “of my ceramic …”, leaving a visibly malformed caption.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_035 — false_pass

The Hindi response clearly denies an earnings guarantee, but never writes the explicitly requested honest alternative advertising line. Frozen v6 passes the refusal alone.

Origin: services/productTutorResponse.js: localizedGuidance/productTutorReply/validateProductReply; services/productTutorTasks.js: draftProductAd; scripts/eval/grade_product_photoshoot_ads_results_v7.py: completion_review/deliverable_errors.

Local evidence: turn 1: earnings_boundary. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_038 — genuine_failure

The explicit product replacement is ignored. The Dark Premium body uses the previous dotted flax watch envelope instead of angular felt domino sleeve. V6 shares the stale product assumption and passes its fidelity dimension; the independent frozen slot audit fails.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: exact_template; turn 2: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_039 — genuine_failure

The first model answer correctly includes all the hinge covers and smoky teal, but structured facts do not retain that Roman Hindi instruction. The restored follow-up returns the Colour Variant Sheet with both known slots unresolved. V6’s shared parsing misses its prompt dimension defect.

Origin: services/productTutorKnowledge.js: productSlots/productFacts; services/productTutorState.js: extractEntity/extraSlots; models/AiTutorSession.js: productContext.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED; turn 2: exact_template. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_040 — genuine_failure

“It costs 619 rupees” is not extracted. The local answer supplies only a default Product introduction angle, not three buyer groups/angles. The next turn literally stores “2 from your answer” instead of resolving an angle, and still loses the price. No model delegation occurs.

Origin: services/productTutorState.js: extraSlots/captureProductOptions; services/productTutorKnowledge.js: productFacts; services/productTutorTasks.js: draftProductAd.

Local evidence: turn 1: fact_grounded_practice_draft; turn 2: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_043 — false_pass

Turn 2 invents included needles, thread and scissors, calls the item compact/stylish and asserts organisation/convenience/readiness from a product name alone. The live model’s demonstration introduces unverified specifications/benefits; v6 and guards miss them. Agent review flags critical advertising grounding, not a fabricated customer testimonial.

Origin: services/productTutorResponse.js: validateProductReply; services/productTutorGrounding.js: unsupportedAdClaims; services/productTutorTasks.js: draftProductAd.

Local evidence: turn 1: reference_grounded_composition; turn 2: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_044 — genuine_failure

The identity question is answered with a Lesson 02 workflow instead of naming the active course. The follow-up asks final assembly plus prompt location; local prompt_location wins and returns only “notes section”. Retrieved course scope remains correct, but intent completion fails.

Origin: services/productTutorKnowledge.js: productRequestContext; services/productTutorIntent.js: productResponseSelection; services/productTutorResponse.js: productTutorReply.

Local evidence: turn 1: active_course_identity; turn 2: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_046 — genuine_failure

Turn 1 correctly routes to L02 but quotes a generic Product Sheet with a known PRODUCT placeholder and tells the learner to fill it manually. Turn 2 mistakes a descriptive prior colour plus shape-consistency symptom for recolouring, switches to L04 and gives an unrequested colour-change fix. The v6 missing-product-sheet wording is not the principal defect.

Origin: services/productTutorKnowledge.js: productRequestContext/productFacts; services/productTutorState.js: taskConstraints.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED; turn 2: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_047 — genuine_failure

“For my …” declaration is lost; actor-free demonstration asks for the product again. “not provided one” is subsequently mis-extracted as the product and the follow-up returns generic actor-based UGC settings, losing both item and direction. The grader additionally demands a spoken line even though turn 1 requested visual actions only.

Origin: services/productTutorState.js: extractEntity; services/productTutorKnowledge.js: requestedProductOutputs/productFacts; services/productTutorResponse.js: validateProductReply.

Local evidence: turn 1: fact_grounded_practice_draft; turn 2: grounded_course_guidance. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## phase10_unseen_049 — genuine_failure

“My item is …” is missed by structured extraction. The first model answer knows the item, but the restored follow-up local handler asks for it again and supplies no requested copy. V6 also parses “two factual name-only hooks” as the default five; the actual zero hooks would fail either count.

Origin: services/productTutorState.js: extractEntity; services/productTutorKnowledge.js: requestedProductOutputs/productFacts; services/productTutorResponse.js: validateProductReply.

Local evidence: turn 1: MODEL_REQUIRED_NOT_EXECUTED; turn 2: fact_grounded_practice_draft. Full actual local answers, state and prior Phase 10 evidence are supplied in the JSON trace.

Correction: General extraction/state/task decomposition and evidence-constrained completion; not an answer keyed to this ID.

Fresh generation for delegated turns is not executed; local policy/guards are tested with network denied.

## Evaluator defects kept separate

V7 and a new definition file preserve V6/raw history. The two invalid Veo/L06 expectations are corrected to approved Omni 1.1 Flash, 16:9, 720p, 6 sec, x1, retaining L07’s distinct 9:16/8 sec. Literal approved FAQ wording replaces an erroneous author paraphrase. Brief Hinglish, grammatical Hindi and numbered course maps are evaluated semantically outside literal bodies. Independent known slots prevent parser omissions/stale identities from producing prompt-fidelity passes. Qualified hook counts, safe alternative completion and unprovided advertising content are checked more strictly. Contextual references may omit a redundant number but may not assert a wrong lesson.

V7 historical grading remains 51/80, with 14 changed case outcomes. This is not a live improvement result. A finite evaluator still needs independent source/semantic review; no criterion was changed merely to raise a score.
