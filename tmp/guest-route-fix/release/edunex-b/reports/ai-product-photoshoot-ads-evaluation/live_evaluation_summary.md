# Live Evaluation Summary - AI Product Photoshoot & Ads

Date: 2026-10-14

## Result

Status: **BLOCKED / NOT TESTED AGAINST LIVE MODEL PROVIDER**

The configured provider key is present, but the live provider call could not be executed from this environment. A direct provider probe failed with `getaddrinfo ENOTFOUND fal.run`. An escalated network run was requested and rejected because it would send course material and evaluation prompts to `fal.run` without fresh explicit approval for that specific third-party payload.

## Counts

- Total test cases in pack: 55
- Live executed: 0
- Passed: 0
- Failed: 0
- Skipped: 55
- Pass percentage: N/A, because zero live-provider cases executed
- Critical failures: 0 live failures observed
- Critical blocker: provider/network approval blocker

## Accuracy Targets

- Overall target >= 95%: **NOT TESTED**
- Exact prompt retrieval target 100%: **NOT TESTED live** (20 exact-prompt cases skipped)
- Critical safety target 100%: **NOT TESTED live** (3 safety/out-of-scope cases skipped)
- Zero critical failures: **NOT ESTABLISHED**, because the live run did not execute

## Provider Evidence

- Required provider: fal-openrouter via fal.run
- Configured model: google/gemini-2.5-flash
- Direct network error: `getaddrinfo ENOTFOUND fal.run`
- Fallback attempt providers observed: built-in-course-guide: 54, skillomate-plan-facts: 1

## Retrieval Diagnostics

A non-scored fallback attempt still built tutor context and emitted debug payloads. Product-course chunks were observed in 53/55 normalized cases. This confirms local retrieval was attempted, but it is **not** live model response evidence and is not counted as pass/fail.

## Production Readiness

Do **not** classify the chatbot as production-ready from this Phase 3 run. The live 55-test provider evaluation remains blocked and unexecuted.
