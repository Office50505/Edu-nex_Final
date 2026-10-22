# Controlled non-production provider-test plan

No external requests were made during this investigation, including pricing lookups. Provider execution is not authorized by this report. The existing 114 blocked adapter attempts were deliberate pre-transport denials on 57 unique turns, not HTTP requests, billed usage or observed Gemini errors. The original UNTESTED cases remain UNTESTED.

## Scope and authorization

Before execution obtain explicit approval of the exact course assets sent, provider endpoint and downstream processors (configured fal/OpenRouter/Google path), model, synthetic identities, payload examples, allowed request count, token budget, monetary cap and credential source. Authorizing AI Product Photoshoot & Ads content does not authorize AI Influencer course content. Credentials stay outside artifacts; use an isolated non-production credential/project, no production database or user records, and no external telemetry containing course text.

Freeze candidate, questions, expected outcomes, scoring rubric, provider settings and redacted payload inventory before calls. Use the actual local authenticated pipeline, synthetic entitled learners and isolated state. Keep server-authoritative ownership checks at retrieval, assembly and final payload. Use an egress allowlist for only the specifically approved endpoint and record downstream routing; preserve the default deny policy for everything else. Do not silently replace model responses with fixtures or relax safety guards.

The current guard intentionally rejects unapproved protected payloads. After approval, a separate evaluation-only transport allowlist can permit only approved payload/course/model combinations while retaining assertions. This requires a reviewed future harness change; do not remove the guard globally or modify application authorization. Verify actual Express/async route completion and isolated database behavior before attributing transport results to the model.

## Proposed staged budget

The observed model is `google/gemini-2.5-flash`, with `max_tokens:900`, temperature 0.2. `evidence/provider_payload_budget.json` contains all 57 captured payload budgets: 1,100,546 input characters, 1,107,771 UTF-8 bytes. Per payload the planning range is `ceil(characters/4) + 10*messageCount` to `ceil(characters/2) + 20*messageCount`. This is a rough sizing heuristic, not a Gemini tokenizer. Multilingual tokenization, reasoning tokens, gateway wrapping and billing may differ.

| Stage | Logical provider turns | Estimated input tokens, single attempt | Configured output maximum |
|---|---:|---:|---:|
| A: public-only non-production smoke checks | 4 | 16,000–32,000 planning allowance; freeze actual payloads first | 3,600 |
| B: previously blocked product/public turns, stateful diagnostic replay | 56 (46 product +10 public-only) | 271,026–542,025 | 50,400 |
| C: other-course isolated boundary case, separately authorized only | 1 | 5,431–10,861 | 900 |
| A+B+C nominal | 61 | 292,457–584,886 | 54,900 |

Without separate other-course-content authorization, omit C and retain that case as UNTESTED: A+B is 60 logical turns. All57 historical turns without smoke checks total 276,457–552,886 input tokens and 51,300 output capacity. Replaying stateful scenarios also requires precursor turns; those already within the original153 turns can normally execute locally, but changed routing may add provider turns. Regenerate the inventory and obtain an updated cap before exceeding the approved count. Never bypass the chatbot by posting captured payloads directly as a substitute for stateful verification.

Current code can make two initial adapter attempts and one validation-repair attempt per logical turn. Thus 61 logical turns have an upper bound of 183 HTTP attempts and 164,700 configured output tokens. A conservative planning envelope for initial retries plus repair payloads is roughly 1.0–1.9 million input tokens, including up to 4,000 characters of original answer per repair. This is not a guaranteed billing ceiling: gateway accounting, hidden reasoning, regenerated payloads and actual accepted settings must be checked. Failed requests may have provider-dependent charges. Prefer a hard evaluation-side request cap and stop on unexpected retry amplification; changing application retry behavior is a separate implementation decision.

No verified current model/gateway prices were found in local evidence. A likely dollar total cannot be substantiated without a provider quote; do not invent one or assume Google's direct price equals fal/OpenRouter pricing. With approved effective prices `P_in` and `P_out` in USD per million tokens, nominal A+B+C cost is approximately `(0.292–0.585)*P_in + 0.0549*P_out + gateway/reasoning/other fees` using maximum configured output. The retry/repair planning allowance is approximately `(1.0–1.9)*P_in +0.1647*P_out + fees`. Attach dated verified billing terms and a concrete dollar cap before approval/execution. Actual output may be lower; an output setting is not evidence of consumed tokens.

## Capture, scoring and stop rules

For every turn record candidate/question hashes, actor/course/session, authorization decision, retrieved source IDs/owners/hashes, full sanitized assembled messages, request hash, endpoint/model, policy allow/deny decision, actual transmitted attempt count, response/finish reason/usage, latency/status/error, retries, repairs, final response origin and state before/after. Keep credential values and unrelated personal information out of logs. Scope inspection must happen before transmission; inspect model responses for leaked foreign content too.

Stop immediately for unauthorized source or payload, unexpected production host/credential, critical safety failure, external destination outside the allowlist, or an exhausted approved cap. A policy-denied/unexecuted case remains UNTESTED; a model request does not count as a successful answer unless the response is actually obtained and independently graded. Provider fallback, exact local asset and accepted real inference remain separate origins. Keep raw actual usage to replace estimates.

Grade literal approved-body fidelity independently; grade generated teaching and artifacts semantically against frozen obligations, including multilingual and state constraints. Do not require extra unasked sentences or penalize mandatory safety refusal. Adjudicate the seven ambiguities and policy conflict in a separately versioned policy decision before any new score; preserve the historical rubric and original grades. These exposed57 turns are diagnostic provider tests, not a new independent blind set. A fresh independent case-author/grader process and complete security coverage are still required for the release gate.
