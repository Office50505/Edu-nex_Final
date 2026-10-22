from pathlib import Path
import fitz

B=Path.cwd();U=B.parent;R=Path(__file__).resolve().parent
out=U/'output/pdf/skillomate-phase3-fix-comparison-20261015.pdf'
scratch=U/'tmp/pdfs/phase3-fix-comparison-20261015'
out.parent.mkdir(parents=True,exist_ok=True);scratch.mkdir(parents=True,exist_ok=True)
assert not out.exists()
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
def start(k,title,sub):
 page=doc.new_page(width=595,height=842);page.draw_rect(fitz.Rect(0,0,595,10),color=teal,fill=teal)
 y=write(page,'SKILLOMATE  /  LOCAL IMPLEMENTATION REVIEW',39,9,teal,'hebo')
 y=write(page,title,y+7,24,navy,'hebo');y=write(page,sub,y,10)
 page.draw_line((44,797),(551,797),color=(.80,.84,.86))
 page.insert_text((44,815),'15 OCT 2026  |  No deployment or live provider calls',fontsize=8,color=gray)
 page.insert_text((516,815),f'{k} / 2',fontsize=8,color=gray)
 return page,y+8
def heading(page,label,y):return write(page,label,y+6,12,navy,'hebo')

p,y=start(1,'Phase 2 to Phase 3','AI Product Photoshoot & Ads - what changed, what was verified, and what remains unknown')
y=write(p,'All three confirmed template-slot failures are fixed in local verification. No post-fix live accuracy has been measured.',y,12,teal,'hebo')
y=heading(p,'Evidence comparison',y)
rows=[('Measure','Phase 2 evidence','Phase 3 evidence'),
 ('Integrated accuracy','45/70 (64.3%), live pipeline','Unmeasured live; historical score retained'),
 ('Template fidelity','22/25 saved live/local outputs','25/25 local complete-body replays'),
 ('Critical slot cases','3 confirmed failures','3/3 local replays pass'),
 ('Node regressions','117/117 passed','153/153 passed'),
 ('Evaluator regressions','25/25 passed','43/43 passed'),
 ('External provider use','22 scored model turns','0 requests; network disabled')]
widths=[134,171,202];xs=[44,178,349]
for index,row in enumerate(rows):
 height=max(len(wrapped(cell,width-14,9)) for cell,width in zip(row,widths))*12+16
 p.draw_rect(fitz.Rect(44,y,551,y+height),fill=(.92,.96,.95) if index==0 else ((.97,.98,.99) if index%2 else (1,1,1)),color=(.85,.88,.90))
 for cell,x,width in zip(row,xs,widths):write(p,cell,y+14,9,navy if index==0 else gray,'hebo' if index==0 else 'helv',x+7,width-14)
 y+=height
y=heading(p,'Critical-case outcome',y+10)
for label,description in [
 ('new15_002','Comma-delimited product names now fill the known slot.'),
 ('new15_conv_001','Leading articles are normalized without changing template wording.'),
 ('new15_conv_005','Product references resolve to the explicit name in user memory.')]:
 y=write(p,label+' - '+description,y)
y=heading(p,'Rubric-only comparison',y)
y=write(p,'The new v3 evaluator scores the SAME old Phase 2 responses at 55/70 (78.6%). This corrects semantic errors and detects missing deliverables. It is not a new tutor score and does not replace the historical 45/70 result.',y)
assert y<780,y

p,y=start(2,'Scope and remaining limits','General rules, preserved course assets, and independent local checks')
y=heading(p,'Implementation changes',y)
for text in [
 'Product facts: bounded explicit-name extraction, grammatical slot boundaries, user-only attributes, price/channel/angle memory and reset on product changes.',
 'Retrieval: lesson and intent metadata, explicit-lesson precedence over a selected video, correct Lesson 08 workflow, prerequisites and complete exact troubleshooting instructions.',
 'Routing and state: negated subscription terms do not hijack a product-price request; saved facts are scoped to learner, course and conversation.',
 'Task completion: conservative hooks, timed visual/voice scripts, captions, ad angles and source-backed image prompts. Unknown benefits and customer claims are never supplied.',
 'Evaluation: a separate v3 grader checks known slots, short Hinglish, contextual negation and actual deliverables. Original v2 and all historical answers remain unchanged.'
]:y=write(p,'- '+text,y)
y=heading(p,'Files for review',y)
for text in [
 'services/: productTutorKnowledge.js, productTutorResponse.js, new productTutorTasks.js, tutorKnowledge.js and aiTutorService.js',
 'routes/ai.js; models/AiTutorSession.js; knowledge/ai-product-photoshoot-ads/guidance.json',
 'scripts/eval/: new grade_product_photoshoot_ads_results_v3.py and README.md',
 'tests/: ai-chat-history, product-tutor-quality, new product-tutor-phase3 and new test_product_evaluator_v3'
]:y=write(p,text,y,9)
y=heading(p,'Validation boundary',y)
y=write(p,'54 new targeted checks are included in the 153 Node / 43 Python totals. Independent complete-body replay covers all 25 saved template requests. Existing AI Influencer, AI Filmmaking, access, mobile/history, safety and provider-error regressions pass. All 91 captured historical artifacts retain their hashes; raw course text and 19 approved template bodies are unchanged.',y)
y=heading(p,'Readiness is not established',y)
y=write(p,'No live evaluation, production authentication/database validation, deployment, commit, push or infrastructure change occurred. Parsing, safety and semantic checks remain bounded; conservative drafts do not prove marketing quality. A separately approved live evaluation is needed before any new live-accuracy or production-readiness claim.',y)
assert y<780,y
doc.save(out);doc.close()
with fitz.open(out) as pdf:
 assert len(pdf)==2
 for i,page in enumerate(pdf):page.get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(scratch/f'page-{i+1}.png')
print(out);print(scratch)
