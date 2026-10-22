from pathlib import Path
from collections import Counter
import datetime,hashlib,json,subprocess,xml.etree.ElementTree as ET
E=Path(__file__).resolve().parent;R=E.parent;PROJECT=R.parent
read=lambda n:json.loads((E/n).read_text())
save=lambda n,d:(E/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
at=datetime.datetime.now(datetime.timezone.utc).isoformat()
baseline=read('baseline_manifest.json');changed=read('changed_file_manifest.json');allowed={f['path'] for f in changed}
checks=[]
for name,h in baseline['files'].items():
 p=PROJECT/name;actual=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
 checks.append({'path':name,'beforeSHA256':h,'currentSHA256':actual,'changed':actual!=h,'authorizedChange':name in allowed})
unexpected=[x for x in checks if x['changed'] and not x['authorizedChange']]
assert not unexpected,unexpected
for f in changed:assert hashlib.sha256((PROJECT/f['path']).read_bytes()).hexdigest()==f['afterSHA256']
save('preservation_verification.json',{'at':at,'checks':checks,'unexpectedChanges':unexpected,'frozenPhase14BQuestionsRubricArchivePreserved':True,'productionConfigurationChanged':False,'approvedCourseAssetsChanged':False,'fourFunctionalFixModulesChanged':False,'gitIndexModified':False})
backend=read('full_backend_execution.json');python=read('full_python_execution.json')
before=list(ET.fromstring((E/'baseline_all_backend.xml').read_text()).iter('testcase'))
before_failed={c.attrib['name'] for c in before if c.find('failure') is not None or c.find('error') is not None}
after_failed={c['name'] for c in backend['cases'] if c['status']=='FAIL'}
assert before_failed==after_failed
chatfiles={'product-tutor-unicode-safety.test.cjs','product-tutor-phase14a.test.cjs','ai-chat-history.test.cjs','tutor-knowledge.test.cjs','product-tutor-quality.test.cjs','product-tutor-phase3.test.cjs','product-tutor-phase5.test.cjs','product-tutor-phase7.test.cjs','product-tutor-phase9.test.cjs','product-tutor-phase11.test.cjs','mobile-course-ai.test.cjs','mobile-course-ai-cache.test.cjs','tutor-course-isolation.test.cjs'}
chat=[c for c in backend['cases'] if Path(c.get('file') or '').name in chatfiles]
new=[c for c in backend['cases'] if Path(c.get('file') or '').name=='tutor-course-isolation.test.cjs']
functional=read('regression/final/reproduction_results.json');functional_turns=[t for c in functional['results'] for t in c['turns']]
assert all(t['fullExpectedBodyMatches'] for t in functional_turns)
replay=read('regression/final/phase12_passing_replay.json')
assert replay['summary']['byteIdenticalCases']==40 and not replay['summary']['changedCases']
before_known=read('before_known_pipeline_results.json');final_known=read('final_known_pipeline_results.json')
assert all(c['inspection']['regressionPass'] for c in final_known['cases'])
for name,h in final_known['sourceHashes'].items():assert hashlib.sha256((PROJECT/'edunex-b'/name).read_bytes()).hexdigest()==h
observer=[json.loads(p.read_text()) for p in (E/'regression/final/provider_invocations').glob('*.json')]
blocked={stage:sum(len(t['trace']['providerRequests']) for t in read(stage+'_known_pipeline_results.json')['cases']) for stage in ['before','after','final']}
summary={'at':at,'newIsolationTests':dict(Counter(c['status'] for c in new)),'chatbotTests':dict(Counter(c['status'] for c in chat)),'allBackend':backend['summary'],'allPythonEvaluators':python['summary'],
 'baselineBackend':{'total':len(before),'PASS':len(before)-len(before_failed),'FAIL':len(before_failed)},'newBackendFailures':sorted(after_failed-before_failed),'resolvedBaselineFailures':sorted(before_failed-after_failed),
 'preexistingFailures':[c for c in backend['cases'] if c['status']=='FAIL'],'originalFunctionalCases':len(functional['results']),'originalFunctionalTurns':len(functional_turns),'completeFunctionalBodiesPass':True,'phase12RecordedReplay':replay['summary'],
 'knownCriticalPipelineReproductions':[{'id':a['id'],'before':b['inspection'],'afterFinal':a['inspection']} for b,a in zip(before_known['cases'],final_known['cases'])],
 'providerAccounting':{'finalFullSuiteObservedAdapterInvocations':sum(p['adapterInvocations'] for p in observer),'finalFullSuiteObservedTransportAttempts':sum(p['transportAttempts'] for p in observer),'allObservedSuiteCallsHaveInjectedFetch':all(c['customFetchProvided'] for p in observer for c in p['calls']), 'knownPipelineBlockedAttemptsByStage':blocked,'finalPhase12RecordedFixtureInvocations':replay['summary']['replayedProviderInvocations'],'finalFourCaseProviderTransportAttempts':functional['deniedExternalRequests'],'externalProviderRequests':0,'liveModelQuality':'UNTESTED','note':'Final full-suite adapter counts are fixture-based and not live inference. Known baseline/intermediate/final HTTP traces block transport; historical Phase14B copied traces are not new calls. Earlier test iterations are preserved as logs, without claiming per-invocation observer coverage.'},
 'recommendation':'Suitable for a NEW independent blind evaluation in an isolated synthetic local environment; not production ready. Retain the 24 pre-existing broader-suite failures as outstanding. Live-provider evaluation requires explicit destination/payload authorization.'}
save('verification_summary.json',summary)
failure_table='| File | Pre-existing failure |\n|---|---|\n'+''.join(f"| {Path(c.get('file') or '').name} | {c['name']} |\n" for c in summary['preexistingFailures'])
(R/'01_Executive_Summary.md').write_text('''# Course isolation fix review

The two confirmed Phase14B course-isolation failures are corrected in local regression testing. Protected knowledge is now restricted to one server-resolved, entitled course. Text comparison intent cannot widen protected retrieval; other-course comparisons use public catalog descriptions. Retrieved-owner validation and final payload checks run before provider transport.

Both exposed requests reproduce their original leakage against the saved Phase14A.1 baseline. On the final candidate, all product-course complete bodies are absent from both assembled provider requests and retrieval outputs while another course is active. Actual Express/JWT pipeline traces show only the selected other-course ID. Conflicting nested saved product-context ownership is now discarded before history/fact inheritance. A related direct-template path was also reproduced and corrected: a course name in learner text cannot override the validated active course.

Verification: **38/38 new isolation tests; 514/514 chatbot regression tests; 167/167 Python evaluator tests**. The complete backend run is **1,045 pass / 24 fail / 0 skip**, compared with **1,007 pass / 24 fail** before this fix. The same 24 failures existed before implementation under the same offline environment; none is new and none was hidden. All four original functional cases pass all five complete-body comparisons. All 40 previously passing Phase12 cases (48 turns) remain byte-identical in explicitly labeled recorded-response replay.

Only three production files, one existing test fixture and one new regression file changed. Approved course assets, the four product-fix modules, authentication middleware, existing evaluator/tests, production configuration, original Phase14B cases/rubric/archive and unrelated user changes are preserved. No deployment, commit, push, database migration, retraining, production connection or external provider request occurred.

**Recommendation:** a new independent blind evaluation may be commissioned in a synthetic local environment after review. This is not production readiness or a passed release gate. Use new questions and freeze the corrected candidate; the stopped Phase14B set remains historical evidence and its exposed cases are known regressions.
''')
(R/'02_Root_Cause_And_Authorization_Trace.md').write_text('''# Confirmed root causes and complete trace

All 235 entries of the Phase14B archive were read and SHA-256 integrity checked before editing. The original candidate manifest matched the current application/tests/assets/evaluator hashes. See `archive_read_inventory.json`, `baseline_manifest.json`, copied original traces and source snapshots. References prefixed `baseline_source` refer to the frozen Phase14A.1 code, not Git HEAD.

1. Authentication: `middleware/compatAuth.js:62` loads the database user; `:78` verifies JWT/session (or supported legacy session) and `:116` populates `req.compatUser`. `routes/ai.js:338` retains this middleware. Body user IDs and entitlement flags are not authority. The user projection already includes purchased courses and course entitlements.
2. Scope selection: `routes/ai.js` normalizes supported course selector aliases, loads user/course session state and calls `resolveRequestedCourseScope`. Before the fix, `baseline_source/services/aiTutorService.js:481` selected a client/text/history hint; selection was not itself proof of authorization. Missing/forged IDs could also fall back to a sole unrelated query result in `:983`.
3. Entitlement: `baseline_source/services/aiTutorService.js:982` used `resolveAllSubscriptionAccess(...).active` as a request-wide material boolean. `services/subscriptionAccess.js:84` is the existing provider-authoritative entitlement resolver. Existing course-purchase authorization is `services/courseAccess.js:1`; limited-trial course selection is defined in `middleware/checkSubscription.js:18`. The original tutor did not apply those course-specific purchase/trial decisions.
4. First confirmed scope break: `baseline_source/services/tutorKnowledge.js:120` tested a broad comparison regex. The word “comparison” in “This is not a comparison” matched. `baseline_source/services/aiTutorService.js:961` used it as `allowCrossCourse`; at `:962` the selected-course database predicate was omitted. Both published courses and their note/example fields were loaded despite the active course remaining the other course.
5. Retrieval amplification: `baseline_source/services/tutorKnowledge.js:173` independently disabled active scoping whenever the boolean OR the same text regex permitted comparison. All returned course slugs populated the document-owner map, making product-course paid source records eligible. Ranking selected product templates from the static approved registry, `services/productTutorKnowledge.js`, even while `activeCourse` identified another course. The original slug-or-ID equality and active-lesson notes insertion also lacked strict owner checks.
6. Context assembly: `baseline_source/services/aiTutorService.js:989` accepted retrieval output, and `:992` assembled all course context/guards in comparison mode. Its returned context interpolated `knowledge.excerpts` without validating protected source ownership. Full product asset bodies therefore entered the system context. This was a deterministic local failure before model execution.
7. Provider construction: `baseline_source/services/aiTutorService.js:1207` built the system message, history, current question and optional repair, then passed the payload to `services/tutorProvider.js`. The provider adapter only handles transport/retry; it had no course-authorization information. The evaluation network guard blocked transport, not context assembly. Final fallback answers withholding templates did not repair this boundary breach.

Original trace 009 contains full Product Sheet, White Studio, Lifestyle and Dark Premium bodies in assembled messages. Trace 010 contains Diwali, Wedding Gift and Colour Variant Sheet. Fresh known-regression baseline reproduction confirms these bodies. Final-source reproduction contains none, and all retrieved course IDs equal the selected other-course ID.

Additional confirmed branch: `baseline_source/services/aiTutorService.js:778` allowed text naming AI Filmmaking to satisfy `isConfirmedAiFilmmakingScope`, even with another authoritative active course. A new offline test reproduced a local approved-template response from that branch before its correction. This is part of the same course-boundary correction, not a newly scored blind case. No unverified source-level hypothesis is presented as a root cause.
''')
(R/'03_Implementation_And_Diff.md').write_text('''# Implementation and exact change scope

`services/tutorKnowledge.js:112` now requires matching database ownership, not a shared slug. Retrieval at `:217` resolves exactly one canonical owner from server-provided courses, refuses orphan/forged owners, inserts paid documents only from that owner, validates selected lessons against the owner's lesson list and limits example prompts accordingly. A comparison flag cannot authorize protected documents from another owner. Each returned protected record retains `courseId` for validation.

`services/aiTutorService.js:962` keeps the database course predicate regardless of comparison intent, removes the unrelated-single-result fallback, and grants materials only after a unique published match plus server entitlement. It reuses the existing course-purchase helper and existing subscription resolver. Limited-trial course selection mirrors the existing lesson-access primary/fallback policy; ambiguous/no trial target grants no material. Body flags do not affect this decision.

Comparisons use a separate public projection and explicit public-field mapping. Other-course notes, example prompts and static protected records cannot enter that comparison catalog. The active course's own independently authorized material may remain available; cross-course comparative information is limited to public descriptions. No protected multi-course comparison operation is introduced. Future such operations would require a separate verified multi-owner grant.

`assertKnowledgeScope` at `services/tutorKnowledge.js:134` rejects missing/foreign protected owners before interpolation. `assertCourseTextScope` at `:151` adds a registered-source literal-body check; this is defense in depth, not the authority mechanism. It does not attempt semantic paraphrase detection. Canonical document-family aliases remain valid. `scopeConversationHistory` at `:161` drops mismatched saved-course history and recognized foreign protected source text, while preserving ordinary client conversation as untrusted text.

`resolveRequestedCourseScope` at `services/aiTutorService.js:481` preserves existing saved course scope ahead of implicit text/history mentions. An explicit selector still requests a switch, but the new target is independently resolved and authorized. Missing/unknown scope grants no protected assets. `buildContext` validates retrieval and final assembled context. `scopedProviderPayload` at `:1244` checks every system/history/user/repair message before transport, and generated text is checked before return.

`routes/ai.js:262` adopts the sanitized history instead of re-forwarding the original client history. Both initial inference and repair receive server-built scope. Scope violations propagate to the existing generic 502 envelope; they cannot fall through to an unsafe course template or provider fallback. Local filmmaking templates require material access, and `isConfirmedAiFilmmakingScope` at `services/aiTutorService.js:780` gives the validated active slug precedence over message text.

Changed production files: `services/aiTutorService.js`, `services/tutorKnowledge.js`, `routes/ai.js`. Test changes: `tests/ai-tutor-fixture.cjs` gains optional injected retrieval corruption/trial data; `tests/tutor-course-isolation.test.cjs` adds 38 regressions/controls. No existing assertion or test threshold was relaxed. `changed_file_manifest.json` and `course_isolation_working_tree.patch` compare against the actual pre-existing working tree. Source snapshots and resulting hashes are included. Existing API URLs/aliases/JSON fields/auth contracts are retained; scope violations use the existing error shape.
''')
(R/'04_Test_Results_And_Provider_Inspection.md').write_text('''# Verification and complete evidence

| Check | Result |
|---|---|
| Initial isolation regressions before correction | 23 cases: 14 failing, 9 passing controls |
| Final course-isolation regression file | 38/38 pass |
| Full chatbot-related suite | 514/514 pass |
| All existing backend files plus new regression | 1,069 tests: 1,045 pass, 24 fail, 0 skip |
| Baseline all existing backend files | 1,031 tests: 1,007 pass, same 24 fail, 0 skip |
| All Python evaluator tests | 167/167 pass, 0 skip |
| Original four functional failures | 4 cases / 5 complete approved-body checks pass |
| Previously passing Phase12 recorded comparison | 40/40 cases, 48 turns byte-identical |
| Known 009/010 final HTTP/JWT reproduction | Correct owner only; zero unauthorized complete bodies in payload |

Full logs and individual failures are retained, including iterations. The first correction iteration had 15 regressions caused by an evaluation-discovered boolean/null handling error in the new document-family helper. It was corrected and all 228 focused tests passed. This was not an authorization leak; failures failed closed or lacked expected transport. A nested saved-context owner conflict was also reproduced before its correction, with raw probe logs preserved. The direct-template branch was then independently reproduced by an additional failing regression, corrected, and the final complete suite rerun. No evidence was removed or test expectations loosened.

The 38 tests cover original cases, same-course full templates, inactive/expired/revoked access, purchased-course boundaries, limited trial, explicit/implicit switches, public comparisons, forged/unknown/missing/unpublished/duplicate course selections, foreign lesson objects, stale saved context, foreign approved history, tampered owner metadata, unlabelled protected excerpts, new-message injection and model-origin foreign template text. Payload tests inspect all complete registered product bodies, not one diagnostic phrase. Source text remains immutable.

`before_known_pipeline_results.json` reproduces the original two failures using saved source and real local Express/JWT handling. `final_known_pipeline_results.json` uses final source hashes and proves no complete product template occurs in either case's assembled messages. Memory-only models, synthetic identities and a synthetic provider credential avoid production/real account data. External fetch/socket transport is denied before sending. Both raw payloads, debug retrieval IDs, state, errors and timings are retained. Live model quality remains untested.

Final full-suite observation records 86 fixture adapter invocations and 94 transport attempts, all using injected fetch. Known-case baseline/intermediate/final HTTP reproductions each record four blocked transport attempts. The final Phase12 comparison uses 11 recorded replies and zero unexpected requests. Functional reproduction uses no provider transport. These counts are separated in `verification_summary.json`; none counts as live-model evidence. No external provider request was sent.

The Phase14B frozen 120-case set and rubric/archive are unchanged and were not rerun/rescored. Cases 009/010 are expressly known regressions. Neither old scores nor grading thresholds were modified. The 24 pre-existing full-backend failures are listed in the next report with raw errors retained.
''')
(R/'05_Preexisting_Failures_And_Limitations.md').write_text('''# Existing failures and remaining limits

The full backend suite is not green. These exact 24 failures occurred before implementation under the same external-network-denied environment and remain afterward. There are no newly failing or newly skipped cases. They concern existing mobile/static-source expectations, billing/configuration mocks, PDF extraction and thumbnail behavior; this review does not assert that every failure is a production defect. They were preserved rather than changed outside scope.

'''+failure_table+'''

No live provider response, production database, real catalog/purchase/trial account, browser UI or deployed environment was exercised. Final verification uses synthetic sessions and offline model transports. Real catalog metadata and transaction integration require a later authorized end-to-end check. A literal source-body guard cannot recognize arbitrary paraphrases or unknown pasted text; metadata/authorization-based filtering is the primary protection. Ordinary client history remains untrusted conversation, not authenticated evidence of course facts. No conversation-persistence redesign or migration was attempted.

Missing/ambiguous course context now withholds protected assets, and a foreign source body pasted directly into a question can produce the existing generic 502 instead of model inference. These are intentional fail-closed behavior changes, not claims of polished learner UX. Cross-course protected comparisons are unsupported; public descriptions remain available. Existing per-course purchase and trial access are now applied to tutoring, so previously overbroad trial access is intentionally denied. The mirrored trial-selection policy should be kept aligned with `checkSubscription.js` in future maintenance.

Recognized foreign approved history is removed; legacy incomplete course/conversation identifiers and textual product reset behavior are not redesigned. Same-course passes do not prove every multilingual or long conversation. The original four product fixes and Unicode protections pass existing checks, but a new independent evaluation is still necessary.
''')
(R/'06_Recommendation_And_Rollback.md').write_text('''# Recommendation and rollback

The confirmed local course-boundary failures are corrected and the relevant tests executed. A **new independent blind evaluation is reasonable after review**, using a newly frozen candidate, new independent questions and initial grading views that include retrieval/payload scope metadata. The old Phase14B questions are exposed evidence and must not be rebranded as blind. No new independent evaluation was started here.

This is not production readiness or deployment approval. The full backend suite retains 24 pre-existing failures. Live-provider execution requires explicit approval for the course-text/derived-prompt payload to the configured destination; this review sent none. Production-like persistence, trial/purchase catalog resolution, UI integration and final end-to-end release verification remain later gates.

Rollback is local only: use `baseline_source` and the exact phase-only patch. First compare each current hash with `changed_file_manifest.json` so subsequent user edits are not overwritten. Restore only the three production files and existing fixture from the baseline snapshots; remove the new regression file only if it still matches this review's hash and removal is intended. Do not reset/stash the working tree, use Git HEAD as the baseline, change course assets or touch unrelated changes. Review evidence and historical Phase14B archives should remain preserved. There is no production deployment, database migration, model retraining or production configuration change to roll back.
''')
(R/'README.md').write_text('''# Skillomate course isolation fix review

Start with `01_Executive_Summary.md`. This local implementation corrects known course-isolation failures; it does not pass a new blind evaluation or authorize deployment.

Evidence includes original Phase14B traces/manifest/stop, full archive-read inventory, frozen working-tree baseline, exact phase-only diff and changed-file hashes, corrected source, before/after HTTP/JWT traces, payload inspection, 38 new regression tests, full baseline/final backend and evaluator logs, all existing failures, original functional body comparisons and separate recorded Phase12 replay. The before/after PDF comparison is under `output/pdf/`.

No production interaction, external provider request, commit, push, deploy, migration or retraining. Existing Phase14B questions/rubric/archive, approved assets and unrelated user changes are unchanged. Packaging integrity hashes cover the delivered review files.
''')
print(json.dumps({k:summary[k] for k in ['newIsolationTests','chatbotTests','allBackend','allPythonEvaluators','newBackendFailures','originalFunctionalCases','originalFunctionalTurns']},indent=2))
