from pathlib import Path
import fitz

B=Path.cwd();U=B.parent
out=U/'output/pdf/skillomate-phase5-fix-comparison-20261015.pdf'
scratch=U/'tmp/pdfs/phase5-fix-comparison-20261015'
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
    for line in wrapped(text,width,size,font):
        page.insert_text((x,y),line,fontname=font,fontsize=size,color=color);y+=size*1.38
    return y+5
def start(number,title,sub):
    page=doc.new_page(width=595,height=842)
    page.draw_rect(fitz.Rect(0,0,595,10),color=teal,fill=teal)
    y=write(page,'SKILLOMATE  /  PHASE 5 LOCAL FIX REVIEW',39,9,teal,'hebo')
    y=write(page,title,y+7,24,navy,'hebo');y=write(page,sub,y,10)
    page.draw_line((44,797),(551,797),color=(.80,.84,.86))
    page.insert_text((44,815),'15 OCT 2026  |  No provider requests or deployment',fontsize=8,color=gray)
    page.insert_text((516,815),f'{number} / 2',fontsize=8,color=gray)
    return page,y+8
def heading(page,label,y):return write(page,label,y+6,12,navy,'hebo')

p,y=start(1,'Phase 4 to Phase 5','AI Product Photoshoot & Ads - fresh historical evidence versus local corrections')
y=write(p,'All five genuine defects pass local replay. Fresh post-fix live accuracy remains unmeasured.',y,12,teal,'hebo')
y=heading(p,'Evidence comparison',y)
rows=[('Measure','Phase 4 fresh evidence','Phase 5 local evidence'),
 ('Integrated score','67/80 (83.75%), v3','No fresh live score'),
 ('Saved-answer regrade','Same old answers, v3','75/80 (93.75%), v4 only'),
 ('Full templates','28/29; one critical failure','29/29 complete local replays'),
 ('Genuine defect cases','Five failed','5/5 local or fixture replays'),
 ('Backend regressions','153/153 passed','191/191 passed'),
 ('Evaluator checks','43/43 passed','77/77 passed; scope below'),
 ('External provider calls','7 scored + 1 preflight','0; local networking denied')]
widths=[134,171,202];xs=[44,178,349]
for index,row in enumerate(rows):
    height=max(len(wrapped(cell,width-14,9)) for cell,width in zip(row,widths))*12+16
    p.draw_rect(fitz.Rect(44,y,551,y+height),fill=(.92,.96,.95) if index==0 else ((.97,.98,.99) if index%2 else (1,1,1)),color=(.85,.88,.90))
    for cell,x,width in zip(row,xs,widths):write(p,cell,y+14,9,navy if index==0 else gray,'hebo' if index==0 else 'helv',x+7,width-14)
    y+=height
y=heading(p,'Critical colour substitution',y+8)
y=write(p,'Explicit part and colour values stop at punctuation or preservation clauses. Colour-of phrasing, grammatical determiners and saved fields work without changing any approved template body. The previously unresolved handle/cobalt-blue case passes its independent complete-body expectation locally.',y)
y=heading(p,'Scores and check counts',y)
y=write(p,'The 75/80 v4 result regrades unchanged Phase 4 answers: eight rubric false failures are corrected, while all five genuine old failures still fail. It does not measure new runtime quality. The 54 new targeted checks are included in the suite totals; evaluator checks comprise 43 historical, 16 new and 18 v3 compatibility assertions run against v4.',y)
assert y<780,y

p,y=start(2,'Changes and limits','General rules, source-grounded knowledge, and preserved historical evidence')
y=heading(p,'What changed',y)
for text in [
 'Retrieval: handset/phone visibility finds the exact FAQ; colour/shape, shade, face identity and finger anatomy select their matching repair. Specific intent precedes generic course overview.',
 'Festive coverage: Diwali and wedding summaries retrieve their approved scene assets, including actual decorations, product sharpness and foreground. English, Hindi and Hinglish translations add no new course facts.',
 'Conversation repair: an optional bounded saved topic and current video/settings intent keep L06 details during language replacement. Unrelated questions do not inherit an earlier topic.',
 'Advertising: common declarative synthetic-customer claims are rejected. Safe refusals, including postposed Hinglish mat/na/nahi, remain safe.',
 'Evaluator v4: all exact-intent conversation turns receive full-body checks. Reviewed semantic aliases have negative controls. A missing product-name echo is excused only when a later complete product-bearing template proves identity.'
]:y=write(p,'- '+text,y)
y=heading(p,'Preserved scope and source review',y)
y=write(p,'All 8 lessons, 19 original prompt bodies, raw course text, v3 grader, Phase 4 ZIP and 226 captured historical evidence files retain their integrity. The patch covers 11 changed files: product knowledge/response/retrieval services, optional session topic schema, guidance translations, evaluator v4/docs and regression tests. No unrelated business logic or production resource changes.',y)
y=heading(p,'Validation boundary',y)
y=write(p,'191 backend and 77 evaluator checks pass, with 29 complete-template replays and 5 genuine-case replays. Saved upstream text is used as a fixture where necessary, never called new model output. Earlier failed local runs are retained, including a grammatical assertion mismatch and a postposed-negation regression corrected before final checks.',y)
y=heading(p,'Remaining issues',y)
y=write(p,'No fresh live evaluation, production auth/database/load validation or sustained provider reliability measurement occurred. Parsing, retrieval, language and safety semantics remain bounded; conservative drafts do not establish marketing effectiveness. User claims are not independently verified. No 95% accuracy, zero fresh critical failures or production-readiness claim is made.',y)
assert y<780,y
doc.save(out);doc.close()
with fitz.open(out) as pdf:
    assert len(pdf)==2
    for i,page in enumerate(pdf):page.get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(scratch/f'page-{i+1}.png')
print(out);print(scratch)
