from pathlib import Path
import json
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from pypdf import PdfReader
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/Phase14A1_Comparison.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
QA = ROOT / 'evidence/pdf_qa'
QA.mkdir(exist_ok=True)
evidence = json.loads((ROOT / 'evidence/verification_summary.json').read_text())
assert evidence['finalBackend']['passed'] == 476
assert evidence['finalSafetySubset']['passed'] == 67
assert evidence['finalPythonEvaluator']['passed'] == 167
assert evidence['phase12PassingReplay']['byteIdenticalCases'] == 40

navy = colors.HexColor('#142b45')
green = colors.HexColor('#157654')
muted = colors.HexColor('#506277')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle', fontName='Helvetica-Bold', fontSize=23, leading=27, textColor=navy, spaceAfter=12))
styles.add(ParagraphStyle(name='Deck', fontName='Helvetica', fontSize=11, leading=16, textColor=muted, spaceAfter=14))
styles.add(ParagraphStyle(name='Section', fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=navy, spaceBefore=12, spaceAfter=7))
styles.add(ParagraphStyle(name='Copy', fontName='Helvetica', fontSize=10, leading=14, spaceAfter=9))
styles.add(ParagraphStyle(name='Cell', fontName='Helvetica', fontSize=9, leading=12))
styles.add(ParagraphStyle(name='TableHeader', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.white))
P = lambda text, style='Copy': Paragraph(text, styles[style])
story = []
story += [P('SKILLOMATE  /  LOCAL REVIEW', 'Deck'), P('Phase 14A.1<br/>Unicode Safety Correction', 'ReportTitle'),
          P('16 October 2026 | AI Product Photoshoot &amp; Ads<br/>Comparison with the stopped Phase 14A working tree.', 'Deck')]
story += [P('The confirmed bypass is rejected. The four functional improvements remain intact. This candidate is ready for safety review before independent blind evaluation; Phase 14B has not started.'),
          P('What changed', 'Section'),
          P('The original Unicode name is retained for legitimate output. A separate NFKC security view now feeds the existing rejection rules in extraction and rendering. Additional script, invisible-character and bidi controls provide checks beyond normalization.'),
          P('Hindi and Hinglish generic declarations also exclude named-declaration prefixes, so a rejected name cannot be retried with a different prefix.')]
rows = [
    ['Verification', 'Phase 14A / before', 'Phase 14A.1 / final'],
    ['Original full-width bypass', 'Accepted (unsafe)', 'Rejected'],
    ['New safety tests', '22/65 pass; 43 fail', '67/67 pass'],
    ['Backend regression suite', '409/409 pass', '476/476 pass'],
    ['Python evaluator suites', '167/167 pass', '167/167 pass'],
    ['Four critical functional cases', '4/4 pass', '4/4 pass; 5 identical turns'],
    ['Phase 12 passing replay', '40 cases / 48 turns', 'All final answers identical'],
    ['External provider requests', 'None in local tests', '0'],
]
data = [[P(cell, 'TableHeader' if i == 0 else 'Cell') for cell in row] for i, row in enumerate(rows)]
table = Table(data, colWidths=[173, 155, 175], hAlign='LEFT')
table.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), navy), ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#edf3f7'), colors.white]), ('VALIGN',(0,0),(-1,-1),'TOP'), ('TOPPADDING',(0,0),(-1,-1),8), ('BOTTOMPADDING',(0,0),(-1,-1),8), ('LEFTPADDING',(0,0),(-1,-1),9), ('RIGHTPADDING',(0,0),(-1,-1),9)]))
story += [Spacer(1,7), table, Spacer(1,12), P('The final 476 include all prior 409 tests plus 67 safety tests. The before safety run had 65 tests; two additional fallback controls were added during correction. Zero final failures or skips. All failed development runs remain in the evidence.')]
story.append(PageBreak())
story += [P('Scope, evidence and next gate', 'ReportTitle'),
          P('Code change boundaries', 'Section'),
          P('<b>Two existing application files:</b> productTutorState.js and productTutorKnowledge.js.<br/><b>One new test file:</b> product-tutor-unicode-safety.test.cjs.<br/>The incremental patch is based on the exact existing working tree. Unrelated source, historical artifacts and the repository index were preserved.'),
          P('No approved source body, v7 evaluator, API, authentication, entitlement, provider setting or database schema changed. No migration, deployment, production request, model retraining, commit or push was performed.'),
          P('Safety and functional evidence', 'Section'),
          P('Positive coverage preserves Hindi code points, Hindi joiners, English/Hinglish names and separate mixed-language words. Negative coverage includes full-width and mathematical letters, mixed-script instruction tokens, invisible splitting, bidi controls, structural delimiters, product replacement and remembered-state follow-ups.'),
          P('The original four critical cases pass complete independent body comparisons. All five critical answers remain byte-identical to Phase 14A. The 40 previously passing Phase 12 cases replay unchanged across 48 turns. No unexpected changed response or prior-test regression was observed.'),
          P('Provider accounting', 'Section'),
          P('The backend suite observes 62 adapter invocations and 70 transport attempts against injected fixtures with external networking denied. The Phase 12 replay serves 11 provider invocations from historical response fixtures. Critical-case and new route-safety tests make no provider calls. These are not fresh live-model results.'),
          P('Known limits and recommendation', 'Section'),
          P('The per-word Latin/Greek or Latin/Cyrillic restriction can reject legitimate mixed-alphabet brand names. NFKC and finite rules do not establish universal injection resistance. Production storage, concurrency, UI behavior, unrestricted multilingual inputs and fresh model quality remain unverified.'),
          P('<b>Recommendation:</b> review the patch and trade-offs, then freeze an independent blind evaluation. Keep development examples out of the blind set. Phase 14B has not been started. Production readiness is not claimed.'),
          P('Machine evidence: evidence/verification_summary.json, evidence/code_changes.patch, evidence/final/*, and the original SAFETY_STOP.json copy. Full logs, source snapshots and integrity hashes accompany this PDF.')]

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#d5dee7'))
    canvas.line(46, 46, A4[0]-46, 46)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(muted)
    canvas.drawString(46, 32, 'LOCAL IMPLEMENTATION ONLY  |  NO DEPLOYMENT  |  AWAITING REVIEW')
    canvas.drawRightString(A4[0]-46, 32, str(doc.page))

SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=46, rightMargin=46, topMargin=42, bottomMargin=60,
                  title='Skillomate Phase 14A.1 Unicode Safety Comparison', author='Skillomate review').build(story, onFirstPage=footer, onLaterPages=footer)
reader=PdfReader(OUT)
assert len(reader.pages)==2, len(reader.pages)
text='\n'.join(p.extract_text() for p in reader.pages)
for value in ['476/476','167/167','67/67','Phase 14B has not']:
    assert value in text, value
doc=pymupdf.open(OUT)
for i,page in enumerate(doc):
    page.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(QA / f'page-{i+1}.png')
    for block in page.get_text('blocks'):
        assert block[0]>=25 and block[2]<=A4[0]-25 and block[1]>=20 and block[3]<=A4[1]-15, block[:4]
(QA / 'verification.json').write_text(json.dumps({'pages':len(reader.pages),'textChecksPassed':True,'textBoundsPassed':True,'renderer':'PyMuPDF (Poppler unavailable)','pdfBytes':OUT.stat().st_size}, indent=2)+'\n')
print(OUT)
