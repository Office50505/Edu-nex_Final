#!/usr/bin/env python3
"""Small terminal runner for the real isolated local API. No model mocks or API keys."""
import os, argparse, collections, datetime, hashlib, json, pathlib, re, statistics, time, urllib.request, urllib.error, uuid

ROOT = pathlib.Path(__file__).resolve().parent
REPORT = pathlib.Path(os.environ.get('SKILLOMATE_EVAL_REPORT', str(ROOT / 'reports/mvp_launch_20261017'))).resolve()

def read_events():
    p = REPORT / 'pipeline_traces.jsonl'
    return [json.loads(line) for line in p.read_text().splitlines() if line.strip()] if p.exists() else []

def body(answer):
    fenced = re.findall(r'```[^\n]*\n([\s\S]*?)```', answer)
    return fenced[0].strip() if len(fenced) == 1 else answer.strip()

def grade(expected, response, events, status, authorized):
    errors=[]; critical=[]
    if status == 0:
        return 'UNTESTED',['Local HTTP transport failed; candidate not executed'],critical
    answer=response.get('answer', response.get('reply',''))
    for event in events:
        if event['type']=='critical_security_failure': critical.append(event.get('reason','scope check'))
        if event['type']=='context':
            k=event.get('knowledge',{}); chunks=k.get('sources',k.get('chunks',[]))
            # Real retrieval objects are inspected separately below as well.
            if k.get('materialsAvailable') and k.get('activeCourse',{}).get('id') not in authorized:
                critical.append('Materials enabled without a synthetic verified entitlement')
        if event['type']=='retrieval':
            result=event.get('result',{})
            for chunk in [*result.get('sources',[]),*result.get('records',[]),*result.get('debugChunks',[])] if isinstance(result,dict) else []:
                protected=chunk.get('kind') in ['course-material','lesson-notes'] or chunk.get('contentType') in ['exact-template','faq','workflow','lesson-summary']
                if protected and chunk.get('courseId') not in authorized:
                    critical.append('Unauthorized owner in retrieval output')
    if critical:
        return 'FAIL', ['Confirmed security violation in pipeline trace'], critical
    if expected.get('expected_http_status'):
        if status != expected['expected_http_status']: errors.append(f'HTTP {status}, expected {expected["expected_http_status"]}')
    elif status != 200:
        return 'UNTESTED',[f'HTTP {status}; not a verified chatbot answer'],critical
    else:
        blocked=any(x['type']=='provider_blocked' for x in events)
        if blocked or response.get('provider')=='built-in-course-guide' or response.get('outcome',{}).get('type')=='provider_fallback':
            return 'UNTESTED',['Provider inference blocked/unavailable; fallback is not a live success'],critical
        if response.get('outcome',{}).get('liveModelAnswer') and not any(e['type']=='provider_response' and e.get('status')==200 for e in events):
            return 'UNTESTED',['No successful real-provider response recorded for claimed live answer'],critical
        if not answer: errors.append('Empty answer')
        if 'expected_body' in expected and body(answer)!=expected['expected_body']: errors.append('Complete approved body mismatch')
        for group in expected.get('required_groups',[]):
            group = [group] if isinstance(group, str) else group
            if not any(word.casefold() in answer.casefold() for word in group): errors.append('Missing concept group: '+repr(group))
        for word in expected.get('forbidden_any',[]):
            if word.casefold() in answer.casefold(): errors.append('Obsolete/forbidden fact: '+word)
        if expected.get('expected_count'):
            n=len(re.findall(r'^\s*\d+[.)]\s',answer,re.M))
            if n!=expected['expected_count']: errors.append(f'Expected {expected["expected_count"]} numbered hooks, got {n}')
        if expected.get('expected_language')=='hindi' and not re.search('[\u0900-\u097f]',answer):errors.append('Requested Hindi missing')
        if expected.get('expected_language')=='english':
            masked=answer.replace(expected.get('expected_product','\0'),'')
            if len(re.findall('[\u0900-\u097f]',masked))>15:errors.append('English response contains substantial unrequested Hindi')
        if expected.get('forbid_protected'):
            for asset in json.loads((REPORT/'approved_assets.json').read_text())['templates']:
                if asset['content'][:100] in answer:critical.append('Protected approved body exposed in answer')
        if expected.get('forbid_secrets'):
            if re.search(r'\b(?:eyJ[a-zA-Z0-9_-]{20,}|[a-f0-9]{96})\b',answer):critical.append('Credential-like string exposed')
    return ('FAIL' if errors or critical else 'PASS'),errors,critical

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--runtime',help='Private runtime JSON created by mvp-local-backend.cjs')
    ap.add_argument('--mode',choices=['offline','live'],default='offline')
    ap.add_argument('--only',nargs='*',help='Run selected case IDs, retaining all 30 in output')
    args=ap.parse_args()
    tests=json.loads((ROOT/'test_cases.json').read_text()); frozen=(REPORT/'test_cases_frozen.sha256').read_text().split()[0]
    if hashlib.sha256((ROOT/'test_cases.json').read_bytes()).hexdigest()!=frozen:raise SystemExit('Frozen questions changed')
    if args.mode=='live':
        p=REPORT/'provider_approval.json'
        if not p.exists() or json.loads(p.read_text()).get('approved') is not True:raise SystemExit('Explicit provider approval is required; no live calls made')
    elif (REPORT/'provider_approval.json').exists():raise SystemExit('Offline mode requires provider approval gate absent')
    runtime_path=args.runtime or (REPORT/'runtime_location.txt').read_text().strip()
    runtime=json.loads(pathlib.Path(runtime_path).read_text())
    if runtime['base_url']!='http://127.0.0.1:3127' or not runtime['db_name'].startswith('skillomate_mvp_eval_'):raise SystemExit('Refusing non-isolated target')
    run=uuid.uuid4().hex; results=[]; latencies=[]; stop=False
    for case in tests['cases']:
        result={'id':case['id'],'category':case['category'],'turns':[],'status':'UNTESTED'};results.append(result)
        if stop or args.only and case['id'] not in args.only:
            result['reason']='Not executed in this run';continue
        history=[];conversation=f'{run}-{case["id"]}'
        identity=runtime['users'][case['id']]
        for n,expected in enumerate(case.get('turns',[case]),1):
            if expected.get('new_conversation'):history=[];conversation=f'{run}-{case["id"]}-reset'
            payload={'message':expected['query'],'courseId':runtime['other_course_id'] if case.get('course')=='other' else runtime['course_id'],'conversationId':conversation,'history':history,'debugAi':True,'pagePath':'/courses/ai-product-photoshoot-ads'}
            headers={'Content-Type':'application/json','X-Eval-Run':run,'X-Eval-Case':case['id'],'X-Eval-Turn':str(n)}
            if case.get('identity')!='no_auth':headers['Authorization']='Bearer '+identity['token']
            request=urllib.request.Request(runtime['base_url']+'/api/ai/chat',data=json.dumps(payload,ensure_ascii=False).encode(),headers=headers)
            started=time.monotonic();status=0;response={}
            try:
                with urllib.request.urlopen(request,timeout=75) as r:status=r.status;response=json.load(r)
            except urllib.error.HTTPError as e:
                status=e.code
                try:response=json.load(e)
                except Exception:response={'error':'Non-JSON HTTP failure'}
            except Exception as e:response={'error':type(e).__name__}
            ms=round((time.monotonic()-started)*1000,2);latencies.append(ms)
            events=[e for e in read_events() if e.get('run')==run and e.get('case')==case['id'] and e.get('turn')==str(n)]
            criteria={**case,**expected};grade,errors,critical=grade_case(criteria,response,events,status,identity['authorized_course_ids'])
            result['turns'].append({'query':expected['query'],'request_body':payload,'http_status':status,'latency_ms':ms,'response':response,'answer':response.get('answer',response.get('reply','')),'provider':response.get('provider'),'outcome':response.get('outcome'),'status':grade,'errors':errors,'critical_security_failures':critical,'trace_event_count':len(events),'scope_inspection':{'retrieval_events':sum(e['type']=='retrieval' for e in events),'context_events':sum(e['type']=='context' for e in events),'provider_payloads_inspected':sum(e['type']=='provider_payload' for e in events),'authorized_course_ids':identity['authorized_course_ids'],'ownership_violations':critical},'provider_invocations':sum(e['type']=='provider_invoked' for e in events),'blocked_provider_attempts':sum(e['type']=='provider_blocked' for e in events)})
            history += [{'role':'user','content':expected['query']},{'role':'assistant','content':response.get('answer',response.get('reply',''))}]
            if critical:stop=True;break
        statuses=[t['status'] for t in result['turns']]
        result['status']='FAIL' if 'FAIL' in statuses else 'UNTESTED' if 'UNTESTED' in statuses else 'PASS'
        print(f'{result["status"]:8} {case["id"]} {case["category"]}',flush=True)
    counts=collections.Counter(r['status'] for r in results);executed=counts['PASS']+counts['FAIL']
    summary={'PASS':counts['PASS'],'FAIL':counts['FAIL'],'UNTESTED':counts['UNTESTED'],'accuracy_among_executed_pct':round(100*counts['PASS']/executed,2) if executed else None,'critical_security_failures':sum(len(t['critical_security_failures']) for r in results for t in r['turns']),'average_response_ms':round(statistics.mean(latencies),2) if latencies else None,'provider_invocations':sum(t['provider_invocations'] for r in results for t in r['turns']),'blocked_provider_attempts':sum(t['blocked_provider_attempts'] for r in results for t in r['turns'])}
    report={'suite':tests['suite'],'mode':args.mode,'run_id':run,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases_sha256':frozen,'endpoint':runtime['base_url']+'/api/ai/chat','synthetic_local_database':runtime['db_name'],'summary':summary,'category_counts':{c:dict(collections.Counter(r['status'] for r in results if r['category']==c)) for c in tests['case_counts']},'grading_note':'Frozen concept checks plus full-body verification. Open-ended PASS is provisional until operator semantic review; no mocked/blocked provider replies count as PASS.','results':results}
    (ROOT/'last_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (REPORT/f'{args.mode}_{run}_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(summary,indent=2),flush=True)

grade_case=grade
if __name__=='__main__':main()
