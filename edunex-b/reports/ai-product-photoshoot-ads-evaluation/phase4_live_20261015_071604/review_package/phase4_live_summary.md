# Phase 4 fresh live application validation

Executed 2026-10-15T07:17:36.273Z to 2026-10-15T07:17:45.445Z UTC. All **80 cases / 100 turns** have actual user-facing responses; no skipped, inconclusive or provider-fallback cases. Provider: `fal.run`, `google/gemini-2.5-flash`. Evaluator: unchanged `product-tutor-v3.0`, integrated scope.

| Suite | Total | Passed | Failed | Skipped | Inconclusive |
|---|---:|---:|---:|---:|---:|
| original | 55 | 46 | 9 | 0 | 0 |
| held_out | 15 | 13 | 2 | 0 | 0 |
| unseen | 10 | 8 | 2 | 0 | 0 |
| Combined | 80 | 67 | 13 | 0 | 0 |

**Overall: 67/80 (83.75%). Target 95% not met. Critical failures: 1. Zero-critical and 100%-template targets not met. No production readiness is claimed.**

## Exact prompts and critical cases

Independent full-template comparison: **28/29 (96.55%)**, spanning all 19 approved headings. Original + held-out template requests: 25/25; new unseen requests: 3/4. `phase4_new_002`, turn 2, leaves the supplied handle and cobalt blue as placeholders: one critical full-template failure. The v3 template dimension does not activate for the new multi-turn category without exact_required, so independent comparison is essential.

The three prior critical template turns (`new15_002`, `new15_conv_001`, `new15_conv_005`) now match their full source bodies. The complete `new15_conv_005` case still fails v3 because turn 1 does not repeat the product name; that is separate from its corrected template substitution.

Exact troubleshooting FAQ instructions: **2/3**; `phase4_new_007` misses the verbatim phone-visibility sentence. Across full templates and these FAQ instructions: **30/32** exact-output checks. This is separate from v3's 99/100 prompt-dimension passes; do not label that dimension as 99% independent prompt fidelity.

## Language, safety, course scope and provenance

Delivered language: **100/100 turns pass the unchanged bounded v3 language check**; the per-language table is in the JSON. This is sampled automated language matching, not a universal linguistic-quality guarantee. One raw provider answer to an English follow-up is Hinglish; the guard replaces it in English but loses its L06 settings.

All **100/100 delivered turns pass v3 safety checks**, and focused review of the advertising requests found no affirmative fake testimonial, invented specific product benefit or earnings guarantee. No other-course disclosure was observed. Zero observed advertising critical failures is distinct from the one critical template failure. Safety semantics remain bounded and need human review for unfamiliar phrasing.

Origins by delivered turn: **93 deterministic local**, **5 live model**, **2 response-validation replacements**, **0 provider fallback**. The two replacements were for lesson attribution/language, not safety replacements. There were **7 scored successful provider calls** (all HTTP 200, first attempt) plus **1 successful preflight call**. Only five delivered turns retain live-model provenance; local/replaced answers are not raw model answers. Raw model evidence and delivered text are stored separately.

Two supplemental, controlled fallback drills inject timeout and connection errors at transport, make zero external requests, preserve distinct diagnostics, retry twice and honestly label fallback. They are excluded from the 80-case score. Their generic saved guidance is safe but does not fully answer the composition question.

## Historical comparison

| Measure | Passed/total | Rate |
|---|---:|---:|
| Phase 2 live, v2 | 45/70 | 64.3% |
| Same Phase 2 saved answers, v3 | 55/70 | 78.6% |
| Fresh original + existing held-out, v3 | 59/70 | 84.3% |
| Fresh including unseen cases, v3 | 67/80 | 83.8% |

The like-for-like 70-case v3 comparison increases by 4 passes (5.7 percentage points). Fresh original is 46/55, unchanged from saved-response v3; held-out rises from 9/15 to 13/15. The 80-case score includes a different test mix. Origin mix also changed, so none of these figures is a model-only improvement claim. Model-only v3 results are 2 passed, 1 failed and 77 inconclusive; most cases contain local turns.

## Local checks and limitations

**153/153 backend AI tutor regressions and 43/43 evaluator tests passed after live execution**, zero failures/skips, with network denied for Node tests. No application change was made during this evaluation.

Manual analysis flags five genuine/incomplete chatbot failures and eight likely evaluator false-failure cases. These observations do not rewrite the official 67/80 v3 result. Remaining chatbot issues include colour/shape routing, festive-detail coverage, exact FAQ paraphrases, follow-up-preserving language replacement and colour-slot clause boundaries.

Actual application HTTP route, retrieval, routing, prompt assembly, live adapter and guards ran with synthetic authentication/course/entitlement fixtures and in-memory session persistence. Production authentication/database, deployed infrastructure, concurrency and sustained provider reliability are not validated. Course-only outbound projection omits unrelated platform/payment context. The small, reused original/held-out corpus and 10 newly authored cases do not establish broad production readiness.

All 149 historical evidence files and the recorded application/source hashes are unchanged. No production resource change, deployment, commit or push occurred. See the raw JSON, configuration, independent audits and saved regression logs for verification.
