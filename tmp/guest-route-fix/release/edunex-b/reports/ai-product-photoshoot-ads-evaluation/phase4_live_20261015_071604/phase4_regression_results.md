# Phase 4 post-evaluation regressions

| Suite | Passed | Failed | Skipped | Exit code |
|---|---:|---:|---:|---:|
| node | 153 | 0 | 0 | 0 |

Execution: 2026-10-15T07:18:00.436345+00:00 to 2026-10-15T07:18:01.118052+00:00; duration 0.682 seconds.

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
```
| python | 43 | 0 | 0 | 0 |

Execution: 2026-10-15T07:18:00.437392+00:00 to 2026-10-15T07:18:00.601817+00:00; duration 0.164 seconds.

```sh
python3 -B -m unittest discover -s tests -p test_product_evaluator*.py -v
```

The live run completed before these executions started. The six existing backend AI tutor test files and both evaluator suites ran unchanged. Coverage includes other-course compatibility, retrieval/template integrity, multilingual and multi-turn handling, mobile/history, entitlement boundaries and provider-failure diagnostics. Node uses the network-denial preload; evaluator tests are offline. Actual JUnit/Python logs and per-test execution JSON are included.

Independent full-body inspection of the fresh answers is 28/29, separate from local regressions. No previously passing unit test was fixed, removed or rerun to conceal failure. Existing unit coverage did not catch the new colour-clause and handset paraphrases.

Supplemental controlled fallback diagnostics:

```json
[
  {
    "id": "controlled_connection_failure",
    "controlledFault": "connection_error",
    "status": "connection_error",
    "attempts": 2,
    "outcome": {
      "type": "provider_fallback",
      "liveModelAnswer": false,
      "providerStatus": "connection_error",
      "responseIssue": null
    },
    "externalRequests": 0,
    "passedBoundedHonestFallbackChecks": true
  },
  {
    "id": "controlled_timeout",
    "controlledFault": "timeout",
    "status": "timeout",
    "attempts": 2,
    "outcome": {
      "type": "provider_fallback",
      "liveModelAnswer": false,
      "providerStatus": "timeout",
      "responseIssue": null
    },
    "externalRequests": 0,
    "passedBoundedHonestFallbackChecks": true
  }
]
```

Both drills pass bounded retry/provenance checks (2/2), but are not live outages, regression-suite counts or part of the 80 scored cases. Their generic fallback relevance remains limited.
