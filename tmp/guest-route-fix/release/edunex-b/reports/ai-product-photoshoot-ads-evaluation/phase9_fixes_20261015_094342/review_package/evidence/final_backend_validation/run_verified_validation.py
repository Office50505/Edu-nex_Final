import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as ET

B=Path.cwd();R=Path(__file__).resolve().parent
jobs=[('node',['node','--test','--test-reporter=junit','tests/ai-chat-history.test.cjs','tests/tutor-knowledge.test.cjs','tests/product-tutor-quality.test.cjs','tests/product-tutor-phase3.test.cjs','tests/product-tutor-phase5.test.cjs','tests/product-tutor-phase7.test.cjs','tests/product-tutor-phase9.test.cjs','tests/mobile-course-ai.test.cjs','tests/mobile-course-ai-cache.test.cjs'],{'NODE_OPTIONS':'--require=./tests/helpers/deny-network.cjs'}),
 ('python',['python3','-B','-m','unittest','discover','-s','tests','-p','test_product_evaluator*.py','-v'],{})]
jobs=[job for job in jobs if job[0]=='node']
def run(item):
 name,command,overrides=item;started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic();env=os.environ.copy();env.update(overrides)
 p=subprocess.run(command,cwd=B,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 suffix='.xml' if name=='node' else '.log'
 with (R/(name+'_verified_output'+suffix)).open('x') as f:f.write(p.stdout if name=='node' else p.stdout+p.stderr)
 with (R/(name+'_verified_stderr.log')).open('x') as f:f.write(p.stderr)
 result={'suite':name,'command':command,'environment_overrides':overrides,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'durationSeconds':time.monotonic()-clock,'exitCode':p.returncode,'externalProviderRequests':0}
 if name=='node':
  root=ET.fromstring(p.stdout);cases=[]
  for c in root.iter('testcase'):cases.append({'name':c.attrib['name'],'classname':c.attrib.get('classname'),'status':'failed' if c.find('failure') is not None or c.find('error') is not None else 'skipped' if c.find('skipped') is not None else 'passed','failure':''.join(c.find('failure').itertext()) if c.find('failure') is not None else None})
  result['cases']=cases;result['summary']={k:sum(c['status']==k for c in cases) for k in ['passed','failed','skipped']};result['summary']['total']=len(cases)
 else:
  import re
  matches=re.findall(r'^(test_\S+) \(([^)]+)\) \.\.\. (ok|FAIL|ERROR|skipped[^\n]*)$',p.stderr,re.M)
  result['cases']=[{'name':n,'class':c,'status':'passed' if s=='ok' else 'skipped' if s.startswith('skipped') else 'failed'} for n,c,s in matches]
  result['summary']={k:sum(c['status']==k for c in result['cases']) for k in ['passed','failed','skipped']};result['summary']['total']=len(matches)
 with (R/(name+'_verified_execution.json')).open('x') as f:json.dump(result,f,indent=2)
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
 results=list(executor.map(run,jobs))
for r in results:print(json.dumps({k:v for k,v in r.items() if k!='cases'},indent=2))
if any(r['exitCode'] or r['summary']['failed'] for r in results):raise SystemExit(1)
