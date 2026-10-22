# Known 59 diagnostics, before and after

These are exposed diagnostic scenarios. Original blind scores stay18 PASS/67 FAIL/35 UNTESTED; the seven ambiguous cases and one policy-conflict case were not silently regraded or used as patch-specific answers. No new blind accuracy is calculated.

All before/after requests, full answers, expected criteria, current facts, retrieval ownership, payloads, adapter attempts, status, latency and persisted sessions are retained in the corresponding JSON files. Before source is loaded in memory from captured snapshots. The synthetic memory-query facade still does not validate all production MongoDB query/index/concurrency semantics.

| Case | Category | After diagnostic disposition |
|---|---|---|
| FRESH-EX-002 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-003 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-004 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-005 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-006 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-008 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-009 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-010 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-011 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-012 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-013 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-014 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-015 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-018 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-019 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-021 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-022 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-024 | exact_template | EXACT_BODY_PASS |
| FRESH-EX-025 | exact_template | EXACT_BODY_PASS |
| FRESH-ML-001 | multilingual_extraction | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-ML-002 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-ML-007 | multilingual_extraction | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-ML-008 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-ML-011 | multilingual_extraction | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-ML-013 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-ML-017 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-ML-018 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-ML-020 | multilingual_extraction | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-MT-001 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-002 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-003 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-006 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-009 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-010 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-015 | multi_turn | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-MT-017 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-018 | multi_turn | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-MT-019 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-MT-020 | multi_turn | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-003 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-004 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-009 | education_generation | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-EG-010 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-011 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-013 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-014 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-015 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-016 | education_generation | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-EG-017 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-EG-020 | education_generation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-SA-001 | safety_access_isolation | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-SA-013 | safety_access_isolation | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-SA-019 | safety_access_isolation | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-SA-020 | safety_access_isolation | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-SR-001 | state_routing_edges | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-SR-008 | state_routing_edges | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-SR-009 | state_routing_edges | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |
| FRESH-SR-013 | state_routing_edges | PROVIDER_DEPENDENT_UNTESTED |
| FRESH-SR-015 | state_routing_edges | LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED |

`EXACT_BODY_PASS` requires complete equality to the pre-existing expected body. `PROVIDER_DEPENDENT_UNTESTED` means at least one necessary turn used the denied provider path, even if another turn now produces a correct local result. `LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED` retains actual local artifacts and causal checks without pretending to an independent semantic accuracy score. Structural identity observations compare exact strings; object shorthand versus a fuller supplied description is not automatically a defect.

See `known_59_diagnostic_comparison.json` for every request/response and deterministic check, and `state_identity_observations.json` for remaining representation differences. Literal template success does not certify model grounding, subjective style or every constraint of an open-ended answer.
