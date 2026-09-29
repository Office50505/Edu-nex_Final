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
gold = colors.HexColor('#D39421')
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
    Paragraph('BUILD UPDATE - LIVE USER PRESENCE', title),
    Paragraph('Admin learner management can now distinguish currently online learners from offline learners using authenticated session heartbeats.', sub),
    Table([[Paragraph('Previous behavior', head), Paragraph('New behavior', head)],
           [Paragraph('Admin displayed historical last-active dates only.', cell), Paragraph('Each learner displays Online or Offline with a colored presence dot.', cell)],
           [Paragraph('Activity timestamps changed only through selected learning actions.', cell), Paragraph('The learner app sends an authenticated heartbeat every 30 seconds while visible.', cell)],
           [Paragraph('Admin data refreshed only after manual interaction.', cell), Paragraph('Learner presence refreshes automatically every 30 seconds without replacing the page with a loading state.', cell)]],
          colWidths=[82*mm, 82*mm], style=TableStyle([
              ('BACKGROUND', (0, 0), (-1, 0), navy), ('GRID', (0, 0), (-1, -1), .5, line),
              ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, panel]), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
              ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
              ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
          ])),
    Spacer(1, 6*mm), Paragraph('Implementation', heading),
    Paragraph('- Reused the authenticated session ping endpoint and persisted its latest timestamp.', body),
    Paragraph('- Defined Online as a heartbeat received within the previous three minutes, allowing for browser timer throttling.', body),
    Paragraph('- Continued browser heartbeats while the learner tab is in the background and sent an immediate ping on focus.', body),
    Paragraph('- Added server-calculated presence and last-seen data to admin learner-management responses.', body),
    Paragraph('- Added an Online Now summary card, row-level presence badges, and presence details in the learner drawer.', body),
    Paragraph('- Added a User presence filter with All users, Online now, and Offline options.', body),
    Paragraph('- Kept presence filtering separate from account access and subscription-status filters to prevent ambiguous Active labels.', body),
    Paragraph('- Renamed ambiguous UI values: Active subscription, Enabled Accounts, and User online status with Online users / Offline users.', body),
    Paragraph('- Fixed the learner Course progress record background and text colors so records remain readable in dark and light admin themes.', body),
    Paragraph('Verification', heading),
    Paragraph('<b>Backend:</b> Presence boundary tests passed, including explicit background-tab throttling tolerance.', body),
    Paragraph('<b>Frontend:</b> 74 player tests passed and the production Vite build completed successfully.', body),
    Paragraph('<b>Runtime:</b> Updated backend restarted locally with MongoDB connected.', body),
    Paragraph('Operational behavior', heading),
    Paragraph('A learner becomes Online after opening an authenticated user-panel page. If heartbeats stop, the learner changes to Offline after approximately three minutes. The admin screen updates within its next 30-second refresh.', body),
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
