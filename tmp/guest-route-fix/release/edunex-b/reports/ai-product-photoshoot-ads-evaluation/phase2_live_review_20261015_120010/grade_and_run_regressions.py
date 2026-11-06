import concurrent.futures
import datetime
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

B=Path.cwd()
R=Path(__file__).resolve().parent
raw=json.loads((R/'application_raw_results.json').read_text())
assert len(raw['results'])==70 and raw.get('completedAt')
spec=importlib.util.spec_from_file_location('grader',B/'scripts/eval/grade_product_photoshoot_ads_results_v2.py')
grader=importlib.util.module_from_spec(spec);spec.loader.exec_module(grader)
templates=grader.templates_from_source(B/'knowledge/ai-product-photoshoot-ads/training.txt')
for name,test_file in [('original','original_test_cases.json'),('held_out','held_out_test_cases.json')]:
 tests=json.loads((R/test_file).read_text())
 for scope in ['end_to_end','live_model']:
  result=grader.regrade(tests,raw,templates,scope)
  with (R/(name+'_'+scope+'_grades.json')).open('x') as f:json.dump(result,f,indent=2,ensure_ascii=False)
  print(name,scope,json.dumps(result['summary']))
  if scope=='end_to_end':
   for r in result['results']:
    if r['status']=='failed':print('FAILED',r['id'],json.dumps([{k:v for k,v in t.get('dimensions',{}).items() if v['status']=='failed'} for t in r['turns']],ensure_ascii=False))

def run(label,command,env_extra):
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
 env=os.environ.copy();env.update(env_extra)
 result=subprocess.run(command,cwd=B,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 log=R/(label+'_test_output.log')
 with log.open('x') as f:f.write(result.stdout)
 evidence={'command':command,'environment_overrides':env_extra,'startedAt':started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'durationSeconds':time.monotonic()-clock,'exitCode':result.returncode,'log':log.name,'provider_requests':0}
 with (R/(label+'_execution.json')).open('x') as f:json.dump(evidence,f,indent=2)
 return label,evidence,result.stdout[-850:]

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
 jobs=[executor.submit(run,'node',['node','--test','tests/ai-chat-history.test.cjs','tests/tutor-knowledge.test.cjs','tests/product-tutor-quality.test.cjs','tests/mobile-course-ai.test.cjs','tests/mobile-course-ai-cache.test.cjs'],{'NODE_OPTIONS':'--require=./tests/helpers/deny-network.cjs'}),executor.submit(run,'evaluator',['python3','-B','-m','unittest','discover','-s','tests','-p','test_product_evaluator.py','-v'],{})]
 for f in concurrent.futures.as_completed(jobs):
  label,evidence,tail=f.result();print(label,json.dumps(evidence));print(tail)
