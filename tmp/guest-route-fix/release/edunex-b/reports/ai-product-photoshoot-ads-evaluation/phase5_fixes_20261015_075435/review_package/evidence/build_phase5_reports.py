"""Assemble saved local evidence. Does not run tests or contact providers."""
from pathlib import Path
import datetime
import difflib
import hashlib
import json

B=Path.cwd();R=Path(__file__).resolve().parent
P=B/'reports/ai-product-photoshoot-ads-evaluation/phase4_live_20261015_071604'
def read(path):return json.loads(path.read_text())
def save(name,data):
    with (R/name).open('x',encoding='utf-8') as f:
        if isinstance(data,str):f.write(data)
        else:json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

before=read(R/'before_manifest.json')
source_names=list(before['sources'])+list(read(R/'additional_before_manifest.json'))+[
    'scripts/eval/grade_product_photoshoot_ads_results_v4.py','tests/product-tutor-phase5.test.cjs','tests/test_product_evaluator_v4.py']
changes=[];patch=[]
for name in source_names:
    original=R/'before'/name;current=B/name
    if original.exists() and original.read_bytes()==current.read_bytes():continue
    changes.append({'path':name,'status':'modified' if original.exists() else 'new','beforeSha256':sha(original) if original.exists() else None,'afterSha256':sha(current)})
    patch.extend(difflib.unified_diff(original.read_text().splitlines(True) if original.exists() else [],current.read_text().splitlines(True),fromfile='a/'+name if original.exists() else '/dev/null',tofile='b/'+name))
save('phase5_changes.patch',''.join(patch))
history_changes=[p for p,h in before['historical'].items() if not (B/p).exists() or sha(B/p)!=h]
assert not history_changes
assert sha(B/'knowledge/ai-product-photoshoot-ads/training.txt')==before['sources']['knowledge/ai-product-photoshoot-ads/training.txt']
assert sha(B/'scripts/eval/grade_product_photoshoot_ads_results_v3.py')==before['sources']['scripts/eval/grade_product_photoshoot_ads_results_v3.py']
assert sha(B.parent/'Skillomate_Chatbot_Phase4_Live_Review.zip')==before['phase4ZipSha256']

node=read(R/'verified_validation/node_verified_execution.json')
python=read(R/'evaluator_verified/python_verified_execution.json')
templates=read(R/'offline_template_replay_results.json')
root=read(R/'offline_root_cause_grades_verified.json')
regrade=read(R/'phase4_saved_response_regrade_v4_reviewed.json')
old=read(P/'v3_integrated_grades.json')
old_by={c['id']:c for c in old['results']};new_by={c['id']:c for c in regrade['results']}
definitions=read(P/'all_test_cases_frozen.json');questions={c['id']:c for c in definitions['single_turn_tests']+definitions['conversation_tests']}
raw=read(P/'application_raw_results.json');responses={c['id']:c for c in raw['results']}
decisions={
 'ppads_017':('Confirmed semantic false failure','Attach the character sheet and keep the same face conveys the required identity-preservation concept. It is not an exact-prompt request; full prompt wording is still checked verbatim in that dimension.'),
 'new15_006':('Confirmed semantic false failure','The response actually lists three buyer groups. Buyer groups is a valid equivalent of buyers/buyer types; price and Instagram remain product facts, not subscription pricing.'),
 'ppads_conv_001':('Confirmed unnecessary-echo failure with independent context proof','The first reply gives the correct product-sheet procedure. The later complete Product Sheet template substitutes perfume bottle correctly. V4 requires this later full product-bearing template proof before excusing the missing name echo.'),
 'ppads_conv_002':('Confirmed semantic false failure','The answer contains buyer groups and a singular buyer problem to validate. The old plural/alias check misses actual content. Creative hypotheses remain generic and their usefulness is not inferred from this semantic correction.'),
 'ppads_conv_004':('Confirmed Hinglish semantic false failure','Sirf bataye hue part ka rang badlo; shape ... same rakho means change only the specified colour and retain shape. V4 limits aliases to preservation wording and rejects shape-changing counterexamples.'),
 'ppads_conv_005':('Confirmed Hindi semantic false failure','केवल एक धीमा मूवमेंट explicitly means only one slow movement. The old alias misses धीमा between एक and मूवमेंट; two movements still fail.'),
 'ppads_conv_006':('Confirmed contextual-refusal semantic false failure','The response proposes demonstrating the product and rejects having the AI character give a personal review. V4 recognizes that meaning, while affirmative customer claims and negated demonstrations remain failures.'),
 'new15_conv_005':('Confirmed unnecessary-echo failure with independent context proof','The first reply gives the L06 settings without repeating the name. The later complete Arc template correctly instantiates cork yoga block, independently proving identity retention. This does not excuse missing or wrong template slots.'),
}
reviews=[]
for case_id,(decision,reason) in decisions.items():
    assert old_by[case_id]['status']=='failed' and new_by[case_id]['status']=='passed'
    reviews.append({'id':case_id,'reviewer':'Evidence-based agent review; not external human sign-off','decision':decision,'reason':reason,
        'frozenTestDefinition':questions[case_id],'originalActualResponseEvidence':responses[case_id],
        'originalV3Grade':old_by[case_id],'newV4GradeOnSameAnswer':new_by[case_id]})
assert {c['id'] for c in regrade['results'] if c['status']=='failed'}=={'ppads_018','ppads_022','phase4_new_002','phase4_new_007','ppads_conv_007'}
save('suspected_evaluator_failure_review.json',{'method':'Review actual saved questions/answers and source-derived prompt audit. All eight judgments are independent of newly generated runtime outputs. No historical response/definition/score is edited.','cases':reviews})

target_node=[c for c in node['cases'] if c['name'].startswith('phase5')]
target_python=[c for c in python['cases'] if 'Phase5EvaluatorTests' in c.get('class','')]
assert len(target_node)==38 and len(target_python)==16
targeted={'mode':'LOCAL_VALIDATION_ONLY','externalProviderRequests':0,'newLiveEvaluation':False,
    'summary':{'newTargetedChecks':len(target_node)+len(target_python),'passed':sum(c['status']=='passed' for c in target_node+target_python),'failed':sum(c['status']=='failed' for c in target_node+target_python),'nodeNewChecks':38,'evaluatorNewChecks':16,'v4CompatibilityChecksReusingV3Assertions':18,'targetedChecksAlreadyIncludedInFullSuiteTotals':True},
    'targetedNodeCases':target_node,'targetedEvaluatorCases':target_python,'fullBackendRegression':node,'fullEvaluatorRegression':python,
    'completeTemplateReplay':templates,'fiveGenuineFailureLocalReplays':root,
    'eightSuspectedEvaluatorFailuresReviewed':reviews,
    'savedPhase4CorpusRegrade':{'originalV3':old['summary'],'newV4':regrade['summary'],'interpretation':'Same old 80 answers, not new tutor/model performance. All five real historical failures remain failed.'},
    'freshLiveAccuracy':None}
save('phase5_targeted_test_results.json',targeted)
manifest={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceChanges':changes,
    'historicalFilesVerifiedUnchanged':len(before['historical']),'historicalChanges':history_changes,'rawCourseSourceUnchanged':True,'original19TemplateBodiesUnchanged':True,
    'v3EvaluatorUnchanged':True,'phase4ZipUnchanged':True,'externalProviderRequests':0,'newLiveAccuracy':None,
    'deployed':False,'committed':False,'pushed':False,'productionInfrastructureModified':False,
    'fullBackendResult':node['summary'],'fullEvaluatorResult':python['summary'],'newTargetedResult':targeted['summary'],
    'templateReplay':{k:v for k,v in templates.items() if k!='results'},'fiveRootCauseReplays':root['summary']}
save('phase5_validation_manifest.json',manifest)

report=['# Phase 5 targeted quality corrections','',
 'Implemented locally against the preserved Phase 4 evidence: 67/80 integrated v3 passes, 13 failures, five genuine/incomplete failures, eight suspected rubric failures and one critical full-template failure. No new external-provider request or live evaluation was made.','',
 '## Changes and why they address the failures','',
 '1. **Bounded colour/part substitution.** The runtime parser isolates explicit change/recolour targets and values, stops at punctuation or preservation clauses, and rejects negated changes. It understands colour-of phrasing and retains grammatical part determiners. Values carry through user history or saved context. The complete approved template remains unchanged; unknown fields stay placeholders. This fixes the clause-boundary cause of phase4_new_002 rather than matching its question. Nine new matrix checks use other parts and colours; additional checks cover history, unknowns and negation.',
 '2. **Intent-aware troubleshooting.** Phone/handset/smartphone visibility resolves to the exact phone-visibility FAQ before generic UGC guidance. Colour-plus-shape, brand-shade, face-identity and finger-anatomy intents have separate source tags. Specific repairs precede generic course-overview matching, correcting ppads_022 and phase4_new_007 and returning more practical face guidance.',
 '3. **Source-backed festive detail.** Retrieval includes both authorized L04 Diwali and Wedding Gift assets for festive questions. Reviewed English/Hindi/Hinglish summaries preserve their actual diyas/marigolds or silk/gift-box/ribbon/rose-petal details, product sharpness, foreground and realistic scale. These facts already exist in training.txt. All 19 original template bodies and all eight lessons are preserved.',
 '4. **Conversation-safe language repair.** Product-video/settings intent resolves L06 before using an earlier lesson. Optional bounded productContext.topic survives omitted client history and referring/translation follow-ups. Current explicit intent/lesson wins; unrelated questions do not inherit a topic. A language replacement now uses the matching retrieved workflow, preserving settings rather than falling back to prerequisites. Existing user/course/conversation and entitlement boundaries remain in place.',
 '5. **Advertising safety.** Guards and v4 detect declarative synthetic-presenter-as-genuine-customer claims, including common Hindi/Hinglish forms, in addition to fake-testimonial directives and first-person endorsements. Immediate prohibitions and postposed nahi/mat/na remain safe. Unknown benefits and specifications are not supplied. This is bounded local verification, not proof that every possible phrasing is understood.',
 '6. **Versioned evaluator correction.** Added v4; v3 and historical outputs remain unchanged. V4 activates complete-template checks on exact-intent conversation turns, independently parses colour clauses, recognizes reviewed semantic equivalents and separates optional name echoes from identity loss using later complete-template proof. Strict numeric settings, complete approved bodies, exact FAQ strings, requested outputs, provenance and safety remain required. Negative controls reject wrong products, unfilled slots, changed template clauses, shape-changing advice, two movements and deceptive testimonials.','',
 'No application or grader code branches on evaluation IDs or whole saved questions. Course templates are authoritative assets, not hardcoded evaluation answers. New products and paraphrases are used in generalized regressions.','',
 '## Actual final local evidence','',
 '- **191/191 backend AI tutor tests passed**, zero failures/skips (153 existing + 38 new).',
 '- **77/77 evaluator tests passed**, zero failures/skips: 43 unchanged v2/v3 tests, 16 new v4 controls and 18 unchanged v3 assertions also exercised against v4.',
 '- **54/54 new targeted unit checks passed**, already included in the two totals above; do not add them again.',
 '- **29/29 complete saved-template local replays passed**, using the independent Phase 4 full-body expectations across all 19 headings. This includes phase4_new_002 and the three older critical template turns.',
 '- **5/5 genuine-failure local replays passed** (seven turns), using local handlers and saved provider fixtures where needed. One replay uses saved upstream text; it is not a new provider answer. Network access is denied during these checks.',
 '- AI Influencer/AI Filmmaking compatibility, access isolation, multilingual and multi-turn, provider-error and mobile/history tests pass. No production authentication/database/load validation occurred.','',
 '## Independent review of the eight suspected rubric failures','',
 '| Case | Decision on unchanged saved answer |', '|---|---|']
for item in reviews:report.append('| '+item['id']+' | '+item['reason']+' |')
report+=['', 'All eight are supported as evaluator false failures under the documented evidence above. The complete original definitions, actual answers, old dimensions and corrected dimensions are in suspected_evaluator_failure_review.json. Product-echo exceptions require a later full product-bearing template that proves identity, not a generic later mention.', '',
 'Regrading the **unchanged Phase 4 responses** with v4 yields **75/80 (93.75%)**, five failed, zero skipped/inconclusive/fallback cases. V3 remains 67/80. All five genuine historical failures still fail, and v4 newly flags the known colour-template fidelity gap missed by v3. This difference measures rubric changes only. It does not measure the new runtime, replace the historical score, establish 95% accuracy or imply production readiness.','',
 '## Modified source files','',
 'Paths relative to the backend. phase5_changes.patch compares this task with its pre-Phase 5 snapshot, not Git HEAD, so earlier authorized work is not misattributed.','',
 '| Path | Status |','|---|---|']
report += [f"| {c['path']} | {c['status']} |" for c in changes]
report += ['', 'One legacy unit assertion now accepts either lid or the lid inside a supplied part slot. This is a grammatical value distinction, not an approved-template edit or relaxed score requirement; complete-body checks remain strict. Two initial full runs found and preserved a grammar assertion mismatch and a postposed-mat safety regression; both were corrected before final passing evidence. See phase5_regression_results.md.', '',
 f"All {len(before['historical'])} captured historical report/evidence files, the Phase 4 ZIP, raw course source and v3 grader retain their hashes. No deployment, commit, push, production resource change or unrelated business-logic change occurred. The comparison PDF and source patch accompany the ZIP.",'']
save('phase5_implementation_report.md','\n'.join(report))

reg=['# Phase 5 local regression evidence','',
 '| Final suite | Total | Passed | Failed | Skipped | Exit |', '|---|---:|---:|---:|---:|---:|',
 f"| Backend AI tutor | 191 | 191 | 0 | 0 | {node['exitCode']} |",f"| Evaluators | 77 | 77 | 0 | 0 | {python['exitCode']} |",'',
 'The final backend run is in verified_validation/. The final evaluator run after tighter negative controls is in evaluator_verified/. No backend code changed after its passing run. The 54 new targeted checks are subsets of these totals; 18 additional v4 compatibility executions reuse unchanged v3 assertions.','',
 '## Actual test commands','', 'From the backend:','', '```sh',
 'NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs '+' '.join(node['command']),
 ' '.join(python['command']),
 'NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs node --test tests/product-tutor-phase5.test.cjs',
 'python3 -B -m unittest discover -s tests -p test_product_evaluator_v4.py -v',
 'node '+str((R/'offline_replays.cjs').relative_to(B)), '```','',
 f"Backend started {node['startedAt']}, completed {node['completedAt']} (exit 0). Final evaluator started {python['startedAt']}, completed {python['completedAt']} (exit 0). JUnit, unittest output and per-test metadata are included.",'',
 'The recorded run_verified_validation.py commands invoke the two full-suite commands above; the three saved full-run directories are the root run folder, final_validation/ and verified_validation/. evaluator_verified/ reruns only Python after evaluator-only negative-control changes.', '',
 '## Earlier development outcomes retained','',
 '| Execution | Backend | Evaluator | Explanation |','|---|---|---|---|',
 '| Initial targeted tool invocation | 33/34 | import error | New festive test incorrectly assumed scene order; new Python pattern had a missing quote. Both corrected. These exploratory console outputs were not persisted as separate raw logs. |',
 '| Targeted repeat | 34/34 | 31/31 | Passed before later controls were added; not the final suite totals. |',
 '| First saved full run | 189/190 | 74/74 | Legacy test rejected grammatical the lid. Raw logs retained in this run directory. |',
 '| Second saved full run (final_validation) | 190/191 | 76/76 | New multilingual guard falsely flagged AI ko asli customer mat batao. Raw logs retained. |',
 '| Verified full run | 191/191 | 77/77 | Both issues fixed; no skipped tests. |',
 '| Evaluator-only final verification | unchanged 191/191 | 77/77 | Tightened shape/colour/demo negative controls; latest v4 saved-response regrade also retained. |','',
 '## Offline evidence checks','',
 'Complete-template replay: **29 passed, zero failed**. This compares all saved template bodies against independent Phase 4 expectations, not isolated keywords. Genuine-failure local replay: **5 passed, zero failed**, seven turns. Both are local checks separate from the 54 new unit checks and do not create a fresh live score.', '',
 'The saved-response grader command uses the unchanged Phase 4 all_test_cases_frozen.json and application_raw_results.json, --scope end_to_end, the new grade_product_photoshoot_ads_results_v4.py, and an exclusive new output phase4_saved_response_regrade_v4_reviewed.json. The five-root-case grading similarly writes offline_root_cause_grades_verified.json. Neither command calls a provider.', '',
 'Networking is denied by tests/helpers/deny-network.cjs for Node checks; evaluator grading/tests have no provider calls. Real credentials are not loaded for test execution. Source/course/historical hashes are in phase5_validation_manifest.json and before_manifest.json.','']
save('phase5_regression_results.md','\n'.join(reg))
remaining=['# Phase 5 remaining issues and limits','',
 'The five confirmed Phase 4 defects pass local replays; full-template replay is 29/29 and final unit suites pass 191 backend / 77 evaluator checks. No new live evaluation has been run, so the updated runtime live pass rate and critical-failure rate remain unmeasured.','',
 '1. **Fresh provider behavior remains unknown.** The old Phase 4 score remains 67/80 with v3. V4 scoring 75/80 is a rubric-only regrade of the old answers; its five genuine failures remain unchanged. The five local fix replays and saved provider fixtures do not constitute an 80-case fresh evaluation.',
 '2. **Parsing is bounded.** Colour changes support explicit change/recolour, colour-of, punctuation and preservation clauses. Unsupported syntax, unusual punctuation, arbitrary languages, ambiguous multi-part changes or complex corrections can still require clarification. Unknown facts remain unknown.',
 '3. **Retrieval and translations are finite.** Festive summaries come from the two approved L04 assets. Broader paraphrases or multiple simultaneous learner intents may still require manual review. Exact prompts are preserved as source assets; additional untranslated prose is not treated as an invented course fact.',
 '4. **Safety is tested, not universally proven.** The local guard now catches common declarative synthetic-customer assertions and respects English/Hindi/Hinglish refusals, including postposed mat/na/nahi. Open-ended paraphrases and inferred unsupported claims remain bounded semantic problems. User-supplied product claims are not independently fact-checked. No claim of perfect real-world advertising safety is made.',
 '5. **Evaluator semantics remain bounded.** Eight specific false failures are supported by actual evidence. Identity-echo exceptions require later complete product-bearing template proof, so otherwise valid conversations lacking such proof may still need manual review. New aliases have counterexamples, but this is not an unrestricted semantic judge or external human sign-off.',
 '6. **Production state is not validated.** Optional topic memory is tested with synthetic persistence and existing course/conversation boundaries. No production migration, data write, deployed auth/database, load/concurrency or AWS change was made. The existing one-session-per-user/course storage design remains.',
 '7. **Creative usefulness is limited.** Existing practice drafts remain conservative and can be generic; passing semantic and deliverable checks does not establish marketing effectiveness, conversion or product truth. Provider uptime/reliability and live latency were not retested.','',
 'Stop after implementation, local validation and packaging. Deployment and a new provider evaluation need separate authorization. No production readiness is claimed.','']
save('phase5_remaining_issues.md','\n'.join(remaining))
save('README.md',f'''# Skillomate Phase 5 fix review

AI Product Photoshoot & Ads local corrections. No new provider request, live evaluation, deployment, commit, push or production infrastructure change.

Start with phase5_implementation_report.md, phase5_targeted_test_results.json, phase5_regression_results.md and phase5_remaining_issues.md. The comparison PDF contrasts Phase 4 fresh evidence with Phase 5 local-only evidence. source/ contains the {len(changes)} changed files, and phase5_changes.patch compares against the pre-Phase 5 workspace snapshot.

Final evidence: 191/191 backend tests, 77/77 evaluator tests, 54/54 new targeted checks already included in suite totals, 29/29 complete-template local replays and 5/5 genuine-defect local replays. Evaluator total includes 43 historical tests, 16 new tests and 18 unchanged v3 assertions run against v4. Older failed development runs are retained and explained.

All eight suspected evaluator false failures are independently supported against the original saved questions and answers. V4 grades the same old Phase 4 corpus at 75/80 (93.75%) versus the preserved 67/80 v3 score. This is solely a rubric correction, not a new chatbot accuracy result. Five genuine old answers remain failed. Updated runtime live quality is unknown.

Preserved: all eight lessons, 19 approved full template bodies, v3 grader, Phase 4 ZIP, and {len(before['historical'])} captured historical evidence files. New source assets are reviewed translations/metadata of existing course facts. No individual evaluation question or ID is used in runtime/grading logic.

Limitations: bounded extraction, language/semantic/safety heuristics, conservative creative output, synthetic persistence/auth fixtures, no deployed production/load validation and no live-provider behavior measurement. Explicit colour/part fields and topic memory are locally verified; unknown facts remain unset. AI actors are not genuine reviewing customers.

evidence/ holds actual saved execution logs/results, local replay evidence, before/after manifests and old-run regrade. reference/ supplies Phase 4 raw responses, frozen definitions, independent audit and v3 grader/source facts for verification. This is a review snapshot, not a standalone installed application. Environment files, credentials, API key values, real learner records and unrelated file contents are excluded; configured-secret scanning and member hashes accompany the archive.
''')
print(json.dumps({'changedFiles':len(changes),'newTargetedChecks':targeted['summary'],'backend':node['summary'],'evaluator':python['summary'],'templateReplays':templates['passed'],'genuineFailureReplays':root['summary']['passed'],'historicalFilesUnchanged':len(before['historical'])},indent=2))
