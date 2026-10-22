"""Independent source/known-slot full-template audit. No runtime or grader imports.

The supplied expectations must be frozen before the audited response generation.
Known slots are declared independently by the reviewer, not inferred by runtime.
The original training text, not expected arbitrary text, defines approved bodies.
"""
import argparse,json,re,unicodedata,hashlib
from pathlib import Path

def canonical(text):
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',text).translate(str.maketrans({'“':"'",'”':"'",'’':"'",'"':"'"}))).strip()
def source_templates(path):
 text=path.read_text();lines=[line for line in text.splitlines()if not re.fullmatch(r'\s*(?:SKILLOMATE\s+Chatbot Knowledge Base|AI Product Photoshoot & Ads\s*·\s*Page\s+\d+)\s*',line)]
 part='\n'.join(lines).split('Part F — Saare prompts (exact)',1)[1].split('Part G —',1)[0];marks=list(re.finditer(r'^\s*(L\d{2}\s+[^\n]+)\s*$',part,re.M))
 return {m[1].strip():re.sub(r'\s+',' ',part[m.end():marks[i+1].start()if i+1<len(marks)else len(part)]).strip()for i,m in enumerate(marks)}
def audit(expectations,raw,assets):
 by={r['id']:r for r in raw['results']};checks=expectations.get('checks',expectations.get('results',[]));results=[]
 for check in checks:
  reasons=[];approved=assets[check['template']];slots=check['knownSlots'];rendered=approved
  patterns={'product':r'\[product\]','person':r'\[man\s*/\s*woman\]','part':r'\[the part, e\.g\. [^\]]+\]','colour':r'\[new colour, e\.g\. [^\]]+\]'}
  for key,pattern in patterns.items():
   if slots.get(key):rendered=re.sub(pattern,lambda m:slots[key],rendered,flags=re.I)
  if canonical(rendered)!=canonical(check['expectedCompleteBody']):reasons.append('frozen expectation is not the approved source body with declared slots')
  result=by.get(check['id']);turns=result.get('turns',[result])if result else[];turn=turns[check['turn']-1]if len(turns)>=check['turn']else{};answer=turn.get('answer','');blocks=re.findall(r'```(?:text)?\s*([\s\S]*?)```',answer)
  # An executable block must contain the whole body and no extra instructions.
  if len(blocks)!=1 or not any(canonical(block)==canonical(rendered)for block in blocks):reasons.append('complete executable body differs, is missing, or known slots remain unresolved')
  results.append({**check,'passed':not reasons,'reasons':reasons,'actualResponse':answer})
 return {'method':'Independent original source, predeclared known slots and entire executable-block comparison; no runtime/grader entity extraction; only whitespace/quote normalization.','total':len(results),'passed':sum(r['passed']for r in results),'failed':sum(not r['passed']for r in results),'results':results}
def main():
 p=argparse.ArgumentParser();p.add_argument('--expectations',type=Path,required=True);p.add_argument('--results',type=Path,required=True);p.add_argument('--knowledge',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();assets=source_templates(a.knowledge)
 if len(assets)!=19:raise SystemExit('Expected 19 approved assets')
 result=audit(json.loads(a.expectations.read_text()),json.loads(a.results.read_text()),assets);result['provenance']={k:{'path':str(v.resolve()),'sha256':hashlib.sha256(v.read_bytes()).hexdigest()}for k,v in [('knowledge',a.knowledge),('expectations',a.expectations),('responses',a.results),('auditor',Path(__file__))]}
 with a.out.open('x')as f:json.dump(result,f,ensure_ascii=False,indent=2)
 print({k:v for k,v in result.items()if k not in ['results','provenance']})
if __name__=='__main__':main()
