from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path("/Users/ayankhan/Desktop/edunex/Edu-nex_Final")
OUTPUT = ROOT / "output/pdf/skillomate-production-lesson-notes-fix-build-comparison-2026-09-22.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#111827")
GOLD = colors.HexColor("#C58B2A")
PALE = colors.HexColor("#F8F5EE")
MUTED = colors.HexColor("#5B6472")
GREEN = colors.HexColor("#137A4B")
RED = colors.HexColor("#B42318")
LINE = colors.HexColor("#D9DEE7")


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 18 * mm, PAGE_W, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(18 * mm, PAGE_H - 11 * mm, "SKILLOMATE - BUILD COMPARISON")
    canvas.setFillColor(GOLD)
    canvas.circle(PAGE_W - 18 * mm, PAGE_H - 9 * mm, 2.2 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, PAGE_W - 18 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 9 * mm, "Prepared 22 Sep 2026 - Asia/Kolkata")
    canvas.drawRightString(PAGE_W - 18 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=25 * mm,
    bottomMargin=20 * mm,
    title="Skillomate Production Lesson Notes Fix - Build Comparison",
    author="Codex",
)

base = getSampleStyleSheet()
title = ParagraphStyle(
    "TitleX", parent=base["Title"], fontName="Helvetica-Bold", fontSize=24,
    leading=29, textColor=NAVY, spaceAfter=7 * mm,
)
subtitle = ParagraphStyle(
    "SubtitleX", parent=base["Normal"], fontSize=11, leading=16,
    textColor=MUTED, spaceAfter=7 * mm,
)
h1 = ParagraphStyle(
    "H1X", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=15,
    leading=19, textColor=NAVY, spaceBefore=5 * mm, spaceAfter=3 * mm,
)
h2 = ParagraphStyle(
    "H2X", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11,
    leading=14, textColor=GOLD, spaceBefore=3 * mm, spaceAfter=2 * mm,
)
body = ParagraphStyle(
    "BodyX", parent=base["BodyText"], fontSize=9.4, leading=14,
    textColor=NAVY, spaceAfter=2.5 * mm,
)
small = ParagraphStyle(
    "SmallX", parent=body, fontSize=8.2, leading=11.5, textColor=MUTED,
)
status = ParagraphStyle(
    "StatusX", parent=body, fontName="Helvetica-Bold", fontSize=10.5,
    leading=15, textColor=RED,
)
center = ParagraphStyle("CenterX", parent=small, alignment=TA_CENTER)


def p(text, style=body):
    return Paragraph(text, style)


def comparison_table(rows, widths):
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


story = [
    Spacer(1, 7 * mm),
    p("Production lesson notes persistence fix", title),
    p(
        "Comparison of the previously deployed build with the tested replacement build. "
        "The new code is committed to GitHub main; production rollout still requires an authorized EC2 deployment key.",
        subtitle,
    ),
    comparison_table([
        [p("Build", center), p("Git commit", center), p("State", center)],
        [p("Previous production", small), p("a677a1467c7d", small), p("Live during verification", small)],
        [p("New notes fix", small), p("1afde1cb6206", small), p("Pushed to main; rollout pending", small)],
    ], [48 * mm, 55 * mm, 66 * mm]),
    p("Finding", h1),
    p(
        "Local notes extraction worked, but production was running older frontend and backend code. "
        "The deployed admin bundle did not contain the lesson-level save control, and the production API returned "
        "HTTP 404 for the new notes route. The failure was therefore a deployment-version mismatch, not a PDF parsing failure.",
    ),
    p("Production evidence before rollout", h2),
    comparison_table([
        [p("Check", center), p("Observed result", center), p("Meaning", center)],
        [p("Frontend bundle", small), p("No 'Save lesson notes' string", small), p("Old admin UI was still live", small)],
        [p("PATCH lesson notes route", small), p("HTTP 404 - Cannot PATCH", small), p("Backend lacked the atomic save endpoint", small)],
        [p("API health", small), p("HTTP 200", small), p("Service was online but on the prior revision", small)],
        [p("Nine ALB samples", small), p("9 x HTTP 404", small), p("All sampled targets remained on old code", small)],
    ], [48 * mm, 55 * mm, 66 * mm]),
    p("What changed", h1),
    comparison_table([
        [p("Area", center), p("Previous build", center), p("New build", center)],
        [p("Notes save", small), p("Submitted the entire course form", small), p("Dedicated Save lesson notes action per existing lesson", small)],
        [p("API", small), p("No lesson-only endpoint", small), p("Protected PATCH endpoint updates videos.$.notes atomically", small)],
        [p("Validation", small), p("Dependent on whole-course validation", small), p("Normalizes line endings and enforces 20,000 characters", small)],
        [p("Feedback", small), p("Extraction confirmation could be mistaken for persistence", small), p("Dirty, saving, success, and error status appears beside notes", small)],
        [p("Cache", small), p("Whole-course save cleared public cache", small), p("Lesson-only save also clears public course caches", small)],
    ], [38 * mm, 64 * mm, 67 * mm]),
    p("Files changed", h1),
    p(
        "Backend: edunex-b/server.js, edunex-b/services/lessonNotes.js, and "
        "edunex-b/tests/lesson-notes.test.cjs. Frontend: edunex-f/src/pages/admin/AdminUploadPage.jsx, "
        "edunex-f/src/pages/admin/admin-react.css, and edunex-f/tests/player/AdminEdit.test.jsx.",
    ),
    p("Verification", h1),
    comparison_table([
        [p("Verification", center), p("Result", center), p("Details", center)],
        [p("Backend focused suite", small), p("PASS - 17/17", small), p("Notes, PDF extraction, and thumbnail update regressions", small)],
        [p("Admin editor suite", small), p("PASS - 7/7", small), p("Includes lesson-only save without whole-course PATCH", small)],
        [p("Frontend production build", small), p("PASS", small), p("130 modules transformed; generated admin bundle contains endpoint and labels", small)],
        [p("Syntax and whitespace", small), p("PASS", small), p("Node syntax check and git diff check completed", small)],
    ], [48 * mm, 38 * mm, 83 * mm]),
    p("Deployment status", h1),
    p(
        "CODE READY - PRODUCTION ROLLOUT BLOCKED BY MISSING EC2 SSH CREDENTIAL",
        status,
    ),
    p(
        "Commit 1afde1cb6206d8e19f6c43796caa222cfa4288c9 is on GitHub main. The documented rolling deployment "
        "requires the Skillomate EC2 PEM key. No authorized PEM was present on this workstation, and the available "
        "id_ed25519 key was rejected by EC2. No production mutation was attempted after authentication failed.",
    ),
    p("Required rollout action", h2),
    p(
        "Run deployment/deploy-skillomate-production.sh from a machine holding Skillomate_Key.pem, or provide the "
        "authorized key path through SKILLOMATE_SSH_KEY. After rollout, verify that an unauthenticated PATCH request "
        "returns HTTP 401 instead of 404, confirm the deployed admin bundle contains 'Save lesson notes', then complete "
        "one authenticated upload-save-reload check in the admin panel.",
    ),
    p("Operational note", h2),
    p(
        "The rolling deploy script pins one main-branch commit, updates all three m7g.large instances sequentially, "
        "builds the frontend, restarts PM2, runs health/readiness/catalog checks, and stops or rolls back on failure.",
        small,
    ),
]

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUTPUT)
