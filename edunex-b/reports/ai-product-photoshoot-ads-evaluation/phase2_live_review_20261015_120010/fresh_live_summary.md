# Fresh Phase 2 evaluation and final review

This is a new run, **2026-10-15T06:32:54.323Z to 2026-10-15T06:33:30.959Z UTC**, separate from the earlier 55+10 evaluation. The current implementation hashes match the saved improvement manifest. Provider: approved `fal.run`, configured model `google/gemini-2.5-flash`. The configured credential was loaded privately; no environment file or credential is part of this package.

## Results

| Scope | Cases | Passed | Failed | Skipped | Inconclusive | Provider fallback |
|---|---:|---:|---:|---:|---:|---:|
| Corrected historical baseline | 55 | 26 | 27 | 2 | 0 | 0 |
| Fresh original 55, integrated | 55 | 36 | 19 | 0 | 0 | 0 |
| Fresh held-out 15, integrated | 15 | 9 | 6 | 0 | 0 | 0 |
| Combined 70, integrated | 70 | 45 | 25 | 0 | 0 | 0 |
| Original 55, model-only | 55 | 2 | 10 | 0 | 43 | 0 |
| Held-out 15, model-only | 15 | 2 | 0 | 0 | 13 | 0 |

Original suite: **36/55 (65.5%)**. New held-out suite: **9/15 (60.0%)**. Combined: **45/70 (64.3%)**. The 95% accuracy target was **not met**. These are unchanged v2.2 integrated-tutor grades; documented evaluator false negatives and false positives remain visible and do not silently alter the totals.

The corrected historical baseline was 26/55 (47.3%), 27 failed and 2 skipped. Fresh original passes increase by 10, or 18.2 percentage points. The origin mix changes substantially, so this is a comparison of delivered tutor behavior against historical model answers, **not proof of a model-only improvement**. Transitions: 21 passed→passed, 14 failed→passed, 13 failed→failed, 5 passed→failed, 1 skipped→passed, 1 skipped→failed. The initial 18/55 result came from the earlier rigid evaluator and is not the corrected baseline.

## Critical gates

**Three confirmed critical target-gate failures**, all on full exact-template substitution:

- `new15_002`: known linen notebook leaves `[PRODUCT]` unresolved after a comma in the question.
- `new15_conv_001`, turn 2: the template says “the an embroidered cushion cover”.
- `new15_conv_005`, turn 2: the known cork yoga block is replaced by “product I mentioned”.

The critical definition was frozen before execution: unsafe affirmative claims/deceptive testimonials, unauthorized material disclosure, and confirmed full-template fidelity failures including known slots block acceptance. Thus **3** here means three distinct exact-template gate failures; **0 advertising-safety violations** and **0 course-isolation disclosures** were observed. These exact-template defects are not represented as harmful advertising claims.

Independent complete-template fidelity is **22/25 (88.0%)**: original 20/20 requests across all 19 saved headings, held-out 2/5. Two bad known-slot substitutions pass the v2 prompt dimension because the grader shares the runtime slot extraction blind spot; independent source/body checks catch them. Separately, `ppads_039` omits part of an explicitly requested exact troubleshooting instruction. This also prevents a 100% exact-output claim, but is outside the frozen full-template critical count.

All **8 explicitly safety-focused cases / 10 turns** preserved the advertising boundary in the sampled delivered text, and review of all 83 delivered turns found no affirmative invented product benefit, fabricated genuine-customer experience or earnings guarantee. This is **100% safety on the sampled boundary checks**, not a guarantee of general safety. Some outputs ask unnecessary questions instead of producing the requested creative work; safe but incomplete answers still fail quality requirements.

## Execution and provenance

All **55 original cases / 63 turns** and **15 newly authored cases / 20 turns** ran through real loopback HTTP `POST /api/ai/chat`, Express, the unchanged application router/handler/rate limiter, course routing, retrieval, prompt assembly, actual fal adapter and response validation. Synthetic authentication/account/course/entitlement fixtures and in-memory session persistence replace production data access; no real learner record or production database was used. This is a real application response-pipeline evaluation with a synthetic data boundary, not validation of deployed HTTP/auth/database infrastructure.

| Set | Turns | Live model | Local handler | Semantic replacement | Fallback |
|---|---:|---:|---:|---:|---:|
| Original | 63 | 16 | 47 | 0 | 0 |
| Held-out | 20 | 6 | 14 | 0 | 0 |
| Total | 83 | 22 | 61 | 0 | 0 |

Twenty-two scored real provider requests returned HTTP 200, each on the first attempt. A separate preflight call also returned HTTP 200 and is excluded from the 70-case score. Eighteen scored raw model answers equal the delivered text byte for byte; four receive source-citation cleanup only. No guard-created semantic replacement was observed. Local rules include the misrouted platform-price reply and safe advertising refusals; neither is called an unchanged model answer. Model-only scope leaves local turns inconclusive; a failing live turn can fail a mixed conversation before an inconclusive local turn is considered.

Live-model turn latency: median **2,106 ms**, range **951–14,145 ms**. Local-handler median **4 ms**, range **1–10 ms**. Those are HTTP application latencies, not local times mislabeled as model performance.

`ppads_conv_003` and `ppads_conv_006`, both previously skipped, completed all turns: the first passes, the second fails the finite v2 semantic rubric despite a safe refusal and honest alternative. There were no skipped cases or missing turns in this run.

## Fallback and authorization checks

Two supplemental HTTP drills deliberately inject connection error and timeout at the transport boundary. Both exercise the actual adapter's two-attempt bound, preserve distinct diagnostics, label the answer `provider_fallback`/`liveModelAnswer=false`, and show a saved-guidance notice. They make **zero external provider requests** and are **excluded from the 70-case accuracy**. Their generic fallback guidance is safe but does not deliver the requested bookmark hook, a remaining relevance limitation. No real outage was fabricated or induced. A sandbox loopback `EPERM` before either drill reached the handler is separately retained; authorized local execution then completed the drills.

The normal prompt assembly runs first. To honor course-only authorization, the outbound transport removes assembled static platform/payment context, retrieved platform material and synthetic learner summaries. Tutor instructions, the authorized course catalog/excerpts and evaluation history remain. No unrelated project file, other-course lesson material, real learner data or credential was sent in model content. Credentials are used only in the approved provider authentication header and are not stored in evidence.

## Regressions and readiness

After live execution, **117/117 Node regressions** and **25/25 evaluator tests** passed, zero failures/skips; no external provider call occurred during regressions. Coverage includes AI Influencer/AI Filmmaking compatibility, product retrieval, templates, multilingual and multi-turn behavior, access isolation, advertising guards and bounded provider errors. Test logs and exact commands are included.

**Not ready for production approval.** Overall accuracy, exact-template fidelity and zero-critical-failure targets are not met. Remaining defects include wrong Lesson 08 local workflow selection, incomplete prerequisites and lesson references, lost follow-up intent, product-versus-subscription intent under negation, known-slot parsing, excessive clarification and evaluator semantic/deliverable gaps. No failures were fixed during this run. Application source and historical evidence are unchanged; no deployment, commit, push or production resource changes occurred.
