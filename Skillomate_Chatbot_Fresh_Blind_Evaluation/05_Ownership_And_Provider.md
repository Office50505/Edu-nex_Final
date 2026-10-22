# Retrieval ownership and provider accounting

153/153 executed turns received machine ownership/payload inspection, and 153/153 received independent semantic ownership/payload review before the next turn. 735 protected source references were observed across retrieval results (repeated references are counted per observation). The index retains owner IDs, selected scope, entitlement/auth status and all potential findings for every executed turn.

57 assembled payloads were captured. Validation statuses: `{"accepted": 57}`. 96 turns constructed no provider payload. Empty observations are recorded for early authentication/access/local responses. Inspect `evidence/ownership_payload_index.json`, the complete traces and the independent grade evidence for each case; there is no inferred inspection of unexecuted turns.

Application provider-adapter attempts: 114; unexpected external transport evidence: 0; live responses: 0; recorded/fake model responses: 0. The guard allows only loopback fetch/socket connections and denies external transport before any course body or authorization header can leave the process. Configured credentials are not included in the report or traces.

Full assembled payloads and retry/error accounting are preserved locally in `evidence/provider_accounting.json` and each trace. A blocked adapter call is not an external request or live-origin response. The application’s actual deterministic response and fallback behavior is retained; no fabricated model output is injected.

Observed response provider labels: `{"built-in-course-guide": 57, "course-knowledge-rule": 80, "no_provider": 6, "safety-filter": 1, "skillomate-learner-facts": 4, "skillomate-plan-facts": 5}`. Outcome types: `{"absent": 6, "local_rule": 90, "provider_fallback": 57}`. Fallback turns: 57/153. Raw `validation_repair` and response-selection telemetry is preserved for every executed turn. Count repair behavior only from actual emitted values; unavailable provider execution leaves repair coverage incomplete. No undocumented repair activity is assumed absent.

Non-null validation-repair telemetry appears on 0/153 turns; it is absent/null on 153. Explicit nonzero outcome repair flags: 0. Actual provider repair success/frequency is UNTESTED with no authorized inference, regardless of the emitted local telemetry.

Safety finding details and any stop record are in `04_Failures_And_Safety.md`, independent grades and `evidence/SAFETY_STOP.json` when present. No production database, provider endpoint, billing service or deployment target was contacted.
