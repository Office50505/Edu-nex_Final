"""Offline source/body checks with manually verified, question-supplied slots.

These are evaluation expectations, not application answers or runtime changes.
No provider calls, no runtime slot parser, no score rewriting.
"""
import importlib.util
import json
from pathlib import Path
import re

B=Path.cwd();R=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('grader',B/'scripts/eval/grade_product_photoshoot_ads_results_v2.py')
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
source=g.templates_from_source(B/'knowledge/ai-product-photoshoot-ads/training.txt')
templates={t['label']:t['text'] for t in source}
raw=json.loads((R/'application_raw_results.json').read_text());actual={r['id']:r for r in raw['results']}
known={
 'ppads_005':{'product':'perfume bottle'},'ppads_006':{'product':'skincare jar'},'ppads_007':{'product':'water bottle'},'ppads_008':{'product':'sunglasses'},
 'ppads_012':{'person':'woman'},'ppads_013':{'product':'coffee mug'},'ppads_014':{'product':'compact keyboard'},'ppads_015':{'product':'handmade soap box'},
 'ppads_019':{'product':'chocolate gift box'},'ppads_020':{'product':'jewellery box'},'ppads_021':{'part':'all bottle caps','colour':'matte black'},
 'ppads_025':{},'ppads_026':{},'ppads_027':{},'ppads_031':{'product':'face serum bottle'},'ppads_032':{'product':'leather wallet'},
 'ppads_033':{'product':'gold bracelet'},'ppads_037':{'product':'protein shaker'},'ppads_038':{'product':'ceramic cup'},'ppads_conv_001':{'product':'perfume bottle'},
 'new15_001':{'product':'enamel camping bowl'},'new15_002':{'product':'linen notebook'},'new15_003':{'part':'all zipper pulls','colour':'forest green'},
 'new15_conv_001':{'product':'embroidered cushion cover'},'new15_conv_005':{'product':'cork yoga block'},
}
rows=[]
for name in ['original','held_out']:
 graded=json.loads((R/(name+'_end_to_end_grades.json')).read_text())
 for case in graded['results']:
  for i,turn in enumerate(case['turns']):
   if not turn.get('template_label'):continue
   case_id=case['id'];slots=known[case_id];body=templates[turn['template_label']]
   if 'product' in slots:body=re.sub(r'\[product\]',lambda m:slots['product'],body,flags=re.I)
   if 'person' in slots:body=re.sub(r'\[man\s*/\s*woman\]',lambda m:slots['person'],body,flags=re.I)
   if 'part' in slots:body=re.sub(r'\[the part, e\.g\. [^\]]+\]',lambda m:slots['part'],body)
   if 'colour' in slots:body=re.sub(r'\[new colour, e\.g\. [^\]]+\]',lambda m:slots['colour'],body)
   r=actual[case_id];a=r.get('turns',[r])[i];blocks=re.findall(r'```(?:text)?\s*([\s\S]*?)```',a['answer'])
   complete=g.fidelity_norm(body) in g.fidelity_norm(a['answer'])
   extra=bool(blocks) and not any(g.fidelity_norm(b).strip("'")==g.fidelity_norm(body).strip("'") for b in blocks)
   rows.append({'id':case_id,'turn':i+1,'set':name,'template':turn['template_label'],'known_slots_from_question_or_user_history':slots,
    'expected_complete_body':body,'actual_answer':a['answer'],'full_body_matches':complete,'extra_or_altered_executable_block':extra,'passed':complete and not extra})
failed=[x['id'] for x in rows if not x['passed']]
assert len(rows)==25 and set(failed)=={'new15_002','new15_conv_001','new15_conv_005'},failed
out={'method':'All 25 saved full-template requests checked against source bodies with independently reviewed explicit slots; no runtime/evaluator slot parser used. Unknown slots are kept unchanged.','total':25,'passed':22,'failed':3,'fidelity_pct':88.0,'results':rows}
with (R/'independent_template_audit.json').open('x') as f:json.dump(out,f,indent=2,ensure_ascii=False)
print(json.dumps({'total':25,'passed':22,'failed':failed,'fidelity_pct':88.0}))
