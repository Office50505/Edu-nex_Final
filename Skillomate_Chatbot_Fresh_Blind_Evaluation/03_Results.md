# Results

18 PASS, 67 FAIL, 35 UNTESTED, 0 INCONCLUSIVE, 0 MISSING_RESPONSE. Overall: **15.00% PASS/120**. Planned questions remain the denominator, including untested cases. All executed responses are retained; a response can exist while a required inference remains untested.

| Category | Planned | Pass | Fail | Untested | Inconclusive | Missing | Pass/planned |
|---|---:|---:|---:|---:|---:|---:|---:|
| education_generation | 20 | 4 | 13 | 3 | 0 | 0 | 20.00% |
| exact_template | 25 | 3 | 19 | 3 | 0 | 0 | 12.00% |
| multi_turn | 20 | 1 | 13 | 6 | 0 | 0 | 5.00% |
| multilingual_extraction | 20 | 1 | 11 | 8 | 0 | 0 | 5.00% |
| safety_access_isolation | 20 | 8 | 6 | 6 | 0 | 0 | 40.00% |
| state_routing_edges | 15 | 1 | 5 | 9 | 0 | 0 | 6.67% |

Requested exact-body checks: 3/25 passed; 25/25 have adjudication records. Model-dependent body checks remain UNTESTED. Conditional literal pass count over correctly selected assets: 3/15 (20.00%), including any selected-but-untested checks in that denominator. Selection errors remain failures in the planned exact-template denominator; conditional fidelity never substitutes for selection accuracy. Unicode is preserved and only whitespace compaction is allowed. The full independent expected/actual comparisons are in the per-turn grades and `results_summary.json`.

The multilingual-extraction category measures full required extraction behavior; its pass/planned rate is reported above. The multi-turn category measures complete frozen scenarios, including switching, corrections and follow-ups. Turn-level language, facts, task-completeness, grounding and context evidence is retained in `dimensionTurnTallies` and per-criterion grades. These dimensions are not substituted for stricter whole-case results. Raw category failures and model-dependent cases must be considered together when assessing product identity preservation or multilingual quality.

| Independently graded turn dimension | Observed tallies |
|---|---|
| authorization | `{"PASS": 153}` |
| completeness | `{"FAIL": 19, "PASS": 6, "UNASSESSED": 128}` |
| facts | `{"FAIL": 43, "PASS": 56, "UNTESTED": 54}` |
| grounding | `{"FAIL": 20, "PASS": 77, "UNTESTED": 56}` |
| http | `{"PASS": 25, "UNASSESSED": 128}` |
| httpStatus | `{"PASS": 128, "UNASSESSED": 25}` |
| isolation | `{"PASS": 153}` |
| language | `{"FAIL": 10, "PASS": 105, "UNTESTED": 38}` |
| taskCompleteness | `{"FAIL": 51, "PASS": 21, "UNASSESSED": 25, "UNTESTED": 56}` |

These are observed turn dimensions, not extra cases or percentages over unexecuted turns. A language or facts PASS does not make an incomplete request pass. Product identity, operation and stale-context findings are documented against each frozen essential criterion; a generic facts tally alone is not a standalone identity-preservation metric.

Executed turns: 153; independently graded turns: 153; unexecuted turns: 0. HTTP counts: `{"200": 149, "401": 4}`. Expected authentication rejections are not infrastructure errors. All response/transport errors remain in the raw traces and execution journal.

Raw stderr is retained: 120 lines, including 120 Promise-like route-handler deprecations emitted under the VM harness. These warnings did not prevent request execution. Journal execution errors: 0; request transport errors: 0. Provider-denial errors are separately accounted before transport and are not hidden as successful model calls.

Local request latency in milliseconds: minimum 5, median 96, mean 110.10457516339869, maximum 217. This excludes agent grading waits and provides no external-model latency measurement.

Live-provider coverage is zero. Cases that needed unavailable inference are explicitly untested even where fallback text was safe. No unexecuted or ambiguous case is counted as a pass.
