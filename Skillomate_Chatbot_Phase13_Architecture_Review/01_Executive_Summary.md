# Phase 13 architecture review — Skillomate product-course chatbot

Review date: 16 October 2026, Asia/Kolkata. Scope: the implementation indexed as **AI Product Photoshoot & Ads**, referred to in the brief as **AI Product Shoot & Videos**. These names are not interchangeable identifiers: the located code uses the slug family in `edunex-b/services/productTutorKnowledge.js:7–10`. No additional course alias was assumed or added.

**Decision: safe to begin a narrowly scoped, local implementation after approval; not safe to deploy or claim release readiness.** Four critical failures are reproduced and understood. The proposed changes need new tests, an independent template oracle, and fresh evaluation before any release decision. This phase made no application source, production configuration, model, evaluator, or existing test changes and performed no deployment.

## Verified evidence

| Evidence | Phase 12 recorded result | Phase 13 verification |
|---|---:|---|
| Overall evaluation | 40/60 passed | Confirmed from saved structured results; not rerun as a live-model evaluation |
| New questions | 20/40 passed | Confirmed from saved set totals |
| Requested exact-template checks | 20/24 passed | Confirmed from independent audit; all four failures replayed |
| Backend regression suite | 351/351 passed | Fresh run: 351 passed, 0 failed, 0 skipped |
| Evaluator regression suite | 167/167 passed | Fresh run: 167 passed, 0 failed, 0 skipped |
| Critical reproduction | Four cases, five turns | All five answers byte-identical to Phase 12; four expected-body failures and one passing setup turn |

All **47 files in the Phase 12 source freeze match current files by SHA-256**. Current Git status already contains staged, unstaged and untracked user work; this review does not treat HEAD as the tested baseline. Evidence protects 252 application/test files and 133 Phase 12 artifact files against changes during this review.

Phase 12 additionally records 76 user-facing turns: 60 local and 16 model-origin, no provider fallback. Its independent audit also found two failures among three supplemental workflow quotations: 21/27 across requested plus supplemental checks. Keep those denominators separate from 20/24. Passing backend/evaluator tests do not establish unseen-language coverage or eliminate the documented evaluator false positives.

Primary prior evidence: `edunex-b/reports/ai-product-photoshoot-ads-evaluation/phase12_live_20261015_110001/{phase12_live_results.json,phase12_template_audit.json,application_raw_results.json,unseen_definitions_frozen.json,regression/*_verified_execution.json}`. A portable selected extract is included in `evidence/phase12_evidence_extract.json`.

## Confirmed causes

| Failure | Confirmed mechanism | Smallest safe correction |
|---|---|---|
| L02 Product Sheet returned label advice | “Full approved … text” fails the prompt/template-noun gate; `label` inside “seed-label” activates the blur topic; the indirect object declaration is also unrecognized | Recognize an affirmative request for a named approved asset without requiring the noun “prompt”; exclude entity spans from symptom inference; capture subject declarations |
| Hindi product missing from White Studio | `हमारी वस्तु का नाम … है` is outside both product parsers; Unicode substitution itself works | Expand general declaration grammar and noun classes, preserving the exact declared name |
| Hinge-pin recolour placeholders | Active-verb parser misses the passive construction; generic `of …` fallback wrongly promotes the recolour clause to a product identity | Parse recolour target/action/result independently of identity; support active/passive constructions; prohibit action clauses as identity evidence |
| Product switch keeps old item | Roman Hindi `product ko … se replace karo` is not recognized; without a new identity the existing state is retained | Parse replacement as an explicit state operation and clear dependent old facts atomically when it succeeds |

All four responses are deterministic local outputs. No model invocation was needed for reproduction. Retraining or changing the provider would not repair these paths.

The Product Sheet diagnosis refines Phase 12's prose: **plain “text” is not the matched blur keyword**. The implemented expression matches `label` within the compound product name. The `troubleshooting` boolean is false in that case; a blur-topic FAQ is nevertheless selected through the local-guidance branch. The recolour case also stores the bogus identity `two removable hinge pins changed to pale saffron`, beyond its visible placeholder failure.

## Additional confirmed concerns

- “Explain why L02 White Studio is useful” returns the entire template without the requested explanation. An asset candidate is treated as an exact request before reasoning selection.
- An original image-prompt request can receive “Which approved template heading…” instead of generation. Exact and open-generation intent are conflated.
- The Phase 12 negated Hinglish prompt mention still activates exact-template clarification.
- “Again” after an exact answer restores history but returns workflow guidance rather than repeating the asset.
- “Forget the previous product and start over” does not reset product facts.
- A different nonempty conversation ID isolates a new chat in the fixture. Missing IDs can reuse saved facts. Server persistence is a single row per user/course, so A→B→A without client history loses A's state.
- The web widget has local chat IDs but omits `conversationId` from its request; the mobile helper sends it. Hindi material/colour declarations and many constraints are not represented in structured state.

The four-case patch should be reviewed separately from conversation storage redesign. Report 04 distinguishes required changes from staged follow-up work.

## Evidence and limits

`evidence/reproduce.cjs` extracts and executes the **unchanged `makeApp` function from the existing Phase 12 runner**, using current source, the original synthetic course, synthetic auth/entitlements and in-memory sessions through actual Express loopback HTTP. It loads no environment files or real keys, denies external fetch, and opens only temporary local ports. The sandbox initially refused a temporary port; the replay succeeded with reviewed execution access. No rejected attempt is counted as a test pass.

`evidence/reproduction_results.json` contains complete answers, independently filled expected bodies, state, retrieval diagnostics, comparisons and provider request counts. External provider attempts: **0**. Extra probes use direct modules and the existing in-process fixture; any provider there is explicitly a stub, not live inference. `evidence/node_verified_execution.json` and `python_verified_execution.json` record the fresh 351/351 and 167/167 runs.

Remaining uncertainties: deployed behavior, real authentication/database persistence, concurrent writes, browser behavior, all multilingual paraphrases, and new model-origin response quality were not freshly tested. No claim that any failure is fixed is made. Approval is required before changing code; deployment remains prohibited.
