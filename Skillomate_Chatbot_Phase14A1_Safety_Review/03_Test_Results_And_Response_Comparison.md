# Executed verification and raw evidence

## Safety tests before and after

The initial 65-test safety suite was executed before application edits: **22 pass, 43 fail, zero skips**, exit 1. This includes the exact original full-width bypass. Evidence: `evidence/before/safety_tests.{json,xml,stderr.log}`.

The first normalized-check correction produced **63 pass, 2 fail** among those same 65 cases. Both were already failing before the change; the remaining cause was the generic declaration fallback described in report 02. That run is retained as `evidence/iterations/first_safety_tests.*`. After closing the overlap, the focused run passed all 67 tests, including two added whitespace/fallback controls (`iterations/second_safety_tests.xml`). The final full-suite execution includes the final 67 tests and all prior 409 tests.

| Safety coverage | Assertions |
|---|---|
| Legitimate English/Hindi/Hinglish names | Original strings survive extraction, facts and full source-body substitution |
| Hindi code-point preservation | Precomposed/decomposed nukta names remain distinct original strings; legitimate joiner remains |
| Legitimate compatibility characters | Full-width brand-like letters preserved when safe |
| Mixed separate words | Hindi plus English words accepted without transliteration |
| Compatibility attacks | Full-width and mathematical letters, normalized structural delimiters and role terms rejected |
| Mixed-script attacks | Latin/Cyrillic and Latin/Greek instruction tokens rejected |
| Invisible/bidi attempts | Invisible word splitting cannot evade validation; bidi controls rejected |
| Alternate entry paths | Direct cleaning, extraction, product facts, preposition fallback and renderer covered |
| Product replacement | Each attack tested with English, Hinglish and Hindi replacement grammar |
| Follow-up state | Seeded unsafe remembered identities/history cannot become template identities |
| Persisted route sequence | Synthetic session rejects attack switch, retains safe identity, and emits same safe source body on follow-up; zero provider calls |
| Other existing rules | Plain prohibited words, placeholders, angle brackets, excessive length and referring names remain rejected |

## Complete regression commands and results

From `Untitled/edunex-b`, the final command is recorded in `evidence/final/node_verified_execution.json`. It runs the entire established Phase 14A chatbot/backend suite plus the new safety file:

```sh
node --test --test-reporter=junit tests/product-tutor-unicode-safety.test.cjs tests/product-tutor-phase14a.test.cjs tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/product-tutor-phase11.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

The Node command runs with `NODE_OPTIONS` loading the existing `tests/helpers/deny-network.cjs` plus the review-only provider observer. The exact options, observer path and evidence destination are recorded. The observer does not change production source and is never loaded into application servers.

| Suite | Passed | Failed | Skipped | Exit |
|---|---:|---:|---:|---:|
| Backend/chatbot | **476** | 0 | 0 | 0 |
| Safety subset within 476 | **67** | 0 | 0 | 0 |
| Prior Phase 14A cases within 476 | **409** | 0 | 0 | 0 |
| Python evaluators | **167** | 0 | 0 | 0 |

Complete per-test statuses, command/timestamp metadata, JUnit XML and stdout/stderr are included. No existing test or evaluator was weakened, removed or skipped. The unchanged v7 evaluator is preserved by hash. The safety tests intentionally test identity rejection, not universal AI safety.

## Functional critical cases

The unchanged Phase 12 `makeApp` function is executed by `evidence/final/reproduce.cjs` through real Express loopback HTTP, using synthetic auth/course/entitlement fixtures and in-memory sessions. External calls are denied; no real credentials or production DB are used. Expected full bodies come from independently frozen source/slots, not runtime extraction.

| Case | Turns | Full body | Compared with Phase 14A |
|---|---:|---|---|
| F1 / phase12_new_001 | 1 | Pass | Byte-identical |
| F2 / phase12_new_002 | 1 | Pass | Byte-identical |
| F3 / phase12_new_005 | 1 | Pass | Byte-identical |
| F4 / phase12_new_029 | 2 | Both pass | Both byte-identical |

All four functional improvements remain intact. No provider call occurred in these cases. `evidence/final/reproduction_results.json` contains complete final answers, expected bodies, state and retrieval traces. The summary compares every turn directly with the saved Phase 14A final evidence, whose hashes are protected.

## All 40 previously passing Phase 12 cases

`evidence/compare_phase12.cjs final` replays all 40 previously passing cases and their 48 user-facing turns using the original synthetic environment and recorded upstream text. **All 40 cases and all 48 final answers are byte-identical to Phase 12.** No unexpected response changed, no recorded response was missing and no unplanned provider route was taken. This is a controlled pipeline comparison, not fresh model inference or an unseen score.

The harness logs 11 provider invocations fulfilled exclusively from historical response fixtures. Full request hashes, original/current answers, outcomes, histories and state are saved in `evidence/final/phase12_passing_replay.json`.

## Provider invocation accounting

- Final regression suite: **62 adapter invocations / 70 transport attempts**, all injected test fixtures, with external networking denied.
- Phase 12 replay: **11 recorded-response fixture invocations**, zero unexpected requests and zero external provider calls.
- Four critical HTTP cases: **0 provider invocations**.
- New persisted-route safety test: **0 provider invocations**.
- Python grading: offline; **0 external provider calls**.

Real external provider requests: **0**. There was no production interaction or deployment. Temporary loopback ports were opened only for synthetic replay and closed after each case. Downloading PDF-generation libraries into an isolated temporary environment was artifact tooling, not a provider/model request or production dependency change.

## Changed behavior and outstanding uncertainty

The intended changed behavior is rejection of unsafe names previously accepted by Phase 14A. Raw pre-fix failures and final safety assertions show the change; legitimate positive outputs, all five critical answers and all 48 passing-case replay answers remain unchanged. The two added fallback controls were authored during correction and are development regressions, not blind evidence.

No new regression, unexpected skip, changed passing-case response, unauthorized asset, cross-course leak, weakened safety rule, approved-source edit or broken public contract was observed by the executed checks. Production authentication/database durability/concurrency, UI flows, new provider responses and unrestricted multilingual/Unicode inputs were not evaluated.

## Rerun guidance

The evidence harnesses use exclusive-create output files. To rerun, copy the review runners and required baseline-source subtree into a fresh empty evidence destination; do not overwrite original Phase 14A/14A.1 or Phase 12 evidence. Run from `Untitled/edunex-b`. Loopback HTTP permission may be required. The full regression helper is `evidence/final/run_verified_validation.py`; it records both suites and all logs. The recorded-response replay requires the existing Phase 12 run directory and is explicitly barred from external inference.
