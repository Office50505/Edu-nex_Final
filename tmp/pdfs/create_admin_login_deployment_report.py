from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    PageBreak,
)


OUTPUT = "output/pdf/admin-login-deployment-comparison.pdf"
PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#0B1220")
INK = colors.HexColor("#1B2638")
MUTED = colors.HexColor("#627087")
GOLD = colors.HexColor("#D39826")
GREEN = colors.HexColor("#228B5A")
PALE_GREEN = colors.HexColor("#EAF7F0")
PALE_GOLD = colors.HexColor("#FFF6E3")
PALE_BLUE = colors.HexColor("#EDF3FA")
LINE = colors.HexColor("#D9E1EA")
WHITE = colors.white


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=25,
    leading=29,
    textColor=WHITE,
    spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="ReportSubtitle",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=10,
    leading=14,
    textColor=colors.HexColor("#D8E1EC"),
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=15,
    leading=18,
    textColor=NAVY,
    spaceBefore=7,
    spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="BodySmall",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=13,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="BodyMuted",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.5,
    leading=12,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="CardTitle",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=10.5,
    leading=13,
    textColor=NAVY,
    spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="TableHead",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=8.2,
    leading=10,
    textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableBody",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableBodyBold",
    parent=styles["TableBody"],
    fontName="Helvetica-Bold",
))


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 36 * mm, PAGE_W, 36 * mm, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 37.5 * mm, PAGE_W, 1.5 * mm, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 22)
    canvas.drawString(18 * mm, PAGE_H - 18 * mm, "Admin Login Deployment")
    canvas.setFillColor(colors.HexColor("#D8E1EC"))
    canvas.setFont("Helvetica", 9.5)
    subtitle = (
        "Previous vs new production version - deployed 11 November 2026 (IST)"
        if doc.page == 1
        else "Verification, configuration, and release evidence"
    )
    canvas.drawString(18 * mm, PAGE_H - 26 * mm, subtitle)
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 15 * mm, PAGE_W - 18 * mm, 15 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10.5 * mm, "Skillomate Admin - Production Deployment Report")
    canvas.drawRightString(PAGE_W - 18 * mm, 10.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=43 * mm,
    bottomMargin=20 * mm,
    title="Admin Login Deployment Comparison",
    author="Codex",
    subject="Previous versus new Skillomate admin deployment",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="content")
doc.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=header_footer)])


story = []
summary = Table([
    [
        Paragraph("STATUS", styles["TableBodyBold"]),
        Paragraph("DEPLOYED AND VERIFIED", styles["TableBodyBold"]),
        Paragraph("VERSION", styles["TableBodyBold"]),
        Paragraph("ae22ac3", styles["TableBodyBold"]),
    ],
    [
        Paragraph("PRODUCTION", styles["TableBodyBold"]),
        Paragraph("edunexadmin.vercel.app", styles["TableBody"]),
        Paragraph("BACKEND", styles["TableBodyBold"]),
        Paragraph("api.skillomate.in", styles["TableBody"]),
    ],
], colWidths=[24 * mm, 61 * mm, 24 * mm, 65 * mm])
summary.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE_GREEN),
    ("TEXTCOLOR", (1, 0), (1, 0), GREEN),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BBDCC9")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.append(summary)
story.append(Spacer(1, 5 * mm))

story.append(Paragraph("Executive summary", styles["Section"]))
story.append(Paragraph(
    "The production admin login failed before credential validation. The standalone admin build did not load the shared API runtime, while its URL helper depended on that runtime. Login submissions therefore targeted the Vercel frontend and returned HTTP 405 instead of reaching the Skillomate API. The new version adds a self-contained, validated API-base fallback and is live in production.",
    styles["BodySmall"],
))
story.append(Spacer(1, 4 * mm))

story.append(Paragraph("Version comparison", styles["Section"]))
comparison_data = [
    [Paragraph("Area", styles["TableHead"]), Paragraph("Previous - 987338c", styles["TableHead"]), Paragraph("New - ae22ac3", styles["TableHead"])],
    [Paragraph("Login request", styles["TableBodyBold"]), Paragraph("POST sent to edunexadmin.vercel.app/api/admin/login", styles["TableBody"]), Paragraph("POST resolves to api.skillomate.in/api/admin/login", styles["TableBody"])],
    [Paragraph("Observed result", styles["TableBodyBold"]), Paragraph("HTTP 405 Method Not Allowed; generic 'Admin login failed.'", styles["TableBody"]), Paragraph("Request reaches the backend authentication route", styles["TableBody"])],
    [Paragraph("API resolver", styles["TableBodyBold"]), Paragraph("Returned the input path when window.EduNex was unavailable", styles["TableBody"]), Paragraph("Reads the injected meta configuration or VITE_API_BASE_URL", styles["TableBody"])],
    [Paragraph("URL safety", styles["TableBodyBold"]), Paragraph("No standalone validation", styles["TableBody"]), Paragraph("Accepts HTTP(S), normalizes /api, preserves absolute URLs", styles["TableBody"])],
    [Paragraph("Regression coverage", styles["TableBodyBold"]), Paragraph("No standalone admin routing test", styles["TableBody"]), Paragraph("Resolver and submitted-login destination are both tested", styles["TableBody"])],
]
comparison = Table(comparison_data, colWidths=[31 * mm, 70 * mm, 73 * mm], repeatRows=1)
comparison.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE_BLUE]),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(comparison)
story.append(Spacer(1, 5 * mm))

story.append(KeepTogether([
    Paragraph("Notable code changes", styles["Section"]),
    Table([
        [Paragraph("1", styles["TableBodyBold"]), Paragraph("Added configuredApiBaseUrl() in edunex-f/src/lib/apiUrl.js to read the production API meta tag independently of the shared runtime.", styles["TableBody"])],
        [Paragraph("2", styles["TableBodyBold"]), Paragraph("Normalized API paths and rejected non-HTTP(S) configured origins.", styles["TableBody"])],
        [Paragraph("3", styles["TableBodyBold"]), Paragraph("Added focused resolver and form-submission regression tests under edunex-f/tests/admin/.", styles["TableBody"])],
    ], colWidths=[10 * mm, 164 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), PALE_GOLD),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ])),
]))

story.append(PageBreak())
story.append(Paragraph("Testing and verification", styles["Section"]))
checks = [
    [Paragraph("Check", styles["TableHead"]), Paragraph("Result", styles["TableHead"]), Paragraph("Evidence", styles["TableHead"])],
    [Paragraph("Frontend regression suites", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("4 files, 19 tests passed", styles["TableBody"])],
    [Paragraph("Backend admin authentication", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("33 tests passed", styles["TableBody"])],
    [Paragraph("Standalone production build", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("Vite production build completed", styles["TableBody"])],
    [Paragraph("Production deployment", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("GitHub/Vercel status: Deployment has completed", styles["TableBody"])],
    [Paragraph("Live asset verification", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("index-t_Sy5pWs.js loads AdminApp-CelwQoSS.js", styles["TableBody"])],
    [Paragraph("Deployed routing logic", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("Live bundle contains API meta lookup, api.skillomate.in, and /api/admin/login", styles["TableBody"])],
    [Paragraph("Backend CORS preflight", styles["TableBodyBold"]), Paragraph("PASS", styles["TableBodyBold"]), Paragraph("HTTP 204; admin Vercel origin allowed for POST and content-type", styles["TableBody"])],
]
check_table = Table(checks, colWidths=[50 * mm, 25 * mm, 99 * mm], repeatRows=1)
check_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PALE_BLUE]),
    ("TEXTCOLOR", (1, 1), (1, -1), GREEN),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(check_table)
story.append(Spacer(1, 5 * mm))

story.append(Paragraph("Configuration and build changes", styles["Section"]))
story.append(Table([
    [Paragraph("Frontend configuration", styles["CardTitle"]), Paragraph("No production secret or credential was embedded. The existing public VITE_API_BASE_URL value is now honored by the standalone admin bundle.", styles["BodySmall"])],
    [Paragraph("Backend configuration", styles["CardTitle"]), Paragraph("No backend environment variable was changed. ADMIN_PASSWORD and ADMIN_TOKEN_SECRET remain controlled by the production backend environment.", styles["BodySmall"])],
    [Paragraph("Build behavior", styles["CardTitle"]), Paragraph("Standalone admin builds now resolve the API origin even though main.jsx intentionally skips the shared edunex-api runtime.", styles["BodySmall"])],
], colWidths=[48 * mm, 126 * mm], style=TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), PALE_GOLD),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
])))
story.append(Spacer(1, 5 * mm))

story.append(Paragraph("Deployment record", styles["Section"]))
deployment = Table([
    [Paragraph("Source branch", styles["TableBodyBold"]), Paragraph("main", styles["TableBody"])],
    [Paragraph("Previous commit", styles["TableBodyBold"]), Paragraph("987338cc - prior production source", styles["TableBody"])],
    [Paragraph("New commit", styles["TableBodyBold"]), Paragraph("ae22ac39 - Fix standalone admin API routing", styles["TableBody"])],
    [Paragraph("Vercel result", styles["TableBodyBold"]), Paragraph("Deployment completed successfully", styles["TableBody"])],
    [Paragraph("Production URL", styles["TableBodyBold"]), Paragraph("https://edunexadmin.vercel.app", styles["TableBody"])],
], colWidths=[48 * mm, 126 * mm])
deployment.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), PALE_BLUE),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(deployment)
story.append(Spacer(1, 5 * mm))

story.append(KeepTogether([
    Paragraph("Remaining validation note", styles["Section"]),
    Table([[Paragraph(
        "No real administrator credential was transmitted during automated verification. The public bundle destination and CORS path were verified without a login attempt. A user should hard-refresh the admin page before the first sign-in so the browser discards the cached pre-fix bundle.",
        styles["BodySmall"],
    )]], colWidths=[174 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_GOLD),
        ("BOX", (0, 0), (-1, -1), 0.8, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ])),
]))

doc.build(story)
print(OUTPUT)
