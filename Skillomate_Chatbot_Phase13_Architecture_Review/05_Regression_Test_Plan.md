# Executed checks and proposed regressions

## Executed in Phase 13

| Check | Result | Evidence |
|---|---|---|
| Phase 12 frozen source comparison | 47/47 current files identical | `evidence/baseline_integrity.json` |
| Critical exact HTTP replay | 4 cases / 5 turns; all 5 answers identical to Phase 12; 4 failed bodies reproduced | `evidence/reproduction_results.json` |
| Direct current-module probes | 14 diagnostic inputs | `evidence/targeted_probes.json:probes` |
| Session-boundary fixture probes | 6 sequential requests | Same file, `routeStates` |
| Additional architecture probes | 5 critical internal traces, 9 route scenarios / 11 turns, 4 language checks | `evidence/additional_probes.json` |
| Unchanged backend regression suite | **351 passed, 0 failed, 0 skipped, exit 0** | `evidence/node_verified_execution.json`, output XML/stderr |
| Unchanged evaluator regression suite | **167 passed, 0 failed, 0 skipped, exit 0** | `evidence/python_verified_execution.json`, output/stderr logs |

Diagnostics are not aggregated into an invented chatbot accuracy score. The fixture's synthetic model response is never reported as live inference. All critical HTTP responses and all nine additional route scenarios made zero provider calls. The direct fixture session probes made zero stub-provider calls. No source fix was applied; the four critical cases still fail their independent expected bodies.

## Reproduce the saved investigation

From `Untitled/edunex-b`, the review harness is:

```sh
node ../Skillomate_Chatbot_Phase13_Architecture_Review/evidence/reproduce.cjs
node ../Skillomate_Chatbot_Phase13_Architecture_Review/evidence/additional_probes.cjs
python3 -B ../Skillomate_Chatbot_Phase13_Architecture_Review/evidence/run_verified_validation.py
```

Output files are exclusive-create to protect evidence. To run again, **copy the three harness files to a new empty sibling review/evidence directory and adjust the command path**, rather than overwriting this review or original Phase 12 artifacts. The runner resolves original Phase 12 inputs from the backend working directory. A temporary-loopback-listen permission may be required. No production server, auth record, database session or external model is involved.

The regression helper is an unchanged copy of P12's `regression/run_verified_validation.py`; it records timestamps, commands, return codes and parsed test counts. Its executed commands were:

```sh
NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test --test-reporter=junit tests/ai-chat-history.test.cjs tests/tutor-knowledge.test.cjs tests/product-tutor-quality.test.cjs tests/product-tutor-phase3.test.cjs tests/product-tutor-phase5.test.cjs tests/product-tutor-phase7.test.cjs tests/product-tutor-phase9.test.cjs tests/product-tutor-phase11.test.cjs tests/mobile-course-ai.test.cjs tests/mobile-course-ai-cache.test.cjs
python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v
```

These suites test application behavior with fixtures, including other-course/access/mobile/history controls. They do not exercise real database durability, deployed auth, live other-course generation, UI rendering or load. Passing evaluator tests demonstrate consistency with their assertions, not correctness of every rubric decision.

## Required new test matrix after approval

Every test below is **proposed, not executed against a fix**. Diagnostic questions disclosed in this review are regression/development data and must be excluded from Phase 14's blind questions.

| Group | Cases/variation | Strong assertions | Planned location |
|---|---|---|---|
| Four original critical cases | P12 IDs 001/002/005/029, exact original requests, omitted-history switch | Full final fenced body equals independently stored approved body with frozen slots; all known fields filled; old product absent; 0 provider calls | New `tests/product-tutor-phase13.test.cjs`; route switch in `tests/ai-chat-history.test.cjs` |
| Named full-text requests | Full approved body/text/wording without “prompt”; headings across lessons | Correct complete authorized asset; unrelated words in identity do not override action | New phase13 tests + tutor-knowledge tests |
| Hindi/English/Hinglish declarations | Possessive genders, object/item/product nouns, name phrases, Devanagari/Latin mixed names | Exact identity span; all occurrences substituted; no grammar particles mistakenly stripped from name | New phase13 tests |
| Recolour grammar | Passive/active, arbitrary multiword colours, parts with determiners, Hindi and Roman Hindi | Only approved part/colour fields replaced; original product/price unaffected; no action-as-identity | New phase13 tests |
| Replace/correct | A→B→B in each language; price/material/channel given before/after switch | Atomic replacement; product-bound old facts cleared; new same-turn facts retained | New phase13 + history tests |
| Negative/ambiguous extraction | Unknown name, negated replacement, question/hypothetical, conflicting names, quoted instructions | No fabricated declaration or destructive reset; clarify genuine ambiguity; preserve safety | New phase13 tests |
| Task boundaries | Explain a named heading; find prompt location; draft original scene; compound explain+copy | Select correct action; complete all requested parts; do not label a new draft “approved” | New phase13 tests |
| Symptom grounding | Identity contains label/motion/finger/brand term; actual separate symptom; resolved/negated symptom | Only an asserted active problem selects troubleshooting; preserve genuine FAQ fixes | Tutor-knowledge + new phase13 tests |
| Follow-ups | Repeat exact asset, change prose language, same again, choose angle, replace then repeat | Same intended asset/task with current facts; no silent prior-heading fallback for an unrelated request | History + phase13 tests |
| Reset | Explicit product reset in same chat, reset then new identity, new nonempty chat ID | Clear product dependencies for reset; no account-wide deletion; preserve deliberate lesson/task scope | History tests, after reset semantics approved |
| Conversation boundaries | New chat IDs; A/B switching with client history; legacy missing ID | No cross-chat facts in new requests; documented legacy compatibility; no cross-user/course reuse | History tests; client fixture tests if scoped |
| Course/entitlement | Valid/invalid lesson, unpublished course, no material access, explicitly requested cross-course comparison | No unauthorized asset; no product changes to Influencer/Filmmaking behavior; exact records stay course-scoped | Existing suites + tutor-knowledge tests |
| Source fidelity | All 19 headings, repeated placeholders, unknown person/price/etc. | Complete source clauses unchanged; only permitted source slots filled; final cleanup cannot truncate or rewrite | New phase13 tests with independent source oracle |
| Languages/constraints | Proper name different script than prose; explicit language override; no hands/actors/music; material correction | Original identity retained; explicit prose language honored; constraints applied or clearly clarified | New phase13 tests; tasks tests only if changed |
| Provider/validation | Success, malformed/empty output, error, timeout, repair exhaustion | Correct outcome/provenance; bounded budget; safe fallback; no local draft mislabeled live | Existing phase suites + focused cases only when affected |

## Independent oracle and test isolation

- Store literal approved bodies/hashes and manually declared known slots in test fixtures frozen before running the candidate. Expected bodies must not call `productSlots`, `extractEntity`, `productFacts` or the production renderer.
- For each exact case compare the complete final executable block after **only predeclared whitespace normalization**, not substring inclusion, token overlap or fuzzy similarity. Keep executable source wording strict. Check every occurrence of a repeated placeholder.
- Permit original placeholders only for facts genuinely not provided. When an identity is ambiguous, the expected behavior is a specific clarification/abstention, not a guessed fill.
- Use fresh generated product strings in property/parameterized tests to prevent name memorization, paired with human-reviewed language constructions. A generator must not merely generate the parser's own grammar.
- Run module/route tests under the existing network-denial helper. Use synthetic isolated state maps and a fixed clock where relevant. Do not point test code at production database/real learners.
- Assert course ID/record IDs, material access, selection mode, provider request count and persisted state in addition to answer text. Diagnostic labels must describe actual execution.
- Validate final output and next-turn state, not just parser return values. This catches correct rendering with bad identity and correct current text with contaminated future facts.

## Validation order

First capture new failures on the current baseline; preserve that output. Then run the focused tests for each approved implementation change. Once the final candidate passes focused tests, run the complete unchanged 351-case backend baseline plus additions and all 167 evaluator baseline tests. Do not repeatedly rerun unchanged successful suites without a new change or concern. A deliberate evaluator-version change needs its own contrastive tests and frozen output comparisons before live evaluation; it must not rewrite v7 history.

Real DB concurrency, durable multiple-chat persistence, deployed browser flows and live provider multilingual generation remain separate acceptance work. They must not be inferred from this read-only review's fixture passes.
