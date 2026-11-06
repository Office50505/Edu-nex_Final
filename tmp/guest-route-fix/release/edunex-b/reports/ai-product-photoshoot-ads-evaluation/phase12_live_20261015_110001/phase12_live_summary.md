# Phase 12 controlled live results

Frozen v7 integrated score: **40/60 passed (66.67%)**, **20 failed**, **0 skipped**, **0 inconclusive**, **0 provider fallbacks**. The 40 new cases were generated and frozen before execution; no source, evaluator or definition was changed after seeing responses.

| Set | Passed | Failed | Skipped | Inconclusive | Accuracy |
|---|---:|---:|---:|---:|---:|
| Genuinely new questions | 20/40 | 20 | 0 | 0 | 50.0% |
| Existing coverage regressions | 20/20 | 0 | 0 | 0 | 100.0% |
| Combined | 40/60 | 20 | 0 | 0 | 66.67% |

There are **76 actual user-facing turns**: **60 local**, **16 live-model-origin**, **0 repaired model**, **0 replacement**, **0 fallback**. Eight live answers are byte-identical to upstream text; eight have application citation-marker cleanup. Sixteen scored provider calls plus one separate probe returned HTTP 200. No repair request was observed. All raw upstream text, final answers, safe payloads, diagnostics and latencies are saved; local outputs are never called model answers.

The independent frozen requested-template audit passes **20/24 (83.33%)**, fails four: new_001, new_002, new_005 and new_029 turn 2. These are four critical cases (one missing full asset, two unfilled known field cases and one stale product switch). The original 20 regression cases include 10 independent template checks, all passing; unseen requested templates pass 10/14. All 19 approved headings are covered across the sets.

Three additional complete source quotations in workflow answers were also audited against expectations frozen before responses: one passes, two fail (new_014 retains PRODUCT; new_032 adds brackets around known values). Across requested and additional expectations, **21/27 checks pass**, six fail, including one absent requested body. There are 26 actual complete quoted/fenced bodies, plus that missing requested body; the denominators are intentionally distinct.

Independent advertising review found **zero critical advertising-safety failures** across 19 predeclared creative/safety/original ethical turns, with all 76 answers screened. Unsupported benefits/accessories, fake buyer testimonials, cures and earnings guarantees were not affirmatively generated. The three v7 safety failures are false positives involving Unicode digits/known Hindi identity or the imperative “Provide real product details”. Safe medical-caption response new_025 still omits a requested explanation; safety and task completion are distinct. Most ad answers are deterministic local drafts, so unconstrained model ad safety is not established.

V7 language checks pass **75/76 turns (98.68%)**; new_040 turn 2 genuinely answers in English instead of Hinglish. All 14 omitted-client-history turns restore server-side history, yet some task/switch/symptom parsers still fail. Restoring messages does not prove semantic continuity. See the per-language counts and full frozen source content resolved from actual debug chunk IDs/hashes in phase12_live_results.json.

Independent review classifies the 20 frozen failures as 12 genuine failures, 3 mixed failures and 5 pure false failures. Three scored passes have additional quality/template defects; two further passes are borderline. No manually adjusted headline score replaces v7. Exact source bodies in new_007/new_031 pass independent audit despite their v7 prompt-dimension failures.

Backend regressions **351/351 pass**; evaluator tests **167/167 pass**, zero failures/skips. Existing-course local regression controls pass; no fresh AI Influencer/AI Filmmaking responses were generated. All eight lessons, 19 exact assets and unique source record IDs remain available. All 47 frozen source files, seven frozen definition/criteria files, 742 historical files and prior ZIPs retain their hashes.

The historical Phase 10 v6/v7 totals are 51/80; this new 40/60 result uses different unseen questions and a different regression mix and is not a paired effect estimate. **Not ready:** overall, unseen and exact-template targets are missed. No deployment, commit, push, code/evaluator change or production modification occurred.

