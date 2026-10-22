import collections
import csv
import hashlib
import json
from pathlib import Path
from audit_notes import NOTES, AMBIG, POLICY

E=Path(__file__).resolve().parent
R=E.parent
load=lambda p:json.loads(p.read_text())
cases=load(E/'all_case_audit_inputs.json')
diagnostics=load(E/'offline_diagnostics.json')
diag={(r['id'],r['turn']):r for r in diagnostics['rows']}

def ref(file, function, start, end):
    return {'file':'edunex-b/'+file,'function':function,'startLine':start,'endLine':end,
            'snapshot':'evidence/source/edunex-b/'+file}

groups={
'RC1':dict(title='Platform/account intent collisions before course handling',status='CONFIRMED',
 explanation='Account and billing matchers bind unrelated words across the whole message. My/mera plus paid/order can mean paid prompts or work order; bare plan can mean a video plan. The route accepts these replies before buildContext, so product intent, retrieval and product validation never run. Hindi private/platform replies also collapse into a two-language formatter.',
 source=[ref('services/aiTutorService.js','isSkillomatePlanQuestion / skillomatePlatformDirectReply',313,404),ref('services/aiTutorService.js','isLearnerContextQuestion / learnerContextDirectReply',713,777),ref('routes/ai.js','handleTutorChat early reply selection',248,267)],
 correction='Require an affirmative account/platform action with correctly bound referents; distinguish plan-the-ad from subscription-plan and work-order from payment-order. Resolve authorized product-course context before selecting overlapping course intents. Preserve actual personal-payment/profile requests and safe masked replies. Start with product-course-scoped disambiguation at the call site rather than changing unrelated course behavior.',
 risks='Global matchers serve other courses and account requests. Avoid a blanket product-word exemption that suppresses genuine billing questions. Never let a client course ID become authorization. Extra context resolution may add local DB reads.',
 tests='Paired account-vs-item-name, paid-template-vs-my-payment, ad-plan-vs-plan-price, workflow-order-vs-my-order, quoted paid-comment, inactive restoration, Hindi restriction, unrelated-course platform controls.',
 improvement='Remove demonstrated unrelated pricing/profile answers and complete legitimate access guidance. No numeric score forecast.',
 verification='Offline actual route with synthetic users; assert selected route, reply contract, no unexpected provider call, masked own-user data only and no protected material for inactive users.'),
'RC2':dict(title='Fragmented task intent and overconfident local guidance selection',status='CONFIRMED',
 explanation='Copy recognition depends on a small vocabulary and often requires prompt/template/text/body in addition to a named asset. Source/full/reproduce/paste/Hindi variants are missed. Conversely How do + prompts can look like imperative do; negated generation and Hinglish original generation are not consistently scoped. requestedProductOutputs confuses camera angle with advertising angle and misses scene/dialogue/buyer-brief verbs. A topic plus any available guidance is treated as enough for a local response; workflow+decision is not handled as a required compound task.',
 source=[ref('services/productTutorIntent.js','productCopyIntent / productIntentSignals / productResponseSelection',2,38),ref('services/productTutorKnowledge.js','wantsProductPrompt / wantsProductScene',80,98),ref('services/productTutorKnowledge.js','requestedProductOutputs / productRequestContext',196,332),ref('services/productTutorResponse.js','productTutorReply / selectProductGuidance',54,159),ref('services/tutorKnowledge.js','retrieveKnowledge ranking and selection',250,308)],
 correction='Build one transient request plan: copy-approved, explain, generate, troubleshoot, clarify or platform/account, with target asset, required parts, counts, negation and confidence. A complete affirmative request naming an approved asset can copy without magic words. Choose local guidance only when it answers every requested part. Keep course facts in approved references; route unsupported synthesis to provider or a truthful unavailable answer. Resolve named assets from the authorized same-course set, never an unrestricted global asset registry.',
 risks='Too many requests could shift to the provider, increasing cost/latency; too broad copy recognition can suppress education. Preserve negative controls, access gates and immutable source bodies. Do not fix this by hardcoding case questions or adding every symptom as a new exception.',
 tests='All 19 assets with fresh copy paraphrases; retain-placeholders vs fill; exact vs meaning vs original scene; negated hooks; angle-of-camera vs ad-angle; buyer brief vs process; decision plus workflow; labels as data vs real blur; aspect-ratio vs lettering; final arrangement vs motion.',
 improvement='Correct executed routing errors with the approved knowledge already available. All 19 failed exact cases contain their requested asset in retrieval; a retrieval-engine replacement is not justified by those cases.',
 verification='Offline plan/route assertions independent of implementation regexes; actual route tests for deterministic completion and zero unauthorized retrieval; live testing only for the synthesis branch.'),
'RC3':dict(title='Entity boundaries, naming syntax and incomplete attribute extraction',status='CONFIRMED',
 explanation='Two overlapping extractors recognize only selected declaration forms. Broad for/of/for-my fallbacks promote request prose or a presenter into a product. Quote-first, curly-quoted called names, Name:, named, bracket assignments and multilingual constructions are missed. Attributes mostly require colour/material/features is/are/: syntax; natural facts and negative constraints are not represented. Price scanning can consume a trailing comma. Missing extraction is not evidence that accents were normalized away.',
 source=[ref('services/productTutorState.js','entity / extractEntity / productOperations / extraSlots',19,92),ref('services/productTutorKnowledge.js','cleanProductName / productSlots',129,179),ref('services/productTutorKnowledge.js','productFacts',218,264)],
 correction='Use one conservative declaration/assignment parser with evidence spans. Separate exact display name, object description and supplied facts; prefer explicit name/slot declarations over referring phrases. Never promote arbitrary request prepositions or an actor into identity. Preserve original Unicode; use the existing separate NFKC security view for every naming path and reject unsafe names. Canonicalize numeric prices independently of punctuation and retain explicit negative facts. Keep an adapter to existing productContext fields; no persistence redesign or migration is needed for the first correction.',
 risks='Over-extraction can turn instructions into facts; under-extraction must ask a focused clarification. Preserve NFKC, bidi/default-ignorable and mixed-script checks; do not simply strip unsafe substrings. Distinguish delimiting quotes from legitimate internal punctuation.',
 tests='Independent English/Hindi/Hinglish declarations, arbitrary accented/decomposed/Indic names, curly quotes, slash/apostrophe names, unnamed described objects, multiple-product ambiguity, actor clauses, request prose, negative features and numeric price separators; unsafe compatibility/mixed-script names at initial and switched turns.',
 improvement='Prevent phantom identities and unnecessary requests for facts already supplied; preserve useful explicit attributes without inventing them.',
 verification='Offline parser/reducer diagnostics using independently declared facts and evidence spans, plus actual-route generation contract tests; do not use runtime extraction as the test oracle.'),
'RC4':dict(title='Template copy/fill contract lacks a complete per-asset slot schema',status='CONFIRMED',
 explanation='renderProductTemplate handles only PRODUCT, man/woman, recolour part and new colour. Source assets also contain woman/man, possessives, clothing, dialogue, brief details, price, channel and number slots. Explicit user assignments are not parsed. productTutorReply applies guessed/context slots even when the user says retain brackets, and its unresolved check only knows four slot categories. This is rendering/selection, not modified knowledge files.',
 source=[ref('services/productTutorKnowledge.js','productSlots / renderProductTemplate',141,188),ref('services/productTutorResponse.js','productTutorReply exact rendering and unresolved fields',143,159),ref('services/aiTutorService.js','aiProductPhotoshootKnowledgeGuard',439,449)],
 correction='Derive an allowlisted slot schema from each approved asset and represent raw-copy versus fill-copy explicitly. Parse bounded explicit assignments and use only user-supplied values for recognized slots. Preserve all brackets in raw mode and leave only genuinely unknown fields in fill mode. Render by literal span substitution; verify that every other source byte/word is unchanged. Align provider instructions with the same supported slot contract. Do not rewrite approved asset bodies.',
 risks='Gender/pronoun or clothing guesses could invent facts. Generic replacement could interpret dollar/backslash content or instructions. Every lookup must require verified owner and entitlement; a direct asset helper must not reopen the fixed global-registry bypass.',
 tests='Every placeholder from all 19 assets, both pronoun orderings, prices/channels/number/dialogue/clothing, unknown and explicitly preserved slots, Unicode and replacement metacharacters, body-diff checks allowing only declared changes, unauthorized/other-course template denial.',
 improvement='Eliminate confirmed unresolved-known-slot and invented-substitution failures; preserve approved wording. No future fidelity percentage is asserted.',
 verification='Offline exact full-body oracle from immutable source plus explicit substitutions; inspect all executable blocks and negative unknown-slot controls separately from semantic generation.'),
'RC5':dict(title='State changes depend on successful narrow identity recognition',status='CONFIRMED',
 explanation='Replacement operations cover limited product-to/with forms. Forget X; New product:, replace it completely, renames and natural corrections can leave the old identity. productFacts clears old bound facts only after a different identity is recognized, while new price is applied independently. Version-2 state suppresses history reparsing, so missed initial facts remain missing. This explains the old-coaster/new-price hybrid and unsupported follow-ups; it does not establish cross-user leakage.',
 source=[ref('services/productTutorState.js','productOperations / scopeProductState',49,96),ref('services/productTutorKnowledge.js','productFacts state update loop',218,264),ref('services/aiTutorService.js','resolveProductHistory / resolveConversationState',294,298),ref('services/aiTutorService.js','resolveConversationState',530,555),ref('routes/ai.js','loadTutorState / persistTutorChat',54,93)],
 correction='Reduce typed declare, replace, correct, rename, recolour and reset operations atomically. Explicit new-product intent with unresolved identity must invalidate the obsolete product and ask, not attach new price/material to it. Field corrections replace the affected fact and preserve only deliberate task context. Keep schema-v2 non-resurrection, user/course/conversation filtering and existing API/persistence. Decide legacy missing-conversation-ID semantics explicitly before changing them.',
 risks='Over-clearing loses deliberate inherited facts; under-clearing retains old price/material. Same-product rename differs from replacement. Do not reparse all assistant history or redesign the one-session-per-user/course storage to mask extraction defects.',
 tests='Seed a known recognized product, verify its stored facts, then replace/correct in three languages; old price/material absent, deliberate actor-free task retained; renamed same object; conflicting correction; unknown new name; switch with malicious name; explicit reset, changed conversation and missing-ID legacy behavior; interleaved users and courses.',
 improvement='Prevent confirmed stale identity and mixed old/new facts; make follow-ups reliable after accurate initial capture.',
 verification='Offline reducer and actual multi-turn route tests with before/after state plus provider-payload inspection. Require nonvacuous initial-state assertions and real schema validation before any live evaluation.'),
'RC6':dict(title='Inconsistent language, count and per-deliverable parsing',status='CONFIRMED',
 explanation='Product and generic language functions use different patterns; a Devanagari product name can set explanation language to Hindi. English please, language English kar do and short Hindi line are not consistently recognized. localizedReply and learnerContextDirectReply only have English-versus-Roman-Hinglish output branches even for detected Hindi. Hook count defaults to five when Hindi modifier sequences are unrecognized. There is no located translation/extraction service; localization is source translations plus regex tags.',
 source=[ref('services/productTutorIntent.js','productResponseLanguage',41,51),ref('services/aiTutorService.js','latestMessageLanguage / explicitLanguagePreference / localizedReply',564,598),ref('services/aiTutorService.js','learnerContextDirectReply locale branches',739,776),ref('services/productTutorTasks.js','requestedHookCount / draftProductAd',48,52),ref('services/productTutorKnowledge.js','requestedProductOutputs',196,215)],
 correction='Use one language decision for explanation after masking only validated identity spans; explicit latest preference wins. Represent separate languages for explanation, source body and dialogue. Parse counts and action morphology consistently in English, Hindi and Hinglish with no silent default when an explicit count is uncertain. Preserve original Unicode identities; keep exact approved bodies in source language.',
 risks='Changing generic localization affects other courses and account replies. Preserve currently passing language switches, quoted source and proper-name exceptions. Do not use NFKC as output normalization.',
 tests='English requests with Indic names; English please and English kar do; Hindi platform restriction; Hinglish explanation plus Hindi dialogue; varied Hindi modifiers/counts; source-English template with Hindi instructions; legitimate and unsafe Unicode name controls.',
 improvement='Correct observed wrong-language output and five-instead-of-two hooks while keeping safe original-script names.',
 verification='Offline expected-language/count assertions independent of parser output; semantic assessment of live multi-part generation only after provider approval.'),
'RC7':dict(title='Local responses bypass the completion/language validation path',status='CONFIRMED',
 explanation='validateProductReply is invoked only after successful provider generation. Local templates, drafts, safety alternatives and FAQs return before that path. A relevant translation can therefore stand in for a requested artifact, missing count, reference, scene or decision. Existing missingProductDeliverables covers selected outputs, not complete scene/comparison/decision contracts. Copy repair also reuses the same faulty parser/renderer, so it is not an independent fidelity oracle.',
 source=[ref('routes/ai.js','handleTutorChat local versus provider branches',266,320),ref('services/productTutorResponse.js','productTutorReply / validateProductReply',98,223),ref('services/productTutorTasks.js','draftProductAd / missingProductDeliverables',55,144),ref('services/productTutorResponse.js','selectProductGuidance / localizedGuidance',54,95)],
 correction='Apply a bounded shared task-completion contract to every response origin before persistence. Validate required outputs/counts, approved-body fidelity and current facts; distinguish explanation from generation. If local capability cannot fulfill it, route to authorized inference or report honest partial/unavailable status. Keep security rejection terminal; do not force a benign deliverable through a blocked malicious request. Avoid recursive repair loops and a large set of new FAQ-specific rules.',
 risks='A validator using the same wrong parser can approve wrong output; an overly strict validator can reject valid paraphrases or require unnecessary name repetition. Preserve safe refusals and cap repair time/cost.',
 tests='Valid complete local guidance stays unchanged; incomplete local captions/scenes/decisions are not accepted; unknown product clarification only when genuinely missing; alternative grounded to actual product; strict immutable-template checks; semantic equivalent educational answers and safety rejection negative controls.',
 improvement='Stop relevant-but-incomplete local text from being labeled a completed task. Provider quality remains separately untested.',
 verification='Offline origin-independent contracts, actual-route traces, no additional unapproved provider calls. Later measure live response completion, repair and fallback separately.'),
'RC8':dict(title='Intentional provider denial is flattened into retryable connection error',status='CONFIRMED OBSERVATION; NOT A LIVE PROVIDER FAILURE',
 explanation='57 unique provider turns each throw PROVIDER_PAYLOAD_NOT_APPROVED in the evaluation guard before transport. errorCode maps the unrecognized code to connection_error and requestTutorProvider retries once. Thus 57 x 2 = 114 blocked adapter attempts, not 114 transmitted requests. The catch path returns saved guidance and an unavailable notice; it cannot establish generated-answer correctness.',
 source=[ref('services/tutorProvider.js','errorCode / requestTutorProvider',5,49),ref('services/aiTutorService.js','callFalOpenRouter',1249,1274),ref('routes/ai.js','provider exception and fallback / outcome',298,331)],
 correction='Future harness/accounting should distinguish intentional policy denial, transport failure, provider rejection, generation and final answer origin. Make deliberate local policy denial nonretryable at its typed boundary without disabling legitimate transient retries. Preserve unavailable/untested semantics and never inject fixtures as live model replies. Preserve old frozen artifacts and evaluator.',
 risks='Changing retry classification can mask real DNS/upstream failures; changing outcome fields can break clients. Prefer additive diagnostics and keep existing response keys. The source also marks provider-generated local replacements non-live; later accounting must retain provider invocation separately.',
 tests='Local policy-denial control has no wire call; transient/429/5xx retry bounds unchanged; empty/invalid response, timeout, max attempts and shared repair budget; correct origin when provider succeeds then local validation replaces output.',
 improvement='Accurate unavailable accounting and less needless waiting; no justified accuracy improvement or live-provider performance conclusion.',
 verification='Offline injected transport unit tests only; controlled authorized real calls for latency, usage, finish reasons and repair quality.'),
'RC9':dict(title='Question/rubric alignment and harness coverage limits',status='EVALUATION LIMITATION',
 explanation='Seven case failures need semantic completeness adjudication; one conflicts with the existing strict leakage rejection policy. Optional May wording was scored as mandatory, and some correct source explanations fail for omitted unstated sentences or repeated names. The synthetic VM uses memory models, two published courses, one unknown selector, global subscriptions and a subset of environment fields; it is not production DB/config behavior. Shared filesystem isolation was instructional, not OS-enforced. None of the confirmed local responses was shown to be caused by a VM artifact.',
 source=[ref('services/aiCompliance.js','checkAiInput / PROMPT_LEAKAGE_PATTERN',7,27),ref('services/productTutorResponse.js','localizedGuidance',66,95)],
 correction='Retain all original grades and frozen criteria. Store this source-aware audit separately. Resolve these eight questions with explicit product/security policy and a human semantic adjudicator before future scoring; define completeness relative to the actual user request. Future harness should add purchase-only/trial, explicit cross-course multi-turn and schema-validating fixtures, and stronger author isolation where available.',
 risks='Post-hoc regrading could inflate results; changing tests to mirror implementation would hide defects. Do not recalculate blind accuracy from this audit or automatically convert disputed failures to passes.',
 tests='Independent semantic-equivalence examples, mandatory-versus-optional criteria, safe hard refusal, no forced name repetition for generic education; fixture parity and nonvacuous state seeding; freeze future rubric before execution.',
 improvement='More defensible validity claims; the original 18/67/35 remains unchanged.',
 verification='Human-reviewed rubric examples, frozen new protocol and transparent per-case rationale; no current evaluator or question-set edits.'),
'RC10':dict(title='Course isolation and entitlement guards must remain intact',status='NO NEW CONFIRMED SECURITY DEFECT',
 explanation='The archive records 153 ownership/payload inspections, 735 protected source references, 57 validated payloads and no critical finding. Source uses authenticated identity, unique server course resolution, subscription/purchase checks, owner-scoped retrieval, protected-text assertions and pre-provider validation. Global-course active subscriptions and sparse course-switch fixtures limit coverage. Full-body matching is defense in depth, not proof against every partial/transformed leakage path.',
 source=[ref('middleware/compatAuth.js','authenticateCompatible / requireCompatibleAuth',78,129),ref('services/aiTutorService.js','buildContext authoritative scope and entitlement',962,1047),ref('services/tutorKnowledge.js','sameCourse / assertKnowledgeScope / scopeConversationHistory',112,166),ref('services/tutorKnowledge.js','retrieveKnowledge owner/materialAccess',217,247),ref('services/aiTutorService.js','scopedProviderPayload',1244,1246),ref('services/courseAccess.js','activeCourseEntitlement',1,15)],
 correction='No security relaxation is proposed. Treat ownership, entitlement and Unicode security as invariants for every planned correction. Reuse verified capabilities in any direct exact-asset path; fail closed on ambiguity. Add missing entitlement and explicit cross-course transition coverage before making a release-compliance claim.',
 risks='A direct global template lookup or relaxed safety rule can reopen the corrected vulnerability. Synthetic passing boundaries do not establish production readiness.',
 tests='Known critical isolation regressions, unauthorized/expired/trial/purchase-only/forged selectors, missing scope, user and course changes, protected-template assembly, malicious names across turns, payload absence assertions and partial-fragment controls.',
 improvement='Preserve the reviewed security correction while improving reliability; no new security score is asserted.',
 verification='Offline actual route and provider-payload inspection first; stop on any confirmed security violation; only approved non-production inference later.')}

audit=[]
for c in cases:
    if c['originalGrade']['status']!='FAIL':continue
    key=c['id'].removeprefix('FRESH-'); codes,note=NOTES[key]; codes=codes.split()
    verdict='GRADING_AMBIGUITY' if key in AMBIG else 'SECURITY_POLICY_EXPECTATION_CONFLICT' if key in POLICY else 'CONFIRMED_DETERMINISTIC_DEFECT'
    failed=[t for t in c['turns'] if t['grade']['status']=='FAIL']
    supporting=[]
    for t in failed:
        d=diag[(c['id'],t['index'])]
        ctx=t['contexts'][0].get('result',{}) if t['contexts'] else {}
        supporting.append({'turn':t['index'],'userRequest':t['request']['message'],'expected':t['request']['expected'],
                           'actualAnswer':t['response'].get('answer'),'providerLabel':t['response'].get('provider'),
                           'outcome':t['response'].get('outcome'),'blockedAttemptsOnFailedTurn':len(t['providerRequests']),
                           'originalFailedCriteria':[x for x in t['grade']['criteria'] if x['status']=='FAIL'],
                           'requestContext':ctx.get('requestContext'),'productContext':ctx.get('productContext'),
                           'nativeHelperReplayMatchesRecorded':d['replayMatchesRecordedReply'],
                           'earlyMatchers':{k:d[k] for k in ['globalLearnerMatcher','globalPlanMatcher']},
                           'requestedAsset':t['request']['expected'].get('exactTemplate'),
                           'requestedAssetPresentInRetrievedRecords': any(r.get('heading')==t['request']['expected'].get('exactTemplate') for r in ctx.get('records',[])) if t['request']['expected'].get('exactTemplate') else None,
                           'traceInOriginalArchive':f'Skillomate_Chatbot_Fresh_Blind_Evaluation/evidence/traces/{c["id"]}.json',
                           'gradeInOriginalArchive':f'Skillomate_Chatbot_Fresh_Blind_Evaluation/evidence/isolated_grader/{c["id"]}_turn_{t["index"]}_grade.json'})
    audit.append({'id':c['id'],'category':c['category'],'originalStatus':'FAIL','auditClassification':verdict,
                  'confirmedApplicationDefect':verdict=='CONFIRMED_DETERMINISTIC_DEFECT','rootCauseGroups':codes,
                  'assessment':note,'sourceEvidence':[r for code in codes for r in groups[code]['source']],
                  'providerDependentOtherTurns':[t['index'] for t in c['turns'] if t['providerRequests']],
                  'providerLimitation':'No failed turn invoked the adapter. Earlier unavailable inference is not evidence of failed live generation and is retained separately.',
                  'harnessAttribution':'No observed harness-caused mismatch established. Pure local reply reproduced outside VM where applicable; synthetic DB/config coverage remains limited.',
                  'supportingEvidence':supporting,
                  'disposition':'Target generic source corrections and regression tests; no claim of a fix.' if verdict=='CONFIRMED_DETERMINISTIC_DEFECT' else 'Human/product-policy adjudication required; do not alter original frozen grade or count as a confirmed defect.'})
assert len(audit)==67
counts=dict(collections.Counter(a['auditClassification'] for a in audit))
summary={'originalBlindCounts':{'PASS':18,'FAIL':67,'UNTESTED':35},'originalScoreUnchanged':True,
         'auditOf67FailedCases':counts,'failedTurns':70,'failedTurnsWithProviderAttempt':0,
         'productRuleResponsesReproduced':63,'productRuleReplayMatches':63,
         'soleProviderOrHarnessCauseEstablishedAmong67':0,
         'failedCasesWithOtherBlockedTurns':[a['id'] for a in audit if a['providerDependentOtherTurns']],
         'ambiguousCases':[a['id'] for a in audit if a['auditClassification']=='GRADING_AMBIGUITY'],
         'policyConflictCases':[a['id'] for a in audit if a['auditClassification']=='SECURITY_POLICY_EXPECTATION_CONFLICT'],
         'failedExactCasesWithCorrectAssetPresent':sum(a['category']=='exact_template' and all(s['requestedAssetPresentInRetrievedRecords'] for s in a['supportingEvidence']) for a in audit),
         'rootGroupCaseAssociations':dict(collections.Counter(code for a in audit for code in a['rootCauseGroups'])),
         'noNewAccuracyMeasurement':True,'newExternalRequests':0,'implementationChanged':False}
(E/'failed_case_classifications.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
(E/'root_cause_groups.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2))
(E/'audit_summary.json').write_text(json.dumps(summary,indent=2))
with (E/'failed_case_classifications.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=['id','category','originalStatus','auditClassification','confirmedApplicationDefect','rootCauseGroups','providerDependentOtherTurns','assessment']);w.writeheader()
    for a in audit:w.writerow({k:','.join(map(str,a[k])) if isinstance(a[k],list) else a[k] for k in w.fieldnames})

lines=['# All 67 failed-case classifications','',
       'This is a source-aware diagnostic audit, not a new blind evaluation or a replacement score. The original 18 PASS / 67 FAIL / 35 UNTESTED remains immutable. 59 cases support a local application defect; seven require grading adjudication; one conflicts with the existing security policy. A disputed case is not automatically a PASS. No failed turn attempted inference; eight failed scenarios also contain earlier blocked turns.','',
       '| Case | Audit classification | Groups | Other blocked turns |','|---|---|---|---|']
for a in audit:lines.append(f'| {a["id"]} | {a["auditClassification"]} | {", ".join(a["rootCauseGroups"])} | {a["providerDependentOtherTurns"]} |')
for a in audit:
    lines += ['',f'## {a["id"]}','','Original grade: FAIL. Audit: **'+a['auditClassification']+'**.','',a['assessment'],'',a['providerLimitation'],'',a['harnessAttribution']]
    for t in a['supportingEvidence']:
        lines += ['',f'### Failed turn {t["turn"]}','','Learner request: '+t['userRequest'],'','Frozen expected behavior:']
        lines += ['- '+s for s in t['expected']['essentialCriteria']]
        if 'expectedBody' in t['expected']:lines+=['','The complete literal expected body and explicit substitutions are preserved in the machine-readable classification and original frozen case.']
        lines += ['','Actual response:','','```text',t['actualAnswer'] or '(no answer)','```','',
                  f'Origin: `{t["providerLabel"]}`; failed-turn adapter attempts: {t["blockedAttemptsOnFailedTurn"]}; native helper reply equality: {t["nativeHelperReplayMatchesRecorded"]}.',
                  '',f'Raw trace inside the included input ZIP: `{t["traceInOriginalArchive"]}`; grading evidence: `{t["gradeInOriginalArchive"]}`.']
    lines+=['','Source references:']
    for r in a['sourceEvidence']:lines.append(f'- `{r["file"]}:{r["startLine"]}–{r["endLine"]}` — `{r["function"]}`. Exact source snapshot: `{r["snapshot"]}`.')
    lines+=['',a['disposition']]
R.joinpath('02_All_67_Failed_Case_Classifications.md').write_text('\n'.join(lines)+'\n')
lines=['# Root-cause groups','', 'Case associations overlap and must not be added to obtain a defect total. RC1–RC7 are confirmed local mechanisms; RC8 is confirmed denial/accounting behavior, RC9 is an evaluation limitation, and RC10 records preserved security rather than a new defect.','']
for id,g in groups.items():
    lines += [f'## {id} — {g["title"]}','','Status: '+g['status']+'.','',g['explanation'],'','Source:']
    lines += [f'- `{r["file"]}:{r["startLine"]}–{r["endLine"]}` — {r["function"]}.' for r in g['source']]
    for label,key in [('Smallest coherent correction','correction'),('Risks and dependencies','risks'),('Regression tests','tests'),('Expected improvement','improvement'),('Verification','verification')]:lines += ['',label+': '+g[key]]
    lines += ['', 'Associated failed cases: '+', '.join(a['id'] for a in audit if id in a['rootCauseGroups'])+'.','']
R.joinpath('04_Root_Cause_Groups_And_Corrections.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(summary,indent=2))
