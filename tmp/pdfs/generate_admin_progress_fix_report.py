from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

root = Path(__file__).resolve().parents[2]
out = root / "output/pdf/skillomate-admin-progress-fix-2026-09-17.pdf"
out.parent.mkdir(parents=True, exist_ok=True)
s = getSampleStyleSheet()
s.add(ParagraphStyle(name="TitleP", fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=colors.HexColor("#1b1916"), spaceAfter=8))
s.add(ParagraphStyle(name="SectionP", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#1b1916"), spaceBefore=8, spaceAfter=7))
s.add(ParagraphStyle(name="BodyP", fontName="Helvetica", fontSize=9.4, leading=14, textColor=colors.HexColor("#29251f")))
s.add(ParagraphStyle(name="HeadP", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white))

def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(colors.HexColor("#ddd5c9")); canvas.line(18*mm,16*mm,A4[0]-18*mm,16*mm)
    canvas.setFont("Helvetica",7.5); canvas.setFillColor(colors.HexColor("#665f56")); canvas.drawString(18*mm,10*mm,"Skillomate admin progress fix"); canvas.drawRightString(A4[0]-18*mm,10*mm,"Page 1"); canvas.restoreState()

doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=22*mm, bottomMargin=22*mm,
                        title="Skillomate Admin Progress Fix", author="Codex")
story = [Paragraph("SKILLOMATE ADMIN", ParagraphStyle("KP", parent=s["BodyP"], fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#c58b2a"), spaceAfter=7)),
         Paragraph("Learner Progress Data Fix", s["TitleP"]), Paragraph("Before/after implementation report - 17 September 2026", s["BodyP"]), Spacer(1,9*mm)]
rows = [[Paragraph("Previous behavior",s["HeadP"]),Paragraph("New behavior",s["HeadP"])],
        [Paragraph("The admin endpoint joined course progress only by the stored Mongo user ID and calculated watch metrics only from newer analytics/progress collections. Legacy records did not join, and CourseProgress.videoProgress watch time was ignored. The UI therefore showed 0%, 0 min, and 0 watched videos even when activity data existed.",s["BodyP"]),
         Paragraph("The endpoint now resolves progress by exact user ID with safe, unique email and normalized-phone fallbacks. It uses videoProgress as a watch-data fallback and derives course count and average progress from analytics duration/coverage when course-summary records are unavailable.",s["BodyP"])]]
t=Table(rows,colWidths=[78*mm,78*mm]); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1b1916")),("GRID",(0,0),(-1,-1),.5,colors.HexColor("#ddd5c9")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story += [t, Spacer(1,8*mm), Paragraph("Live verification",s["SectionP"])]
checks=[("Admin API","PASS","HTTP 200; returned 87 learners."),("Activity population","PASS","15 learners now have course progress or watch activity."),("Progress calculation","PASS","Maximum returned average progress is 100%."),("Watch calculation","PASS","118 total watch minutes returned across learners."),("Regression tests","PASS","9 maintenance tests and 3 admin user-control tests passed."),("Syntax/build","PASS","Backend syntax check and frontend production build passed.")]
vt=Table([[Paragraph("Check",s["HeadP"]),Paragraph("Result",s["HeadP"]),Paragraph("Evidence",s["HeadP"])]]+[[Paragraph(a,s["BodyP"]),Paragraph(f"<b>{b}</b>",s["BodyP"]),Paragraph(c,s["BodyP"])] for a,b,c in checks],colWidths=[43*mm,24*mm,89*mm])
vt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#1b1916")),("GRID",(0,0),(-1,-1),.5,colors.HexColor("#ddd5c9")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [vt, Spacer(1,8*mm), Paragraph("Data-integrity safeguard",s["SectionP"]), Paragraph("Fallback matching is used only when an email or normalized phone number uniquely identifies one account. Orphaned records are not assigned when identity is missing or ambiguous, preventing another learner's progress from appearing on the wrong profile.",s["BodyP"])]
doc.build(story,onFirstPage=footer)
print(out)
