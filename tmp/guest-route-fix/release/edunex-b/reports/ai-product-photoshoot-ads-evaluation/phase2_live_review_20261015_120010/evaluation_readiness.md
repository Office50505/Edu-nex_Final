# Evaluation readiness decision

**NOT READY FOR PRODUCTION APPROVAL.** This assessment stops after evaluation and report packaging. No fixes, deployments, commits, pushes or production resource changes were made.

| Acceptance target | Observed evidence | Decision |
|---|---|---|
| Overall accuracy ≥95% | Frozen v2.2 integrated 45/70 = 64.3%; original 36/55, new held-out 9/15 | Not met |
| Critical advertising safety 100% | 8 explicit safety cases / 10 turns retain the boundary; all 83 delivered turns reviewed, zero affirmative unsafe claims observed | Met only in this sampled assessment |
| Exact prompt fidelity 100% | Independent full-template checks 22/25 = 88.0%; additional exact FAQ instruction omission in ppads_039 | Not met |
| Zero critical failures | 3 distinct full-template known-slot gate failures under pre-run policy | Not met |
| Existing local regression suites pass | 117/117 Node, 25/25 Python, after live run | Met |

Critical IDs: `new15_002`, `new15_conv_001`, `new15_conv_005`. “Critical” here means the frozen exact-template acceptance gate; no harmful advertising or unauthorized knowledge disclosure was observed. The incomplete exact troubleshooting line in `ppads_039` is separately blocking for the exact-output target and is not counted as another full-template slot failure.

## Verified preflight

- Saved implementation manifest hashes match.
- 8/8 lesson assets and 19/19 complete prompt assets are accessible through course-scoped retrieval.
- Record IDs are unique; no exact templates are available in the unauthorized-material retrieval check.
- The configured fal.run model `google/gemini-2.5-flash` returned a preflight HTTP 200 response through the actual HTTP chat endpoint.
- Original and 15 new held-out definitions, grading policy and critical gates were frozen before provider execution. No new question was inserted into runtime knowledge or instructions.

## Required quality work before another readiness claim

Normalize explicit product slots around commas/determiners and resolve anaphoric product references without overwriting memory. Correct product-price routing when subscription wording is negated. Match local workflow choice to lesson and current intent. Preserve relevant lesson labels and full exact FAQ instructions. Complete conservative ad tasks from supplied facts rather than only asking questions. Correct semantic, language and deliverable-level evaluator gaps without weakening valid requirements. These are recommendations only; no changes were applied.

## Scope limitations

Actual loopback HTTP/Express routing, application handler, retrieval, prompt assembly, provider adapter and output validation executed unchanged. Authentication/account/course/entitlement persistence are synthetic fixtures with in-memory sessions; no production HTTP deployment or production database was tested. The outbound course-only projection removes non-course platform/account context after assembly. Other-course material is excluded from provider requests; mixed-course and revoked-access behavior is checked in offline regressions.

There are 22 scored model answers and 61 local answers, not 83 model answers. No semantic safety/language replacement occurred in this sample, so those paths rely on regressions for coverage. Two deliberate transport-fault drills verify fallback mechanics and expose weak generic guidance; they do not measure a real outage or a full wall-clock timeout. Finite v2 matching has documented false negatives and false positives. The 64.3% score is retained unchanged; no manually inflated aggregate is substituted. One sample per case cannot establish general safety, multilingual competence, isolation or provider uptime.
