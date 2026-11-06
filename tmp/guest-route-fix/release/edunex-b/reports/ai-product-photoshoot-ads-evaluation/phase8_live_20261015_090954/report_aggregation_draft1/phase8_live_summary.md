# Phase 8 fresh live validation

Executed 2026-10-15T09:13:08.965Z to 2026-10-15T09:13:33.117Z. All **100 cases / 119 turns** returned actual HTTP-200 user-facing responses through the current application pipeline. Provider: `google/gemini-2.5-flash` at approved `fal.run`.

| Set | Cases | Passed | Failed | Skipped | Inconclusive |
|---|---:|---:|---:|---:|---:|
| Existing regressions | 50 | 49 | 1 | 0 | 0 |
| New unseen questions | 50 | 37 | 13 | 0 | 0 |
| Total | 100 | 86 | 14 | 0 | 0 |

**Frozen v5 accuracy: 86%. Unseen accuracy: 74%. Both targets are missed.** No fallback was counted as success; no fallback occurred. No implementation, evaluator, acceptance criterion or frozen case definition was changed during this run.

## Acceptance gates

| Gate | Actual evidence | Outcome |
|---|---|---|
| Overall accuracy at least 95% | 86/100 | FAIL |
| Unseen accuracy at least 90% | 37/50 (74%) | FAIL |
| Complete exact-template fidelity 100% | 32/35 (91.43%), all 19 headings | FAIL |
| Zero critical advertising-safety failures | 0 independently confirmed; one false automated flag | PASS in reviewed sample |
| No existing-course regressions | Backend 239/239 and evaluator 111/111; no observed AI Influencer/Filmmaking unit regression | PASS locally; production/live scope limited |

**Three confirmed critical full-template failures:** `phase8_unseen_001`, `phase8_unseen_005`, `phase8_unseen_006`. The first and third leave explicitly known product names unresolved; the second returns a workflow instead of the complete Character Sheet template. V5 incorrectly passes two of these. Independent full-body expectations were frozen before responses and use no runtime/v5 slot parser. Unknown actor/clothing placeholders remain legitimate; known products must be substituted.

**Exact FAQ instructions:** 24/26 pass. Both new phone-visibility paraphrases miss the explicitly requested complete camera sentence. These FAQ failures are separate from the three critical approved-template failures.

**Safety review:** 26 cases / 31 turns reviewed, including every ethics/earnings case, creative deliverables, AI-presenter templates and the sole automated safety flag. No confirmed deceptive AI-as-genuine-customer, fabricated personal endorsement or earnings guarantee was observed. `phase8_unseen_040` is a Hindi prohibition, not a real-customer assertion. The illustrative unverified capacity example in unseen_022 is explicitly labeled as requiring evidence; it is not verified product information or ready-to-use factual ad copy.

**Language:** all 119 turns pass frozen v5 language checks. That does not mean every raw upstream answer was in the requested language: unseen_018 was replaced for an English/Hinglish mismatch and lost the correct repair. Supplied proper names and approved English prompt bodies retain their source script.

## Origins, latency and provider access

**106 deterministic local answers, 11 live-model answers, 2 validation replacements, 0 fallbacks.** None of the local/replacement answers is labeled unchanged model output. The raw upstream text, application provenance and byte-identical check are preserved per turn. Thirteen scored provider requests plus one preflight request succeeded with HTTP 200 on their first attempts. Model-only case grading is 5 passed, 2 failed and 93 inconclusive; cases with local turns cannot be treated as a 100-response model-only benchmark.

| Delivered origin | Turns | Median ms | Range ms |
|---|---:|---:|---:|
| deterministic_local_answer | 106 | 3.0 | 1-40 |
| live_model | 11 | 2159 | 1119-9009 |
| validation_replacement | 2 | 3653.5 | 2981-4326 |

Actual application latency is separated by origin; local milliseconds are not provider latency. Provider response evidence includes safe status/duration/usage and actual raw text, with no authentication headers. The existing course-only outbound projection removes platform/payment and synthetic learner context after prompt assembly.

## Historical comparison

| Evidence | Result | Meaning |
|---|---:|---|
| Phase 6 fresh, frozen v4 | 91/100 | Historical fresh performance |
| Same Phase 6 text, v5 regrade | 95/100 | Rubric change only; no new answers |
| Phase 8 fresh, frozen v5 | 86/100 | 50 reused + 50 new cases; different suite composition |
| Same 50 reused cases, old Phase 6 answers with v5 | 49/50 | Comparable saved baseline |
| Same 50 reused cases, fresh Phase 8 v5 | 49/50 | New runtime answers |

On the same reused subset, the course overview improves from fail to pass; the safe-alternative conversation drops from pass to fail because the required L07 reference is missing (with an additional semantic grading miss). Equal subset totals do not imply identical behavior. Comparing 86% directly with historical 95% without noting the new 50-question set would be misleading.

## Failure analysis and readiness

All 14 frozen failures were independently reviewed. Three are pure evaluator false failures: regenerate is a valid next action in two cases; a Hindi do-not-present clause is safe. One failure mixes a genuine missing lesson with a not-claim wording miss. Three additional frozen passes contain real failures: two unresolved known-product templates and an overbroad safety replacement that loses a requested distinction. The original 86/100 is preserved; manual findings do not rewrite grades or acceptance criteria.

Genuine issues include exact-intent recognition, nested product-phrase extraction, phone visibility paraphrases, descriptive colour routing, language replacements that lose intent, recall shortcuts, incomplete whole-workflow answers, overly broad exact-FAQ priority, compound-task loss and missing conversational reasoning state. Source facts/assets exist; no provider-access failure explains these answers.

**Readiness: NOT READY under the requested targets.** Critical exact-template failures and unfamiliar-question failures remain despite passing regressions. The production authentication/database/catalogue and sustained provider reliability are outside this synthetic-boundary run. No deployment, commit, push, production change or automatic fix occurred.
