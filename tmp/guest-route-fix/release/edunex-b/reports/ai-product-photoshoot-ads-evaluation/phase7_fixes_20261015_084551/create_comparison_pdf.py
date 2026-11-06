from pathlib import Path
import fitz
B=Path.cwd();U=B.parent
out=U/'output/pdf/skillomate-phase7-fix-comparison-20261015.pdf';scratch=U/'tmp/pdfs/phase7-fix-comparison-20261015'
out.parent.mkdir(parents=True,exist_ok=True);scratch.mkdir(parents=True,exist_ok=True);assert not out.exists()
doc=fitz.open();navy=(.08,.16,.25);teal=(.05,.43,.40);gray=(.30,.35,.40)
def wrapped(text,width,size=10,font='helv'):
 lines=[]
 for paragraph in text.split('\n'):
  line=''
  for word in paragraph.split():
   proposed=(line+' '+word).strip()
   if fitz.get_text_length(proposed,fontname=font,fontsize=size)>width and line:lines.append(line);line=word
   else:line=proposed
  lines.append(line)
 return lines
def write(page,text,y,size=10,color=gray,font='helv',x=44,width=507):
 for line in wrapped(text,width,size,font):page.insert_text((x,y),line,fontname=font,fontsize=size,color=color);y+=size*1.38
 return y+5
def start(n,title,sub):
 p=doc.new_page(width=595,height=842);p.draw_rect(fitz.Rect(0,0,595,10),color=teal,fill=teal)
 y=write(p,'SKILLOMATE  /  PHASE 7 LOCAL FIX REVIEW',39,9,teal,'hebo');y=write(p,title,y+7,24,navy,'hebo');y=write(p,sub,y,10)
 p.draw_line((44,797),(551,797),color=(.80,.84,.86));p.insert_text((44,815),'15 OCT 2026  |  Local validation only - no provider requests',fontsize=8,color=gray);p.insert_text((516,815),f'{n} / 2',fontsize=8,color=gray)
 return p,y+8
def heading(p,text,y):return write(p,text,y+6,12,navy,'hebo')
p,y=start(1,'Phase 6 to Phase 7','AI Product Photoshoot & Ads - historical live evidence versus local corrections')
y=write(p,'Five genuine failures pass local replay. Fresh post-fix live performance remains unmeasured.',y,12,teal,'hebo')
y=heading(p,'Verified evidence comparison',y)
rows=[('Measure','Phase 6 evidence','Phase 7 evidence'),('Fresh integrated score','91/100 (91%), frozen v4','No new live score'),('Same saved answers','91/100 with v4','95/100 with v5; rubric only'),('Full template bodies','36/36; 19 headings','36/36 local replays'),('Known genuine defects','Five genuine/incomplete cases','5/5 local replays, six turns'),('Backend tests','191/191 passed','239/239 passed'),('Evaluator tests','77/77 passed','111/111 passed'),('New targeted scenarios','Not applicable','66/66; included in suites'),('External provider calls','Fresh Phase 6 execution','0; Node networking denied')]
widths=[134,171,202];xs=[44,178,349]
for i,row in enumerate(rows):
 height=max(len(wrapped(c,w-14,9))for c,w in zip(row,widths))*12+16
 p.draw_rect(fitz.Rect(44,y,551,y+height),fill=(.92,.96,.95)if i==0 else((.97,.98,.99)if i%2 else(1,1,1)),color=(.85,.88,.90))
 for c,x,w in zip(row,xs,widths):write(p,c,y+14,9,navy if i==0 else gray,'hebo'if i==0 else'helv',x+7,w-14)
 y+=height
y=heading(p,'How to read the counts',y+7)
y=write(p,'The 239 backend checks include all 191 historical checks and 48 new ones. The 111 evaluator executions include 77 historical, 18 new and 16 unchanged v4 contracts run against v5. The 66 new targeted checks are already included. Replays are separate evidence, not additional unit-test totals.',y)
y=heading(p,'Historical grading is preserved',y)
y=write(p,'Four pure evaluator false failures are corrected in v5. All five genuine old answers still fail. The saved-answer 95/100 result measures grading changes only; it is not a fresh chatbot accuracy score. Complete template clauses and exact FAQ requirements remain strict.',y)
assert y<780,y
p,y=start(2,'Implementation and limits','General rules, source-grounded answers and independently reviewable evidence')
y=heading(p,'What changed',y)
for text in [
 'Course routing: the full course title is masked during intent detection. Complete-course questions get all eight lessons, tools, prerequisites and learning outcomes; explicit lesson tasks stay specific.',
 'Entity and intent handling: called/named, name-only and Hindi/Hinglish declarations retain descriptive names. Referring phrases keep existing identity. Product adjectives and incidental substrings do not trigger unrelated UGC, colour or motion rules.',
 'Troubleshooting: mobile-device camera framing finds the verbatim L07 repair. Product-consistency paraphrases work across all three languages; phone-photo tasks remain L02.',
 'Task completion: supplied names suffice for requested hook quantities. Honest demo requests get three visual actions and an example spoken line. Scene comparisons explain both options using approved reference assets, with no invented benefits.',
 'Conversation and safety: omitted client history and language switches retain known products. Proper names can keep their script without establishing prose language. Review prohibitions stay safe; unrelated negation cannot excuse fake customer claims.',
 'Evaluator v5: independent multilingual slots, anaphora, contextual No, demonstration equivalents and scoped negation correct documented defects. Concrete outputs, quantities, known identity, safety and full-template checks remain required.'
]:y=write(p,'- '+text,y)
y=heading(p,'Source and evidence integrity',y)
y=write(p,'Ten source/test/documentation files are changed or added. The patch compares pre-Phase-7 workspace snapshots with current files. All 8 lessons, 19 approved templates and 53 unique chunk identifiers remain. Raw training text, v4 grader, 439 captured historical artifacts and five historical review ZIPs retain their hashes.',y)
y=heading(p,'Remaining limitations',y)
y=write(p,'No new external-provider evaluation, deployment or production infrastructure change occurred. Finite intent, language and safety heuristics still need human review for unfamiliar wording. Route tests use synthetic auth, database/session and provider fixtures. Production persistence, load and provider reliability are not measured. No production-readiness claim is made.',y)
assert y<780,y
doc.save(out);doc.close()
with fitz.open(out)as pdf:
 assert len(pdf)==2
 for i,page in enumerate(pdf):page.get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(scratch/f'page-{i+1}.png')
print(out);print(scratch)
