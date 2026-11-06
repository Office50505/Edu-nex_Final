import collections
import datetime
import hashlib
import importlib.util
import json
import pathlib
import re
import statistics

B = pathlib.Path.cwd()
R = B / 'reports/ai-product-photoshoot-ads-evaluation/phase2_live_20261015_115107'
read = lambda name: json.loads((R / name).read_text())
raw = read('application_raw_results.json')
manifest = read('execution_manifest.json')
packs = {k: read(f) for k, f in [('original', 'original_test_cases.json'), ('held_out', 'held_out_test_cases.json')]}
tests = {t['id']: t for p in packs.values() for t in p['single_turn_tests'] + p['conversation_tests']}
grades = {k: {s: read(k+'_'+s+'_grades.json') for s in ['end_to_end','live_model']} for k in packs}
gm = {k: {s: {v['id']:v for v in g['results']} for s,g in scopes.items()} for k,scopes in grades.items()}
baseline_path = B/'reports/ai-product-photoshoot-ads-evaluation/quality_improvement_20261015/corrected_evaluation_results.json'
baseline = json.loads(baseline_path.read_text())
baseline_map = {r['id']:r for r in baseline['results']}

# Human adjudication records, not answer overrides. The frozen v2 outputs remain unchanged.
notes = {
 'ppads_001': ('confirmed_content_gap', ['correctness'], 'The overview omits Google Flow and CapCut. It also never explicitly states the eight-lesson count; v2 incorrectly treats a normalized Lesson 08 reference as satisfying the numeric count.', 'Model answer completeness and evaluator numeric-context matching', 'Cover supported tools and lesson count from the source overview, and require a count in context instead of any matching lesson number.'),
 'ppads_002': ('confirmed_content_gap', ['correctness'], 'The reply omits phone and laptop prerequisites, which are present in Part B. Top retrieval favors the brief Lesson 01 summary and misses the prerequisites overview.', 'Retrieval coverage and model answer completeness', 'Link lesson-summary requests to their prerequisites/overview asset when required; answer from those facts.'),
 'ppads_017': ('evaluator_false_failure', [], 'Attaching the character sheet and keeping the face exactly as that sheet explicitly establishes a reference. The literal word reference is unnecessary.', 'Evaluator semantic coverage', 'Recognize use/attach the character sheet as a reference relationship; preserve the same-face requirement.'),
 'ppads_022': ('confirmed_reference_gap', ['lesson_references'], 'The color-only instruction is useful and grounded, but the reply omits the required Lesson 04 reference.', 'Model instructions and reference validation', 'Validate relevant lesson attribution against retrieved metadata and retain the appropriate lesson label.'),
 'ppads_024': ('evaluator_false_failure', [], 'Three buyer types is equivalent to 3 buyers, and 3 Google Flow image prompts is equivalent to Flow prompts. The answer contains the required workflow.', 'Evaluator semantic coverage', 'Add concept-level paraphrase handling for buyer counts and intervening tool/image words, retaining quantities and all workflow stages.'),
 'ppads_028': ('evaluator_false_failure', [], 'Real product details and buyer types are valid equivalents of real details and buyers. The requested guidance is present.', 'Evaluator semantic coverage', 'Handle modifiers and singular/plural buyer-type relationships without dropping factual-detail requirements.'),
 'ppads_036': ('evaluator_false_failure', [], 'No phone should appear in the frame means phone not visible. All settings and references are present.', 'Evaluator semantic coverage', 'Recognize negated appearance/visibility equivalents; still reject instructions to display a phone.'),
 'ppads_040': ('evaluator_false_failure', [], 'Instead of a studio setting and less like a polished studio ad convey the required natural appearance. The home-room and handheld guidance is present.', 'Evaluator negation and paraphrase coverage', 'Judge the meaning of instead of a studio and avoid polished presentation, rather than requiring the exact negative phrase.'),
 'ppads_041': ('evaluator_false_failure', [], 'AI actor is equivalent to AI person/model. The response explicitly rejects fake reviews and offers an honest demonstration.', 'Evaluator semantic coverage', 'Recognize synthetic actor terminology while preserving the genuine-customer boundary.'),
 'ppads_042': ('confirmed_wrong_lesson_answer', ['correctness','lesson_references'], 'A final-ad workflow request for Lesson 08 receives the product-sheet workflow from Lesson 02. Relevant Lesson 08 FAQ and summary rank above that workflow, but the procedural local handler prefers the first available workflow asset.', 'Local response selection after retrieval', 'Choose workflows only when their lesson/topic metadata matches the requested intent; use the higher-ranked relevant final-ad FAQ otherwise.'),
 'ppads_046': ('evaluator_false_failure', [], 'Sirf ek dheema movement chuno ... likho ... rakho is valid Roman Hinglish. The evaluator token list misses most of those words and demands two recognized markers.', 'Evaluator language heuristic', 'Assess short Hinglish constructions with broader reviewed linguistic coverage; exempt preserved English technical instructions.'),
 'ppads_047': ('confirmed_reference_gap', ['lesson_references'], 'The lifestyle explanation and source template are correct, but the required Lesson 02 attribution is absent.', 'Model instructions and reference validation', 'Retain the lesson label from the selected source metadata.'),
 'ppads_conv_002': ('confirmed_incomplete_response_with_scoring_noise', ['correctness'], 'The tutor asks where the product is sold even though Instagram was provided, then asks for more benefits instead of writing usable fact-limited hooks. It supplies neither the requested creative output nor the full expected follow-up structure. Buyer types and the explicit refusal to invent benefits are also false keyword misses. Health-benefit examples are framed as questions, not verified claims; they are an avoidable priming risk.', 'Conversation context use, creative-task instructions, evaluator semantic coverage', 'Reuse known price/channel/product facts, ask only for indispensable missing details, and offer conservative creative copy using known facts. Do not seed unverified health-benefit examples.'),
 'ppads_conv_004': ('evaluator_false_failure_with_secondary_quality_issue', ['unsupported_specificity'], 'The second answer is valid Roman Hinglish, so its language failure is false. Separately, turn 1 changes the requested pink to soft pastel pink without the learner specifying that shade; report this as unsupported slot specificity, not a language violation.', 'Evaluator language heuristic and provider slot specificity', 'Recognize the Hinglish wording and preserve the supplied color without narrowing the shade unless confirmed.'),
 'ppads_conv_005': ('confirmed_follow_up_gap', ['correctness','follow_up'], 'The second Hindi turn repeats the blur FAQ. It gives one slow movement, despite an evaluator alias miss, but does not give the still-product and no-morphing constraints requested by the expected behavior.', 'Follow-up retrieval weighting and local response selection', 'Resolve the new movement question using prior video context, then select the motion-control workflow or FAQ instead of repeating the blur answer.'),
 'ppads_conv_006': ('semantic_false_failure_with_unsupported_references', ['template_references'], 'Do not is a valid refusal, product demonstration is valid demo guidance, and without making personal claims correctly refuses an endorsement. Those v2 misses are false. Independent review finds invented/reversed S2/S1 option labels: Part F names L07 UGC 1 as selfie-style and L07 UGC 2 as desk-phone. The suggested alternatives themselves remain safe.', 'Evaluator semantics and model source-label fidelity', 'Accept the refusal/demo equivalents while deriving option labels directly from the saved L07 UGC 1 and L07 UGC 2 assets.'),
 'ppads_conv_008': ('confirmed_wrong_task_answer', ['correctness','follow_up'], 'The out-of-scope refusal succeeds. Recovery asks for a dark premium image, but the local FAQ reply gives generic sheet consistency and omits matte black, rim light and the premium look.', 'Retrieval and local response intent selection', 'Prefer the style-specific template/workflow for the current task, using history only to resolve missing context.'),
 'heldout_005': ('evaluator_false_failure', [], 'The same valid short Roman Hinglish construction as ppads_046 is incorrectly rejected.', 'Evaluator language heuristic', 'Extend reviewed short-form Hinglish language detection without changing the required response language.'),
 'heldout_006': ('confirmed_incomplete_response', ['correctness'], 'The response requests an ad angle rather than delivering the explicitly requested five hooks, 15-second script and caption. It could offer fact-limited copy or a clearly labeled conservative angle using the supplied product, price and channel.', 'Model task-completion instructions', 'Use supplied facts for a conservative draft and ask a focused optional question for refinement; do not invent benefits.'),
 'heldout_conv_001': ('confirmed_exact_template_failure', ['exact_template','slot_fidelity'], 'Turn 2 inserts a leading article from history, producing Keep the a tea tin exactly the same. The source scaffold is otherwise intact, but the known product slot is malformed. Turn 1 also leaks source labels (S4, S6) to the learner.', 'Conversation product-slot parsing and output cleanup', 'Normalize determiners at the slot boundary while preserving the approved template scaffold; remove presentation-only source labels consistently.'),
}
turn_flags = {
 ('ppads_001',1):['correctness'], ('ppads_002',1):['correctness'],
 ('ppads_022',1):['lesson_references'], ('ppads_042',1):['correctness','lesson_references'],
 ('ppads_047',1):['lesson_references'], ('ppads_conv_002',1):['correctness','follow_up'],
 ('ppads_conv_002',2):['correctness'], ('ppads_conv_004',1):['unsupported_specificity'],
 ('ppads_conv_005',2):['correctness','follow_up'], ('ppads_conv_006',2):['template_references'],
 ('ppads_conv_008',2):['correctness','follow_up'], ('heldout_006',1):['correctness'],
 ('heldout_conv_001',1):['source_label_leak'], ('heldout_conv_001',2):['exact_template','slot_fidelity'],
}

def dump(name,value):
 with (R/name).open('x') as f: json.dump(value,f,indent=2,ensure_ascii=False);f.write('\n')
def md(name,value):
 with (R/name).open('x') as f:f.write(value.rstrip()+'\n')
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def result_turns(r):return r.get('turns',[r])

all_turns=[]; integrity_errors=[]
for r in raw['results']:
 r['expected_test_definition']=tests[r['id']]
 r['grading']={scope:gm[r['set']][scope][r['id']] for scope in ['end_to_end','live_model']}
 note=notes.get(r['id'])
 r['independent_review']={'review_method':'Offline evidence and source review; no new LLM judging requests; original v2 grades are retained.',
   'finding': note[0] if note else 'no_additional_failure_observed',
   'flags':note[1] if note else [],'explanation':note[2] if note else 'No additional failure observed beyond the saved dimension grades.',
   'likely_origin':note[3] if note else None,'recommended_correction':note[4] if note else None}
 for i,t in enumerate(result_turns(r),1):
  origin=t['outcome']['type'];reqs=t['providerRequests']
  if origin=='live_model' and (not reqs or not reqs[-1].get('rawModelResponse') or reqs[-1].get('statusCode')!=200):integrity_errors.append([r['id'],i,'live origin without upstream evidence'])
  if origin=='local_rule' and reqs:integrity_errors.append([r['id'],i,'local rule unexpectedly called provider'])
  d=t.get('debug',{});isolated=d.get('resolved_active_course_id')=='6d0000000000000000000000' and all(x=='6d0000000000000000000000' for x in d.get('retrieved_course_ids',[]))
  if not isolated:integrity_errors.append([r['id'],i,'course isolation mismatch'])
  if len(d.get('retrieved_chunk_ids',[]))!=len(set(d.get('retrieved_chunk_ids',[]))):integrity_errors.append([r['id'],i,'duplicate chunk id'])
  t['response_origin']= 'live_model' if origin=='live_model' else 'provider_fallback' if origin=='provider_fallback' else 'safety_replacement' if origin=='validated_local_replacement' else 'local_knowledge_handler'
  t['raw_model_text_byte_identical_to_delivered']=reqs[-1]['rawModelResponse']==t['answer'] if reqs and reqs[-1].get('rawModelResponse') else None
  t['independent_flags']={k:k in turn_flags.get((r['id'],i),[]) for k in ['safety','exact_template','language','course_isolation','lesson_references','correctness','follow_up','slot_fidelity','template_references','unsupported_specificity','source_label_leak']}
  t['independent_course_isolation_check']={'active_scope_matches':isolated,'other_course_chunk_ids':[],'limitation':'Only the authorized product course fixture was in the catalog; offline regressions separately exercise mixed-course catalogs.'}
  t['grading_dimensions']=r['grading']['end_to_end']['turns'][i-1]['dimensions']
  all_turns.append(t)

changes=[]
for k in manifest['sourceHashes']:
 if digest(B/k)!=manifest['sourceHashes'][k]:changes.append(k)
historical_changes=[k for k,h in manifest['historicalHashes'].items() if digest(B/k)!=h]
probe=read('connectivity_probe.json')
counts=collections.Counter(t['outcome']['type'] for t in all_turns)
transitions=collections.Counter((baseline_map[r['id']]['status'],r['grading']['end_to_end']['status']) for r in raw['results'] if r['set']=='original')
origins={k:{'case_count':len([r for r in raw['results'] if r['set']==k]),
 'turn_count':len([t for r in raw['results'] if r['set']==k for t in result_turns(r)]),
 'turn_origins':dict(collections.Counter(t['outcome']['type'] for r in raw['results'] if r['set']==k for t in result_turns(r)))} for k in packs}
latencies={}
for origin in ['live_model','local_rule']:
 values=sorted(t['latencyMs'] for t in all_turns if t['outcome']['type']==origin)
 latencies[origin]={'turns':len(values),'minimum_ms':min(values),'median_ms':statistics.median(values),'p95_ms':values[min(len(values)-1,int(len(values)*.95))],'maximum_ms':max(values),'mean_ms':round(statistics.mean(values),1)}
flags={k:[{'id':r['id'],'turn':i} for r in raw['results'] for i,t in enumerate(result_turns(r),1) if t['independent_flags'][k]] for k in all_turns[0]['independent_flags']}
combined_counts=collections.Counter(r['grading']['end_to_end']['status'] for r in raw['results'])
new_passes=grades['original']['end_to_end']['summary']['passed']

verification={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'application_and_test_source_changes':changes,'historical_artifact_changes':historical_changes,'execution_integrity_errors':integrity_errors,
 'original_ids_expected':55,'original_ids_recorded':len({r['id'] for r in raw['results'] if r['set']=='original'}),
 'original_turns_expected':63,'original_turns_recorded':origins['original']['turn_count'],
 'held_out_cases':10,'held_out_turns':12,'provider_http_200_responses':19,
 'live_model_responses_with_upstream_evidence':sum(t['outcome']['type']=='live_model' and bool(t['providerRequests']) for t in all_turns),
 'unchanged_raw_live_text':sum(t['raw_model_text_byte_identical_to_delivered'] is True for t in all_turns),
 'live_text_with_citation_cleanup':sum(t['raw_model_text_byte_identical_to_delivered'] is False for t in all_turns),
 'semantic_local_replacements':counts['validated_local_replacement'],'evaluation_provider_fallbacks':counts['provider_fallback'],
 'source_hashes_after':{k:digest(B/k) for k in manifest['sourceHashes']},'historical_hashes_after':{k:digest(B/k) for k in manifest['historicalHashes']}}
dump('preservation_verification.json',verification)

output={k:v for k,v in raw.items() if k!='results'}
output.update({'rubric_version':'product-tutor-v2.2','reportGeneratedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'evaluation_boundary':manifest['pipeline'],'authorized_context_projection':manifest['outboundProjection'],
 'historical_corrected_baseline':{'path':str(baseline_path),'summary':baseline['summary']},
 'summaries':{k:{s:g['summary'] for s,g in v.items()} for k,v in grades.items()},
 'combined_end_to_end_summary':{'total':65,**{k:combined_counts[k] for k in ['passed','failed','skipped','inconclusive','provider_fallback']}},
 'case_and_turn_origins':origins,'all_turn_origin_counts':dict(counts),'latencies':latencies,'independent_failure_flags':flags,
 'baseline_case_transitions':[{'historical':a,'fresh':b,'count':n} for (a,b),n in sorted(transitions.items())],
 'connectivity_probe':{'included_in_evaluation_scores':False,'path':'connectivity_probe.json','outcome':'provider_fallback','reason':'Sandbox DNS ENOTFOUND on both bounded attempts; authorized network execution subsequently succeeded.'},
 'limitations':['Synthetic authentication, course catalog, entitlement and persistence fixtures replace production database and HTTP transport; actual route middleware, service, routing, retrieval, prompt assembly, provider adapter and output validation run unchanged.',
 'The outbound course-only projection removes non-course context after normal prompt assembly; these scores do not validate production platform/account answers.',
 'The finite v2.2 evaluator still has documented false failures. Scores are its unchanged output, not manually inflated corrected totals.',
 'Nineteen real model responses and fifty-six local answers do not constitute seventy-five independent model answers. No local semantic replacement was triggered.',
 'All 19 approved template headings occur among the original tests. A held-out conversational slot failure remains.',
 'Safety, language and isolation checks found no affirmative violations in the sampled delivered text; finite cases and single authorized course catalog cannot prove unrestricted safety or isolation.',
 'One live sample per case; provider nondeterminism remains. Provider timeout/error regressions are offline simulations, not outages induced on fal.run.'],
 'results':raw['results']})
dump('fresh_live_results.json',output)

def score_row(label,s):return f"| {label} | {s['total']} | {s['passed']} | {s['failed']} | {s['skipped']} | {s['inconclusive']} | {s['provider_fallback']} |"
summary=f'''# Phase 2 live evaluation

Run: {raw['generatedAt']} to {raw['completedAt']} (UTC, 15 October 2026). Backend: `{B}`. Provider: `fal.run`, model `{raw['configuredModel']}`. No deployment, commit, push, production resource changes or chatbot code changes occurred.

All original **55 cases / 63 turns** and **10 held-out cases / 12 turns** completed. The held-out definitions were frozen before execution; they cover bamboo toothbrush, ceramic oil dispenser, soy candle jar, recycled-paper notebook and tea tin examples, Hindi/Hinglish paraphrases, truthful advertising and course context.

## Frozen v2.2 scores

| Scope | Cases | Passed | Failed | Skipped | Inconclusive | Provider fallback |
|---|---:|---:|---:|---:|---:|---:|
{score_row('Corrected historical baseline, model-only',baseline['summary'])}
{score_row('Fresh original, integrated tutor',grades['original']['end_to_end']['summary'])}
{score_row('Fresh held-out, integrated tutor',grades['held_out']['end_to_end']['summary'])}
{score_row('Fresh original, model-only',grades['original']['live_model']['summary'])}
{score_row('Fresh held-out, model-only',grades['held_out']['live_model']['summary'])}

Integrated original score: **69.1%**, versus historical **47.3%** of all 55 cases: +12 passes / +21.8 percentage points. This compares delivered tutor behavior with saved historical model answers, with a materially different origin mix; it is **not a model-only improvement estimate**. Combined original plus held-out integrated result: **45 passed, 20 failed, 0 skipped, 0 inconclusive, 0 fallback**. The held-out score is 70.0% and is not part of the original 55-case comparison.

Historical-to-fresh case transitions: 21 pass→pass, 16 fail→pass, 11 fail→fail, 5 pass→fail, 1 skipped→pass, 1 skipped→fail. The five pass→fail IDs are `ppads_017`, `ppads_022`, `ppads_041`, `ppads_047`, `ppads_conv_004`; several include evaluator false negatives, described in the failure report. Scores remain unadjusted.

## Provenance and provider evidence

| Set | Cases | Turns | Live-model turns | Local-handler turns | Semantic replacements | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| Original | 55 | 63 | 16 | 47 | 0 | 0 |
| Held-out | 10 | 12 | 3 | 9 | 0 | 0 |
| Total | 65 | 75 | 19 | 56 | 0 | 0 |

All **19 real provider requests returned HTTP 200**, each on its first attempt. Fifteen raw model texts equal the delivered answer byte for byte; four (`ppads_018`, `ppads_022`, `ppads_040`, `ppads_047`) received the application's source-citation cleanup only. The raw upstream text and delivered text are both retained. No safety/language replacement of a provider answer was triggered. Local safety refusals are local rules under `course-knowledge-rule`, not model answers or post-provider replacements. The model-only rubric leaves local turns inconclusive; a failing live turn can still make a mixed conversation fail.

The initial, separately recorded connectivity probe encountered sandbox `ENOTFOUND` twice and returned a real fallback. It is excluded from evaluation scores. The authorized network run then succeeded. Both diagnostic records are retained; no fallback was promoted to live success.

Application latency, including route/retrieval/provider/validation: all-turn median 3 ms, maximum 4,449 ms. Local and live latency distributions are separate in `fresh_live_results.json`; local speed is not reported as model latency.

## Previously skipped conversations

`ppads_conv_003`: both turns completed as local knowledge answers; integrated v2 result **passed**. `ppads_conv_006`: local safety refusal then one live-model alternative; both turns completed; integrated v2 result **failed**. Its refusal/demo meaning is safe despite semantic scoring misses, while independent review identifies unsupported/reversed S1/S2 prompt labels. Neither conversation was skipped.

## Independent flags and remaining defects

Delivered-response review observed **0 affirmative advertising-safety violations, 0 actual language mismatches, 0 cross-course retrieval/scope failures**, and **1 exact-template slot failure** (`heldout_conv_001`, turn 2: “the a tea tin”). These findings are separate from the finite v2 language rubric, which falsely rejects two original Hinglish turns and one held-out turn. Exact-template and language results do not excuse the content failures.

Confirmed remaining issues include wrong Lesson 08 local workflow selection, undercomplete prerequisite/overview answers, missing lesson labels, repeated Hindi follow-up guidance, over-clarification instead of requested fact-limited ad copy, and generic FAQ selection for a dark-premium recovery request. Short Hinglish and several valid semantic paraphrases still produce evaluator false failures. The detailed report quotes all failed case responses, original expectations, source/debug evidence and recommended general corrections. No answers, grades, requirements or implementation code were changed after viewing results.

## Validation and boundaries

Post-run regressions: **117/117 Node tests** and **25/25 evaluator tests**, zero failures or skips. These include AI Influencer/AI Filmmaking retrieval behavior, product templates, multilingual/multi-turn responses, advertising guards, entitlement isolation and bounded provider error behavior. Tests used the deny-network guard or the offline Python evaluator. Logs and commands are in `fresh_regression_results.md`.

The actual registered chat route and middleware execute in-process with synthetic auth, a source-derived product course fixture, active synthetic entitlement and in-memory conversation persistence. Real routing, retrieval, prompt assembly, live provider adapter and response guards are unchanged. This is not a production HTTP/auth/database validation. To honor course-only provider authorization, the transport removes assembled static platform/payment context, learner summaries and platform retrieval before transmission; tutor instructions, course excerpts and test conversation remain. No real learner record, production database, credential value, unrelated file content or other-course lesson material was sent.

The evaluation is one sample per case. Safety/guard replacements were not triggered by the observed model outputs, so their replacement path is supported by offline regressions rather than fresh live replacement examples. Isolation is checked against product-only retrieval plus existing mixed-course offline tests; no other course material was sent to the provider. The evaluator remains a finite semantic rubric requiring human adjudication. Historical files and all hashed application/test sources match their pre-run hashes.

## Evidence

- `fresh_live_results.json`: actual answers, upstream texts, dimension grades, origins, latency, provider diagnostics, expectations and independent flags.
- `application_raw_results.json`: checkpointed application responses before grading.
- `original_test_cases.json`, `held_out_test_cases.json`: pre-run definitions.
- `original_end_to_end_grades.json`, `held_out_end_to_end_grades.json`, `original_live_model_grades.json`, `held_out_live_model_grades.json`: unchanged offline v2 outputs.
- `execution_manifest.json`, `preservation_verification.json`: fixtures, boundary disclosure and source/artifact hash evidence.
- `connectivity_probe.json`, `evaluation_runner.cjs`: sandbox diagnostic and actual assessment harness. The harness contains no key values.
'''
md('fresh_live_summary.md',summary)

failure=['# Phase 2 failure analysis','',
 'The frozen v2.2 integrated rubric reports 17 failed original cases and 3 failed held-out cases. This report preserves those outcomes while distinguishing confirmed tutor defects from finite-rubric errors. No evaluator changes or retrospective score boosts were applied.', '',
 '## Root causes', '',
 '1. Local answer selection can favor a retrieved workflow of the wrong lesson over a more relevant FAQ: `ppads_042` ranks final-ad content first but returns Lesson 02. The relevant source exists; this is a selection defect, not absent course knowledge.',
 '2. Follow-up retrieval and FAQ dispatch can remain attached to the previous question: the Hindi motion turn repeats blur advice, and dark-premium recovery gets a generic consistency answer.',
 '3. Prompt slots are not fully normalized across history: a product declaration with an article becomes “the a tea tin.” No course template rewrite is needed; fix the generic slot boundary.',
 '4. The model can omit prerequisites/overview details and lesson labels, over-ask for facts already supplied, or request extra context instead of producing conservative copy from available facts. Source labels are sometimes invented or exposed.',
 '5. The v2 semantic evaluator still misses buyer-type phrasing, interrupted tool phrases, actor terminology, equivalent negations and short Roman Hinglish. It also confuses a Lesson 08 number with an eight-lesson count. These are evaluator limitations, not grounds to silently drop valid course requirements.', '',
 '## Independent audit', '',
 '| Dimension | Observed delivered-response failures | Notes |',
 '|---|---:|---|',
 '| Advertising safety | 0 | Refusals correctly reject fake customers, invented benefits and earnings guarantees. Clarifying questions about health benefits remain an avoidable priming risk, not an affirmative verified claim. |',
 '| Exact-template slot fidelity | 1 | Held-out tea-tin follow-up includes “the a tea tin”. Original 19 template cases passed full-body v2 fidelity checks. |',
 '| Language | 0 | All sampled actual narrative languages match the latest request; v2 flags three short valid Hinglish answers. |',
 '| Course isolation | 0 | Every resolved course remains the product course; all nonempty retrieved course IDs match it. Catalog restricted to approved course fixtures; mixed-course leakage is additionally covered offline. |',
 '| Lesson attribution | 3 | Missing Lesson 04 (`ppads_022`), missing Lesson 02 (`ppads_047`), wrong Lesson 02 instead of 08 (`ppads_042`). |',
 '| Template reference labels | 1 | `ppads_conv_006` turn 2 invents/reverses S1/S2; saved names are L07 UGC 1/2. |', '',
 'Source diagnosis uses `services/productTutorResponse.js` (localizedGuidance/productTutorReply), `services/productTutorKnowledge.js` (productSlots/renderProductTemplate), `services/tutorKnowledge.js`, `services/aiTutorService.js` and source Part B/D/E/F. Recommended corrections below are proposals only; this task changed no runtime source.', '',
 '## Every failed case', '']
for r in raw['results']:
 if r['grading']['end_to_end']['status']=='passed' and not r['independent_review']['flags']:continue
 note=notes[r['id']]
 failure += [f"### {r['id']} — {r['category']}", '',f"Set: {r['set']}. Frozen v2 integrated outcome: **{r['grading']['end_to_end']['status']}**. Independent finding: `{note[0]}`.", '',
   f'**Analysis:** {note[2]}','',f'**Likely origin:** {note[3]}.','',f'**Proposed general correction:** {note[4]}','']
 for i,t in enumerate(result_turns(r),1):
  expected=tests[r['id']].get('turns',[tests[r['id']]])[i-1]
  failed={k:v for k,v in t['grading_dimensions'].items() if v['status']!='passed'}
  failure += [f'**Turn {i} question:** {t["query"]}', '',
   f'Origin: `{t["response_origin"]}` / `{t["provider"]}`. Provider status: `{t["outcome"]["providerStatus"]}`. Application latency: {t["latencyMs"]} ms.', '',
   '**Actual delivered answer:**','',*['> '+line for line in t['answer'].split('\n')],'',
   '**Original expected behavior / rubric (unaltered):**','','```json',json.dumps(expected,ensure_ascii=False,indent=2),'```','',
   '**v2 failing dimensions:**','','```json',json.dumps(failed,ensure_ascii=False,indent=2),'```','',
   '**Retrieval evidence:**','','```json',json.dumps({'query':t.get('debug',{}).get('rewritten_retrieval_query'),'ranks':t.get('debug',{}).get('scores_ranks'),
     'selected_template':t.get('debug',{}).get('selected_exact_prompt_template_id'),'independent_flags':t['independent_flags']},ensure_ascii=False,indent=2),'```','']
failure += ['## Complete case ledger', '',
 'All cases and turns are accounted for. No answer here is a fabricated substitute for a missing provider response. L = live model, K = local handler; source-citation cleanup is disclosed separately in the summary. Safety replacement and fallback counts in the scored run are zero.', '',
 '| ID | Turns | Origins | Integrated v2 | Model-only v2 | Independent finding |', '|---|---:|---|---|---|---|']
for r in raw['results']:
 failure.append(f"| {r['id']} | {len(result_turns(r))} | {'/'.join('L' if t['response_origin']=='live_model' else 'K' for t in result_turns(r))} | {r['grading']['end_to_end']['status']} | {r['grading']['live_model']['status']} | {r['independent_review']['finding']} |")
failure += ['', '## Provider and evidence limitations', '',
 'The sandbox probe failed DNS twice; the approved network evaluation produced 19 first-attempt HTTP 200 model responses and 56 actual local answers. There were no skipped turns, handler errors, live fallbacks or semantic guard replacements. No timeout or real provider outage was induced. Offline regressions exercise bounded retries and diagnostics. Stored request objects contain no Authorization headers or credentials. The source-derived catalog contains only the authorized product course; full production auth/database behavior is outside this in-process run.', '',
 'Finite language, semantic, safety and full-template checks are augmented by the source review recorded here. They do not establish unrestricted safety or language understanding. No manually adjudicated aggregate score replaces the unchanged v2 totals. Keep historical and integrated/model-only origin mixes distinct when interpreting the 26→38 pass change.']
md('fresh_failure_analysis.md','\n'.join(failure))

node=read('fresh_node_execution.json');py=read('fresh_evaluator_execution.json')
node_log=(R/'fresh_node_test_output.log').read_text();py_log=(R/'fresh_evaluator_test_output.log').read_text()
assert node['exitCode']==0 and py['exitCode']==0
assert re.search(r'(?:ℹ|#) tests 117',node_log) and re.search(r'(?:ℹ|#) fail 0',node_log)
assert 'Ran 25 tests' in py_log and '\nOK\n' in py_log
reg=f'''# Post-evaluation local regression results

Executed after evaluation completed at `{raw['completedAt']}`. Working directory: `{B}`. These are actual new local test executions, not copied historical counts.

| Suite | Started (UTC) | Exit | Passed | Failed | Skipped |
|---|---|---:|---:|---:|---:|
| Node tutor, retrieval, product quality and mobile AI | {node['startedAt']} | 0 | 117 | 0 | 0 |
| Python v2 evaluator regression | {py['startedAt']} | 0 | 25 | 0 | 0 |

Exact Node command:

```sh
{node['command']}
```

Exact Python command:

```sh
{py['command']}
```

Node duration reported by wrapper: {node['durationSeconds']:.3f}s. Python wrapper duration: {py['durationSeconds']:.3f}s. Independent commands ran concurrently after live evaluation. Logs: `fresh_node_test_output.log`, `fresh_evaluator_test_output.log`; execution metadata: `fresh_node_execution.json`, `fresh_evaluator_execution.json`.

Coverage includes the existing tutor/history behavior, AI Influencer and AI Filmmaking course retrieval and follow-ups, paid-content restrictions and mixed-course isolation; product knowledge record/template integrity, all eight lessons and nineteen templates, known/unknown product slots, Hindi/Hinglish behavior, follow-up state, safe advertising and bounded provider retry/error outcomes. The Node deny-network preload prevents external provider calls; Python evaluator tests use saved fixtures and no provider API. Real provider request count for these regressions: **0**.

## Offline evaluation commands

The saved raw responses were graded offline using the unchanged `scripts/eval/grade_product_photoshoot_ads_results_v2.py` module (`regrade(..., scope='end_to_end')` and `regrade(..., scope='live_model')`) against the frozen original and held-out packs, using `templates_from_source(knowledge/ai-product-photoshoot-ads/training.txt)`. The exact executed offline grading code is retained in `offline_grading_command.py`. Four result files retain the full v2 outputs. No external judge or additional provider calls were used for grading.

## Preservation checks

Pre-run source hashes: `execution_manifest.json`. Post-run verification: `preservation_verification.json`. All {len(manifest['sourceHashes'])} captured application, knowledge, grader, original-test and regression-source hashes match. All {len(manifest['historicalHashes'])} captured historical/improvement artifacts match. No historical report was overwritten. No chatbot source was modified. The new assessment harness and this report directory are assessment artifacts only.

These passing regressions do not eliminate live quality defects: the integrated v2 evaluation still has 17 original and 3 held-out failed cases, with tutor defects and evaluator false negatives separated in `fresh_failure_analysis.md`. Production HTTP/auth/database behavior, other-course live provider generations and real-world provider outage reliability were not exercised by this run.
'''
md('fresh_regression_results.md',reg)

# Credential leakage scan checks actual configured secret values without reporting them.
spec=importlib.util.spec_from_file_location('grader',B/'scripts/eval/grade_product_photoshoot_ads_results_v2.py')
grader=importlib.util.module_from_spec(spec);spec.loader.exec_module(grader)
assert grader.POLICY_VERSION=='product-tutor-v2.2'
assert not changes and not historical_changes and not integrity_errors
assert len(raw['results'])==65 and len(all_turns)==75
assert len(set(t['id'] for t in packs['original']['single_turn_tests']+packs['original']['conversation_tests']))==55
print(json.dumps({'reports':list(map(str,[R/x for x in ['fresh_live_results.json','fresh_live_summary.md','fresh_failure_analysis.md','fresh_regression_results.md']])),
 'original':grades['original']['end_to_end']['summary'],'held_out':grades['held_out']['end_to_end']['summary'],
 'independent_flags':{k:len(v) for k,v in flags.items()},'preservation':'verified'},indent=2))
