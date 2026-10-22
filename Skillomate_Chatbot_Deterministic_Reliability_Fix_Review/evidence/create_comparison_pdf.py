from pathlib import Path
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
from reportlab.lib.enums import TA_LEFT
import fitz
E=Path(__file__).resolve().parent;R=E.parent;s=json.loads((E/'verification_summary.json').read_text());out=R/'output/pdf';out.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='Deck',fontName='Helvetica',fontSize=11,leading=16,textColor=colors.HexColor('#44536b'),spaceAfter=14));styles['BodyText'].fontSize=9.5;styles['BodyText'].leading=14;styles['BodyText'].spaceAfter=9;styles['Heading2'].fontSize=13;styles['Heading2'].spaceBefore=10;styles['Heading2'].spaceAfter=8
story=[]
def para(t,style='BodyText'):story.append(Paragraph(t,styles[style]))
def heading(t):para(t,'Heading2')
para('Skillomate chatbot','Title');para('Deterministic reliability correction<br/>AI Product Photoshoot &amp; Ads','Deck')
para('LOCAL REVIEW ONLY  |  16 October 2026','Heading3');para('Comparison against the saved working tree. No deployment, production interaction, external inference, commit or push. Eight source files changed; one test file added. Existing curriculum, evaluator, historical grades and schema are preserved.')
heading('Verified before and after')
data=[['Check','Baseline','Corrected candidate'],['Full backend','1,048 pass / 24 fail','1,171 pass / same 24 fail'],['New reliability tests','13 pass / 110 fail','123 pass / 0 fail'],['Existing Python evaluators','Unchanged evaluator','167 pass / 0 fail'],['All 19 approved assets','Known copy / fill defects','57 full-body controls pass'],['Exposed failed exact cases','19 failed cases','19 complete expected bodies'],['Original critical scenarios','Known four diagnoses','4 scenarios / 5 bodies pass'],['Phase 12 passing comparison','40 cases / 48 turns','40 byte-identical cases']]
table=Table([[Paragraph(c,styles['BodyText']) for c in row] for row in data],colWidths=[164,150,174],hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eef7')),('GRID',(0,0),(-1,-1),0.35,colors.HexColor('#cbd4e2')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),4)]));story.append(table)
heading('Interpretation')
para('The full backend suite still exits with failure because the same 24 pre-existing tests remain red. There are zero newly failing or skipped backend tests. The Phase 12 comparison explicitly uses 11 recorded upstream responses; it measures preservation, not live-model quality.')
para('The 59 exposed diagnostic scenarios cover 72 turns per stage: 19 exact-body passes, 24 provider-dependent scenarios untested for real generation, and 16 local-response observations without a new blind semantic score. No improved overall accuracy or production readiness is claimed.')
story.append(PageBreak());para('Changes, boundaries and rollback','Title')
for title,body in [
 ('Approved template handling','Raw copying preserves every placeholder. Filling uses approved labels and explicit facts, including constrained slot-only edits. Every other source word remains unchanged; unknown fields stay literal.'),
 ('Task routing and local completeness','A transient plan separates copy, explanation, synthesis, troubleshooting and account requests. Product-course disambiguation follows authoritative server context. Local artifacts are checked for requested deliverables and language; genuine synthesis reaches the normal provider path under hard transport denial.'),
 ('Product state and multilingual behavior','Shared declaration parsing preserves original Unicode while validating a separate NFKC security view. Atomic replacement clears obsolete product-bound facts; rename and corrections retain appropriate facts. Explicit language, counts and dialogue language are respected. Negative constraints do not become affirmative claim evidence.'),
 ('Security and compatibility','Authentication, entitlement, owner-scoped retrieval, payload assertions and mandatory refusal remain. No unrestricted template registry was introduced. Existing response keys and persistence schema remain; extra explicit slots use the existing bounded attributes array. Synthetic tests are not a production security certification.'),
 ('Remaining limits','Real inference, provider quality, production persistence and concurrency remain untested. Grammar and local drafts are conservative, not universal language understanding. The historical 18 PASS / 67 FAIL / 35 UNTESTED grades are unchanged. Existing 24 backend failures remain release blockers.'),
 ('Review and rollback','Use the baseline-relative patch and SHA-256 manifest, not a diff against HEAD. Check final hashes before reversing this patch; preserve unrelated user changes. No reset, stash, git clean, database migration or production toggle is required. Review approval does not authorize external content transmission or deployment.')]:
 heading(title);para(body)
para('STOP AFTER PACKAGING. AWAIT REVIEW.','Heading3')
pdf=out/'Skillomate_Deterministic_Reliability_Comparison.pdf'
def footer(canvas,doc):
 canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#66758a'));canvas.drawString(44,24,'Skillomate | Local correction review | No external inference');canvas.drawRightString(A4[0]-44,24,str(doc.page))
SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=44,leftMargin=44,topMargin=36,bottomMargin=42).build(story,onFirstPage=footer,onLaterPages=footer)
doc=fitz.open(pdf);pages=[]
for i,page in enumerate(doc):
 dest=out/('comparison_page_'+str(i+1)+'.png');page.get_pixmap(matrix=fitz.Matrix(1,1)).save(dest);pages.append({'page':i+1,'textCharacters':len(page.get_text()),'renderedPNG':str(dest.relative_to(R))})
assert len(doc)==2
(E/'pdf_verification.json').write_text(json.dumps({'file':str(pdf.relative_to(R)),'pages':pages,'rendered':True,'tool':'reportlab + PyMuPDF in existing local venv; no download'},indent=2)+'\n')
print(pdf)
