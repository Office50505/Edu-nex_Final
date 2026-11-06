from pathlib import Path
import json,hashlib,datetime,difflib,shlex,platform
B=Path.cwd();R=Path(__file__).resolve().parent;P=B/'reports/ai-product-photoshoot-ads-evaluation/phase8_live_20261015_090954'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,x):
 with(R/n).open('x',encoding='utf-8')as f:f.write(x if isinstance(x,str)else json.dumps(x,ensure_ascii=False,indent=2)+'\n')
before=read(R/'before_manifest.json');node=read(R/'final_backend_legacy_verified/node_verified_execution.json');py=read(R/'final_evaluator_validation/python_verified_execution.json');audit=read(R/'verified_replays/independent_local_template_audit.json');oldAudit=read(R/'independent_historical_template_audit.json');old=read(P/'v5_integrated_grades.json');new=read(R/'phase8_saved_response_regrade_v6_final.json');priorReview=read(P/'independent_failure_review.json');routing=read(R/'verified_replays/offline_reviewed_case_routing.json')
assert node['summary']['passed']==296 and py['summary']['passed']==147 and audit['passed']==35 and not audit['failed']and oldAudit['failed']==3
assert all(sha(B/n)==h for n,h in before['historical'].items());assert all(sha(Path(n))==h for n,h in before['historicalZipHashes'].items())
assert sha(B/'knowledge/ai-product-photoshoot-ads/training.txt')==before['sources']['knowledge/ai-product-photoshoot-ads/training.txt'];assert sha(B/'scripts/eval/grade_product_photoshoot_ads_results_v5.py')==before['sources']['scripts/eval/grade_product_photoshoot_ads_results_v5.py']
changes=[];patch=[]
for n,h in before['sources'].items():
 if sha(B/n)==h:continue
 changes.append({'path':n,'changeType':'modified','beforeSha256':h,'afterSha256':sha(B/n)});patch.extend(difflib.unified_diff((R/'before'/n).read_text().splitlines(True),(B/n).read_text().splitlines(True),fromfile='a/'+n,tofile='b/'+n))
for n in ['services/productTutorIntent.js','scripts/eval/grade_product_photoshoot_ads_results_v6.py','scripts/eval/audit_product_templates.py','tests/product-tutor-phase9.test.cjs','tests/test_product_evaluator_v6.py']:
 changes.append({'path':n,'changeType':'added','beforeSha256':None,'afterSha256':sha(B/n)});patch.extend(difflib.unified_diff([],(B/n).read_text().splitlines(True),fromfile='/dev/null',tofile='b/'+n))
save('phase9_changes.patch',''.join(patch))
nb=[x for x in node['cases']if x['name'].startswith('phase9 ')];np=[x for x in py['cases']if x['class'].startswith('test_product_evaluator_v6.Phase9EvaluatorTests.')];compat=[x for x in py['cases']if x['class'].startswith('test_product_evaluator_v6.V6CompatibilityTests.')]
assert len(nb)==57 and len(np)==18 and len(compat)==18
oldby={x['id']:x for x in old['results']};transitions=[{'id':x['id'],'v5':oldby[x['id']]['status'],'v6':x['status'],'failedDimensions':[{k:d['reasons']for k,d in t['dimensions'].items()if d['status']=='failed'}for t in x['turns']]}for x in new['results']if x['status']!=oldby[x['id']]['status']]
assert len(transitions)==6
inventory=read(R/'verified_replays/knowledge_inventory.json');assert len(inventory['lessons'])==8 and len(inventory['templates'])==19 and inventory['uniqueChunkIds']==53
manifest={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceChanges':changes,'historicalFilesVerifiedUnchanged':len(before['historical']),'historicalZipsVerifiedUnchanged':len(before['historicalZipHashes']),'rawTrainingTextUnchanged':True,'v5EvaluatorUnchanged':True,'guidanceFactsUnchanged':sha(B/'knowledge/ai-product-photoshoot-ads/guidance.json')==before['sources']['knowledge/ai-product-photoshoot-ads/guidance.json'],'environment':{'os':platform.platform(),'python':platform.python_version(),'node':'v26.7.0','backend':str(B)},'providerRequests':0,'liveEvaluationExecuted':False,'backendEvidence':'final_backend_legacy_verified/node_verified_execution.json','evaluatorEvidence':'final_evaluator_validation/python_verified_execution.json','templateEvidence':'verified_replays/independent_local_template_audit.json','sourceFilesEditedBeforeCorrespondingFinalExecution':True,'existingRegressionAssertionAdaptation':{'file':'tests/ai-chat-history.test.cjs','reason':'The old wrong-language fixture assumed one call and no retained wrong-language text anywhere. New architecture makes one bounded repair call and explicitly retains an untranslated reference on failure. Assertions now require two calls maximum, non-live replacement provenance, correct-language explanation outside the quoted reference, explicit failure notice and repair diagnostics. Original safety/access/other-course assertions remain.'},'sourceScope':['product-course request selection/extraction/guards','shared route/service product-only history and bounded repair integration','optional product session language','new evaluator/auditor and local tests/docs'],'noProductionModification':True,'deployed':False,'committed':False,'pushed':False}
save('phase9_validation_manifest.json',manifest)
critical={'phase8_unseen_001','phase8_unseen_005','phase8_unseen_006'};criticalrows=[r for r in audit['results']if r['id']in critical];assert len(criticalrows)==3 and all(r['passed']for r in criticalrows)
save('phase9_targeted_test_results.json',{'phase':9,'mode':'LOCAL_ONLY_NO_EXTERNAL_PROVIDER','summary':{'total':75,'passed':75,'failed':0,'skipped':0,'inconclusive':0},'counting':'57 new backend checks (45 service + 12 route) and 18 new evaluator/auditor checks, included in the 296/147 suite totals. Eighteen v5 compatibility executions against v6 are separate; replay bodies are not added to unit-test totals.','backendTargeted':nb,'evaluatorTargeted':np,'v6CompatibilityChecks':compat,'backendSuite':node['summary'],'evaluatorSuite':py['summary'],'independentTemplateReplay':{'total':35,'passed':35,'failed':0,'approvedHeadings':19,'historicalSameBodyResult':{'passed':32,'failed':3},'criticalCases':criticalrows},'historicalSameResponseRegrade':{'v5':old['summary'],'v6':new['summary'],'caseTransitions':transitions,'newRuntimePerformance':False},'routingOnlyCases':len(routing['results']),'externalProviderRequests':0,'notNewLiveEvaluation':True})
files='\n'.join('- `'+c['path']+'` ('+c['changeType']+')'for c in changes)
links={n:str((B/n).resolve())for n in ['routes/ai.js','services/aiTutorService.js','services/productTutorKnowledge.js','services/productTutorResponse.js','services/productTutorIntent.js','services/tutorKnowledge.js','models/AiTutorSession.js']}
arch=f'''# Phase 9 root-cause architecture analysis

Course: AI Product Photoshoot & Ads. Evidence: the completed Phase 8 package, all 100 raw responses, frozen definitions, independent 35-body audit and seventeen-case independent failure review. No new provider evaluation was run in Phase 9.

## Finding

Poor unseen-question performance is primarily a control-flow problem, with correlated evaluator blind spots. The required course facts/assets exist. Before Phase 9, loosely matched keywords selected deterministic text before any provider call, and response validation could substitute a different topic after a correct model answer. The route saved message history but loaded only structured fields. Therefore a large local-answer share did not establish correct learner-task understanding.

Phase 8 measured 49/50 reused and 37/50 new questions, 32/35 complete templates, and 106 local / 11 model / 2 replacement turns. Passing 239 backend and 111 evaluator checks did not establish broad generalization. Phase 9 preserves those results.

## Actual pipeline and decision boundaries

```mermaid
flowchart TD
    Q[User question] --> A[Input checks and authenticated course scope]
    A --> E[Current material-access entitlement]
    E --> H[Same user/course/conversation history and supplied facts]
    H --> I[Product task and literal-request recognition]
    I --> K[Scoped source retrieval]
    K --> S[Response selection policy]
    S -->|Literal approved asset| T[Complete deterministic template and known slots]
    S -->|Matched facts or bounded draft| L[Grounded local answer]
    S -->|Ambiguous reasoning or compound task| M[Existing model with scoped sources and history]
    M --> V[Safety, exactness, language and reference validation]
    V -->|Safe language error, no matching local repair| R[One repair within original total budget]
    R --> V2[Revalidate and preserve replacement provenance]
    V --> F[Final answer]
    V2 --> F
    T --> F
    L --> F
    F --> P[Bounded same-conversation session persistence]
```

1. **Question, authentication and course scope:** `routes/ai.js` performs input checks, compatible-auth middleware, rate limiting and course resolution. Plan/account answers retain their existing priority. No auth/entitlement bypass is added.
2. **Context/access:** `buildContext` in `services/aiTutorService.js` resolves published course and selected lesson, checks current access through existing subscription rules, and retrieves scoped references. Product history is restored only after active material access and actual product-course scope are verified. Client history takes priority when supplied. Server history requires the same authenticated user query, course and explicit conversation ID; it is sanitized to 12 turns, 2,000 characters each. It is untrusted conversation context, never verified product or course facts.
3. **Task recognition:** `productTutorKnowledge.js` extracts explicit user facts and task context. The new `productTutorIntent.js` describes compound, whole-journey, reasoning, location and colour-action signals. Descriptive colour alone no longer selects a recolouring lesson. Exact requests include original/complete/entire wording; a negated saved-prompt mention or prompt-location question is not a literal-body request.
4. **Retrieval:** `tutorKnowledge.js` retains course/access boundaries and six selected records. Exact assets get strong priority; whole-journey/compound questions receive their requested workflow and location sources rather than one narrow FAQ. All eight lessons and nineteen complete bodies remain intact in 53 unique records.
5. **Response selection:** exact assets are deterministic. Safety refusals, explicitly requested supplied facts, clearly matched course facts and bounded conservative drafts remain local. Open reasoning, unfamiliar ambiguity and compound/full-course-journey tasks go to the existing configured model. A local answer needs a matching task/source, rather than only an explicit lesson number or weak top chunk. Debug metadata records the policy reason.
6. **Model generation:** the existing provider adapter and approved endpoint configuration remain. The prompt includes current language, every requested part, retrieved course sources and bounded prior context. No new provider was added and none was contacted in this phase.
7. **Validation:** full literal assets can be repaired directly from authorized source. Matched course repairs can be localized without changing topic. A safe ambiguous answer in the wrong language gets one model-repair request sharing the original 25-second total budget, with maxAttempts=1 for repair. The initial adapter remains maxAttempts=2; total maximum is three transport attempts within the shared budget. Corrected output is revalidated. Failed repair explicitly reports incompletion and retains the safe original as reference; it cannot count as a completed v6 answer. A safety violation still gets immediate safe replacement, never translation of an unsafe endorsement.
8. **Final output/state:** local, model, validation replacement and fallback provenance remain distinct. A repaired model answer is not labeled unchanged live output. Optional product-context language and existing message storage preserve facts, lesson, intent and reasoning decisions. Legacy sessions without the new language field can restore history. No infrastructure/schema migration is run.

## Root causes, evidence and correction

| Root cause | Phase 8 evidence | Architectural correction | Deterministic or model? |
|---|---|---|---|
| Request preposition consumes the later product phrase | unseen_001 and unseen_006 leave supplied names unresolved; v5 repeats the parsing mistake | Overlapping bounded candidate extraction, rejection of request prose, complete-body rendering and independent predeclared-slot audit | Deterministic literal renderer; independent audit |
| Literal request missed despite retrieved asset | unseen_005 returns model-shot summary instead of Character Sheet | Recognize complete original requests and prioritize the entire authorized asset; no unrelated workflow substitute | Deterministic |
| Generic keyword overwhelms requested task | Hindi descriptive colour selects variants in unseen_023 | Require colour-changing intent; route unfamiliar reasoning to the model with source context | Task cues plus model reasoning |
| Recall shortcut misreads informational question | unseen_020 echoes name instead of facts needed for ads | Recall requires actual past-facts language; generic-ad question retrieves ad-plan guidance | Deterministic known facts; model when ambiguous |
| Exact flag chooses any FAQ | unseen_048 ignores L06 configuration for morphing repair | Exactness binds to requested task; FAQ preference requires a matched troubleshooting topic | Deterministic settings/source matching |
| Narrow FAQ drops another requested part | unseen_038 and unseen_050 omit full journey/workflow | Compound/full-journey selection and retrieval coverage; model receives both parts | Model synthesis from sources |
| Omitted client history loses a selected choice | unseen_049 asks clarification after a correct first answer | Restore bounded messages after current scope/access checks; selected choice is conversation, not a newly invented product fact | Deterministic state, model explanation |
| Language replacement discards correct repair | unseen_018 upstream gives L04 repair; replacement becomes L02 | Fix task recognition; preserve relevant repair locally or use one bounded contextual language repair | Local for known literal repair; model for prose |
| Overbroad negation detection discards safe comparison | unseen_024 is replaced with generic refusal; unseen_040 falsely unsafe | Clause-scoped Hindi/Roman prohibitions, with affirmative-claim negative controls | Deterministic safety checks, model comparison |
| Finite scorer misses genuine content | regenerate false failures; known-slot false passes; incomplete comparison passes | Separate v6, negative controls and independent full-source auditor | Offline deterministic checks plus review |

## Why this is not a model-only router

Literal fidelity, access control, product-slot substitution, recorded settings, source identity, provenance, scope and retry budgets are software invariants. A model should not rewrite approved template bodies or decide entitlement. Short unambiguous recorded workflows can be returned locally. A supplied name also suffices for conservative original hooks/captions without invented claims.

The existing model is better suited to explaining trade-offs, interpreting unfamiliar prose, comparing ideas, answering multiple grounded requests, and restating a prior reasoning decision. The policy delegates these tasks without adding examples from the evaluation corpus to runtime knowledge. Handlers and graders never branch on evaluation IDs or read reports. The boundary is still finite and requires future live evidence; it does not prove every unfamiliar intent is understood.

## Independent evaluator review

V5 stays byte-for-byte unchanged. V6 changes implementation of the existing requirements, not the targets or historical acceptance thresholds. Three false failures are corrected (two regenerate equivalents and a Hindi prohibition). Three false passes are exposed (two unresolved known-product templates and a missing requested distinction). The mixed not-claim wording improves, but its missing lesson reference still fails. Both old and corrected historical totals happen to be 86/100; different case outcomes and dimensions are retained in the new output. This is not new chatbot performance.

The independent auditor imports neither runtime nor grader entity parsing. It validates frozen reviewer-declared slots against the original source, then checks the whole executable body. It rejects altered expected source, wrong/unresolved known slots, truncation, appended instructions and extra executable blocks. On old answers it reproduces 32/35; on new local literal handlers it gets 35/35. Unknown actor/clothing fields legitimately remain unknown.

## Constraints and practical limits

No provider call, deployment, commit, push or production-resource change occurred. Model-selected requests were not generated live. Route tests use synthetic auth/session/provider dependencies. No new live accuracy is claimed. More model-eligible work and occasional repair may increase latency/cost; generation and repair share one bounded budget. Safety and intent checks remain finite; see remaining issues before deployment decisions.
'''
save('phase9_architecture_analysis.md',arch)
transitiontable='\n'.join('| '+t['id']+' | '+t['v5']+' | '+t['v6']+' |'for t in transitions)
save('phase9_implementation_report.md',f'''# Phase 9 implementation report

Implementation and local validation completed {manifest['createdAt']}. No new live evaluation or provider request.

## Actual verification

| Check | Result |
|---|---:|
| Backend AI tutor regressions | 296/296 passed; 0 failures/skips |
| Evaluator regressions | 147/147 passed; 0 failures/skips |
| New targeted checks | 75/75 (57 backend + 18 evaluator/auditor) |
| Additional v5 compatibility executions against v6 | 18/18, included in evaluator total |
| Independent full-template local replay | 35/35, all 19 headings |
| Three Phase 8 critical templates | 3/3 corrected locally |
| Independent audit of unchanged Phase 8 template text | 32/35; same three historical failures |
| Historical Phase 8 text regraded with v6 | 86 passed / 14 failed; not new runtime quality |
| External provider requests | 0 |

## Implemented changes

- Explicit source-aware response selection keeps literal templates, access/safety boundaries, recorded facts and simple conservative drafts local. Open reasoning and compound/full-journey questions go to the existing model with the relevant source set.
- Complete/original request recognition and overlapping product candidates correct all three critical literal failures. Known names are substituted in every product slot; actor/clothing unknowns remain placeholders. Unknown asset headings prompt clarification rather than an unrelated summary.
- Phone enters-shot and Hinglish visibility paraphrases return the exact recorded FAQ. Colour-changing intent is separated from descriptive colour. Exact settings no longer choose arbitrary troubleshooting FAQ. Recall shortcuts require past-fact intent. No new course facts were added.
- Same-user/course/conversation message restoration occurs only after current entitlement and product scope are validated. It supports legacy sessions, omits expired/foreign history, and retains reasoning context when client history is absent. Known user facts remain separate from untrusted assistant context. Optional stored language supports minimal continuations; fresh explicit language wins.
- Validation retains safe relevant content, recognizes scoped prohibitions, preserves a supported lesson on referring alternatives, and uses one bounded language repair when local source text cannot express the task. Failure is explicit and retains the original as reference; v6 cannot score it as complete. Repaired/replaced answers remain non-live provenance.
- New v6 fixes documented scoring implementation errors while preserving v5 and historical criteria. The independent auditor validates complete original source bodies and predeclared slots without reusing runtime parsing.

## Modified and added source files

{files}

`phase9_changes.patch` is against captured pre-Phase-9 workspace snapshots, not repository HEAD. It excludes unrelated existing work. All before/after hashes are in phase9_validation_manifest.json. The source package includes changed files and necessary references. The only existing regression assertion adapted is the ambiguous wrong-language fixture: it now checks one bounded repair and truthful incomplete-reference behavior instead of assuming one transport call and discarding all original text. No safety/access/other-course requirement was removed.

## Critical repair evidence

- phase8_unseen_001: full Product Sheet body now contains the supplied obsidian ring dish in every product slot.
- phase8_unseen_005: complete Character Sheet body is returned with the man slot; no short workflow substitute.
- phase8_unseen_006: complete Hands close-up body contains the supplied quilted binocular wrap; legitimately missing actor/clothing details stay unset.

These IDs occur only in evidence/report replay selection, never runtime branches. The 35 independent literal comparisons preserve the pre-Phase-8 expectations and original training source. Generalized tests use different products and phrasings.

## Historical scoring investigation

| Case | Frozen v5 | New v6 on same old text |
|---|---|---|
{transitiontable}

Three cases improve because they were false failures; three drop because they were false passes. Both totals are 86/100. Missing lesson requirements and all complete-template/FAQ constraints remain valid. No score inflation or historical output rewrite occurred. The initial v6 draft incorrectly treated entire in a negated saved-prompt request as literal intent; an independent corpus review and new negative control fixed it. That early 85/100 draft output is retained as development evidence.

## Preserved scope

All eight lessons, nineteen template bodies, raw training text and guidance facts remain unchanged in 53 unique records. V5 is unchanged. All {len(before['historical'])} captured historical artifacts and {len(before['historicalZipHashes'])} prior review ZIPs retain their hashes. AI Influencer and AI Filmmaking regression coverage passes. No production infrastructure, endpoint, secret, business pricing or entitlement rule was changed.

## Remaining boundary

Seventeen previously reviewed cases have local routing diagnostics. Model-required turns are explicitly not executed, so these dispositions are not scored as repaired live answers. Fresh generation quality, model repair success under real latency, production auth/database/load and broader unseen generalization remain unmeasured. See phase9_remaining_issues.md.
''')
commands=[('Backend',node),('Evaluator',py)]
reg=['# Phase 9 executed local regressions','','All provider interactions are local fixtures; Node real networking is denied by the existing preload. Python graders/auditor are offline.','', '| Suite | Total | Passed | Failed | Skipped | Exit |','|---|---:|---:|---:|---:|---:|']
for label,x in commands:
 v=x['summary'];reg +=[f"| {label} | {v['total']} | {v['passed']} | {v['failed']} | {v['skipped']} | {x['exitCode']} |",'',f"{x['startedAt']} to {x['completedAt']}; {x['durationSeconds']:.3f} seconds.",'','```sh',('NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs 'if label=='Backend'else'')+shlex.join(x['command']),'```','']
reg +=['The 57 new backend cases comprise 45 service contracts and 12 route contracts. The 147 evaluator executions comprise 111 existing checks, 18 new Phase 9 checks and 18 unchanged v5 checks run against v6. New unique targeted cases: 75/75, included in the suite totals. No sum combines unit tests with replay bodies.','',
'## Offline replay/audit commands','', '```sh',f'node {R}/offline_phase8_replays.cjs {R}/verified_replays',f'python3 -B scripts/eval/audit_product_templates.py --expectations {P}/independent_template_expectations_frozen.json --results {R}/verified_replays/offline_template_responses.json --knowledge knowledge/ai-product-photoshoot-ads/training.txt --out {R}/verified_replays/independent_local_template_audit.json',f'python3 -B scripts/eval/audit_product_templates.py --expectations {P}/independent_template_expectations_frozen.json --results {P}/application_raw_results.json --knowledge knowledge/ai-product-photoshoot-ads/training.txt --out {R}/independent_historical_template_audit.json',f'python3 -B scripts/eval/grade_product_photoshoot_ads_results_v6.py --tests {P}/all_test_cases_frozen.json --results {P}/application_raw_results.json --scope end_to_end --out {R}/phase8_saved_response_regrade_v6_final.json','```','',
'Actual outcomes: local full bodies 35 passed / 0 failed; historical full bodies 32 passed / 3 failed; historical v6 regrade 86 passed / 14 failed / 0 skipped/inconclusive. Seventeen-case routing diagnostics include model_required_not_executed; no actual future model answer is invented.','',
'## Coverage and retained development evidence','',
'Existing suites cover AI Influencer/Filmmaking, access, course/session isolation, mobile/cache/history, provider timeout/connection/fallback, multilingual, safety and exact prompts. Added checks cover nested product phrases, complete Character Sheet requests, full-body mutation, source/known-slot independent audits, compound/model routing, complete workflow references, malformed-asset clarification, saved reasoning messages, access expiry, cross-user/conversation/course boundaries, legacy sessions, current language and context-aware replacement.','',
'Earlier local executions remain in their own directories: attempt1 237/239 backend and 111/111 evaluator; attempt2 280/285 backend and 142/143 evaluator; attempt3 285/285 and 144/144; attempt4 288/290 and 145/145. Subsequent passing stages add security, intent and completion controls. final_backend_validation had one failure from adding a lesson label to a fresh comparison merely because a language phrase appeared; it was corrected to require actual inherited lesson context. Final backend 296/296 and final evaluator 147/147 evidence supersede these earlier executions. No existing report was overwritten.','',
'The early failures exposed actual policy/negation/priority gaps and two new test-definition mistakes (a no-op mutation and an obsolete transport-count assumption). Numeric, full-template, access and safety requirements remain. Final suite components were rerun after their corresponding source changes; backend was not rerun after evaluator-only edits or vice versa. All final outcomes use current source hashes.','',
'No fresh provider evaluation, deployment, commit, push, production data mutation or unrelated business-logic edit occurred. Passing local fixtures does not establish new live accuracy.','']
save('phase9_regression_results.md','\n'.join(reg))
save('phase9_remaining_issues.md','''# Phase 9 remaining issues and limits

All final local tests pass, and all three known critical template defects pass independently frozen complete-body replay. No new external-provider evaluation occurred.

1. Fresh model quality is unknown. The new policy intentionally delegates ambiguous reasoning, compound tasks and complete-journey synthesis. This corrects the previous forced-FAQ route, but it does not prove the existing model will complete every part correctly. Seventeen known-case diagnostics record model-required turns as not executed, not passed.
2. Language repair is bounded and can still fail. A safe wrong-language answer may trigger one additional model generation within the original 25-second total budget (maximum three transport attempts including initial retries). This can increase token use/latency. If it fails, the app explicitly states incompletion and retains the original as reference. V6 counts that as incomplete, not a successful final answer.
3. Intent and entity parsing remain finite. The root fixes handle overlapping prepositions, complete/original requests, varied products, descriptive colour, phone framing, current language and compound/context requests. Unfamiliar declarations or genuinely ambiguous template headings can still require clarification. Generalization has not been established through a new held-out live corpus.
4. Independent expectations require independent preparation. The full-body auditor needs reviewer-declared known slots and approved headings frozen before response generation. It imports no runtime/grader parser and rejects altered expectations, but it cannot discover every hidden product fact automatically. Never substitute shared parser output for independent expected values.
5. The evaluator remains a bounded rubric. V6 corrects documented false passes/failures and strengthens completion checks without lowering requirements. Historical Phase 8 text still scores 86/100, with six changed outcomes. This is historical regrading, not post-fix performance. Semantic false positives/negatives can still require review.
6. Safety remains limited by finite clause checks. Local negative controls protect against affirmative synthetic-customer claims and unrelated disclaimers; safe Hindi/Hinglish prohibitions retain their meaning. User-provided product claims are not independently authenticated. Source templates are not evidence of a product benefit or genuine customer experience.
7. Conversation scope is bounded. History restoration requires current product-course material access and the same authenticated user, course and explicit conversation ID; only twelve sanitized message turns are sent. It does not promise recall beyond that window. Structured product facts persist separately. Existing other-course behavior is preserved by product-only restoration gates.
8. Production behavior was not tested. Auth, entitlement/database/session and provider dependencies in route tests are synthetic fixtures. No production infrastructure, AWS resource, migration, deployment, commit or push was used. Optional product language needs no migration; legacy sessions are covered locally. Real persistence, load, sustained provider availability and live AI Influencer/Filmmaking responses remain unmeasured.

No failing local check remains in the final executions. The next evidence step, requiring separate authorization, is a frozen new live evaluation with unfamiliar products and multi-part reasoning. No production-readiness declaration is made here.
''')
save('README.md',f'''# Skillomate Chatbot Phase 9 Architecture Review

Local architecture remediation complete. No live evaluation or external-provider request, deployment, commit, push or production-resource modification.

## Results

- Backend 296/296; evaluator 147/147; 0 failed/skipped.
- New unique targeted checks 75/75 (57 backend + 18 evaluator), included in suite totals.
- Eighteen v5 compatibility checks against v6 are additional executions inside the evaluator total.
- Independent complete-template local replay 35/35, including all three Phase 8 critical cases; all 19 headings preserved.
- Unchanged old Phase 8 body audit remains 32/35.
- Same historical Phase 8 text with v6 remains 86/100, with three corrected false failures and three exposed false passes. This is not fresh live performance.
- All 8 lessons, 19 exact bodies and 53 unique chunks preserved. V5, raw course text and guidance facts are unchanged.

## Contents

Five requested phase9 reports; phase9_changes.patch; relevant current source/test/docs; source before snapshots and hashes; actual final and earlier test logs with commands/exit codes; independent historical/local full-body audits and raw local replies; routing-only diagnostics; historical v6 regrades and case transitions; original Phase 8 raw responses/definitions/independent expectations and review; comparison PDF required by project instructions; package integrity metadata.

## Source changes

{files}

## Environment and limits

macOS, Node v26.7.0, Python {platform.python_version()}. Networking denied for local Node tests/replays. All model interactions in route tests are explicit synthetic fixtures. Current entitlement and course/conversation boundaries gate server history restoration; no production database is accessed. Model-delegation diagnostics are not scored live answers. New live accuracy, production performance and model repair reliability remain unmeasured.

No environment files, API keys, credentials, authorization headers, personal learner records or unrelated project files are included. The package privately scans configured secret values before creation. Nonfunctional test literals and synthetic course questions are evidence, not credentials or personal learner data. Historical artifacts and all prior review ZIPs are preserved.
''')
print(json.dumps({'reports':str(R),'sourceFiles':len(changes),'backend':296,'evaluator':147,'newTargeted':75,'templateReplay':'35/35','historicalArtifactsPreserved':len(before['historical'])},indent=2))
