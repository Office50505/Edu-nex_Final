from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,re,collections,difflib,csv,io,shutil,subprocess,zipfile
E=Path(__file__).resolve().parent;R=E.parent;B=R.parent;backend=B/'edunex-b'
load=lambda n:json.loads((E/n).read_text());dump=lambda n,d:(E/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
sha=lambda b:hashlib.sha256(b).hexdigest()
def counts(name):
 s=(E/name).read_text();return {k:int(v) for k,v in re.findall(r'ℹ (tests|pass|fail|skipped|cancelled) (\d+)',s)}
def failures(name):
 s=(E/name).read_text();return sorted({re.sub(r' \([\d.]+ms\)$','',l[2:]) for l in s.splitlines() if l.startswith('✖ ') and l!='✖ failing tests:'})
baseline=load('baseline.json');frozen=load('corrected_candidate_freeze.json');changed=[];patch=[]
for group,rows in frozen['groups'].items():
 for rel,after in rows.items():
  before=baseline['groups'].get(group,{}).get(rel)
  assert sha((B/rel).read_bytes())==after
  if before==after:continue
  old=(E/'before'/rel).read_text() if before else ''
  new=(B/rel).read_text();delta=list(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+rel if before else '/dev/null',tofile='b/'+rel));patch.extend(delta)
  dest=E/'after'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(B/rel,dest)
  changed.append({'path':rel,'beforeSHA256':before,'afterSHA256':after,'linesAdded':sum(l.startswith('+') and not l.startswith('+++') for l in delta),'linesRemoved':sum(l.startswith('-') and not l.startswith('---') for l in delta),'functions': [{'name':m[1],'line':new[:m.start()].count('\n')+1} for m in re.finditer(r'(?:async )?function (\w+)\(',new)]})
(E/'phase_changes.patch').write_text(''.join(patch));dump('changed_file_manifest.json',changed)
pre=counts('backend_before.log');post=counts('backend_final_all.log');negative=counts('all_new_controls_baseline_complete.log')
oldfails=failures('backend_before.log');newfails=failures('backend_final_all.log');assert len(oldfails)==24 and oldfails==newfails
summary={'baselineBackend':pre,'finalBackend':post,'preexistingBackendFailures':oldfails,'newBackendFailures':[],'resolvedBaselineBackendFailures':[],'newTests':post['tests']-pre['tests'],'newTestsBaseline':negative,'newTestsFinal':{'tests':post['tests']-pre['tests'],'pass':post['pass']-pre['pass'],'fail':0},'pythonEvaluators':{'tests':167,'pass':167,'fail':0},'sourceFilesChanged':sum('/services/' in r['path'] or '/routes/' in r['path'] for r in changed),'testFilesAdded':sum(r['beforeSHA256'] is None for r in changed),'externalRequests':0,'deployed':False}
assert post['fail']==24 and summary['newTests']==123
before=load('diagnostics_before.json');after=load('diagnostics_after.json');bef={r['id']:r for r in before['cases']};assert len(after['cases'])==len(bef)==59
rows=[];exact=0;state_differences=[]
for c in after['cases']:
 turns=[];had_blocked=False
 for i,t in enumerate(c['traces']):
  exp=c['expected'][i];old=bef[c['id']]['traces'][i];answer=t['response'].get('answer','');prior=old['response'].get('answer','')
  blocked=t['response'].get('outcome',{}).get('type')=='provider_fallback';had_blocked|=blocked
  context=(t['contextObservations'] or [{}])[0].get('result',{});facts=context.get('productContext',{});checks={}
  if exp.get('expectedBody') is not None:
   b=re.search(r'```text\n([\s\S]*?)\n```',answer);checks['completeExactBodyMatches']=bool(b and b[1]==exp['expectedBody']);exact+=int(checks['completeExactBodyMatches'])
  if exp.get('facts',{}).get('product'):
   want=exp['facts']['product'];got=facts.get('product');checks['expectedIdentity']=want;checks['actualIdentity']=got;checks['literalIdentityEqual']=want==got
   if want!=got:state_differences.append({'id':c['id'],'turn':i+1,'expected':want,'actual':got,'interpretation':'Observation only: expected object shorthand vs full supplied description or absent separately declared identity requires adjudication; do not infer a new defect solely from literal inequality.'})
  if exp.get('mustNotReuse'):checks['obsoleteStringsAbsentFromFinalAnswer']=all(x not in answer for x in exp['mustNotReuse'])
  turns.append({'turn':i+1,'request':t['request']['message'],'expected':exp,'beforeAnswer':prior,'afterAnswer':answer,'answerChanged':prior!=answer,'beforeOutcome':old['response'].get('outcome'),'afterOutcome':t['response'].get('outcome'),'currentState':facts,'deterministicChecks':checks,'blockedAdapterAttempts':len(t['providerRequests']),'actualExternalRequests':0,'scopeAlerts':t['scopeInspection']['potentialCriticalFindings']})
 status='EXACT_BODY_PASS' if c['category']=='exact_template' and all(t['deterministicChecks'].get('completeExactBodyMatches') for t in turns) else 'PROVIDER_DEPENDENT_UNTESTED' if had_blocked else 'LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED'
 rows.append({'id':c['id'],'category':c['category'],'diagnosticStatus':status,'turns':turns})
assert exact==19
summary['knownDiagnosticCases']=59;summary['knownDiagnosticTurns']=72;summary['diagnosticStatuses']=dict(collections.Counter(r['diagnosticStatus'] for r in rows));summary['knownExactFullBodyMatches']=19
summary['beforeExecution']=load('diagnostics_before_execution.json');summary['afterExecution']=load('diagnostics_after_execution.json')
phase12=load('phase12/final/phase12_passing_replay.json');summary['phase12RecordedComparison']=phase12['summary'];assert phase12['summary']['byteIdenticalCases']==40 and phase12['summary']['unexpectedTransportRequests']==0
critical=load('reproduction_results.json');critical_turns=[t for c in critical['results'] for t in c['turns']];assert len(critical_turns)==5 and all(t['fullExpectedBodyMatches'] for t in critical_turns)
summary['criticalOriginalCases']={'cases':4,'turns':5,'completeBodyMatches':5,'externalRequests':critical['deniedExternalRequests']};assert critical['deniedExternalRequests']==0
summary['generatedAt']=datetime.now(timezone.utc).isoformat();dump('verification_summary.json',summary);dump('known_59_diagnostic_comparison.json',rows);dump('state_identity_observations.json',state_differences)
iterations=[]
for p in sorted(E.glob('*.log')):
 c=counts(p.name)
 if c:iterations.append({'log':p.name,'counts':c,'failures':failures(p.name)})
dump('validation_iterations.json',iterations)
# Preserve the historical grading protocol as a copy, not a changed evaluator.
shutil.copy2(B/'Skillomate_Chatbot_Reliability_Root_Cause_Review/evidence/original_scoring_rubric.json',E/'unchanged_original_scoring_rubric.json')

(R/'01_Executive_Summary.md').write_text(f'''# Deterministic reliability correction review

Implemented local corrections in eight application files and added one regression file. Course assets, authentication/entitlement/isolation implementations, database schema, existing evaluator and historical grades/rubric remain unchanged. No provider request was transmitted; no production interaction, deploy, commit or push occurred. Archive cleanup remains unapproved and no ZIP was deleted.

Verification: **{post['pass']} backend passes, the same 24 baseline failures, zero newly failing or skipped tests** across {post['tests']} tests. The 123 new tests pass; against saved baseline source they produced 110 failures and 13 passes. All167 Python evaluator tests pass. All19 assets have raw-copy, product-fill and complete allowlisted-slot coverage (57 full-body controls). All19 exposed failed exact-template cases now match their complete frozen expected bodies. Four original critical scenarios match all five expected bodies. All40 previously passing Phase12 cases (48 turns) remain byte-identical using explicitly labeled recorded upstream replies.

The 59 confirmed mismatch scenarios were replayed before and after through actual local Express/JWT/request/service/retrieval/response code, using synthetic users and memory-only models. They are known diagnostic regressions, not a new blind set. Complete traces and ownership/payload inspections cover all72 turns per stage. Final diagnostic disposition: {summary['diagnosticStatuses']}. These are evidence-availability categories, not a new accuracy score. Local-response observations have not been independently regraded for every semantic expectation.

Corrected raw/fill selection, all approved slots, natural copy grammar, account collisions after authoritative course resolution, typed request planning, Unicode-preserving declarations, atomic replacement/rename/reset/correction, stale-bound-fact clearing, explicit languages/counts and local completeness checks. Genuine synthesis goes to the normal provider branch, which is denied before transport during this task. Negative constraints cannot be promoted into affirmative grounding evidence.

**Stop for review.** This package does not establish production readiness or measured live-generation quality. Existing24 failures and unavailable real inference remain release blockers. Review known limitations and rollback instructions before approving further work.
''')

mapping=[
 ('Approved copy/fill','productTutorKnowledge.js: wantsProductPrompt, explicitTemplateSlots, productSlots, renderProductTemplate; productTutorIntent.js: productCopyIntent; productTutorResponse.js: resolveProductTutorReply','Raw mode ignores stored facts. Fill mode permits approved labels and supplied values only, including explicit slot-only limits. Unknown slots remain literal. No source-body edits.'),
 ('Task selection','productTutorIntent.js: productRequestPlan, productIntentSignals, productCourseDomain; routes/ai.js: chooseDirectReply','Transient mode/operations/output counts/languages/parts accompany synthesis context. Account collision disambiguation runs only after server-resolved product-course context. Other-course selector never authorizes product assets.'),
 ('State and extraction','productTutorState.js: entity, declaration, extractEntity, productOperations; productTutorKnowledge.js: productFacts','One safe identity grammar across state/rendering. Atomic replace/reset discards prior bound facts; rename retains same-item facts; quantity/material corrections replace obsolete values. Facts preceding a same-turn replacement are excluded. Original Unicode is retained; NFKC remains validation-only.'),
 ('Multilingual completeness','productTutorIntent.js: productResponseLanguage, explicitProductLanguage, requestedOutputCount; productTutorTasks.js: draftProductAd; productTutorResponse.js: productTutorReply','Explicit explanation language wins over name script; output/dialogue languages can differ. Counts over local capacity delegate instead of silently truncating. Shared local contract checks requested artifacts and language. Accurate short explanations remain local.'),
 ('Grounding and refusal','productTutorGrounding.js: unsupportedAdClaims; productTutorResponse.js: productSafetyRequest, productAccessReply','Keep all existing Unicode/name rejection rules and mandatory refusals. Negative attributes are excluded from positive claim evidence and marketing fact lines. Honest alternative cards remain labeled AI showcases. Inactive learners get legitimate restoration steps without protected bodies.'),
 ('Compatibility','aiTutorService.js: skillomatePlanDirectReply, skillomatePlatformDirectReply, learnerContextDirectReply; routes/ai.js','Product-scoped optional locale arguments preserve existing two-argument callers. Existing API response keys, authentication and data schema remain. Extra explicit template values use the existing bounded attributes array for persistence; no migration.')]
text='# Root cause to implementation mapping\n\n'
for title,functions,behavior in mapping:text+=f'## {title}\n\n{functions}.\n\n{behavior}\n\n'
text+='Exact baseline-relative diffs and function/line indexes are in `evidence/phase_changes.patch` and `changed_file_manifest.json`. The diff is against the saved working tree, not HEAD; pre-existing user changes are included in neither the task patch nor rollback. `tutorKnowledge.js` needed no change: the failed requested assets were already retrieved and its owner checks remain byte-identical.\n'
(R/'02_Changes_And_Root_Cause_Mapping.md').write_text(text)

text='# Test results and baseline failures\n\n| Run | Pass | Fail | Skip | Interpretation |\n|---|---:|---:|---:|---|\n'
text+=f"| Frozen full backend | {pre['pass']} | 24 | 0 | Before local source edits |\n| Final full backend | {post['pass']} | 24 | 0 | Same24 names; zero new failures |\n| New controls against baseline | 13 | 110 | 0 | Independent failures before correction |\n| New controls final | 123 | 0 | 0 | Included in full backend |\n| Python evaluator | 167 | 0 | 0 | Existing unittest suites; v7 unchanged |\n| Asset raw/product-fill/all-field checks | 57 | 0 | 0 | All19 full bodies in three modes |\n| Original critical scenarios | 4 cases /5 bodies | 0 | 0 | Actual synthetic HTTP pipeline |\n| Phase12 recorded comparison | 40 cases /48 turns | 0 changed | 0 | 11 recorded transport fixtures; zero external inference |\n\n"
text+='Commands: `NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/*.test.cjs`; `python3 -B -m unittest discover -s tests -p \'test_*.py\' -v`. Existing explicit isolation and Unicode suites ran inside the full backend run. The local HTTP replays additionally used a loopback-only guard, because a blanket no-network guard also prevents local HTTP. Temporary loopback bind permission was needed; production DBs were replaced with synthetic in-memory records.\n\nThe baseline module preload reads captured pre-edit source in memory; it does not reset or overwrite the working tree. New tests were first run before edits, then the complete expanded test file was also executed against that captured baseline. One newly authored assertion was corrected during development: a new product may retain its newly supplied descriptor; the assertion must reject the obsolete material rather than demand an entirely empty attributes list. No existing test, historical expected answer, grade or scoring threshold was changed.\n\n'
text+='## Existing24 full-backend failures\n\nThese exact names occur in both baseline and final runs. They concern mobile/static behavior, billing/config mocks, PDF extraction and thumbnail behavior. The source changes do not fix or hide them. The full suite exits1 because they remain. No claim is made that every baseline failure represents a production defect.\n\n'
text+='\n'.join(f'{i}. {name}' for i,name in enumerate(oldfails,1))+'\n\n'
text+='Intermediate failures and outcomes are retained in `validation_iterations.json` and all patch/backend logs. New regressions involving extraction boundaries, continuation clarification, negation, local completeness, dialogue language, brief as an adjective, source-slot limits and nested-scope provider inspection were corrected and retested. Initial diagnostic harness setup failed for a relative path and sandbox loopback binding; a later Phase12 command had an argument error and stopped before execution. These are harness setup failures, not candidate grades. Final successful traces supersede their verification conclusions, while raw failures remain recorded. The original rubric/evaluator was not tuned.\n'
(R/'03_Test_Results_And_Preexisting_Failures.md').write_text(text)

text='# Known59 diagnostics, before and after\n\nThese are exposed diagnostic scenarios. Original blind scores stay18 PASS/67 FAIL/35 UNTESTED; the seven ambiguous cases and one policy-conflict case were not silently regraded or used as patch-specific answers. No new blind accuracy is calculated.\n\nAll before/after requests, full answers, expected criteria, current facts, retrieval ownership, payloads, adapter attempts, status, latency and persisted sessions are retained in the corresponding JSON files. Before source is loaded in memory from captured snapshots. The synthetic memory-query facade still does not validate all production MongoDB query/index/concurrency semantics.\n\n| Case | Category | After diagnostic disposition |\n|---|---|---|\n'
text+='\n'.join(f"| {r['id']} | {r['category']} | {r['diagnosticStatus']} |" for r in rows)
text+='\n\n`EXACT_BODY_PASS` requires complete equality to the pre-existing expected body. `PROVIDER_DEPENDENT_UNTESTED` means at least one necessary turn used the denied provider path, even if another turn now produces a correct local result. `LOCAL_RESPONSE_OBSERVED_NOT_REBLIND_SCORED` retains actual local artifacts and causal checks without pretending to an independent semantic accuracy score. Structural identity observations compare exact strings; object shorthand versus a fuller supplied description is not automatically a defect.\n\nSee `known_59_diagnostic_comparison.json` for every request/response and deterministic check, and `state_identity_observations.json` for remaining representation differences. Literal template success does not certify model grounding, subjective style or every constraint of an open-ended answer.\n'
(R/'04_Known_59_Before_After_Diagnostics.md').write_text(text)

s=summary['afterExecution'];b=summary['beforeExecution'];text=f'''# Safety, ownership and provider accounting

Authentication middleware, entitlement services, course-owner retrieval assertions, protected-text checks, strict session schema and existing Unicode tests remain unchanged. The common identity validator retains the original original-name/security-normalized-view split, unsafe instruction patterns, compatibility-character rejection, bidi/default-ignorable checks, mixed Latin/Greek/Cyrillic-word rejection and role/name exclusions. Mandatory input refusals remain before all course handling. No provider decides access rights.

The task adds no unrestricted asset lookup. Course/topic recognition can identify a heading, but source copying still requires `materialsAvailable` and a matching asset inside authorized retrieved records. Every accepted assembled provider payload still passes the existing owner/text checks. The transient request plan contains user operations and task metadata, not a bypass capability.

Known diagnostics before: {b['providerAdapterAttempts']} blocked attempts on {b['providerDependentTurns']} provider-dependent turns. After: {s['providerAdapterAttempts']} blocked attempts on {s['providerDependentTurns']} provider-dependent turns. The unchanged adapter retries deliberate policy denial twice; those attempts are not transmitted HTTP requests or live model answers. Both stages inspect all72 turns and report zero scope alerts. Final traces contain every attempted payload and denial.

The Phase12 comparison uses11 recorded upstream responses, explicitly marked fixture replay. Unexpected unmatched fixture requests: zero. No fixture is credited as live inference. Original critical scenarios make no external requests. Unit-test transport fixtures remain internal mocks; the full suite has no central aggregate counter of every fixture invocation. Its blanket network-denial preload prevents accidental external HTTP/fetch/socket activity.

**External AI requests:0. Production requests/data changes:0. Deployment/commit/push:0.** Keys were not loaded by the new59-case harness: it uses a synthetic never-transmitted key. The original historical runners use synthetic keys and recorded replies. No source course content was sent externally. Configured-secret value checks run before packaging without logging secret values.

Coverage is local and synthetic, not a security certification. Real provider quality, downstream usage/billing and production persistence/concurrency remain untested. The server-authoritative guards must remain release invariants for any later work.
''';(R/'05_Safety_And_Provider_Accounting.md').write_text(text)

(R/'06_Unresolved_Issues_And_Recommendation.md').write_text('''# Limitations and next step

The existing24 backend failures remain unresolved and separately listed; the full backend suite is not green. New tests and deterministic replay are not a substitute for live-generation evaluation or production end-to-end checks.

Provider-dependent diagnostic cases remain UNTESTED for actual answer quality. Routing them away from an incomplete local FAQ is a verified deterministic correction, not proof that an unavailable model would satisfy them. Original grading remains untouched. Local non-template responses were recorded and covered by targeted contracts, but have not all received a new independent semantic grade. Do not claim all59 scenarios fully pass.

Extraction remains a conservative bounded grammar, not universal language understanding. Exact display names and described objects share the existing product field; some frozen expected object shorthands differ from fuller supplied descriptions. Rich material/feature prose and negative constraints are not a general typed ontology. Additional template values are carried through the existing bounded attributes array; many simultaneous facts can exhaust that bound. Do not infer missing product details from a source example. Natural unrecognized declarations should clarify or use the authorized synthesis path, never fall back to an obsolete identified product.

Local practice drafts are conservative examples, with limited creative variety. Context-specific scenes, comparison/choice, buyer briefs, complex targeting and larger counts may require provider synthesis. Count, language and typed-artifact checks cannot prove all subjective semantic obligations. Legacy missing-conversation-ID behavior remains the existing contract; session persistence was not redesigned. The synthetic HTTP harness uses memory models, so real MongoDB indexes, strict query behavior and concurrent sessions need a separate isolated integration check. Historical platform guidance outside the verified product-course locale changes remains unchanged.

The deployment gate remains blocked pending review, resolution/adjudication of baseline test issues, explicitly authorized controlled provider testing and a genuinely new independent evaluation. Do not reuse these59 exposed diagnostics as blind evidence. Do not change historical grades or v7 thresholds to increase a score. Any external content transmission needs separate explicit approval of provider, course scope and budget. No further evaluation or production action is started by this package.
''')
(R/'07_Rollback_And_Review_Instructions.md').write_text('''# Review and rollback

This task used the existing working tree. Pre-existing changes include files already modified/untracked before this task; a diff against HEAD would mix them with this patch. The authoritative task diff is `evidence/phase_changes.patch`, derived from byte snapshots in `evidence/before/`, with final hashes in `changed_file_manifest.json`. Eight source files changed and one new test file was added. No existing test was edited.

Before applying a later rollback, verify each changed file still matches its final SHA-256. If it differs, stop and reconcile that newer work manually. From the Untitled project root, `git apply --reverse --check <absolute-path-to-review>/evidence/phase_changes.patch` is a non-mutating check. After explicit rollback approval, review and reverse only this task patch, or restore just the eight named files from the saved baseline and remove only the newly added test file. The task has not run any rollback command. Do not reset, stash, clean or overwrite unrelated changes.

After rollback rerun the original security/isolation/Unicode suites and baseline chatbot/backend checks under external-network denial. Baseline24 failures are expected until separately resolved; the new reliability tests should again expose the original problems rather than be deleted to claim a pass. No database migration/config/deployment change needs reversal because none occurred.

Review the diff, raw/fill slot rules, atomic state reducer, local response contract, locale changes and negative-evidence filtering. Validate preserved source/evaluator hashes and inspect the full-body results. Accepting this local patch does not authorize provider transmission or deployment. Stop here and await review.
''')
(R/'README.md').write_text('''# Skillomate deterministic reliability fix review

Read reports01–07. Evidence includes the saved working-tree source/test baseline, exact task-only patch, changed-file hashes and function lines, after-source snapshots, independent regression tests, complete full backend/Python logs, intermediate failures, known59-case actual HTTP/JWT traces, payload ownership inspections, all19 asset controls, original four critical reproductions and recorded Phase12 comparisons. The PDF comparison is under `output/pdf/`.

The final counts are in `evidence/verification_summary.json`; final backend log is `backend_final_all.log`. Existing24 failures remain visible and no production readiness is claimed. New test source is included under `evidence/after/edunex-b/tests/`. Reproduction scripts run from the current project's edunex-b directory and need its installed dependencies. The diagnostic harness uses synthetic users, in-memory model boundaries and a synthetic provider key; preload its local_only_guard.cjs for HTTP diagnostics. Blanket deny-network is used for unit suites. Never run historical live-evaluation scripts or remove egress denial.

Baseline123-control replay uses `baseline_preload.cjs`, which substitutes captured source reads in memory; it never rewrites application files. Historical comparison uses recorded upstream responses, not live inference. Known scenarios are diagnostic evidence, not a newly blinded score. Review helper scripts and snapshots are artifacts, not new application entry points.

No archive cleanup was approved or performed. No existing ZIP/evidence, approved curriculum, evaluator, historical grade/rubric, production configuration or data was modified. No external AI call, deployment, commit or push occurred. Stop and await review.
''')
print(json.dumps({k:v for k,v in summary.items() if k not in ['preexistingBackendFailures']},ensure_ascii=False))
