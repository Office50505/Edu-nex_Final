from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import simpleSplit
from xml.sax.saxutils import escape
import re, fitz, json
root=Path.cwd()
src=root/'reports/compliance-check-fixes-2026-11-06/BUILD34_COMPARISON.md'
out=root/'output/pdf/Skillomate_Build34_Review_Status_2026-11-06.pdf'
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleAudit', fontName='Helvetica-Bold', fontSize=25, leading=30, textColor=HexColor('#172b3a'), spaceAfter=18))
styles.add(ParagraphStyle(name='SectionAudit', fontName='Helvetica-Bold', fontSize=15, leading=19, textColor=HexColor('#173e57'), spaceBefore=16, spaceAfter=9, keepWithNext=True))
styles.add(ParagraphStyle(name='IssueAudit', fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=HexColor('#173e57'), spaceBefore=11, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name='BodyAudit', fontName='Helvetica', fontSize=9.5, leading=14, textColor=HexColor('#263746'), spaceAfter=8, splitLongWords=True))
styles.add(ParagraphStyle(name='MatrixAudit', parent=styles['BodyAudit'], fontSize=9, leading=13, leftIndent=9, borderPadding=6, backColor=HexColor('#f3f6f8'), spaceAfter=7))
styles.add(ParagraphStyle(name='BulletAudit', parent=styles['BodyAudit'], leftIndent=12, firstLineIndent=-10))
def fmt(s):
    s=escape(s)
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'<font face="Courier" size="8">\1</font>',s)
    s=re.sub(r'(https://[^\s<]+)',lambda m:'<link href="'+m.group(1)+'" color="#18609a">'+m.group(1).replace('/','/<wbr/>')+'</link>',s)
    return s
story=[]
for line in src.read_text().splitlines():
    if not line.strip(): continue
    if line.startswith('# '): story.append(Paragraph(fmt(line[2:]),styles['TitleAudit']))
    elif line.startswith('## '): story.append(Paragraph(fmt(line[3:]),styles['SectionAudit']))
    elif line.startswith('### '): story.append(Paragraph(fmt(line[4:]),styles['IssueAudit']))
    elif line.startswith('|'):
        cells=[x.strip() for x in line.strip('|').split('|')]
        if cells[0] in ('Item','---'): continue
        if all(set(x)<=set('-: ') for x in cells):continue
        story.append(Paragraph(fmt('**'+cells[0]+' | '+cells[1]+'**')+'<br/>'+fmt(cells[2]),styles['MatrixAudit']))
    elif line.startswith('- '):story.append(Paragraph('- '+fmt(line[2:]),styles['BulletAudit']))
    else:story.append(Paragraph(fmt(line),styles['BodyAudit']))
def footer(canvas,doc):
    canvas.setStrokeColor(HexColor('#d9e1e7')); canvas.line(42,39,553,39)
    canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#5d6d7a'))
    canvas.drawString(42,26,'SKILLOMATE  /  BUILD 34 REVIEW STATUS  /  6 NOVEMBER 2026')
    canvas.drawRightString(553,26,str(doc.page))
doc=SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=42,leftMargin=42,topMargin=43,bottomMargin=55,title='Skillomate Release 34 Preparation - 6 November 2026',author='Skillomate technical audit')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
pdf=fitz.open(out)
images=[]
for i,page in enumerate(pdf):
    dest=root/f'tmp/pdfs/build34-review-status/page-{i+1}.png'
    page.get_pixmap(matrix=fitz.Matrix(1,1)).save(dest)
    images.append(str(dest))
from PIL import Image,ImageOps,ImageDraw
thumbs=[]
for i,p in enumerate(images):
    im=Image.open(p).convert('RGB');im.thumbnail((298,422))
    tile=Image.new('RGB',(318,452),'#cfd5db');tile.paste(im,((318-im.width)//2,10));ImageDraw.Draw(tile).text((12,434),f'Page {i+1}',fill='black');thumbs.append(tile)
for start in range(0,len(thumbs),6):
    batch=thumbs[start:start+6];sheet=Image.new('RGB',(318*3,452*2),'white')
    for k,im in enumerate(batch):sheet.paste(im,((k%3)*318,(k//3)*452))
    sheet.save(root/f'tmp/pdfs/build34-review-status/contact-{start//6+1}.png')
assert all(page.get_text().strip() for page in pdf)
print(json.dumps({'pdf':str(out),'pages':len(pdf),'bytes':out.stat().st_size,'rendered':len(images)}))
