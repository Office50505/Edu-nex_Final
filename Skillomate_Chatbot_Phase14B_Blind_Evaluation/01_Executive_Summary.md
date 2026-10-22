# Phase 14B blind evaluation — release gate failed

The frozen Phase 14A.1 candidate fails the release gate because two independent cases confirmed cross-course protected-material retrieval. Execution stopped; no fix or deployment was performed.

All 120 cases and expected outcomes were independently authored and frozen before execution, covering all 19 approved assets. Of 11 executed cases, 8 passed, 2 failed critically, and 1 remains untested because required provider inference was blocked. Another 109 cases were never executed. Total: **8 PASS, 2 FAIL, 110 UNTESTED, 0 INCONCLUSIVE, 0 MISSING_RESPONSE**.

The fixed planned-denominator score is **8/120 = 6.67%**. The secondary executed-case pass rate is **8/11 = 72.73%**. These figures reflect a safety stop and incomplete coverage; they do not estimate multilingual or generation quality.

In cases 009 and 010, the selected/resolved course remained the synthetic other course, while approved product-course templates were retrieved and complete source bodies assembled into model context. The learner explicitly excluded a comparison. No complete asset was disclosed in the final learner answer. External networking was blocked, so no provider transmission occurred. The frozen rubric treats cross-course retrieval itself as critical.

The candidate, existing tests, v7 evaluator, course assets and protected configuration/history remain byte-identical to the recorded baseline. Regression checks passed: 476 backend chatbot tests, 167 Python evaluator tests, and all 40 previously passing Phase 12 cases (48 turns) unchanged in an explicitly labeled recorded-response replay.

**Recommendation:** do not advance this candidate to final end-to-end verification. Await review and separately authorize any remediation. Do not deploy or claim production readiness.
