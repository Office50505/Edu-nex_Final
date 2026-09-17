from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

root = Path(__file__).resolve().parents[2]
out = root / "output/pdf/skillomate-admin-panel-color-fix-2026-09-17.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="T", fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=colors.HexColor("#1b1916"), spaceAfter=8))
styles.add(ParagraphStyle(name="S", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#1b1916"), spaceBefore=8, spaceAfter=7))
styles.add(ParagraphStyle(name="B", fontName="Helvetica", fontSize=9.5, leading=14, textColor=colors.HexColor("#29251f")))
styles.add(ParagraphStyle(name="H", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#ddd5c9")); canvas.line(18*mm, 16*mm, A4[0]-18*mm, 16*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(colors.HexColor("#665f56"))
    canvas.drawString(18*mm, 10*mm, "Skillomate admin color fix comparison")
    canvas.drawRightString(A4[0]-18*mm, 10*mm, "Page 1")
    canvas.restoreState()

doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=22*mm, bottomMargin=22*mm,
                        title="Skillomate Admin Panel Color Fix", author="Codex")
story = [Paragraph("SKILLOMATE ADMIN", ParagraphStyle("K", parent=styles["B"], fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#c58b2a"), spaceAfter=7)),
         Paragraph("Expanded Learner Panel Color Fix", styles["T"]),
         Paragraph("Before/after implementation report - 17 September 2026", styles["B"]), Spacer(1, 9*mm)]

rows = [[Paragraph("Previous behavior", styles["H"]), Paragraph("New behavior", styles["H"])],
        [Paragraph("The expanded learner-management panel was forced to #fbfdfb by a legacy selector. In dark mode this produced a bright white area, washed-out text, and low-contrast detail cards.", styles["B"]),
         Paragraph("The expanded panel now uses the active admin theme variables. Dark mode renders the dark surface with white/muted text; the explicit light-theme selector continues to render a white surface.", styles["B"])]]
t = Table(rows, colWidths=[78*mm,78*mm])
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1b1916")),("GRID",(0,0),(-1,-1),.5,colors.HexColor("#ddd5c9")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story += [t, Spacer(1, 9*mm), Paragraph("Code change", styles["S"]),
          Paragraph("Updated <b>edunex-f/src/pages/admin/admin-react.css</b>. The dark and light progress-panel rules now include the more-specific <b>.users-shell .progress-panel</b> selector, which overrides the legacy rule without relying on source-order ambiguity.", styles["B"]),
          Spacer(1, 7*mm), Paragraph("Verification", styles["S"])]
checks = [
    ("CSS cascade", "PASS", "The corrective selector matches/exceeds the legacy selector specificity."),
    ("Dark theme", "PASS", "Uses var(--admin-surface), var(--admin-text), and var(--admin-line)."),
    ("Light theme", "PASS", "Explicit admin-theme-light override remains white with dark text."),
    ("Production build", "PASS", "Vite transformed 114 modules and completed successfully."),
]
vt = Table([[Paragraph("Check",styles["H"]),Paragraph("Result",styles["H"]),Paragraph("Evidence",styles["H"])]] + [[Paragraph(a,styles["B"]),Paragraph(f"<b>{b}</b>",styles["B"]),Paragraph(c,styles["B"])] for a,b,c in checks], colWidths=[42*mm,24*mm,90*mm])
vt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1b1916")),("GRID",(0,0),(-1,-1),.5,colors.HexColor("#ddd5c9")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [vt, Spacer(1, 8*mm), Paragraph("Remaining validation", styles["S"]),
          Paragraph("Refresh the authenticated /admin/users tab and expand a learner. The logged-in browser state was not available to headless validation, so a final visual confirmation in the existing authenticated Chrome tab is recommended.", styles["B"])]
doc.build(story, onFirstPage=footer)
print(out)
