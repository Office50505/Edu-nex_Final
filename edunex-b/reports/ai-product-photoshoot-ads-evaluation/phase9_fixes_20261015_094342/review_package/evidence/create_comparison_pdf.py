from pathlib import Path
import fitz
B=Path.cwd();U=B.parent;out=U/'output/pdf/skillomate-phase9-architecture-comparison-20261015.pdf';tmp=U/'tmp/pdfs/phase9-architecture-comparison-20261015';out.parent.mkdir(parents=True,exist_ok=True);tmp.mkdir(parents=True,exist_ok=True);assert not out.exists()
doc=fitz.open();navy=(.08,.16,.25);teal=(.05,.43,.40);gray=(.30,.35,.40)
def wrap(text,width,size=10,font='helv'):
 lines=[]
 for paragraph in text.split('\n'):
  line=''
  for word in paragraph.split():
   nxt=(line+' '+word).strip()
   if fitz.get_text_length(nxt,fontname=font,fontsize=size)>width and line:lines.append(line);line=word
   else:line=nxt
  lines.append(line)
 return lines
def write(p,text,y,size=10,color=gray,font='helv',x=44,width=507):
 for line in wrap(text,width,size,font):p.insert_text((x,y),line,fontname=font,fontsize=size,color=color);y+=size*1.38
 return y+5
def page(n,title,sub):
 p=doc.new_page(width=595,height=842);p.draw_rect(fitz.Rect(0,0,595,10),color=teal,fill=teal);y=write(p,'SKILLOMATE  /  PHASE 9 ARCHITECTURE REVIEW',39,9,teal,'hebo');y=write(p,title,y+7,24,navy,'hebo');y=write(p,sub,y,10)
 p.draw_line((44,797),(551,797),color=(.80,.84,.86));p.insert_text((44,815),'15 OCT 2026  |  Local validation - zero provider requests',fontsize=8,color=gray);p.insert_text((516,815),f'{n} / 2',fontsize=8,color=gray);return p,y+8
def heading(p,t,y):return write(p,t,y+6,12,navy,'hebo')
p,y=page(1,'Phase 8 to Phase 9','AI Product Photoshoot & Ads - architecture remediation and verified local evidence')
y=write(p,'Three critical templates pass complete local replay. Fresh live generalization is still unmeasured.',y,12,teal,'hebo')
y=heading(p,'Evidence comparison',y)
rows=[('Measure','Phase 8 evidence','Phase 9 evidence'),('Fresh integrated score','86/100; unseen 37/50','No fresh live evaluation'),('Complete templates','32/35; three critical failures','35/35 local; all 19 headings'),('Backend regressions','239/239 passed','296/296 passed'),('Evaluator regressions','111/111 passed','147/147 passed'),('New targeted checks','Fresh unseen test questions','75/75 local checks'),('Historical regrade','86/100 with frozen v5','86/100 with v6; six changes'),('External provider requests','13 scored plus 1 preflight','0; all provider tests mocked')]
widths=[134,171,202];xs=[44,178,349]
for i,row in enumerate(rows):
 h=max(len(wrap(c,w-14,9))for c,w in zip(row,widths))*12+16;p.draw_rect(fitz.Rect(44,y,551,y+h),fill=(.92,.96,.95)if i==0 else((.97,.98,.99)if i%2 else(1,1,1)),color=(.85,.88,.90))
 for c,x,w in zip(row,xs,widths):write(p,c,y+14,9,navy if i==0 else gray,'hebo'if i==0 else'helv',x+7,w-14)
 y+=h
y=heading(p,'The architectural change',y+7)
y=write(p,'Before: broad keyword matches could select a local FAQ before the learner task reached the model; language guards could replace a correct answer with another topic. The route saved messages but did not reload them when client history was omitted.',y)
y=write(p,'After: literal assets and clear source facts remain deterministic. A separate policy delegates ambiguous reasoning and compound/full-journey requests to the existing model with scoped references and bounded same-conversation history. Replacements retain their own provenance.',y)
y=heading(p,'How to interpret scoring',y)
y=write(p,'V5 and historical results are preserved. V6 corrects three false failures and exposes three false passes, leaving the historical total at 86/100 with different case outcomes. Independent audits compare original full source bodies and predeclared slots, without using runtime entity parsing.',y)
assert y<780,y
p,y=page(2,'Controls and remaining limits','General fixes with preserved access, literal fidelity and independent evidence')
y=heading(p,'Implementation changes',y)
for t in [
 'Literal requests: overlapping request phrases no longer hide the supplied product. Complete/original template wording selects the full asset; known names fill every product slot and unknown actor/clothing details stay unset.',
 'Task selection: exact settings bind to the requested workflow, descriptive colour does not imply recolouring, and phone-framing paraphrases find the verbatim FAQ. Recall shortcuts require a genuine past-facts question.',
 'Conversation: after current product-course entitlement is verified, restore at most 12 sanitized turns for the same authenticated user, course and explicit conversation ID. Expired access, other courses and different conversations cannot restore the stored history. Legacy sessions remain supported.',
 'Validation: retain safe explanatory content and scoped Hindi/Hinglish prohibitions. Known repairs stay on topic. Ambiguous language errors receive one repair inside the original 25-second budget; maximum three transport attempts including initial retries.',
 'Honest failure: unsuccessful repair explicitly states incompletion and keeps the safe earlier answer only as reference. Repaired output is revalidated and marked as a replacement, never unchanged live-model output. V6 cannot count explicit failed translation as task completion.'
]:y=write(p,'- '+t,y)
y=heading(p,'Integrity and local verification',y)
y=write(p,'Thirteen source/test/documentation files are added or modified; a before/current unified diff is included. All eight lessons, 19 approved bodies, guidance facts and 53 unique record IDs remain. V5, raw training text, 432 captured historical artifacts and seven earlier review ZIPs retain their hashes. No unrelated business logic or production configuration changed.',y)
y=write(p,'296 backend and 147 evaluator checks pass. The 75 new targeted checks are included in those totals; 18 additional v5 compatibility executions are inside the evaluator total. All 35 local complete-body checks pass; the auditor still finds the original three failures in the unchanged Phase 8 answers.',y)
y=heading(p,'Limits before another readiness decision',y)
y=write(p,'No new live model performance, production auth/database/load behavior or sustained provider reliability was measured. Delegating a request does not prove the model will answer it correctly. Intent and safety checks remain finite. Model repair may add latency and can fail within budget. No deployment, commit, push or production-readiness claim is made.',y)
assert y<780,y
doc.save(out);doc.close()
with fitz.open(out)as pdf:
 assert len(pdf)==2
 for i,p in enumerate(pdf):p.get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(tmp/f'page-{i+1}.png')
print(out);print(tmp)
