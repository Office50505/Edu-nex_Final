from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

root = Path('/Users/ayankhan/Desktop/edunex/Edu-nex_Final')
target = root / 'documents' / 'skillomate-development-work-report-2026-09-18.pdf'
navy = colors.HexColor('#111827')
muted = colors.HexColor('#667085')
line = colors.HexColor('#D8DCE3')
panel = colors.HexColor('#F6F7F9')
title = ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=20, leading=25, textColor=navy, spaceAfter=10)
sub = ParagraphStyle('sub', fontName='Helvetica', fontSize=10, leading=15, textColor=muted, spaceAfter=12)
heading = ParagraphStyle('heading', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=navy, spaceBefore=9, spaceAfter=6)
body = ParagraphStyle('body', fontName='Helvetica', fontSize=9, leading=13.5, textColor=navy, spaceAfter=6)
head = ParagraphStyle('head', fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white)
cell = ParagraphStyle('cell', fontName='Helvetica', fontSize=8, leading=11, textColor=navy)

buffer = BytesIO()
doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
story = [
    Paragraph('BUILD UPDATE - LEARNER PURCHASE HISTORY', title),
    Paragraph('A dedicated Purchase history action now gives administrators a unified learner commerce and course-access timeline.', sub),
    Table([[Paragraph('Previous behavior', head), Paragraph('New behavior', head)],
           [Paragraph('Manage showed course ownership and a technical admin-action list.', cell), Paragraph('Every learner row now includes a Purchase history button beside View and Manage.', cell)],
           [Paragraph('Payment orders and manual course assignments were separate.', cell), Paragraph('One chronological panel combines payment orders with course grant and revoke events.', cell)],
           [Paragraph('Manual course assignments could not be understood as purchase/access history.', cell), Paragraph('Admin assignments show course title, access duration, status, reason context, and date.', cell)]],
          colWidths=[82*mm, 82*mm], style=TableStyle([
              ('BACKGROUND', (0, 0), (-1, 0), navy), ('GRID', (0, 0), (-1, -1), .5, line),
              ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, panel]), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
              ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
              ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
          ])),
    Spacer(1, 6*mm), Paragraph('Implementation', heading),
    Paragraph('- Added a protected per-user purchase-history endpoint.', body),
    Paragraph('- Returns up to 100 recent payment orders and 100 recent course ownership changes.', body),
    Paragraph('- Added a responsive, theme-aware Purchase history panel that expands beneath the learner row like Manage.', body),
    Paragraph('- The button changes to Close history while its inline panel is open.', body),
    Paragraph('- Reorganized row actions into a two-column grid: View/Manage, full-width Purchase history, then destructive actions.', body),
    Paragraph('- Formatted Indian learner mobile numbers for display as +91,99999-99992 without changing stored values or search behavior.', body),
    Paragraph('- Reduced the sidebar-only wordmark size and reserved fixed space for the collapse control so the full Skillomate brand is not clipped.', body),
    Paragraph('- Shows payment type, gateway, payment instrument, amount, status, and timestamp.', body),
    Paragraph('- Shows admin course grants and revocations with course title and Trial, Yearly, or Permanent access type.', body),
    Paragraph('- Added empty, loading, and error states.', body),
    Paragraph('Verification', heading),
    Paragraph('<b>Backend:</b> 17 admin, entitlement, playback, and presence tests passed.', body),
    Paragraph('<b>Frontend:</b> 74 player tests passed and the production Vite build completed successfully.', body),
    Paragraph('<b>Code quality:</b> Backend syntax and git whitespace validation passed.', body),
    Paragraph('Data note', heading),
    Paragraph('A manually assigned course is labeled Admin assigned rather than displaying a false payment amount. Real payment orders retain their stored INR amount and gateway status.', body),
]
doc.build(story)
buffer.seek(0)
existing = PdfReader(str(target))
appendix = PdfReader(buffer)
writer = PdfWriter()
for page in existing.pages[:-1]:
    writer.add_page(page)
for page in appendix.pages:
    writer.add_page(page)
writer.add_metadata(existing.metadata or {})
with target.open('wb') as stream:
    writer.write(stream)
print(target)
