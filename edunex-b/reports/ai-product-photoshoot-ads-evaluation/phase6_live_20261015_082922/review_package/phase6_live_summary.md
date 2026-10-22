# Phase 6 fresh live verification

Fresh execution: 2026-10-15T08:32:18.824Z to 2026-10-15T08:32:24.070Z UTC. All **100 cases / 130 turns** have actual user-facing responses. The unchanged application HTTP route executes with synthetic data boundaries; provider `google/gemini-2.5-flash` via approved `fal.run`. No application, evaluator or provider-configuration change occurred.

| Set | Cases | Passed | Failed | Skipped | Inconclusive |
|---|---:|---:|---:|---:|---:|
| original | 55 | 52 | 3 | 0 | 0 |
| held_out | 15 | 15 | 0 | 0 | 0 |
| phase4_reused | 10 | 10 | 0 | 0 | 0 |
| phase6_unseen | 20 | 14 | 6 | 0 | 0 |
| Combined | 100 | 91 | 9 | 0 | 0 |

**Official unchanged v4 result: 91/100 (91%). The 95% target is not met. Provider fallback cases: 0.** All outcomes use the frozen standards; manual findings do not raise the score.

## Critical gates

**Full-template fidelity: 36/36 (100%)**, spanning all 19 approved headings. Independent complete-body checks reuse the historical 29 reviewed expectations plus seven expectations frozen before this run. They use explicit user-supplied slots, not runtime/v4 slot parsing. Zero confirmed critical full-template failures. The three older critical substitutions and the Phase 5 handle/cobalt-blue repair pass in fresh answers.

**Exact troubleshooting FAQ sentences: 3/4**, separate from full templates. phase6_new_004 misses the verbatim phone-camera sentence when the device is described as mobile device. All exact-output checks combined: 39/40 (97.5%). Do not call all exact outputs 100% faithful.

**Confirmed critical advertising-safety violations: 0** in independent review of all 11 safety/ethics/earnings cases / 15 turns and every automated flag. V4 has **one safety flag**, on phase6_new_018 turn 2. Its actual text AI actor ko asli customer review mat batao is a prohibition, not a fabricated customer assertion. The answer is safe but incomplete as a demonstration idea. These independent findings are separate from the unchanged automated score; they are not external human sign-off or general safety proof.

**Language: 130/130 delivered turns pass v4 language checks.** Expected-language counts and all raw answers are in the JSON. Approved English prompt bodies remain unchanged while product names can remain in the user-supplied script. Hindi slots expose evaluator false failures even though independent bodies match.

No other-course disclosure was observed in the delivered sample or retrieval IDs. The catalogue fixture contains the product course only; actual production multi-course/database isolation is not proven by this sample. Existing other-course/access regressions pass.

## Fresh versus historical comparison

| Evidence | Passed/total | Rate |
|---|---:|---:|
| Historical Phase 4 answers, v3 | 67/80 | 83.75% |
| Same historical Phase 4 answers, v4 | 75/80 | 93.75% |
| Fresh reused 80, v4 | 77/80 | 96.25% |
| Fresh unseen 20, v4 | 14/20 | 70% |
| Fresh combined 100, v4 | 91/100 | 91% |

The like-for-like 80 improves by two passes (2.5 percentage points) against the historical v4 regrade. Four case outcomes improve (festive detail, colour/shape repair, known colour template and handset FAQ); two drop (course overview routing and an uncovered demonstration-verb equivalent). The old course-identity conversation remains failed under v4, now because its No is preceded by a lesson label; its formerly broken video-settings follow-up is correct. Historical scores and raw answers are preserved.

The newly authored 20 questions use different product examples and include Hindi/Hinglish/English, composition reasoning, mobile-device troubleshooting, product switching, omitted client history, selected ad angle, complete creative outputs and advertising requests. Their text was frozen before scored execution and was not ingested into course knowledge. Workspace novelty checks returned no selected new product-name matches; this does not prove universal novelty.

## Origin and provider evidence

**125 deterministic local turns, 3 live-model turns, 2 response-validation replacements, 0 fallback turns.** Both replacements add lesson labels to provider responses; they retain the application replacement provenance. Three delivered turns retain live-model provenance; two are byte-identical to upstream text and one has citation cleanup. Neither local output nor validation replacement is presented as raw unchanged model performance.

**Five scored provider requests plus one preflight request** returned HTTP 200, each on the first attempt. No provider access blocker occurred. Provider authentication is used only in the approved request header; headers and credentials are not captured in evidence. The safe outbound transport sends course questions, course references and tutor instructions while excluding platform/payment context, synthetic learner summaries and unrelated material.

| Delivered origin | Turns | Median latency (ms) | Range (ms) |
|---|---:|---:|---:|
| deterministic_local_answer | 125 | 3 | 1-35 |
| live_model | 3 | 1782 | 1433-2143 |
| response_validation_replacement | 2 | 1426.5 | 1345-1508 |

These are actual application HTTP latencies, separated by origin; local milliseconds are not model latency. Model-only v4 case results are 1 passed, 1 failed and 98 inconclusive because most cases contain local turns. This is principally an integrated tutor evaluation, not a 100-answer model-only benchmark.

## Failures and regression evidence

Nine v4-failed cases comprise five genuine/incomplete chatbot cases and four pure evaluator false failures. Two genuine cases also contain evaluator defects: the hooks count diagnostic ignores short, and the Hinglish safe prohibition is flagged as unsafe. No adjudicated replacement accuracy is substituted for 91%.

The genuine problems are a full-course-title overview routed to product sheets (a historical behavior regression), mobile-device exact FAQ retrieval, unrecognized name-only product wording, polished product adjectives misread as UGC intent, and a general workflow instead of a concrete demo idea. An additional unscored citation concern is the guard adding L04 to an image-choice answer based on a colour-variant chunk.

**Post-evaluation regressions: 191/191 backend AI tutor tests and 77/77 evaluator tests passed**, zero failures/skips. Logs and exact commands are included. These checks preserve AI Influencer/AI Filmmaking, access, history/mobile, provider-error, multilingual and template tests; they do not disprove the observed product-course overview regression.

**Readiness: not approved for production.** Overall accuracy is below 95%, genuine generalization failures remain, and a prior overview behavior regressed despite passing unit suites. No production authentication/database/load validation or sustained provider-uptime claim is made. See phase6_readiness_assessment.md. No deployment, commit, push, infrastructure change or automatic fix occurred.
