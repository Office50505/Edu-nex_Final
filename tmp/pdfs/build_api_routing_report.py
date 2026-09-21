from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
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


OUTPUT = "output/pdf/skillomate-api-routing-build-comparison.pdf"

NAVY = colors.HexColor("#0F172A")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#F1F5F9")
GOLD = colors.HexColor("#C58B2A")
GREEN = colors.HexColor("#166534")
WHITE = colors.white


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
    canvas.line(18 * mm, 15 * mm, 192 * mm, 15 * mm)
    canvas.setFillColor(SLATE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 10 * mm, "Skillomate production API routing - build comparison")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=24, leading=29, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Subtitle", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=11, leading=16, textColor=SLATE, spaceAfter=18,
))
styles.add(ParagraphStyle(
    name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=14, leading=18, textColor=NAVY, spaceBefore=12, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="BodySmall", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.2, leading=13.2, textColor=NAVY, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="CodeBox", parent=styles["BodyText"], fontName="Courier",
    fontSize=8.3, leading=11.5, textColor=NAVY, backColor=LIGHT,
    borderPadding=7, spaceBefore=3, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Status", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=10, leading=14, textColor=GREEN, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="TableHeader", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.4, leading=11.5, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.4, leading=11.5, textColor=NAVY,
))


def p(text, style="BodySmall"):
    return Paragraph(text, styles[style])


def table(rows, widths):
    wrapped_rows = []
    for row_index, row in enumerate(rows):
        style = styles["TableHeader"] if row_index == 0 else styles["TableCell"]
        wrapped_rows.append([cell if isinstance(cell, Paragraph) else Paragraph(str(cell), style) for cell in row])
    result = Table(wrapped_rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.4),
        ("LEADING", (0, 0), (-1, -1), 11.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return result


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=22 * mm,
    title="Skillomate Production API Routing Build Comparison",
    author="OpenAI Codex",
)

story = [
    p("BUILD COMPARISON REPORT", "Status"),
    p("Skillomate production API routing fix", "ReportTitle"),
    p("Previous repository state compared with the production-ready frontend build generated on 21 September 2026.", "Subtitle"),
]

summary = Table([
    [p("Outcome", "BodySmall"), p("Production requests now resolve through <b>https://api.skillomate.in</b>; local development continues to use the Vite <b>/api</b> proxy.", "BodySmall")],
    [p("Build", "BodySmall"), p("PASS - Vite production build completed (129 modules transformed).", "BodySmall")],
    [p("Tests", "BodySmall"), p("PASS - 24 test files and 157 tests passed, including seven production routing assertions.", "BodySmall")],
    [p("CORS", "BodySmall"), p("Updated - production allowlist always includes both apex and www Skillomate origins.", "BodySmall")],
], colWidths=[33 * mm, 137 * mm])
summary.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.8, GOLD),
    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
    ("BACKGROUND", (0, 0), (0, -1), LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [summary, Spacer(1, 5 * mm)]

story += [
    p("1. Root cause", "Section"),
    p("The shared frontend helper returned relative <b>/api/...</b> paths. In production, the browser therefore sent those requests to the frontend origin and CloudFront distribution at <b>www.skillomate.in</b>, where they hung instead of reaching the dedicated ALB-backed API hostname. Several direct fetch, admin, image, certificate, payment, onboarding, and playback paths also bypassed the shared helper."),
    p("2. Before and after", "Section"),
    table([
        ["Area", "Previous version", "New build"],
        ["Production base", "No VITE_API_BASE_URL", "VITE_API_BASE_URL=https://api.skillomate.in"],
        ["/api/courses", "Same-origin /api/courses", "https://api.skillomate.in/api/courses"],
        ["Path handling", "Only /api-prefixed input", "Supports /api/x, api/x, and /x without duplicate /api"],
        ["Direct fetches", "Several bypassed the helper", "Delegated through the centralized URL builder"],
        ["Local development", "Vite proxy to configurable target", "Preserved; blank base keeps /api relative"],
        ["Production CORS", "Dependent only on runtime env values", "Exact apex and www origins always included in production"],
        ["Authentication", "Bearer Authorization headers", "Unchanged and covered by a routing test"],
    ], [31 * mm, 65 * mm, 74 * mm]),
]

story += [PageBreak()]
story += [
    p("3. Notable code and configuration changes", "Section"),
    p("Central URL builder", "Status"),
    p("<b>edunex-f/js/edunex-api.js</b> now reads a build-injected meta value, validates and normalizes the origin, creates one canonical /api path, preserves absolute external URLs, and routes backend image proxy URLs through the same mechanism."),
    p("Build-time environment", "Status"),
    p("<b>edunex-f/vite.config.js</b> loads VITE_API_BASE_URL and injects it into every generated application shell. <b>edunex-f/.env.production</b> supplies the public production hostname. <b>.env.example</b> documents a blank local base and retains VITE_API_PROXY_TARGET=http://127.0.0.1:3000."),
    p("Direct-call consolidation", "Status"),
    p("A small module adapter in <b>src/lib/apiUrl.js</b> delegates module code to window.EduNex.apiUrl. Payment, login, signup, password recovery, deletion requests, reports, onboarding, course retries, admin requests, certificates, thumbnails, image proxy requests, and relative playback grants now use it."),
    p("Backend CORS", "Status"),
    p("<b>edunex-b/server.js</b> now merges configured origins with exact production defaults for https://skillomate.in and https://www.skillomate.in. Existing Authorization and Content-Type headers and GET, POST, PUT, PATCH, DELETE, and OPTIONS methods remain allowed. Wildcard behavior remains limited to development when no origins are configured."),
    p("Production resolution examples", "Section"),
    p("/api/courses  ->  https://api.skillomate.in/api/courses", "CodeBox"),
    p("/api/login    ->  https://api.skillomate.in/api/login", "CodeBox"),
    p("/api/signup   ->  https://api.skillomate.in/api/signup", "CodeBox"),
    p("api/courses   ->  https://api.skillomate.in/api/courses", "CodeBox"),
    p("/courses      ->  https://api.skillomate.in/api/courses", "CodeBox"),
    p("4. Files changed by category", "Section"),
    table([
        ["Category", "Files / scope"],
        ["Core routing", "js/edunex-api.js; src/lib/apiUrl.js; src/lib/courseRequest.js"],
        ["Build and env", "vite.config.js; .env.example; .env.production; .gitignore files; _redirects"],
        ["Frontend consumers", "Payment, login, signup, deletion, reports, password recovery, onboarding, video, certificate, and admin modules"],
        ["Legacy compatibility", "payment.html, videos.html, certificates.html, premium-nav.js, and legacy-pages.js"],
        ["Backend", "server.js and backend .env.example"],
        ["Tests", "tests/player/ApiRouting.test.js"],
    ], [42 * mm, 128 * mm]),
]

story += [PageBreak()]
story += [
    p("5. Verification performed", "Section"),
    table([
        ["Check", "Result"],
        ["Frontend suite", "PASS - 24 files, 157 tests"],
        ["Routing test", "PASS - normalization, absolute URL preservation, production auth request"],
        ["Production build", "PASS - npm run build; 129 modules transformed"],
        ["Development-mode build", "PASS - empty API base injected, preserving relative proxy behavior"],
        ["Syntax / diff", "PASS - node checks and git diff --check"],
        ["Built-output scan", "PASS - production hostname present in route shells"],
        ["Forbidden URL scan", "PASS - no www.skillomate.in/api and no api.skillomate.in/api/api"],
        ["Direct fetch scan", "PASS - no direct fetch('/api...') bypass in built output"],
    ], [58 * mm, 112 * mm]),
    p("Build note", "Section"),
    p("Vite emitted its existing advisory that the HLS chunk is larger than 500 kB after minification. This is a performance warning, not a build failure, and is unrelated to API routing."),
    p("6. Deployment requirement", "Section"),
    p("The production build requires the following public configuration. It is already present in the repository production environment file:"),
    p("VITE_API_BASE_URL=https://api.skillomate.in", "CodeBox"),
    p("Deploy the newly generated <b>edunex-f/dist</b> contents to the frontend S3 origin and invalidate CloudFront so browsers receive the new HTML shells and JavaScript. Deploy the backend CORS change to all API instances before or with the frontend rollout."),
    p("7. Remaining risks", "Section"),
    p("<b>Deployment cache:</b> stale CloudFront HTML or JavaScript can retain the old routing until invalidation completes."),
    p("<b>Backend rollout consistency:</b> all three EC2 instances must run the same CORS allowlist code; otherwise requests may fail intermittently behind the ALB."),
    p("<b>External configuration:</b> production infrastructure and ALB settings were intentionally not changed. The API DNS, TLS certificate, target health, and deployment environment remain operational prerequisites."),
    p("<b>Browser validation:</b> after deployment, verify login, signup/OTP, courses, payment status, admin login, image proxy, and playback from both https://skillomate.in and https://www.skillomate.in using the browser network panel."),
    Spacer(1, 5 * mm),
    KeepTogether([
        p("Release conclusion", "Section"),
        p("The new build removes the unintended production dependency on the frontend CloudFront /api path while retaining local proxy behavior and bearer-token authentication. It is ready for coordinated frontend and backend deployment, subject to cache invalidation and post-deployment smoke checks."),
    ]),
]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
