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
    Paragraph('BUILD UPDATE - COURSE OWNERSHIP', title),
    Paragraph('Comparison of the previous subscription-only learner controls with the completed individual-course purchase and learner-dashboard workflow.', sub),
    Table([[Paragraph('Previous behavior', head), Paragraph('New behavior', head)],
           [Paragraph('Admin-created learners received no access or broad subscription access.', cell), Paragraph('Admins can assign a specific published course when creating a learner.', cell)],
           [Paragraph('Learner controls offered Grant subscription and Remove access.', cell), Paragraph('Learner controls offer Add purchased course and Remove course.', cell)],
           [Paragraph('Protected course and playback routes checked subscription entitlement only.', cell), Paragraph('Protected routes recognize ownership of the requested course; legacy subscriptions remain a compatibility fallback.', cell)]],
          colWidths=[82*mm, 82*mm], style=TableStyle([
              ('BACKGROUND', (0, 0), (-1, 0), navy), ('GRID', (0, 0), (-1, -1), .5, line),
              ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, panel]),
              ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 7),
              ('RIGHTPADDING', (0, 0), (-1, -1), 7), ('TOPPADDING', (0, 0), (-1, -1), 7),
              ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
          ])),
    Spacer(1, 6*mm), Paragraph('Notable code changes', heading),
    Paragraph('- Added purchasedCourses references to learner records.', body),
    Paragraph('- Added an audited admin API for granting and revoking individual courses.', body),
    Paragraph('- Updated playlist, private playback and certification authorization to accept course ownership.', body),
    Paragraph('- Preserved subscription entitlement as a transition fallback for existing paying customers.', body),
    Paragraph('- Updated learner creation and management UI to use course selection instead of subscription duration.', body),
    Paragraph('- Replaced manual course-number prompts with an accessible in-page dropdown dialog and audit-reason field.', body),
    Paragraph('- Added per-course Trial (custom days), Yearly (365 days), and Permanent access with backend expiry enforcement.', body),
    Paragraph('- Added immediate purchased-course detail cards in learner management and synchronized the open learner drawer after ownership changes.', body),
    Paragraph('- Extended subscription-status responses with active course IDs and duration-aware entitlement details.', body),
    Paragraph('- Fixed the learner dashboard gate so an assigned course unlocks the panel without requiring a global subscription.', body),
    Paragraph('- Limited course-owner learning history to courses assigned by an administrator; subscribers retain catalog-wide access.', body),
    Paragraph('Verification', heading),
    Paragraph('<b>Backend:</b> 8 targeted entitlement and playback tests passed, including legacy permanent grants and expired trial exclusion.', body),
    Paragraph('<b>Frontend:</b> 74 player tests passed and the production Vite build completed successfully.', body),
    Paragraph('<b>Code quality:</b> JavaScript syntax checks and git whitespace validation passed.', body),
    Paragraph('Deployment note', heading),
    Paragraph('This build is implemented and verified locally. Production behavior will change only after the backend and frontend are deployed together.', body),
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
