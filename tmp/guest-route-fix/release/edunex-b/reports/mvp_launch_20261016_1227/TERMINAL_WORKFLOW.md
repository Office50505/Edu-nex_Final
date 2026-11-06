# Local MVP testing

Run commands from `Untitled/edunex-b`.

The original `chatbot_eval.py`, `test_cases.json`, and `last_results.json` were absent. The new small runner uses the real existing `server.js`, `/api/ai/chat`, bearer authentication, MongoDB models, entitlement resolution, retrieval and conversation persistence. The existing v7 saved-response grader and its tests are unchanged. The old `scripts/eval-tutor.cjs` targets another course and is incompatible.

```sh
node scripts/eval/mvp-local-backend.cjs
python3 -B chatbot_eval.py --mode offline
```

The isolated backend is already running at `http://127.0.0.1:3127`; do not start a second instance on the same port. The launcher uses a new `skillomate_mvp_eval_*` database on the existing local MongoDB instance. It never touches the existing server on port 3000 or its remote database. Private synthetic bearer tokens are stored under a mode-0700 directory in `/private/tmp`, not in this report. The runtime locator contains only that file path. Synthetic video identifiers are schema fixtures; no videos are fetched. Background jobs are disabled. External inference is denied unless a separately recorded explicit approval matches the frozen question hash/model/call budget.

After explicit provider approval is recorded by the operator:

```sh
python3 -B chatbot_eval.py --mode live
```

The live command fails closed without approval. Model: `google/gemini-2.5-flash`; endpoint: fal/OpenRouter chat completions. Plan: 40 HTTP turns, maximum 60 upstream attempts including retries/repairs, maximum 900 output tokens and 120,000 serialized payload characters per attempt. Normal expected cost $0.15–$0.50; $3 planning allowance, not a guaranteed vendor billing cap. Current OpenRouter reference rates: $0.30/M input and $2.50/M output tokens; gateway billing may differ. Public pricing pages were read; no AI inference was performed. Vendor account environment is unverified; the application and data are isolated locally.

```sh
NODE_OPTIONS='--require=./tests/helpers/deny-network.cjs' node --test tests/*.test.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
```

Final local verification: 1,210 backend tests, 1,186 passed, the same 24 pre-existing failures, no new failures or skips. All 167 Python evaluator tests passed. Fifteen new focused regression tests cover natural product switches, negative controls, Unicode rejection, semantic comparison and ordinary troubleshooting.

Final offline 30-case summary: 19 PASS, 2 raw FAIL, 9 UNTESTED; 90.48% among executed cases; zero confirmed critical security failures; mean response time 54.69 ms; zero upstream requests. Local rules are not described as live model successes. Complete requests, responses, origins and source/payload inspection are in `../../last_results.json` and `pipeline_traces.jsonl`. The frozen cases and expected outcomes are preserved in `test_cases.frozen.json`.

The two raw flags remain unchanged: MVP-05's expected slot drops the article supplied by the learner, while its actual full body exactly matches literal authorized substitution; MVP-14 gives relevant reference-sheet guidance without naming shape checkpoints. See `grading_review.json`. No grades were increased after observing answers. The real English product-switch contamination was fixed. The incomplete comparison now takes the provider route; its generated answer is untested.

The final application delta is two parser lines in `productTutorState.js` and `productTutorIntent.js`; `focused_source_changes.diff` contains the precise task delta. Revert only those hunks and remove only the new MVP test if rollback is needed; preserve all earlier working-tree changes. An optional local access-denial optimization was removed after six existing contract checks failed; final source preserves the original response-helper contract. Intermediate test logs remain available.

Release decision: HOLD pending approved real-provider execution and review of remaining responses. No production readiness, deployment, push, commit or ZIP was performed.
