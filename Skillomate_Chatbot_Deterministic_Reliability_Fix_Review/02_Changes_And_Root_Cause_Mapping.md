# Root cause to implementation mapping

## Approved copy/fill

productTutorKnowledge.js: wantsProductPrompt, explicitTemplateSlots, productSlots, renderProductTemplate; productTutorIntent.js: productCopyIntent; productTutorResponse.js: resolveProductTutorReply.

Raw mode ignores stored facts. Fill mode permits approved labels and supplied values only, including explicit slot-only limits. Unknown slots remain literal. No source-body edits.

## Task selection

productTutorIntent.js: productRequestPlan, productIntentSignals, productCourseDomain; routes/ai.js: chooseDirectReply.

Transient mode/operations/output counts/languages/parts accompany synthesis context. Account collision disambiguation runs only after server-resolved product-course context. Other-course selector never authorizes product assets.

## State and extraction

productTutorState.js: entity, declaration, extractEntity, productOperations; productTutorKnowledge.js: productFacts.

One safe identity grammar across state/rendering. Atomic replace/reset discards prior bound facts; rename retains same-item facts; quantity/material corrections replace obsolete values. Facts preceding a same-turn replacement are excluded. Original Unicode is retained; NFKC remains validation-only.

## Multilingual completeness

productTutorIntent.js: productResponseLanguage, explicitProductLanguage, requestedOutputCount; productTutorTasks.js: draftProductAd; productTutorResponse.js: productTutorReply.

Explicit explanation language wins over name script; output/dialogue languages can differ. Counts over local capacity delegate instead of silently truncating. Shared local contract checks requested artifacts and language. Accurate short explanations remain local.

## Grounding and refusal

productTutorGrounding.js: unsupportedAdClaims; productTutorResponse.js: productSafetyRequest, productAccessReply.

Keep all existing Unicode/name rejection rules and mandatory refusals. Negative attributes are excluded from positive claim evidence and marketing fact lines. Honest alternative cards remain labeled AI showcases. Inactive learners get legitimate restoration steps without protected bodies.

## Compatibility

aiTutorService.js: skillomatePlanDirectReply, skillomatePlatformDirectReply, learnerContextDirectReply; routes/ai.js.

Product-scoped optional locale arguments preserve existing two-argument callers. Existing API response keys, authentication and data schema remain. Extra explicit template values use the existing bounded attributes array for persistence; no migration.

Exact baseline-relative diffs and function/line indexes are in `evidence/phase_changes.patch` and `changed_file_manifest.json`. The diff is against the saved working tree, not HEAD; pre-existing user changes are included in neither the task patch nor rollback. `tutorKnowledge.js` needed no change: the failed requested assets were already retrieved and its owner checks remain byte-identical.
