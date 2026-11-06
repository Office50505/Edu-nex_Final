"""Reproduce the independent full-body audit; needs explicit new output path."""
from pathlib import Path
import json,re,sys
R=Path(__file__).resolve().parent
raw=json.loads((R/'application_raw_results.json').read_text());by={x['id']:x for x in raw['results']};checks=json.loads((R/'independent_template_expectations_frozen.json').read_text())['checks']
def norm(text):return re.sub(r'\s+',' ',str(text).translate(str.maketrans({'“':"'",'”':"'",'’':"'",'"':"'"}))).strip()
results=[]
for c in checks:
 r=by[c['id']];turn=r.get('turns',[r])[c['turn']-1];match=re.search(r'```(?:text)?\s*([\s\S]*?)```',turn['answer']);body=match[1].strip()if match else'';results.append({**c,'question':turn['query'],'actualResponse':turn['answer'],'actualCompleteBody':body,'passed':norm(body)==norm(c['expectedCompleteBody'])})
result={'method':'Entire executable block versus pre-response complete expected source body and known slots; whitespace/quote normalization only. No runtime or v5 expected-slot parser.','total':len(results),'passed':sum(x['passed']for x in results),'failed':sum(not x['passed']for x in results),'approvedHeadingsCovered':len({x['template']for x in results}),'results':results}
with Path(sys.argv[1]).open('x')as f:json.dump(result,f,ensure_ascii=False,indent=2)
print({k:v for k,v in result.items()if k not in ['method','results']})
