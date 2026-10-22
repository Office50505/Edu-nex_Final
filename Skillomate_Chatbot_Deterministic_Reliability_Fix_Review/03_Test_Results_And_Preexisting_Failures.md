# Test results and baseline failures

| Run | Pass | Fail | Skip | Interpretation |
|---|---:|---:|---:|---|
| Frozen full backend | 1048 | 24 | 0 | Before local source edits |
| Final full backend | 1171 | 24 | 0 | Same24 names; zero new failures |
| New controls against baseline | 13 | 110 | 0 | Independent failures before correction |
| New controls final | 123 | 0 | 0 | Included in full backend |
| Python evaluator | 167 | 0 | 0 | Existing unittest suites; v7 unchanged |
| Asset raw/product-fill/all-field checks | 57 | 0 | 0 | All 19 full bodies in three modes |
| Original critical scenarios | 4 cases /5 bodies | 0 | 0 | Actual synthetic HTTP pipeline |
| Phase 12 recorded comparison | 40 cases /48 turns | 0 changed | 0 | 11 recorded transport fixtures; zero external inference |

Commands: `NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/*.test.cjs`; `python3 -B -m unittest discover -s tests -p 'test_*.py' -v`. Existing explicit isolation and Unicode suites ran inside the full backend run. The local HTTP replays additionally used a loopback-only guard, because a blanket no-network guard also prevents local HTTP. Temporary loopback bind permission was needed; production DBs were replaced with synthetic in-memory records.

The baseline module preload reads captured pre-edit source in memory; it does not reset or overwrite the working tree. New tests were first run before edits, then the complete expanded test file was also executed against that captured baseline. One newly authored assertion was corrected during development: a new product may retain its newly supplied descriptor; the assertion must reject the obsolete material rather than demand an entirely empty attributes list. No existing test, historical expected answer, grade or scoring threshold was changed.

## Existing 24 full-backend failures

These exact names occur in both baseline and final runs. They concern mobile/static behavior, billing/config mocks, PDF extraction and thumbnail behavior. The source changes do not fix or hide them. The full suite exits1 because they remain. No claim is made that every baseline failure represents a production defect.

1. Back exits enrolled playback one level and keeps lessons
2. Back exits preview playback one level and keeps lessons
3. Home displays course metadata before its playback request finishes
4. PDF extraction reads selectable text from a real PDF
5. PhonePe amount mismatch never grants one-time access
6. annual checkout selects server-owned plan/price and returns annual checkout metadata
7. appcopyai disables backups, cleartext traffic, overlays, and unverified deep links
8. blank vertical URL clears legacy storage while preserving the horizontal thumbnail
9. config, status and verification reject unauthenticated and revoked sessions before billing work
10. course detail back returns to the courses page instead of home
11. environment overrides control purchase configuration even when a stored purchase has an older product
12. mute and playback speed changes do not trigger a source reload
13. nonterminal callback state remains retryable for a later provider success event
14. notifications require Pub/Sub authentication and the correct package before processing
15. on-screen Back uses the same lesson-preserving transition
16. pending monthly checkout cannot be reused as annual; invalid types and wrong plans cannot create mandates
17. profile avatar picker keeps unique bundled choices and falls back from unknown legacy values
18. root page swipe is bidirectional and disabled while search is open
19. server exposes authenticated Google config under /api exactly once with the confirmed defaults
20. status returns authenticated entitlement state without caching
21. verification errors preserve safe client codes and hide provider internals
22. verification rate limit applies before another verification call
23. verification rejects missing, malformed and oversized tokens and malformed JSON
24. verification uses the authenticated owner and token, ignoring client-claimed product/package/status

Intermediate failures and outcomes are retained in `validation_iterations.json` and all patch/backend logs. New regressions involving extraction boundaries, continuation clarification, negation, local completeness, dialogue language, brief as an adjective, source-slot limits and nested-scope provider inspection were corrected and retested. Initial diagnostic harness setup failed for a relative path and sandbox loopback binding; a later Phase 12 command had an argument error and stopped before execution. These are harness setup failures, not candidate grades. Final successful traces supersede their verification conclusions, while raw failures remain recorded. The original rubric/evaluator was not tuned.
