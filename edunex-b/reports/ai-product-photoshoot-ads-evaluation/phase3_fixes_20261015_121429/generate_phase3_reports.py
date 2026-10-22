import datetime
import difflib
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

B=Path.cwd();R=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(name,value):
 with (R/name).open('x') as f:json.dump(value,f,indent=2,ensure_ascii=False);f.write('\n')
def md(name,text):
 with (R/name).open('x') as f:f.write(text.rstrip()+'\n')

before=read(R/'phase3_manifest_before.json')
baseline=B/'reports/ai-product-photoshoot-ads-evaluation/phase2_live_review_20261015_120010'
node=read(R/'node_verified_execution.json');python=read(R/'python_verified_execution.json');replay=read(R/'offline_template_replay_results_final.json')
assert node['summary']=={'passed':153,'failed':0,'skipped':0,'total':153}
assert python['summary']=={'passed':43,'failed':0,'skipped':0,'total':43}
assert replay['passed']==25 and replay['failed']==0

changed=['services/productTutorKnowledge.js','services/productTutorResponse.js','services/productTutorTasks.js','services/tutorKnowledge.js','services/aiTutorService.js','routes/ai.js','models/AiTutorSession.js',
 'knowledge/ai-product-photoshoot-ads/guidance.json','scripts/eval/grade_product_photoshoot_ads_results_v3.py','scripts/eval/README.md',
 'tests/product-tutor-quality.test.cjs','tests/ai-chat-history.test.cjs','tests/product-tutor-phase3.test.cjs','tests/test_product_evaluator_v3.py']
# Restore the pre-phase README into the review's BEFORE snapshot only. Its hash
# must match the saved Phase 1 improvement manifest, not a reconstructed string.
old_readme=R/'before/scripts/eval/README.md'
if not old_readme.exists():
 with zipfile.ZipFile(B.parent/'Skillomate_Chatbot_Improvement_Review.zip') as z:
  data=z.read('Skillomate_Chatbot_Improvement_Review/edunex-b/scripts/eval/README.md')
 manifest=read(B/'reports/ai-product-photoshoot-ads-evaluation/quality_improvement_20261015/verification_manifest.json')
 expected=next(x['sha256'] for x in manifest['changed_implementation_files'] if x['path'].endswith('/scripts/eval/README.md'))
 assert hashlib.sha256(data).hexdigest()==expected
 with old_readme.open('xb') as f:f.write(data)

source_rows=[];patch=[]
for name in changed:
 p=B/name;old=R/'before'/name
 source_rows.append({'path':name,'absolute_path':str(p),'status':'modified' if old.exists() else 'new','before_sha256':digest(old) if old.exists() else None,'after_sha256':digest(p)})
 patch.extend(difflib.unified_diff(old.read_text().splitlines(True) if old.exists() else [],p.read_text().splitlines(True),fromfile='before/'+name if old.exists() else '/dev/null',tofile='after/'+name))
with (R/'phase3_changes.patch').open('x') as f:f.writelines(patch)

history_changes=[name for name,value in before['historical_hashes'].items() if digest(B/name)!=value]
unchanged_core=['knowledge/ai-product-photoshoot-ads/training.txt','scripts/eval/grade_product_photoshoot_ads_results_v2.py','scripts/eval/product_photoshoot_ads_test_cases.json','tests/test_product_evaluator.py']
assert not history_changes
assert all(digest(B/name)==before['sources_before'][name] for name in unchanged_core)
assert digest(B.parent/'Skillomate_Chatbot_Phase2_Live_Review.zip')==before['phase2_package_hash']
assert not any(re.search(r'ppads_|new15_|heldout_', (B/name).read_text()) for name in changed if name.startswith(('services/','routes/','models/','knowledge/')))

root=ET.parse(R/'node_verified_output.xml').getroot();target_node=[]
for item in root.iter('testcase'):
 if item.attrib.get('file','').endswith('product-tutor-phase3.test.cjs') or item.attrib['name'].startswith('phase3 '):
  target_node.append({'name':item.attrib['name'],'file':item.attrib.get('file'),'status':'passed' if item.find('failure') is None else 'failed'})
target_py=[c for c in python['cases'] if 'Phase3EvaluatorTests' in c['class']]
assert len(target_node)==36 and len(target_py)==18
targeted={'mode':'LOCAL_VALIDATION_ONLY','new_live_evaluation':False,'external_provider_requests':0,
 'summary':{'targeted_unit_checks':54,'passed':54,'failed':0,'node_targeted':36,'python_v3_targeted':18},
 'targeted_node_cases':target_node,'targeted_python_cases':target_py,'full_node_regression':node,'full_python_regression':python,
 'complete_template_replay':replay,
 'historical_score_notice':'Phase 2 remains 45/70 (64.3%) under its unchanged v2 grader. New tutor live accuracy is unmeasured. Saved-response v3 regrading below changes the rubric, not model answers or chatbot behavior.'}

spec=importlib.util.spec_from_file_location('grader',B/'scripts/eval/grade_product_photoshoot_ads_results_v3.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
templates=g.templates_from_source(B/'knowledge/ai-product-photoshoot-ads/training.txt');raw=read(baseline/'application_raw_results.json');regrades={}
for name,pack in [('original','original_test_cases.json'),('held_out','held_out_test_cases.json')]:
 regrades[name]=g.regrade(read(baseline/pack),raw,templates,'end_to_end')
dump('phase2_saved_response_regrade_v3.json',{'interpretation':'OFFLINE RUBRIC COMPARISON ONLY; not a new live evaluation; actual saved answers unchanged','results':regrades})
targeted['saved_response_v3_regrade']={k:v['summary'] for k,v in regrades.items()}
dump('phase3_targeted_test_results.json',targeted)

manifest={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':source_rows,'historical_files_verified_unchanged':len(before['historical_hashes']),
 'historical_changes':history_changes,'raw_course_source_unchanged':True,'original_v2_grader_unchanged':True,'original_55_case_pack_unchanged':True,
 'phase2_zip_unchanged':True,'runtime_contains_evaluation_case_ids':False,'external_provider_requests':0,'deployed':False,'committed':False,'pushed':False,
 'node':node['summary'],'python':python['summary'],'local_template_replay':{'passed':25,'total':25,'critical_cases_passed':3},
 'new_live_accuracy':None}
dump('phase3_validation_manifest.json',manifest)
paths='\n'.join(f"| `{x['path']}` | {x['status']} |" for x in source_rows)
report=f'''# Phase 3 targeted implementation report

Implemented locally against the verified Phase 2 package: original **36/55**, held-out **9/15**, integrated **45/70 (64.3%)**, exact templates **22/25**, three critical known-slot failures. Historical answers, scores and the original v2 evaluator remain unchanged.

## Changes and reasons

1. **Known product slots and references.** Explicit declarations precede request prepositions. Names terminate before commas, price/channel clauses and language instructions. Leading determiners are removed inside the slot so the approved scaffold stays grammatical. Referring phrases such as “the product I mentioned” cannot overwrite a named product from user history or stored context. Assistant-invented attributes are ignored. Known facts reset on a genuine product change. The original `training.txt` and all 19 approved template bodies are unchanged; only explicit placeholders are filled.
2. **Lesson- and intent-aware retrieval.** Source records carry reviewed intent tags. Explicit lesson requests outrank a previously selected video; the local selector filters by lesson/topic before preferring a workflow. Lesson 08 uses its existing final-ad FAQ instead of Lesson 02. Motion follow-ups select motion troubleshooting, style requests retrieve the full matching saved asset, and exact FAQ fixes retain the entire stored instruction. A reviewed overview/prerequisites translation adds the phone, laptop, product and supported tools already present in the source.
3. **Product versus platform routing.** Negated platform references are excluded from affirmative subscription intent. A product ad and its supplied price stay in course scope even when the learner says not to discuss a subscription. An actual affirmative platform-price question still uses the existing platform handler.
4. **Course-scoped conversation memory.** `AiTutorSession.productContext` stores a bounded product name, attributes, price, sales channel, selected ad angle, selected lesson and requested outputs. Only user turns supply facts. Memory survives omitted client history; different users, different active courses and new conversation IDs cannot reuse it. This is a schema/source change only: no production data migration or database write was performed.
5. **Complete safe practice outputs.** A local composer can produce a conservative ad angle/plan, five hooks (or the requested bounded count), timed script with separate visuals and voiceover, caption, and three reference-grounded Flow scene prompts when the product facts suffice. Buyer groups are labeled hypotheses to validate. Missing product identity gets one focused question. Unknown specifications, benefits, customer experiences and prices are not filled in. Approved templates remain separate from original practice drafts. The response guard detects missing deliverables, wrong language, missing/wrong lesson attribution and incomplete exact instructions. Replacements retain their existing non-live provenance. Claim checks no longer let an unrelated negation excuse a later endorsement; `showcase` is not confused with the verb `show`.
6. **Versioned evaluator corrections.** New `grade_product_photoshoot_ads_results_v3.py` adds independent expected-slot parsing, full known-slot checks, reviewed semantic/short-Hinglish equivalents, contextual direct refusals, tighter negation scope, and a separate task-completion dimension. Numeric settings and complete template clauses remain strict. A caption/angle promise is not the output. A routing-forbidden platform term is classified as correctness rather than deceptive advertising. v2 and its 25 tests remain intact.

These rules do not branch on evaluation IDs or match whole saved questions. New regression products differ from the failed held-out examples. Exact prompts are stored course assets, not hardcoded evaluation answers.

## Actual validation

- **153/153 Node regressions passed**, zero failures/skips (117 existing checks plus 36 new targeted checks).
- **43/43 evaluator tests passed**, zero failures/skips (25 unchanged v2 checks plus 18 new v3 checks).
- **25/25 complete-template local replays passed**, including `new15_002`, `new15_conv_001`, and `new15_conv_005`, against independent source-derived complete-body expectations saved before this implementation.
- All 8 lessons and 19 complete template assets remain covered by the existing integrity/retrieval tests. AI Influencer/AI Filmmaking, paid-content access, mobile/history, platform and provider-error compatibility checks pass.
- **0 external provider requests.** Node validation loads the deny-network preload; evaluator checks and saved-response regrading are offline.

Replaying the 25 template inputs exercises the local retrieval/response handlers. It is not a fresh provider or deployed-system evaluation. Final route-level tests use synthetic persisted state and provider fixtures; no production account or database is touched.

## Saved-response grader comparison, not live improvement

Regrading the same unchanged Phase 2 answers with v3 yields **46/55 original and 9/15 held-out**, combined **55/70 (78.6%)**. The prior v2 result stays **45/70 (64.3%)**. The difference is evaluator correction only. v3 newly identifies the two additional known-slot prompt failures and previously v2-passing missing captions/angles; valid paraphrases and short Hinglish stop failing. New tutor live accuracy is **unknown**, and no 95% or production-readiness claim is made.

## Changed source files

Paths are relative to `{B}`. The review patch compares the pre-Phase 3 workspace snapshot, not Git HEAD, because earlier authorized changes already existed.

| Path | Status |
|---|---|
{paths}

Existing tests that required all product drafting to call the provider now verify local output, supplied facts, course isolation and honest provenance. Provider-specific safety/language/fallback tests still exercise the actual adapter/guards with fixtures, using a non-local conceptual question. The old determiner assertion now rejects “the a …”; feature-only checks avoid unintentionally requesting a complete hook list. No test was removed, and valid safety/fidelity requirements were not relaxed.

## Preservation and delivery

All **{len(before['historical_hashes'])}** pre-existing product-evaluation report/evidence files retain their hashes. The Phase 2 ZIP, raw course text, original 55-case definitions and v2 grader/tests are unchanged. No deployment, commit, push, production infrastructure or unrelated business change occurred. Evidence includes structured results, JUnit/Python logs, the exact commands, source hashes, before/after patch and local template replay output. The repository-required comparison PDF accompanies the ZIP.
'''
md('phase3_implementation_report.md',report)

nodecmd='NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs '+' '.join(node['command'])
pycmd="python3 -B -m unittest discover -s tests -p 'test_product_evaluator*.py' -v"
reg=f'''# Phase 3 local regression results

Final validated source state: `{node['completedAt']}`. No live provider evaluation was run.

| Suite | Actual outcome | Exit | Skipped |
|---|---:|---:|---:|
| Node tutor, course retrieval, product quality, Phase 3 and mobile/history | 153/153 passed | 0 | 0 |
| Python evaluator v2 + v3 | 43/43 passed | 0 | 0 |
| Complete saved-template local replay | 25/25 passed | 0 | 0 |
| New targeted checks within those suites | 54/54 passed | 0 | 0 |

The 54 targeted unit checks are 36 Node checks (33 in the new Phase 3 file plus 3 route/persistence checks) and 18 v3 evaluator checks. They are subsets of the full suites, not additional tests to add twice. The template replay is a separate local verification of 25 source-derived bodies and all three confirmed critical inputs.

## Commands executed from the backend

```sh
{nodecmd}
{pycmd}
node reports/ai-product-photoshoot-ads-evaluation/phase3_fixes_20261015_121429/offline_template_replay_final.cjs
```

`run_verified_validation.py` captures the final suite execution and parses JUnit/Python outcomes. Node ran {node['startedAt']}–{node['completedAt']} UTC, duration {node['durationSeconds']:.3f}s; Python ran {python['startedAt']}–{python['completedAt']} UTC, duration {python['durationSeconds']:.3f}s. `node_verified_output.xml`, `python_verified_output.log` and execution JSON retain the actual evidence. No full-suite check is hidden behind an assumed success count.

Earlier development iterations ran the same suite subsets to resolve selector, determiner, provider-origin, motion-follow-up, contextual-negation and `showcase` false-positive failures. Saved development logs and the earlier 151/152-check runs are separate from the final 153-check results. The last added case prevents a saved product context from another active course being reused; the full suite was rerun after that change.

## Coverage and preservation

Critical root-cause tests use unseen products and independently compare complete template bodies. Additional tests cover attributes and new-product resets, selected ad angle, price/channel memory without client history, new-conversation and user/course boundaries, Lesson 08, prerequisites, exact phone instructions, Hindi movement follow-up, language switching, requested hook counts/scripts/captions/Flow prompts, honest advertising and unknown facts. Existing AI Influencer/AI Filmmaking/access/provider-error checks remain passing.

Both original v2 and new v3 evaluators are tested. The unchanged Phase 2 corpus is optionally regraded offline into a new file to demonstrate scoring differences; no saved answer or historical score is overwritten. A regrade is not a runtime or provider evaluation.

Network calls: **0 external provider requests**. The deny-network Node preload blocks actual fetch/HTTP/socket use; fixtures still exercise provider success/error/retry guards. No runtime database connection, production migration or server deployment occurred. All captured historical hashes and immutable core input hashes match. See `phase3_validation_manifest.json` and `phase3_targeted_test_results.json`.
'''
md('phase3_regression_results.md',reg)

remaining='''# Phase 3 remaining issues and limits

The three confirmed critical full-template cases are fixed in local verification, and all 25 saved template-body replays pass. Local suites pass 153 Node and 43 evaluator checks. This does not establish new live accuracy, 95% overall quality or production readiness. The last live v2 score remains 45/70 (64.3%). No live provider call was made in Phase 3.

1. **Fresh model behavior remains unmeasured.** Provider-generated creative wording and complex questions need a separately approved live evaluation. No post-fix live score or critical-failure rate is inferred from local tests or saved-response regrading.
2. **Product extraction is bounded.** It supports tested explicit declarations, commas, prices/channels, determiners, multilingual declarations and common conversational references. Ambiguous names, unusual punctuation, unsupported currencies/channels and more complex attribute corrections may still need a focused question. Approved scaffold words stay unchanged, so unusual plural/product-name grammar still merits review.
3. **Practice drafts are conservative.** They intentionally use supplied facts and simple reusable structures, with buyer groups labeled hypotheses. They do not establish marketing effectiveness or verify user-supplied claims. Complex persuasive copy can still require the provider or more information. Counts are bounded to limit response size; very large output requests are not a tested acceptance target.
4. **Finite evaluator semantics remain limited.** v3 corrects observed failures and checks actual deliverables, but cannot prove arbitrary meaning, truth, task completion or safety. Unfamiliar valid layouts and paraphrases need human review. Expected-slot parsing is implemented independently from runtime but is still a bounded parser; the saved independent source audit remains valuable.
5. **Persistence/infrastructure is locally validated only.** The optional productContext schema and conversation/user/course boundaries are tested with synthetic persistence. No production migration, deployed HTTP/auth path, database load or concurrency behavior was tested. The existing one-session-per-user/course storage shape remains; this change does not introduce a separate multi-conversation archive.
6. **Provider reliability was not retested live.** Existing offline retries/timeouts/connection/rate-limit regressions pass. No real outage, provider uptime or wall-clock performance claim is made. Generic fallback relevance for arbitrary questions remains bounded by available course material.

The saved-response v3 result of 55/70 (78.6%) is solely a rubric comparison on the old text. It does not replace 45/70 or measure the new tutor. Historical source/evidence is preserved. Stop here after local validation and packaging; deployment and another live evaluation have not been performed.
'''
md('phase3_remaining_issues.md',remaining)

readme='''# Skillomate Chatbot Phase 3 fix review

Local targeted fixes for AI Product Photoshoot & Ads. No live provider requests, deployment, production changes, commit or push.

Reports:
- phase3_implementation_report.md
- phase3_targeted_test_results.json
- phase3_regression_results.md
- phase3_remaining_issues.md

Validation: 153/153 Node tests, 43/43 evaluator tests, 54/54 new targeted checks (already included in suite totals), and 25/25 independent complete-template local replays. All three recorded critical cases pass locally. No new live accuracy is claimed; the verified historical Phase 2 result remains 45/70 (64.3%). V3 saved-response grading is a separate rubric-only comparison (55/70) on unchanged answers.

The source/ directory contains relevant changed application, knowledge, evaluator and regression files. phase3_changes.patch compares the pre-Phase 3 workspace with the delivered implementation. Evidence includes final command logs and metadata, original v2 references, hashes, saved-response v3 results and local replay output. The comparison PDF is required by the repository AGENTS.md and distinguishes historical live evidence from current local validation. Environment files, API key values, actual learner data and unrelated project files are excluded.

Known limits: no new live-model measurement, bounded parsing/semantic heuristics, conservative practice drafts, synthetic persistence testing and no production infrastructure validation. See phase3_remaining_issues.md. Do not treat local passes or the rubric-only regrade as production readiness.
'''
md('README.md',readme)
print(json.dumps({'changed_files':len(changed),'node':node['summary'],'python':python['summary'],'targeted_unit_checks':54,'template_replays':25,'critical_replays_passed':3,'historical_files_unchanged':len(before['historical_hashes']),'v3_saved_regrade':{k:v['summary']['passed'] for k,v in regrades.items()}},indent=2))
