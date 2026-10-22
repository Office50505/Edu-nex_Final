# Results and category scores

| Category | Planned | Executed | Pass | Fail | Untested | Pass / planned |
|---|---:|---:|---:|---:|---:|---:|
| exact_template | 25 | 0 | 0 | 0 | 25 | 0.0% |
| multilingual_extraction | 20 | 0 | 0 | 0 | 20 | 0.0% |
| multi_turn | 20 | 0 | 0 | 0 | 20 | 0.0% |
| education_generation | 20 | 0 | 0 | 0 | 20 | 0.0% |
| safety_access_isolation | 20 | 11 | 8 | 2 | 10 | 40.0% |
| state_routing_edges | 15 | 0 | 0 | 0 | 15 | 0.0% |

Primary accuracy uses all 120 planned cases. Untested, inconclusive and missing responses never count as passes. Executed-case pass rate is secondary only. The 110 UNTESTED cases comprise 109 unexecuted cases plus case 011 with unavailable necessary inference. Cases 009/010 are critical FAIL despite unavailable inference: local retrieval failure was directly observed.

Exact-template fidelity, product identity preservation, multilingual quality and functional multi-turn correctness remain **untested**. The 25 frozen exact-body cases cover all 19 assets, but none ran before the stop; conditional fidelity has denominator zero and is not 100%. Supplemental bodies found in assembled internal context establish the security finding, not successful learner-facing template fidelity.

No ambiguous or missing candidate responses were assigned. Four HTTP 401 responses are expected authentication denials. The separate infrastructure attempt never reached the handler and is preserved outside scored candidate cases. Full per-turn criteria, reasons and excerpts are in `evidence/isolated_grader/grades.json`; machine-readable aggregate metrics are in `evidence/results_and_metrics.json`.
