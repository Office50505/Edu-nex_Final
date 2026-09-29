from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path("/Users/ayankhan/Desktop/edunex/Edu-nex_Final")
OUTPUT = ROOT / "output/pdf/skillomate-admin-only-build-comparison-2026-09-22.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#111827")
GOLD = colors.HexColor("#C58B2A")
PALE = colors.HexColor("#F8F5EE")
MUTED = colors.HexColor("#5B6472")
GREEN = colors.HexColor("#137A4B")
BLUE = colors.HexColor("#1F5A94")
LINE = colors.HexColor("#D9DEE7")


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, PAGE_H - 18 * mm, PAGE_W, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(18 * mm, PAGE_H - 11 * mm, "SKILLOMATE - ADMIN BUILD COMPARISON")
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
    title="Skillomate Admin-Only Build Comparison - 22 Sep 2026",
    author="Codex",
)

styles = getSampleStyleSheet()
title = ParagraphStyle(
    "TitleX", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23,
    leading=28, textColor=INK, spaceAfter=5 * mm,
)
subtitle = ParagraphStyle(
    "SubtitleX", parent=styles["Normal"], fontSize=10.5, leading=15,
    textColor=MUTED, spaceAfter=6 * mm,
)
h1 = ParagraphStyle(
    "H1X", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15,
    leading=19, textColor=INK, spaceBefore=4 * mm, spaceAfter=3 * mm,
)
h2 = ParagraphStyle(
    "H2X", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11,
    leading=14, textColor=GOLD, spaceBefore=2 * mm, spaceAfter=1.5 * mm,
)
body = ParagraphStyle(
    "BodyX", parent=styles["BodyText"], fontSize=9.25, leading=13.5,
    textColor=INK, spaceAfter=2.3 * mm,
)
small = ParagraphStyle(
    "SmallX", parent=body, fontSize=8.1, leading=11.3, textColor=MUTED,
)
center = ParagraphStyle("CenterX", parent=small, alignment=TA_CENTER)
success = ParagraphStyle(
    "SuccessX", parent=body, fontName="Helvetica-Bold", fontSize=11,
    leading=15, textColor=GREEN,
)


def p(text, style=body):
    return Paragraph(text, style)


def table(rows, widths):
    result = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.1),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return result


story = [
    Spacer(1, 7 * mm),
    p("Admin-only course and access fixes", title),
    p(
        "Build comparison for the admin-only release pushed to GitHub main. The update restores reliable lesson-note "
        "persistence and ensures active access granted by an administrator is not replaced by stale Razorpay checkout state.",
        subtitle,
    ),
    table([
        [p("Build", center), p("Git commit", center), p("Repository state", center)],
        [p("Previous main", small), p("9838fb45ba2e", small), p("Checkout cancellation popup fix", small)],
        [p("Admin-only build", small), p("54319a394faa", small), p("Pushed to main and remotely verified", small)],
    ], [47 * mm, 52 * mm, 70 * mm]),
    p("Outcome", h1),
    p("PUSH COMPLETE - REMOTE MAIN VERIFIED", success),
    p(
        "The release contains eight scoped files: the admin course editor, its styles and tests, the protected lesson-notes "
        "API and validation service, and Razorpay status handling required for admin-managed access. No learner page, player, "
        "mobile layout, or general site styling file is part of this commit.",
    ),
    p("Feature comparison", h1),
    table([
        [p("Area", center), p("Previous build", center), p("Admin-only build", center)],
        [p("Lesson-note save", small), p("Notes depended on the whole-course update flow", small), p("Existing lessons have a dedicated Save lesson notes action", small)],
        [p("Persistence API", small), p("No lesson-only write endpoint", small), p("Protected atomic PATCH updates videos.$.notes and clears public caches", small)],
        [p("Editor state", small), p("No persistent dirty-state summary", small), p("Sticky save bar shows unsaved, saving, saved, and error states", small)],
        [p("Navigation safety", small), p("Admin could leave with pending edits", small), p("Browser leave warning appears while course or notes changes remain", small)],
        [p("Admin subscription", small), p("Stale Razorpay checkout could override an active admin grant", small), p("Active admin grant takes precedence and disables checkout/renewal flags", small)],
        [p("Course assignment status", small), p("Razorpay status omitted assigned-course details", small), p("Returns course IDs and normalized active entitlements", small)],
    ], [38 * mm, 63 * mm, 68 * mm]),
    p("Notable implementation details", h1),
    p("Lesson notes", h2),
    p(
        "The new endpoint validates course and lesson IDs, normalizes line endings, trims content, enforces the existing "
        "20,000-character limit, performs a positional MongoDB update, returns the persisted value, and invalidates public course caches.",
    ),
    KeepTogether([
        p("Admin editor", h2),
        p(
            "The React editor tracks general edits separately from lesson-note edits. Notes-only saves do not submit the full course. "
            "A complete course save also flushes pending note changes, while current apiUrl routing and lesson notes URL support remain intact.",
        ),
    ]),
    Spacer(1, 3 * mm),
    p("Access behavior and verification", title),
    p("Admin-managed access", h1),
    p(
        "Subscription status first checks the current subscription document. When an active document was granted by an administrator, "
        "it remains the source of truth even if an older Razorpay billing record is still marked ready. The response identifies the source "
        "as admin, reports no pending checkout, and does not claim auto-renewal.",
    ),
    p("Validation performed", h1),
    table([
        [p("Check", center), p("Result", center), p("Coverage", center)],
        [p("Backend focused suite", small), p("PASS - 44/44", small), p("Lesson notes, PDF extraction, Razorpay, S3 thumbnail behavior", small)],
        [p("Admin controls suite", small), p("PASS - 40/40", small), p("User access, deletion workflow, payment audit, notes, Razorpay", small)],
        [p("Admin React suites", small), p("PASS - 10/10", small), p("Course editor save flow and admin user controls", small)],
        [p("Production frontend build", small), p("PASS", small), p("Vite transformed 130 modules and produced route assets", small)],
        [p("Syntax and diff checks", small), p("PASS", small), p("Node syntax validation and whitespace/error checks", small)],
        [p("Remote branch check", small), p("PASS", small), p("refs/heads/main resolves to 54319a394faa", small)],
    ], [48 * mm, 36 * mm, 85 * mm]),
    p("Files in this release", h1),
    table([
        [p("Layer", center), p("Files", center)],
        [p("Backend runtime", small), p("controllers/razorpayController.js; server.js; services/lessonNotes.js", small)],
        [p("Frontend admin", small), p("pages/admin/AdminUploadPage.jsx; pages/admin/admin-react.css", small)],
        [p("Automated tests", small), p("tests/lesson-notes.test.cjs; tests/razorpay.test.cjs; tests/player/AdminEdit.test.jsx", small)],
    ], [45 * mm, 124 * mm]),
    KeepTogether([
        p("Scope intentionally excluded", h1),
        p(
            "Learner-facing course pages, video player behavior, mobile code, general navigation, and unrelated local workspace changes "
            "were excluded. Existing newer main-branch work, including the checkout-cancellation popup fix, was preserved by rebasing "
            "before the push.",
        ),
    ]),
    p("Delivery note", h1),
    p(
        "This report confirms the source push and automated build checks, not an EC2 rollout. Deployment still requires the authorized "
        "server key, followed by one signed-in admin save-reload and visual check; browser automation was unavailable in this session.",
    ),
]

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUTPUT)
