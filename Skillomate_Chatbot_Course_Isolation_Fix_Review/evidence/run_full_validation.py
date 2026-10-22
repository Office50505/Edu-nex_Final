from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime,json,os,re,subprocess,time,xml.etree.ElementTree as ET
E=Path(__file__).resolve().parent
tests=sorted(str(p) for p in Path('tests').glob('*.test.cjs'))
commands=[('backend',['node','--test','--test-reporter=junit',*tests]),('python',['python3','-B','-m','unittest','discover','-s','tests','-p','test_*.py','-v'])]
def run(job):
 name,command=job;env=os.environ.copy()
 if name=='backend':
  env['NODE_OPTIONS']='--require=./tests/helpers/deny-network.cjs --require='+str(E/'regression/provider_observer.cjs')
  env['PHASE14A_PROVIDER_EVIDENCE']=str(E/'regression/final/provider_invocations')
 start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 p=subprocess.run(command,env=env,capture_output=True,text=True)
 suffix='xml' if name=='backend' else 'log'
 (E/f'full_{name}.{suffix}').write_text(p.stdout if name=='backend' else p.stdout+p.stderr)
 (E/f'full_{name}.stderr.log').write_text(p.stderr)
 result={'startedAt':at,'seconds':time.monotonic()-start,'command':command,'exitCode':p.returncode,'externalRequestsPermitted':0}
 if name=='backend':
  cs=list(ET.fromstring(p.stdout).iter('testcase'))
  result['cases']=[{'name':c.attrib['name'],'file':c.attrib.get('file'),'status':'FAIL' if c.find('failure') is not None or c.find('error') is not None else 'SKIP' if c.find('skipped') is not None else 'PASS','failure':''.join(c.find('failure').itertext()) if c.find('failure') is not None else None} for c in cs]
 else:
  found=re.findall(r'^(test_\S+) \(([^)]+)\) \.\.\. (ok|FAIL|ERROR|skipped[^\n]*)$',p.stderr,re.M)
  result['cases']=[{'name':n,'class':c,'status':'PASS' if s=='ok' else 'SKIP' if s.startswith('skipped') else 'FAIL'} for n,c,s in found]
 result['summary']={s:sum(c['status']==s for c in result['cases']) for s in ['PASS','FAIL','SKIP']}
 result['summary']['total']=len(result['cases'])
 (E/f'full_{name}_execution.json').write_text(json.dumps(result,indent=2))
 return {'suite':name,'exitCode':p.returncode,'summary':result['summary']}
with ThreadPoolExecutor(max_workers=2) as pool:
 for result in pool.map(run,commands):print(json.dumps(result),flush=True)
