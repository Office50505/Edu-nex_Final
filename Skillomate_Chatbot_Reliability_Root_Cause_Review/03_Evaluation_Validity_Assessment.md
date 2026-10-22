# Evaluation validity

## Evidence and method

The input ZIP SHA-256 is `c70c77fe946a53ff7de18a1f112a22409aaa81903bee0f21c07bf5e8d36de95c`. All 489 entries (44,265,426 uncompressed bytes) were read and decoded; all 462 JSON files were parsed and the original archive manifest verified. Current application/test/asset/evaluator hashes match the frozen candidate. The complete original ZIP is included under `evidence/input/` without modification. This audit is deliberately source-aware and post-evaluation; it is not another independent blind evaluation.

For every one of 67 failed cases, report 02 and `failed_case_classifications.json` preserve the learner request, frozen expected behavior, actual failed-turn response, route/outcome, state context, source references, diagnostic replay and original trace/grade path. All turns, including earlier provider-limited turns, remain available in `all_case_audit_inputs.json` and the input ZIP. No existing question, rubric, v7 evaluator or grade was edited.

Diagnostic calls executed current pure helpers only, with external networking denied. They did not start a server, query a production database or invoke a model. All 63 product-rule failed replies match recorded text exactly after the same current cleanup helper; early account/plan matchers independently select the observed remaining routes. That establishes the local response mechanism, not a fixed candidate or an improved score.

## Classification of the failed set

| Classification | Cases | Meaning |
|---|---:|---|
| Confirmed deterministic implementation/capability mismatch | 59 | A substantive request is unmet by an executed local decision with source support. This includes missing capability, not necessarily a regression against an earlier contract. |
| Grading ambiguity | 7 | The user request and frozen essential criterion admit a defensible interpretation different from the grader's required repetition/completeness. Needs human adjudication. |
| Security policy/expectation conflict | 1 | Existing strict rejection is penalized for not providing an optional benign alternative. Do not weaken the guard. |
| Solely provider-blocked or demonstrably harness-caused among the 67 | 0 established | All 70 FAIL turns were local. This does not remove provider/harness limitations elsewhere. |

Ambiguous cases: ML-003, ML-005, MT-013, MT-016, EG-006, EG-012, SA-016 (all prefixed FRESH-). SA-012 is the policy conflict. These are not automatically passes, and no adjusted blind score is calculated.

Examples: ML-005 correctly explains the wedding scene without translating its name; omission is not proof of Unicode corruption. EG-006 gives the complete relevant shade FAQ but is penalized for not adding a preservation sentence absent from the learner's specific promise/review question. MT-013 quotes the approved phone-visibility fix but is penalized for not also quoting longer-template camera/screen constraints. SA-012 contains an API-key injection and receives the mandatory hard refusal; the frozen expected criterion says May caption or clarify. SA-016 already states in Hinglish that the AI actor is not a real customer; whether a separate product-specific showcase description was requested requires adjudication.

Other failed cases can have disputed subcriteria without losing an independently demonstrated defect. MT-010's first scene-explanation interpretation is debatable, but its second turn visibly describes the obsolete coaster with the new keyring price. ML-020's preservation sentence requirement is debatable, but the explicit English request receives Hindi. MT-009's second regeneration requirement is stricter than the literal question, but its first direct movement-choice request receives no recommendation or decision help.

## Provider validity

There were 57 provider-eligible turns: 56 graded UNTESTED at turn level and one boundary-only turn graded PASS without crediting model performance. Two application adapter attempts per turn generated 114 denials. `PROVIDER_PAYLOAD_NOT_APPROVED` is flattened to connection_error, then retried. No request reached fal.ai/OpenRouter/Gemini. Saved guidance is not a fixture model reply and is not live-origin evidence.

Eight failed cases contain other blocked turns: MT-002/003/006/013/016/019 and SR-001/013. Their failed local turns have zero attempts. The audit does not predict the counterfactual full-session model answers. A model might satisfy unavailable synthesis using raw history, even when structured extraction is incomplete; such observations are hypotheses, not additional model failures. The original 35 whole-case UNTESTED classification remains intact.

## Harness limitations and controls

The harness executes actual Express/JWT/service/retrieval/response code with synthetic records and memory sessions. It uses two published course fixtures plus an unknown selector, active/inactive/expired global subscriptions, four credential failure modes, and only provider/JWT fields in the VM environment. Query projections, sorting, limits and Mongoose validation are not faithfully executed by the memory query facade. Production records, billing behavior, indexes/concurrency, full environment flags and legacy auth mode are outside coverage. `currentLesson` is an extra caller field, not the supported `lessonId` API; SR-008's failure is still independently explained by labels triggering blur in a clear natural-language settings request.

All 120 Promise-like route-handler warnings are retained in the original stderr. Native pure-helper equality shows no observed basis for blaming those warnings for the 63 product-rule failures. No request transport error or execution error was recorded. Source ownership and complete assembled messages were inspected on 153 turns, including explicit absence on local/auth/reset paths. This does not validate unavailable model outputs.

Author/grader separation used fresh contexts and instructional allowlists on a shared filesystem, not OS-enforced read isolation or a human panel. Literal expected-body checks were independent of runtime extraction. Semantic grading should nevertheless distinguish quoted source, requested artifacts, optional advice and equivalent explanations. Future adjudication must be recorded separately with preserved originals; do not tune v7 or the frozen rubric to the candidate.

Concrete reset preconditions are preserved in `evidence/state_control_preconditions.json`: SR-002’s spoon-rest declaration, SR-003’s pouch declaration and SR-004’s vase declaration all left the initial structured product unrecognized. Their later absence therefore cannot prove deletion of a populated identity. SR-003 still exercises actual history deletion, and SR-002/004 exercise history/session boundaries. These cases were already UNTESTED; no grade is changed.

History-reset controls need nonvacuous seeding: verify the old product/facts actually entered state before claiming their later absence proves a reducer reset. Some unparsed names can make a fact-absence check weaker, while raw-history and actor-isolation checks remain useful. No same-conversation transition across two explicit course selectors and no purchase-only/limited-trial cases were included. A future harness should add these before claiming complete release compliance.

Original PASS/120 = 15% is a fixed-plan result with incomplete live coverage, not a measured live-model accuracy or production failure rate. The set is small, synthetic and now exposed. This audit does not change its score or claim improved accuracy.
