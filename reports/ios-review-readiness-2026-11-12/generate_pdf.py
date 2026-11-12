"""Render the audit narrative. Full clause detail remains in the accompanying matrix."""
from pathlib import Path
from html import escape
import re
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TARGET = ROOT/'output/pdf/skillomate-ios-review-readiness-2026-11-12.pdf'
TARGET.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='AuditBody',fontName='Helvetica',fontSize=9.2,leading=13,spaceAfter=7,textColor=colors.HexColor('#253348')))
styles.add(ParagraphStyle(name='AuditCell',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=0))
styles['Title'].fontSize=23; styles['Title'].leading=28
styles['Heading2'].fontSize=13; styles['Heading2'].leading=17; styles['Heading2'].spaceBefore=13
styles['Heading2'].keepWithNext=True

def inline(s):
    s = escape(s).replace('→','&gt;').replace('–','-').replace('—','-')
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m: m[1]+' ('+m[2]+')',s)
    s = re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
    s = re.sub(r'`([^`]+)`',r'\1',s)
    return s

story=[]; table=[]
def flush():
    global table
    if not table:return
    cells=[[Paragraph(inline(v),styles['AuditCell']) for v in row] for row in table]
    t=LongTable(cells,colWidths=[150,160,201],repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8EEF7')),
                          ('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#CCD5E2')),
                          ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
                          ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    story.extend([t,Spacer(1,10)]);table=[]

for line in (HERE/'README.md').read_text().splitlines():
    if line.startswith('|'):
        cells=[c.strip() for c in line.strip('|').split('|')]
        if not all(re.fullmatch(r'[-:]+',c) for c in cells):table.append(cells)
        continue
    flush()
    if not line.strip():continue
    if line.startswith('# '):story.append(Paragraph(inline(line[2:]),styles['Title']))
    elif line.startswith('## '):story.append(Paragraph(inline(line[3:]),styles['Heading2']))
    else:story.append(Paragraph(inline(line),styles['AuditBody']))
flush()
def footer(canvas,doc):
    canvas.setStrokeColor(colors.HexColor('#CCD5E2'));canvas.line(42,37,A4[0]-42,37)
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#59677C'))
    canvas.drawString(42,25,'Skillomate | iOS review audit | 12 November 2026')
    canvas.drawRightString(A4[0]-42,25,str(doc.page))
doc=SimpleDocTemplate(str(TARGET),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=40,bottomMargin=49,
                      title='Skillomate iOS App Review Readiness - 12 November 2026',author='Project audit')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(TARGET)
