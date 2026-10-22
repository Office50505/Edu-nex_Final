# Verification and complete evidence

| Check | Result |
|---|---|
| Initial isolation regressions before correction | 23 cases: 14 failing, 9 passing controls |
| Final course-isolation regression file | 38/38 pass |
| Full chatbot-related suite | 514/514 pass |
| All existing backend files plus new regression | 1,069 tests: 1,045 pass, 24 fail, 0 skip |
| Baseline all existing backend files | 1,031 tests: 1,007 pass, same 24 fail, 0 skip |
| All Python evaluator tests | 167/167 pass, 0 skip |
| Original four functional failures | 4 cases / 5 complete approved-body checks pass |
| Previously passing Phase12 recorded comparison | 40/40 cases, 48 turns byte-identical |
| Known 009/010 final HTTP/JWT reproduction | Correct owner only; zero unauthorized complete bodies in payload |

Full logs and individual failures are retained, including iterations. The first correction iteration had 15 regressions caused by an evaluation-discovered boolean/null handling error in the new document-family helper. It was corrected and all 228 focused tests passed. This was not an authorization leak; failures failed closed or lacked expected transport. A nested saved-context owner conflict was also reproduced before its correction, with raw probe logs preserved. The direct-template branch was then independently reproduced by an additional failing regression, corrected, and the final complete suite rerun. No evidence was removed or test expectations loosened.

The 38 tests cover original cases, same-course full templates, inactive/expired/revoked access, purchased-course boundaries, limited trial, explicit/implicit switches, public comparisons, forged/unknown/missing/unpublished/duplicate course selections, foreign lesson objects, stale saved context, foreign approved history, tampered owner metadata, unlabelled protected excerpts, new-message injection and model-origin foreign template text. Payload tests inspect all complete registered product bodies, not one diagnostic phrase. Source text remains immutable.

`before_known_pipeline_results.json` reproduces the original two failures using saved source and real local Express/JWT handling. `final_known_pipeline_results.json` uses final source hashes and proves no complete product template occurs in either case's assembled messages. Memory-only models, synthetic identities and a synthetic provider credential avoid production/real account data. External fetch/socket transport is denied before sending. Both raw payloads, debug retrieval IDs, state, errors and timings are retained. Live model quality remains untested.

Final full-suite observation records 86 fixture adapter invocations and 94 transport attempts, all using injected fetch. Known-case baseline/intermediate/final HTTP reproductions each record four blocked transport attempts. The final Phase12 comparison uses 11 recorded replies and zero unexpected requests. Functional reproduction uses no provider transport. These counts are separated in `verification_summary.json`; none counts as live-model evidence. No external provider request was sent.

The Phase14B frozen 120-case set and rubric/archive are unchanged and were not rerun/rescored. Cases 009/010 are expressly known regressions. Neither old scores nor grading thresholds were modified. The 24 pre-existing full-backend failures are listed in the next report with raw errors retained.
