from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/pdf/skillomate-admin-update-comparison-2026-09-17.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

INK = colors.HexColor("#1B1916")
GOLD = colors.HexColor("#C88C1E")
MUTED = colors.HexColor("#665F56")
LINE = colors.HexColor("#DDD5C9")
PAPER = colors.HexColor("#FCFAF6")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleX", fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="SectionX", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK, spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name="BodyX", fontName="Helvetica", fontSize=9, leading=13, textColor=INK))
styles.add(ParagraphStyle(name="MetaX", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="HeadX", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(18*mm, 16*mm, A4[0]-18*mm, 16*mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18*mm, 10*mm, "Skillomate admin update comparison")
    canvas.drawRightString(A4[0]-18*mm, 10*mm, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=22*mm,
                        title="Skillomate Admin Update Comparison", author="Codex")
story = [Spacer(1, 8*mm), Paragraph("SKILLOMATE ADMIN", ParagraphStyle("K", parent=styles["MetaX"], fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, spaceAfter=7)),
         Paragraph("GitHub Update Comparison", styles["TitleX"]),
         Paragraph("Previous local baseline vs. integrated origin/main", styles["MetaX"]), Spacer(1, 9*mm)]

meta = [
    ["Date", "17 September 2026"],
    ["Previous revision", "9eb9e05 - Configure Android SDK versions"],
    ["New revision", "e563e00 - icon and new build"],
    ["Update method", "Fetch + fast-forward pull + tracked-change stash restore"],
    ["Local work", "Preserved; returned to its prior unstaged state"],
]
t = Table([[Paragraph(f"<b>{a}</b>", styles["MetaX"]), Paragraph(b, styles["BodyX"])] for a,b in meta], colWidths=[38*mm,118*mm])
t.setStyle(TableStyle([("GRID",(0,0),(-1,-1),.45,LINE),("BACKGROUND",(0,0),(-1,-1),colors.white),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [t, Spacer(1, 8*mm), Paragraph("Outcome", styles["SectionX"]),
          Paragraph("The local main branch now matches origin/main at e563e00. Ten upstream commits were added without discarding the existing Android, backend, admin-user-management, reports, screenshots, or QA artifacts.", styles["BodyX"]),
          Spacer(1, 5*mm), Paragraph("Notable upstream changes", styles["SectionX"])]

changes = [
    ("Admin panel", "New operations pages, refreshed navigation and shell, dashboard/course/upload/certification updates, admin branding assets, and a major admin stylesheet refresh."),
    ("Authentication", "OTP password recovery and supporting frontend/backend tests were added."),
    ("Media", "Video-player behavior and HLS/player styling were updated."),
    ("Mobile", "Launcher icons, app code, Android build configuration, footer behavior, and iOS lockfile updates were pulled."),
    ("Frontend", "Theme preload, route redirects, navigation/footer refinements, and multiple public page updates were integrated."),
]
for heading, body in changes:
    story += [Paragraph(f"<b>{heading}:</b> {body}", styles["BodyX"]), Spacer(1, 2.5*mm)]

story += [PageBreak(), Paragraph("Conflict resolution and preservation", styles["SectionX"])]
rows = [[Paragraph("File", styles["HeadX"]), Paragraph("Resolution", styles["HeadX"])],
        [Paragraph("appcopyai/android/build.gradle", styles["BodyX"]), Paragraph("Adopted upstream build tools 36.1.0 while preserving the local target SDK 36 setting.", styles["BodyX"])],
        [Paragraph("AdminUsersPage.jsx", styles["BodyX"]), Paragraph("Combined the upstream CRM drawer, six-column learner layout, progress view, and delete flow with local ban/unban, subscription management, audit history, and account-state controls.", styles["BodyX"])],
        [Paragraph("admin-react.css", styles["BodyX"]), Paragraph("Merged automatically; local styling changes remain over the new upstream admin design.", styles["BodyX"])]]
rt = Table(rows, colWidths=[56*mm,100*mm], repeatRows=1)
rt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),INK),("GRID",(0,0),(-1,-1),.45,LINE),("BACKGROUND",(0,1),(-1,-1),colors.white),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [rt, Spacer(1, 8*mm), Paragraph("Verification performed", styles["SectionX"])]
checks = [
    ("Frontend production build", "PASS", "Vite transformed 114 modules and completed the production build."),
    ("Admin maintenance tests", "PASS", "9/9 tests passed."),
    ("Admin user controls", "PASS", "3/3 focused tests passed for ban/session revocation, subscription validation, and audit metadata."),
    ("Repository synchronization", "PASS", "main and origin/main both resolve to e563e00."),
    ("Conflict markers", "PASS", "Both conflicts were resolved and marked; no unmerged paths remain."),
]
vt = Table([[Paragraph("Check",styles["HeadX"]),Paragraph("Result",styles["HeadX"]),Paragraph("Evidence",styles["HeadX"])]] + [[Paragraph(a,styles["BodyX"]),Paragraph(f"<b>{b}</b>",styles["BodyX"]),Paragraph(c,styles["BodyX"])] for a,b,c in checks], colWidths=[52*mm,22*mm,82*mm], repeatRows=1)
vt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),INK),("GRID",(0,0),(-1,-1),.45,LINE),("BACKGROUND",(0,1),(-1,-1),colors.white),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [vt, Spacer(1, 8*mm), Paragraph("Safety note", styles["SectionX"]),
          Paragraph("The automatic stash created before pulling remains available as stash@{0}. It is a temporary recovery copy; the restored working tree already contains the preserved local changes. Untracked files were never moved or deleted.", styles["BodyX"])]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
