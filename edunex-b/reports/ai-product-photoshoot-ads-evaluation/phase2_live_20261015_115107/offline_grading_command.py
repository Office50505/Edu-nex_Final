import json,pathlib,importlib.util
out=pathlib.Path('reports/ai-product-photoshoot-ads-evaluation/phase2_live_20261015_115107');spec=importlib.util.spec_from_file_location('grader','scripts/eval/grade_product_photoshoot_ads_results_v2.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);templates=m.templates_from_source(pathlib.Path('knowledge/ai-product-photoshoot-ads/training.txt'));raw=json.load(open(out/'application_raw_results.json'))
for name,testfile in [('original','original_test_cases.json'),('held_out','held_out_test_cases.json')]:
 tests=json.load(open(out/testfile))
 for scope in ['end_to_end','live_model']:
  d=m.regrade(tests,raw,templates,scope)
  with (out/(name+'_'+scope+'_grades.json')).open('x') as f:json.dump(d,f,ensure_ascii=False,indent=2)
  print(name,scope,json.dumps(d['summary']))
  if scope=='end_to_end':
   for r in d['results']:
    if r['status']!='passed':
     print('FAILED',r['id'],r['status'])
     for i,t in enumerate(r['turns']):print(' turn',i+1,{k:v for k,v in t.get('dimensions',{}).items() if v['status']!='passed'})
