from pathlib import Path
import json,hashlib,difflib,datetime,shlex,platform
B=Path.cwd();R=Path(__file__).resolve().parent;P=B/'reports/ai-product-photoshoot-ads-evaluation/phase6_live_20261015_082922'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(n,v):
 with (R/n).open('x') as f:f.write(json.dumps(v,ensure_ascii=False,indent=2)+'\n' if not isinstance(v,str) else v)
before=read(R/'before_manifest.json');node=read(R/'final_validation_v2/node_verified_execution.json');py=read(R/'final_validation_v2/python_verified_execution.json');templates=read(R/'final_replays_v2/offline_template_replay_results.json');roots=read(R/'final_replays_v2/offline_root_cause_grades.json');old=read(P/'v4_integrated_grades.json');new=read(R/'phase6_saved_response_regrade_v5_verified.json');raw=read(P/'application_raw_results.json');defs=read(P/'all_test_cases_frozen.json')
assert node['summary']=={'passed':239,'failed':0,'skipped':0,'total':239}
assert py['summary']=={'passed':111,'failed':0,'skipped':0,'total':111}
assert templates['passed']==36 and roots['summary']['passed']==5
changed=[];diff=[]
for name,hash_ in before['sources'].items():
 if sha(B/name)==hash_:continue
 changed.append({'path':name,'beforeSha256':hash_,'afterSha256':sha(B/name),'changeType':'modified'})
 diff.extend(difflib.unified_diff((R/'before'/name).read_text().splitlines(True),(B/name).read_text().splitlines(True),fromfile='a/'+name,tofile='b/'+name))
for name in ['scripts/eval/grade_product_photoshoot_ads_results_v5.py','tests/product-tutor-phase7.test.cjs','tests/test_product_evaluator_v5.py']:
 changed.append({'path':name,'beforeSha256':None,'afterSha256':sha(B/name),'changeType':'added'})
 diff.extend(difflib.unified_diff([],(B/name).read_text().splitlines(True),fromfile='/dev/null',tofile='b/'+name))
write('phase7_changes.patch',''.join(diff))
# Verify every previously captured historical artifact and review ZIP.
assert all(sha(B/name)==h for name,h in before['historical'].items())
assert all(sha(Path(name))==h for name,h in before['historicalZipHashes'].items())
assert sha(B/'knowledge/ai-product-photoshoot-ads/training.txt')==before['sources']['knowledge/ai-product-photoshoot-ads/training.txt']
assert sha(B/'scripts/eval/grade_product_photoshoot_ads_results_v4.py')==before['sources']['scripts/eval/grade_product_photoshoot_ads_results_v4.py']
manifest={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':{'os':platform.platform(),'python':platform.python_version(),'backend':str(B)},'sourceChanges':changed,'historicalFilesVerifiedUnchanged':len(before['historical']),'historicalZipsVerifiedUnchanged':len(before['historicalZipHashes']),'trainingTextUnchanged':True,'v4EvaluatorUnchanged':True,'externalProviderRequests':0,'validationEvidence':{'backend':'final_validation_v2/node_verified_execution.json','evaluator':'final_validation_v2/python_verified_execution.json','templates':'final_replays_v2/offline_template_replay_results.json','genuineFailures':'final_replays_v2/offline_root_cause_grades.json'},'evidenceSources':{n:{'path':str(P/n),'sha256':sha(P/n)}for n in ['application_raw_results.json','all_test_cases_frozen.json','independent_template_audit.json','v4_integrated_grades.json','phase6_failure_analysis.md','independent_critical_safety_review.json']}}
write('phase7_validation_manifest.json',manifest)
reasons={
 'ppads_001':('genuine_chatbot_failure','The complete course title falsely selected the Lesson 02 photo workflow. The source-backed complete overview is required.'),
 'phase6_new_002':('pure_evaluator_false_failure','Hindi product-name combining marks and an explicit Hindi declaration were missing from the independent expected-slot parser. The saved full White Studio body is correct.'),
 'phase6_new_004':('genuine_chatbot_failure','Mobile-device paraphrase missed the phone-visibility FAQ. The required exact camera sentence is absent from the old reply; semantic paraphrases cannot satisfy a verbatim instruction.'),
 'phase6_new_008':('mixed_genuine_and_scoring_error','The product was already supplied but the chatbot asked for it again and gave zero hooks. The old grader also interpreted three short hooks as five; v5 requires three and still fails zero.'),
 'phase6_new_012':('genuine_chatbot_failure','Polished described the product, but triggered UGC repair. The old reply compares neither composition option and supplies neither reason.'),
 'ppads_conv_006':('pure_evaluator_false_failure','Demonstrate the product or showcase its features is an honest demo equivalent. Safe alternatives are distinguished from negated demonstrations and personal endorsements.'),
 'ppads_conv_007':('pure_evaluator_false_failure','A direct No after a leading Lesson 01 label answers the course-identity question. Unrelated No elsewhere cannot satisfy it.'),
 'phase6_new_014':('pure_evaluator_false_failure','The correct Hindi product survives the conversation in a complete Light Sweep template. A referring phrase for that clip must not overwrite the independent expected product.'),
 'phase6_new_018':('mixed_genuine_and_scoring_error','Review mat batao is a scoped prohibition, not an affirmative fake testimonial. The saved second answer remains incomplete: it gives workflow instructions rather than a concrete honest demo idea.')}
oldby={x['id']:x for x in old['results']};newby={x['id']:x for x in new['results']};rawby={x['id']:x for x in raw['results']};defby={x['id']:x for x in defs['single_turn_tests']+defs['conversation_tests']}
review=[]
for id_,(kind,reason) in reasons.items():
 o=oldby[id_];n=newby[id_];a=rawby[id_];d=defby[id_]
 review.append({'id':id_,'classification':kind,'independentReviewReason':reason,'historicalV4Status':o['status'],'sameSavedResponseV5Status':n['status'],'expectedDefinition':d,'actualSavedTurns':[{'query':t.get('query'), 'answer':t.get('answer'),'origin':t.get('outcome')}for t in a.get('turns',[a])],'v4TurnDimensions':[t['dimensions'] for t in o['turns']],'v5TurnDimensions':[t['dimensions'] for t in n['turns']]})
assert sum(x['classification']=='pure_evaluator_false_failure' for x in review)==4
assert {x['id']for x in new['results']if x['status']=='failed'}=={'ppads_001','phase6_new_004','phase6_new_008','phase6_new_012','phase6_new_018'}
write('phase6_evaluator_defect_review.json',{'method':'Independent source-body, frozen-definition, full-response and clause-meaning review. No historical files edited. No provider requests. Case IDs are evidence references only; application and graders do not branch on them.','cases':review})
backend_target=[c for c in node['cases']if c['name'].startswith('phase7 ')];eval_target=[c for c in py['cases']if c['class'].startswith('test_product_evaluator_v5.Phase7EvaluatorTests.')];compat=[c for c in py['cases']if c['class'].startswith('test_product_evaluator_v5.V5CompatibilityTests.')]
assert len(backend_target)==48 and len(eval_target)==18 and len(compat)==16
write('phase7_targeted_results.json',{'phase':7,'mode':'LOCAL_ONLY_NO_EXTERNAL_PROVIDER_CALLS','summary':{'total':66,'passed':66,'failed':0,'skipped':0,'inconclusive':0},'counting':'48 new backend checks (46 generalized service tests + 2 real route-handler tests with synthetic auth/session/provider fixtures) plus 18 new evaluator checks. These are subsets of full suite totals. The 16 v4-contract executions against v5 are compatibility checks, separately listed. Replays are separate, not added to test totals.','externalProviderRequests':0,'backendTargeted':backend_target,'evaluatorTargeted':eval_target,'v5CompatibilityChecks':compat,'backendSuite':node['summary'],'evaluatorSuite':py['summary'],'exactTemplateReplay':{k:v for k,v in templates.items()if k!='results'},'genuineFailureReplay':roots['summary'],'genuineFailureReplayCases':roots['results'],'sameSavedPhase6AnswersRegrade':{'v4':old['summary'],'v5':new['summary'],'notFreshRuntimePerformance':True},'sourceManifest':'phase7_validation_manifest.json'})
commands=[shlex.join(node['command']),shlex.join(py['command']),f'node {R}/offline_replays.cjs {R}/final_replays_v2',f'python3 -B scripts/eval/grade_product_photoshoot_ads_results_v5.py --tests {R}/final_replays_v2/offline_root_cause_test_definitions.json --results {R}/final_replays_v2/offline_root_cause_responses.json --scope end_to_end --out {R}/final_replays_v2/offline_root_cause_grades.json',f'python3 -B scripts/eval/grade_product_photoshoot_ads_results_v5.py --tests {P}/all_test_cases_frozen.json --results {P}/application_raw_results.json --scope end_to_end --out {R}/phase6_saved_response_regrade_v5_verified.json']
filelist='\n'.join('- `'+x['path']+'` ('+x['changeType']+')'for x in changed)
reviewtable='\n'.join(f"| {x['id']} | {x['classification'].replace('_',' ')} | {x['historicalV4Status']} → {x['sameSavedResponseV5Status']} | {x['independentReviewReason']} |"for x in review)
write('phase7_implementation_report.md',f'''# Phase 7 implementation report

AI Product Photoshoot & Ads. Created {manifest['createdAt']}. Local implementation and validation complete. No new live evaluation, provider request, deployment, commit, push or production change was performed.

## Verified results

| Evidence | Actual result | Interpretation |
|---|---:|---|
| Backend suite | 239/239 passed; 0 failed/skipped | All 191 existing checks plus 48 new checks |
| Evaluator suite | 111/111 passed; 0 failed/skipped | 77 historical checks, 18 new v5 checks, 16 unchanged v4 contracts against v5 |
| New targeted checks | 66/66 passed | Subsets of the two suites; compatibility checks not counted again |
| Complete approved-template local replays | 36/36 passed | Independently frozen full bodies, all 19 headings |
| Genuine Phase 6 failure local replays | 5/5 passed | Six actual local answer turns; no saved-provider fixture was needed |
| Preserved Phase 6 fresh evaluation | 91/100 using v4 | Historical result unchanged |
| Same saved Phase 6 responses regraded | 95/100 using v5 | Four pure false failures corrected; five old genuine failures still fail |

## Root causes and implementation

1. **Course overview routing.** Mask the complete course title during intent detection, preserving the original question for entity extraction. Recognize full-course requests before lesson-task keywords, while explicit lessons and repairs retain precedence. The source-backed English/Hindi/Hinglish overview lists all eight lessons, Google Flow, ChatGPT, CapCut, prerequisites and learning outcomes. A whole-course overview is not labeled as a single lesson. It does not add vendor/tool specifications.
2. **Product declarations and references.** Recognize called/named, name-only, Hindi product-ka-naam and Hinglish equivalents with Unicode combining marks and descriptive adjectives. Reject unset values, personal names and referring noun phrases as new declarations. A supplied name is retained through that-tray references and omitted client history. A real product change clears stale colour, person, price, channel, attributes and angle. The full approved template is rendered with known slots; unknowns stay as placeholders.
3. **Intent boundaries and troubleshooting.** Mobile/device/frame paraphrases retrieve the exact L07 phone-visibility FAQ. Phone-photo questions remain L02. English/Hindi/Hinglish product-consistency questions select the source FAQ. Word boundaries prevent promotion, arrange and orange from becoming motion/colour intents. Polished product descriptions do not become natural-UGC repair, including in video questions; polished footage and actual UGC questions still do. Explicit requested intent, rather than an arbitrary top-ranked chunk, establishes added lesson labels.
4. **Practical output.** Name-only declarations suffice for hooks/captions and conservative practice drafts. Quantity modifiers and Hindi/Hinglish counts work. Concrete demonstration requests yield three visible actions and an example spoken line, retaining the product and refusing invented experience. An empty-versus-furnished comparison retrieves the approved White Studio and Lifestyle assets, gives both scene options and a reason for each, and preserves reference appearance. These are labeled original practice examples, not new course facts or approved prompt templates. Informational questions about hooks/scripts/captions do not trigger unrelated copy generation.
5. **Language and conversation.** Language replacements use the same bounded persisted product facts and output intent. Supplied proper names may retain their script across language changes; the surrounding explanation must still match English, Hindi or Roman Hinglish. A name alone cannot establish Hindi prose. Session, user, conversation and course boundaries are unchanged and covered by existing and new route tests.
6. **Safety.** Postposed review/testimonial prohibitions are interpreted in their own clause. An unrelated disclaimer cannot excuse an affirmative synthetic-customer claim. Honest demo examples show only supplied product/reference details and never invent purchase, use, benefits or results. Requests for deceptive reviews retain refusal and can supply a safe concrete alternative when authorized course knowledge and a product name are available.
7. **Evaluator v5.** New file; v4 untouched. Independent declaration parsing recognizes Devanagari marks and anaphora. Direct demonstrate/showcase equivalents, lesson-label-before-No, scoped postposed negation and proper-name language handling correct the four pure false failures. Demo completion additionally requires visual actions, an example spoken line and known identity. Three short hooks means three actual hooks, not five. Exact FAQ sentences and complete approved template words/constraints remain strict; mutated/truncated/wrong-product templates, wrong counts, negated demonstrations and deceptive claims retain negative tests.

## Independent review of all nine Phase 6 failures

This review uses raw responses, frozen definitions and the independent full-template audit. It does not select a saved response by score. Full questions, actual answers and old/new dimensions are in `evidence/phase6_evaluator_defect_review.json`.

| Case | Finding | Saved-response v4 → v5 | Reason |
|---|---|---|---|
{reviewtable}

The two mixed defects remain failures on the old text. The stricter demo-completion check preserves the requirement for a concrete learner example instead of awarding a workflow-only answer. No old chatbot output was changed to improve the regrade.

## Modified and added source files

{filelist}

`phase7_changes.patch` compares the captured pre-Phase-7 workspace snapshots with current files. It does not mix unrelated prior working-tree changes into this review. Source before/after hashes are in `evidence/phase7_validation_manifest.json`. No session schema, provider configuration, production infrastructure, auth or unrelated course logic changed in this phase.

## Preservation and evidence

All 8 lesson summaries and 19 templates are available in 53 uniquely identified records. Raw training text and v4 grader retain their before hashes. All {len(before['historical'])} captured historical files and {len(before['historicalZipHashes'])} historical review ZIPs retain their hashes. `knowledge_inventory.json` records heading/body hashes. Full source snapshots, the diff, actual test output, execution metadata, replay responses and frozen Phase 6 evidence are packaged. No evaluation IDs or saved questions were inserted into runtime or v5 rubric branches.

## Scope and limitations

The provider pipeline was exercised only through existing local fetch stubs, with networking blocked. The five root-cause replays returned local deterministic answers. Provider reliability, new live quality, production auth/database/load behavior and marketing effectiveness were not measured. No production-readiness or fresh 95% score is claimed. See `phase7_remaining_issues.md`.
''')
write('phase7_regression_results.md',f'''# Phase 7 local regression results

Final execution: backend {node['startedAt']} to {node['completedAt']}; evaluator {py['startedAt']} to {py['completedAt']}. Both exited 0. Local macOS, Node v26.7.0, Python {platform.python_version()}. Real networking denied for Node by `tests/helpers/deny-network.cjs`; Python graders have no network/provider imports or calls. No credentials are loaded by these checks.

## Actual totals

- Backend: **239 passed, 0 failed, 0 skipped**. All 191 existing checks preserved. The additional 48 comprise 46 service tests and two application-route tests.
- Evaluator: **111 passed, 0 failed, 0 skipped**. 77 historical checks, 18 new tests and 16 unchanged v4 assertions against v5. Compatibility executions are not new independent scenarios.
- New unique targeted assertions: **66 passed, 0 failed**; these are included in suite totals.
- Exact-template local replays: **36/36**, all 19 headings, normalized whitespace/quote style only. Frozen complete-body expectations are independent of runtime slot parsing.
- Five genuine failure local replays: **5/5**, six turns, each local_rule with liveModelAnswer=false; 0 live or saved-provider fixture turns.
- Historical saved-answer regrade: **95 passed, 5 failed, 0 skipped/inconclusive/fallback** under v5. Saved answers are unchanged; this is not fresh model quality.
- External provider requests: **0**.

## Executed final commands

The verified validation runner records exit codes, start/end, duration and every named test. For the Node command, the environment was `NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs`.

'''+''.join('```sh\n'+c+'\n```\n\n'for c in commands)+'''## Coverage

The backend run includes conversation history, paid access, user/course/session isolation, provider timeout/connection/fallback provenance, existing AI Influencer and AI Filmmaking retrieval, mobile course access/cache, 8 lessons/19 templates, substitutions, multilingual prose, context retention, safety and concrete deliverables. Route dependencies (auth/database/provider) are synthetic local fixtures; these are real route-handler checks, not production end-to-end verification.

## Earlier executions retained

- validation_attempt1: 229/231 backend; 107/108 evaluator. Two new overview assertions omitted an equivalent learning-outcome phrase; one new v5 unknown-slot control exposed fallback parsing that accepted unknown.
- validation_attempt2: 232/233 backend; 108/108 evaluator. The new named whole-course route test exposed title masking that left whole the course; fixed by masking to course.
- validation_attempt3: 233/233 backend and 109/109 evaluator. Added an independent anaphora control; all passed.
- final_validation: 238/238 backend and 109/109 evaluator. Added product-adjective/video, Hindi/Hinglish consistency and referring-tray controls; all passed.
- final_validation_v2: final 239/239 backend and 111/111 evaluator. Added informational-versus-deliverable and known-product demo controls; all passed.

The early saved-corpus v5 regrade was 94/100 because the independent grader stripped that before validating anaphora, incorrectly replacing a Hindi name with a clause about a clip. The new negative control fixed that evaluator defect; final regrade is 95/100. Earlier outputs remain available, unmodified. Tests were rerun only after source/test changes or unresolved failures.

No existing-course regression was observed locally. No external provider run, deployment or production modification occurred.
''')
write('phase7_remaining_issues.md','''# Phase 7 remaining issues

All five known genuine Phase 6 root causes pass local replay and all final local suites pass. The four pure evaluator false failures are corrected in a new v5 file. Historical v4 scores, raw answers and definitions are unchanged.

1. **Fresh live generalization remains unmeasured.** Phase 6 remains the latest actual fresh corpus at 91/100 with v4. The 95/100 saved-response v5 regrade changes scoring only. Local root-cause replays and generalized tests do not establish a fresh 95% live result. No new external-provider evaluation was run or authorized by this phase.
2. **Bounded language/intent rules.** New forms are covered in all three languages, but arbitrary product declarations, inflections, code switching and indirect requests can still require provider reasoning or clarification. Finite runtime and evaluator rules need independent human review for unfamiliar meaning. Negative controls reduce known collisions; they do not prove unrestricted understanding.
3. **Conservative demonstrations and drafts.** Examples use only supplied names/facts and visible reference appearance; they are not customer experiences, new course facts, full creative marketing judgement or verified claims. Product benefits, prices and materials supplied by users are not independently authenticated. Unknowns are left unset. More complex mixed requests can still need provider completion.
4. **Safety assurance is local.** Common deceptive synthetic-customer, first-person endorsement and earnings-claim forms plus refusal/negation controls pass. This is not evidence that every novel unsafe phrasing or provider output is prevented. Exact original course templates remain preserved; honest user-facing guidance does not label an AI actor a genuine customer.
5. **No provider reliability measurement.** Existing bounded retries, diagnostics and fallback behavior are unchanged and fixture-tested only. No actual latency, uptime, timeout or production concurrency claim is possible from this phase.
6. **Synthetic integration boundaries.** Route tests use local auth/session/provider stubs. Real database persistence, production authorization, production UI behavior and load are not exercised here. Existing AI Influencer/Filmmaking checks pass, but no fresh live evaluations for those courses occurred.
7. **Independent scoring still matters.** Strict full-template and FAQ checks remain required. The five old genuine Phase 6 answers still fail v5. Reused known failure replays verify repairs; they are not held-out evidence. A later authorized live evaluation should freeze v5 and include genuinely new products, languages and conversations before any production-readiness decision.

No unresolved failing local check remains in the final execution. No deployment, commit, push or production-resource change was performed.
''')
write('README.md',f'''# Skillomate Chatbot Phase 7 Fix Review

Course: AI Product Photoshoot & Ads. Local implementation and validation complete on {manifest['createdAt']}. No new external-provider evaluation, deployment, commit, push or production modification.

## Results and counting

- Backend: 239/239 passed; all 191 historical checks plus 48 new.
- Evaluator: 111/111 passed; 77 historical, 18 new, 16 compatibility executions.
- New targeted scenarios: 66/66 passed, included in the suite totals.
- Full prompt-template local replays: 36/36 across 19 headings.
- Five genuine Phase 6 case local replays: 5/5 (six local answer turns).
- Preserved historical Phase 6 fresh score: 91/100 v4. Same old responses with v5: 95/100; five genuine old failures still fail. This is a rubric regrade, never new runtime performance.
- Eight lessons, nineteen complete templates, 53 unique chunks preserved. All {len(before['historical'])} captured historical files and five review ZIPs unchanged.
- Provider requests in Phase 7: 0. Configured fal.run provider was not contacted. Tests use denied networking and synthetic fixtures, with no credentials loaded by test harnesses.

## Included files

- Four requested reports: phase7_implementation_report.md, phase7_targeted_results.json, phase7_regression_results.md, phase7_remaining_issues.md.
- phase7_changes.patch: unified before/current diff for ten source files.
- source/: all ten changed/added source/test/documentation files.
- evidence/: final and earlier execution logs, each command/exit code/test outcome, full local replay answers/expectations, unchanged-corpus v5 regrades, independent nine-failure review, manifests, inventory and reproducible local report/replay builders.
- reference/phase6/: original raw answers, frozen definitions, v4 grades, failure analysis, independent template audit and safety review.
- reference/: original training.txt, unchanged v4 grader and network-denial helper.
- skillomate-phase7-fix-comparison-20261015.pdf: two-page comparison required by project instructions.
- phase7_package_integrity.json: member hashes, source validation, historical preservation and private secret-value scan result.

## Modified source paths

{filelist}

## Environment and limitations

macOS local workspace, Node v26.7.0, Python {platform.python_version()}. Local route tests use synthetic authentication, database/session and provider fixtures. Fresh live performance, production auth/database/UI/load and provider reliability remain unmeasured. Finite semantic heuristics require human review for new wording. Read the remaining-issues report before interpreting local checks as deployment evidence.

No environment files, keys, credentials, personal learner records or unrelated project files are included. All learner/product fixtures are synthetic course-evaluation material. Test credentials in fixture source are nonfunctional literals. Source diff is against the pre-Phase-7 workspace, preserving prior unrelated work. Historical evaluation artifacts are copied for evidence, never overwritten.
''')
print(json.dumps({'sourceFiles':len(changed),'targeted':66,'backend':node['summary'],'evaluator':py['summary'],'historicalFilesUnchanged':len(before['historical']),'reports':str(R)},indent=2))
