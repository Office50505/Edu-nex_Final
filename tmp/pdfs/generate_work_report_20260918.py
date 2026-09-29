from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, PageBreak, Paragraph, Spacer,
    Table, TableStyle, KeepTogether, HRFlowable
)

ROOT = Path('/Users/ayankhan/Desktop/edunex/Edu-nex_Final')
OUT = ROOT / 'documents' / 'skillomate-development-work-report-2026-09-18.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
INK = colors.HexColor('#172033')
MUTED = colors.HexColor('#667085')
GOLD = colors.HexColor('#D39421')
GOLD_DARK = colors.HexColor('#9A6510')
GOLD_PALE = colors.HexColor('#FFF7E6')
NAVY = colors.HexColor('#111827')
PANEL = colors.HexColor('#F6F7F9')
LINE = colors.HexColor('#D8DCE3')
GREEN = colors.HexColor('#19724A')
GREEN_PALE = colors.HexColor('#EAF7F0')
BLUE_PALE = colors.HexColor('#EDF4FF')

for name, path in [
    ('Inter', '/System/Library/Fonts/Supplemental/Arial.ttf'),
    ('InterBold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'),
]:
    if Path(path).exists():
        pdfmetrics.registerFont(TTFont(name, path))

FONT = 'Inter' if 'Inter' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
BOLD = 'InterBold' if 'InterBold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold'

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle', fontName=BOLD, fontSize=28, leading=33, textColor=NAVY, spaceAfter=7))
styles.add(ParagraphStyle(name='ReportSubtitle', fontName=FONT, fontSize=12.5, leading=18, textColor=MUTED, spaceAfter=18))
styles.add(ParagraphStyle(name='Kicker', fontName=BOLD, fontSize=9, leading=12, textColor=GOLD_DARK, tracking=1.2, spaceAfter=10))
styles.add(ParagraphStyle(name='H1x', fontName=BOLD, fontSize=17, leading=21, textColor=NAVY, spaceBefore=4, spaceAfter=10, keepWithNext=True))
styles.add(ParagraphStyle(name='H2x', fontName=BOLD, fontSize=12, leading=15, textColor=INK, spaceBefore=8, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='BodyX', fontName=FONT, fontSize=9.5, leading=14.3, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name='SmallX', fontName=FONT, fontSize=8, leading=11.5, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name='SmallBoldX', fontName=BOLD, fontSize=8, leading=11, textColor=INK))
styles.add(ParagraphStyle(name='MetricValue', fontName=BOLD, fontSize=22, leading=25, textColor=NAVY, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='MetricLabel', fontName=FONT, fontSize=8, leading=10, textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='TableHead', fontName=BOLD, fontSize=8, leading=10, textColor=colors.white))
styles.add(ParagraphStyle(name='TableBody', fontName=FONT, fontSize=8, leading=11, textColor=INK))
styles.add(ParagraphStyle(name='TableBodyCenter', fontName=FONT, fontSize=8, leading=11, textColor=INK, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='Callout', fontName=FONT, fontSize=9.5, leading=14, textColor=INK, leftIndent=2*mm, rightIndent=2*mm))
styles.add(ParagraphStyle(name='FooterX', fontName=FONT, fontSize=7.5, leading=9, textColor=MUTED))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18*mm, 14*mm, PAGE_W-18*mm, 14*mm)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18*mm, 9*mm, 'Skillomate | Development Work Report')
    canvas.drawRightString(PAGE_W-18*mm, 9*mm, f'Page {doc.page}')
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm,
    topMargin=18*mm, bottomMargin=20*mm, title='Skillomate Development Work Report',
    author='Skillomate Development Team'
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='content')
doc.addPageTemplates([PageTemplate(id='report', frames=[frame], onPage=footer)])


def P(text, style='BodyX'):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f'<font color="#D39421">&#8226;</font>&nbsp;&nbsp;{text}', ParagraphStyle(
        name='BulletLocal', parent=styles['BodyX'], leftIndent=11, firstLineIndent=-9, spaceAfter=4
    ))


def section(title):
    return [Spacer(1, 2*mm), P(title, 'H1x'), HRFlowable(width='100%', thickness=0.7, color=LINE, spaceAfter=8)]


def metric(value, label):
    return [P(value, 'MetricValue'), Spacer(1, 1.5*mm), P(label, 'MetricLabel')]


def metric_strip(items):
    table = Table([[metric(v, l) for v, l in items]], colWidths=[doc.width/len(items)]*len(items))
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), PANEL), ('BOX', (0,0), (-1,-1), 0.7, LINE),
        ('INNERGRID', (0,0), (-1,-1), 0.5, LINE), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    return table


def data_table(headers, rows, widths):
    data = [[P(h, 'TableHead') for h in headers]]
    for row in rows:
        data.append([P(str(cell), 'TableBody') for cell in row])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY), ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.45, LINE), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, PANEL]),
    ]))
    return t


story = []
story += [Spacer(1, 18*mm), P('DEVELOPMENT RECORD', 'Kicker'), P('Skillomate Development<br/>Work Report', 'ReportTitle')]
story += [P('Frontend, backend, payments, playback, subscription access, progress persistence, debugging and privacy review', 'ReportSubtitle')]
story += [HRFlowable(width='100%', thickness=2, color=GOLD, spaceAfter=16)]
story += [metric_strip([('17', 'files in the primary completed change set'), ('354', 'lines added'), ('86', 'lines removed'), ('207', 'automated tests passing')]), Spacer(1, 8*mm)]
story += [P('<b>Reporting date</b> 18 September 2026', 'BodyX'), P('<b>Repository</b> Edu-nex_Final / Skillomate', 'BodyX'), P('<b>Primary delivered commit</b> f82289f - Fix subscription access and persistent course progress', 'BodyX')]
story += [Spacer(1, 5*mm)]
callout = Table([[P('<b>Outcome.</b> The web and backend suites are green, the production frontend build succeeds, local client/admin/API health checks return HTTP 200, and course progress now remains stable when lesson metadata becomes available.', 'Callout')]], colWidths=[doc.width])
callout.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GOLD_PALE),('BOX',(0,0),(-1,-1),0.8,GOLD),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
story += [callout, Spacer(1, 8*mm)]
story += [P('Scope of this report', 'H2x'), bullet('Documents the work completed during the current Skillomate development and debugging cycle.'), bullet('Separates delivered changes from the latest uncommitted debugging refinements.'), bullet('Records verification evidence, known limitations and recommended next actions.')]
story += [PageBreak()]

story += section('1. Executive summary')
story += [P('The work focused on stabilizing the paid learning experience across the browser, backend and mobile-compatible API. The largest completed change set corrected subscription entitlement behavior, made progress survive refreshes, improved payment simulation, hardened account deletion, and aligned the course-progress component with dark and light themes.', 'BodyX')]
story += [P('The follow-up debugging pass investigated the reported percentage decrease. The root cause was a denominator that changed as previously unknown lesson durations were discovered. Progress is now calculated as the average per-lesson coverage across the fixed lesson count, which prevents the displayed course percentage from dropping solely because metadata was filled later.', 'BodyX')]
story += section('2. Delivered changes by area')
rows = [
    ('Frontend / learner UI', 'Course progress now consumes the backend percentage; dark/light styling improved; learner subscription state remains accessible after refresh; admin controls were aligned with updated APIs.'),
    ('Backend / access', 'Central subscription-access resolver preserves already-paid access until the actual period end, including cancelled subscriptions that should not renew.'),
    ('Backend / progress', 'Progress writes, compatibility projections and certification synchronization were updated so the server is the durable source of truth.'),
    ('Payments', 'The simulator supports the 24-hour trial workflow and idempotent behavior, reducing duplicate or inconsistent local subscription outcomes.'),
    ('Account lifecycle', 'Deletion cleanup was expanded across dependent data while keeping the user deletion as the final step.'),
    ('Playback', 'Private playback authorization and session checks were exercised; CloudFront playback still depends on valid backend key configuration.'),
]
story += [data_table(['Area', 'Completed work'], rows, [42*mm, doc.width-42*mm]), Spacer(1, 4*mm)]
story += [P('Primary completed change-set size', 'H2x'), P('Commit f82289f changed 17 files with 354 additions and 86 deletions across backend services, controllers, middleware, frontend components, admin code and automated tests.', 'BodyX')]
story += [PageBreak()]

story += section('3. Defects addressed')
for item in [
    '<b>Progress reset after refresh:</b> persisted server progress is loaded instead of relying only on transient browser state.',
    '<b>Percentage decreasing:</b> percentage no longer shrinks when additional lesson durations become known.',
    '<b>Subscription requested again locally:</b> access resolution now respects an active trial or remaining paid period even when the raw gateway status is cancelled or stale.',
    '<b>Payment simulator inconsistency:</b> simulator responses and trial duration were normalized and tested for repeat requests.',
    '<b>Theme mismatch:</b> the course-progress panel has explicit dark/light presentation rules.',
    '<b>Test regressions:</b> backend harnesses were updated to provide current helpers used by playback, AI history, mobile player and session-refresh code.',
]: story.append(bullet(item))

story += section('4. Verification evidence')
verification = [
    ('Backend automated suite', '145 / 145 passed', 'PASS'),
    ('Frontend player suite', '62 / 62 passed', 'PASS'),
    ('Frontend production build', '116 modules transformed', 'PASS'),
    ('Mobile Expo configuration', 'Public configuration resolved successfully', 'PASS'),
    ('Backend health endpoint', 'HTTP 200 on localhost:3000', 'PASS'),
    ('Client application', 'HTTP 200 on localhost:5173', 'PASS'),
    ('Admin route', 'HTTP 200 on localhost:5173/admin', 'PASS'),
    ('Git whitespace validation', 'No diff-check errors', 'PASS'),
]
story += [data_table(['Check', 'Evidence', 'Result'], verification, [55*mm, 85*mm, 25*mm])]
story += [Spacer(1, 4*mm), P('<b>Build note:</b> Vite reports one performance warning because the HLS chunk is larger than 500 kB after minification. This does not fail the build, but code splitting is a future optimization.', 'SmallX')]

story += [PageBreak()]
story += section('5. Current working-tree changes')
story += [P('The latest debugging refinements remain uncommitted and have not been pushed. They affect five files: one production backend rule and four automated-test files, totaling 18 additions and 3 deletions.', 'BodyX')]
working = [
    ('edunex-b/services/completionRules.js', 'Stable average per-lesson percentage calculation.'),
    ('edunex-b/tests/certification.test.cjs', 'Regression test for newly discovered lesson durations.'),
    ('edunex-b/tests/ai-chat-history.test.cjs', 'Updated isolated test helper context.'),
    ('edunex-b/tests/mobile-player.test.cjs', 'Updated course-loader test dependency.'),
    ('edunex-b/tests/web-session-refresh.test.cjs', 'Updated revoked-session handler dependency.'),
]
story += [data_table(['File', 'Purpose'], working, [82*mm, doc.width-82*mm])]

story += section('6. Privacy and activity-tracking review')
story += [P('The application processes personally identifiable and behavioral information required for account, learning and support features. This includes names, mobile numbers, optional email, age/gender selections, avatar data, session/device context, learning progress, subscription information and support messages.', 'BodyX')]
story += [P('Current activity records cover login sessions, IP/user-agent context, video starts, playback progress, video and course completion, downloads, wishlists, payments, subscriptions, certificates and selected administrative actions. The system does not currently maintain a comprehensive clickstream for every button, link, page view, search, scroll or form abandonment.', 'BodyX')]
privacy = Table([[P('<b>Recommended boundary</b><br/>Track meaningful product events, not raw keystrokes or indiscriminate clicks. Never place passwords, OTPs, payment-card data or sensitive message content in analytics payloads. Update consent, privacy and retention controls before expanding behavioral tracking.', 'Callout')]], colWidths=[doc.width])
privacy.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),BLUE_PALE),('BOX',(0,0),(-1,-1),0.7,colors.HexColor('#8DB5E8')),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
story += [privacy]

story += section('7. Recommended next actions')
for item in [
    '<b>Review and commit</b> the five current debugging changes after product-owner approval.',
    '<b>Retest with a real subscribed local account</b> to confirm entitlement, playback and progress behavior end to end.',
    '<b>Configure private CloudFront playback</b> with the correct backend private key and public key ID in the deployment environment.',
    '<b>Remove tracked iOS build logs and archives</b> from future source-control commits because they expose developer/build metadata and unnecessarily enlarge the repository.',
    '<b>Define an analytics event catalog</b> before adding click tracking, including purpose, fields, retention period and deletion behavior.',
    '<b>Optimize the HLS bundle</b> through lazy loading or manual chunking if initial-load performance becomes a concern.',
]: story.append(bullet(item))

story += [Spacer(1, 3*mm), P('<b>Status:</b> ready for review. Automated checks are green. The outstanding decision is whether to commit and push the latest five-file debugging refinement.', 'SmallX')]

doc.build(story)
print(OUT)
