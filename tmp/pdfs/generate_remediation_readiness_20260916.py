from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output/pdf/skillomate-production-readiness-remediation-2026-09-16.pdf"

NAVY = colors.HexColor("#12233F")
BLUE = colors.HexColor("#2563EB")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#D9E0EA")
PANEL = colors.HexColor("#F5F7FB")
RED = colors.HexColor("#B42318")
RED_BG = colors.HexColor("#FEF3F2")
AMBER = colors.HexColor("#B54708")
AMBER_BG = colors.HexColor("#FFFAEB")
GREEN = colors.HexColor("#027A48")
GREEN_BG = colors.HexColor("#ECFDF3")


def register_fonts():
    pairs = [
        ("ReportSans", "/System/Library/Fonts/Supplemental/Arial.ttf"),
        ("ReportSans-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for name, path in pairs:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
    regular = "ReportSans" if "ReportSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    bold = "ReportSans-Bold" if "ReportSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    return regular, bold


FONT, BOLD = register_fonts()
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", fontName=BOLD, fontSize=8.3, leading=10, textColor=BLUE, tracking=1.0, spaceAfter=7))
styles.add(ParagraphStyle(name="TitleX", fontName=BOLD, fontSize=27, leading=31, textColor=NAVY, spaceAfter=10))
styles.add(ParagraphStyle(name="SubtitleX", fontName=FONT, fontSize=10.5, leading=15, textColor=MUTED, spaceAfter=13))
styles.add(ParagraphStyle(name="H1X", fontName=BOLD, fontSize=18, leading=22, textColor=NAVY, spaceBefore=3, spaceAfter=9))
styles.add(ParagraphStyle(name="H2X", fontName=BOLD, fontSize=11.5, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyX", fontName=FONT, fontSize=8.8, leading=12.6, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="SmallX", fontName=FONT, fontSize=7.2, leading=9.5, textColor=MUTED))
styles.add(ParagraphStyle(name="CellX", fontName=FONT, fontSize=7.3, leading=9.8, textColor=INK))
styles.add(ParagraphStyle(name="CellBoldX", fontName=BOLD, fontSize=7.3, leading=9.8, textColor=INK))
styles.add(ParagraphStyle(name="CellHeadX", fontName=BOLD, fontSize=7.3, leading=9.8, textColor=colors.white))
styles.add(ParagraphStyle(name="VerdictX", fontName=BOLD, fontSize=18, leading=21, textColor=RED))
styles.add(ParagraphStyle(name="MetricX", fontName=BOLD, fontSize=14, leading=17, textColor=NAVY, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="MetricLabelX", fontName=FONT, fontSize=6.8, leading=8.6, textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="BulletX", fontName=FONT, fontSize=8.4, leading=12, textColor=INK, leftIndent=10, firstLineIndent=-7, bulletIndent=0, spaceAfter=3))


def p(text, style="BodyX"):
    return Paragraph(text, styles[style])


def bullet(text, color=INK):
    style = ParagraphStyle("BulletTemp", parent=styles["BulletX"], textColor=color)
    return Paragraph("&#8226;&nbsp;&nbsp;" + text, style)


def pill(label, kind):
    fg, bg = {
        "pass": (GREEN, GREEN_BG),
        "fixed": (GREEN, GREEN_BG),
        "blocked": (RED, RED_BG),
        "warn": (AMBER, AMBER_BG),
    }[kind]
    return Table(
        [[Paragraph(label.upper(), ParagraphStyle("Pill", fontName=BOLD, fontSize=6.4, leading=7.5, textColor=fg, alignment=TA_CENTER))]],
        colWidths=[21 * mm],
        rowHeights=[5.5 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("BOX", (0, 0), (-1, -1), 0.55, fg),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]),
    )


def grid(rows, widths, header=True):
    if header:
        rows = [[p(cell, "CellHeadX") if isinstance(cell, str) else cell for cell in rows[0]], *rows[1:]]
    table = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    rules = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        rules += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
    for row in range(1 if header else 0, len(rows)):
        if row % 2 == 0:
            rules.append(("BACKGROUND", (0, row), (-1, row), PANEL))
    table.setStyle(TableStyle(rules))
    return table


def page_footer(canvas, doc):
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFont(FONT, 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "Skillomate remediation readiness - 16 Sep 2026")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=19 * mm,
        title="Skillomate Production Readiness Remediation Report - 2026-09-16",
        author="Automated verification",
        subject="Before/after remediation, automated test evidence, and deployment verdict",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page_footer)])
    story = [
        Spacer(1, 9 * mm),
        p("REMEDIATION VERIFICATION", "Kicker"),
        p("Skillomate production readiness", "TitleX"),
        p("Before/after evidence for the failed suites, MongoDB smoke path, Android native validation, mobile dependency advisories, and release-signing status.", "SubtitleX"),
    ]

    verdict = Table([
        [p("DEPLOYMENT VERDICT", "Kicker")],
        [p("NOT READY TO SHIP", "VerdictX")],
        [p("The code and runtime gates requested in this remediation are green. Deployment remains blocked because no trusted iOS distribution identity is installed, no new store-signed iOS artifact was produced, and the repository's existing mobile artifacts do not establish production signing.", "BodyX")],
    ], colWidths=[doc.width - 12 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), RED_BG),
        ("BOX", (0, 0), (-1, -1), 1.0, RED),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [verdict, Spacer(1, 6 * mm)]

    metrics = Table([
        [p("151 / 151", "MetricX"), p("0", "MetricX"), p("7", "MetricX"), p("0", "MetricX")],
        [p("frontend + backend tests", "MetricLabelX"), p("moderate-or-higher npm findings", "MetricLabelX"), p("Mongo-backed smoke checks passed", "MetricLabelX"), p("valid Apple signing identities", "MetricLabelX")],
    ], colWidths=[doc.width / 4] * 4, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
    ]))
    story += [metrics, Spacer(1, 7 * mm), p("Assessment scope", "H2X")]
    scope = [
        [p("Repository", "CellBoldX"), p("Office50505/Edu-nex_Final, main at 9eb9e05 plus preserved local edits", "CellX")],
        [p("Previous report", "CellBoldX"), p("skillomate-production-readiness-2026-09-16.pdf", "CellX")],
        [p("Remediation date", "CellBoldX"), p("16 September 2026 (Asia/Kolkata)", "CellX")],
        [p("Interpretation", "CellBoldX"), p("A green technical gate is not a signed-release certification. Existing user changes were preserved and the working tree remains uncommitted.", "CellX")],
    ]
    story += [grid(scope, [41 * mm, doc.width - 41 * mm], header=False), PageBreak()]

    story += [p("1. Before and after", "H1X")]
    comparison = [
        ["Gate", "Before remediation", "After remediation", "Status"],
        [p("Frontend regression", "CellBoldX"), p("34/35; deletion-status wording failed", "CellX"), p("35/35; copy now explicitly states the account is not yet deleted", "CellX"), pill("Fixed", "fixed")],
        [p("Backend regression", "CellBoldX"), p("112/116; four stale harness/assertion failures", "CellX"), p("116/116; player lifecycle/source tests and rate-limit module harness aligned", "CellX"), pill("Fixed", "fixed")],
        [p("Mongo smoke", "CellBoldX"), p("Server never reached healthy DB state", "CellX"), p("Server started locally; Mongo connected to test; 7 safe checks passed", "CellX"), pill("Pass", "pass")],
        [p("Android native", "CellBoldX"), p("Blocked by Gradle download timeout", "CellX"), p("Compile/lint path completed; BUILD SUCCESSFUL using cached Gradle 8.14.3", "CellX"), pill("Pass", "pass")],
        [p("Mobile npm audit", "CellBoldX"), p("11 moderate findings", "CellX"), p("0 vulnerabilities after dependency cleanup and override", "CellX"), pill("Fixed", "fixed")],
        [p("iOS production trust", "CellBoldX"), p("Development export; trust unavailable", "CellX"), p("0 valid keychain signing identities; no production export possible locally", "CellX"), pill("Blocked", "blocked")],
    ]
    story += [grid(comparison, [34 * mm, 48 * mm, doc.width - 106 * mm, 24 * mm]), Spacer(1, 5 * mm)]

    story += [p("What changed", "H2X")]
    story += [
        bullet("Frontend account-deletion success copy now preserves the pending-verification truth required by the test and user-facing flow."),
        bullet("Backend mobile-player tests now validate the current replaceAsync dependency and released-player guard behavior; the single-session harness supplies rateLimitToggle."),
        bullet("Expo packages were patched within SDK 57 compatibility; unused @expo/ngrok was removed and xcode's UUID dependency is overridden to a maintained release."),
        bullet("Android uses Build Tools 36.0.0, compile/target SDK 36, NDK 27.1.12297006, a 60-second wrapper timeout, and 120-second artifact HTTP timeouts."),
        bullet("Android manifest/config now declares notification permission for Expo Video and marks camera hardware optional."),
    ]

    story += [p("2. Final automated evidence", "H1X")]
    checks = [
        ["Check", "Result", "Evidence"],
        [p("Frontend Vitest", "CellBoldX"), pill("Pass", "pass"), p("5 files, 35 tests, 35 passed.", "CellX")],
        [p("Backend Node tests", "CellBoldX"), pill("Pass", "pass"), p("116 tests, 116 passed, 0 skipped or failed.", "CellX")],
        [p("Frontend production build", "CellBoldX"), pill("Pass", "pass"), p("Vite transformed 116 modules. Non-blocking 592.43 kB HLS chunk warning remains.", "CellX")],
        [p("Android JS export", "CellBoldX"), pill("Pass", "pass"), p("Metro bundled 723 modules and 47 assets; 2.3 MB Hermes bundle emitted.", "CellX")],
        [p("Android native unit task", "CellBoldX"), pill("Pass", "pass"), p("testDebugOptimizedUnitTest completed as NO-SOURCE; no native unit cases are defined.", "CellX")],
        [p("Android lint", "CellBoldX"), pill("Pass", "pass"), p("lintDebugOptimized completed; BUILD SUCCESSFUL in final rerun.", "CellX")],
        [p("Mobile npm audit", "CellBoldX"), pill("Pass", "pass"), p("Online registry audit: found 0 vulnerabilities.", "CellX")],
        [p("Expo version check", "CellBoldX"), pill("Pass", "pass"), p("Bundled SDK 57 map reports dependencies up to date; final invocation was offline.", "CellX")],
    ]
    story += [grid(checks, [48 * mm, 25 * mm, doc.width - 73 * mm]), PageBreak()]

    story += [p("3. Runtime smoke evidence", "H1X")]
    story += [p("The smoke harness started the backend on localhost:3100 with database health required. The server logged a successful MongoDB connection to the test database and shut down cleanly after the run.", "BodyX")]
    smoke = [
        ["Endpoint / behavior", "Result", "Observation"],
        [p("GET /api/health", "CellX"), pill("Pass", "pass"), p("API process alive", "CellX")],
        [p("GET /api/health/db", "CellX"), pill("Pass", "pass"), p("Mongo connected to test", "CellX")],
        [p("Bunny admin route", "CellX"), pill("Pass", "pass"), p("Anonymous request rejected", "CellX")],
        [p("Admin login negative path", "CellX"), pill("Pass", "pass"), p("Bad password rejected", "CellX")],
        [p("Image proxy SSRF guard", "CellX"), pill("Pass", "pass"), p("Private target rejected", "CellX")],
        [p("GET /api/courses", "CellX"), pill("Pass", "pass"), p("1 course returned", "CellX")],
        [p("GET /api/categories", "CellX"), pill("Pass", "pass"), p("6 categories returned", "CellX")],
    ]
    story += [grid(smoke, [62 * mm, 25 * mm, doc.width - 87 * mm]), Spacer(1, 5 * mm)]
    story += [
        p("Credential-gated coverage", "H2X"),
        p("Fourteen authenticated, payment, progress, admin, and Bunny-thumbnail checks were skipped because smoke user/admin/course/provider credentials were not supplied. These skips are explicit and are not counted as passes.", "BodyX"),
        p("UI validation note", "H2X"),
        p("The account-deletion interaction is covered by the passing Vitest/jsdom suite. The in-app Browser runtime was not callable in this environment and the repository has no Playwright binary, so no separate rendered-browser pass is claimed.", "BodyX"),
    ]

    story += [p("4. Remaining release blockers", "H1X")]
    blockers = [
        ["Priority", "Finding", "Required evidence to close"],
        [p("P0", "CellBoldX"), p("iOS distribution signing", "CellBoldX"), p("Install/use a valid Apple Distribution identity and App Store provisioning profile, export a store IPA, verify entitlements and signing authority, then confirm TestFlight/App Store Connect acceptance.", "CellX")],
        [p("P0", "CellBoldX"), p("Store-signed mobile artifacts", "CellBoldX"), p("Produce fresh Android AAB/APK and iOS IPA from a controlled clean commit. Existing artifacts are not accepted as proof of current production signing; Android native release config contains no local production signing identity.", "CellX")],
        [p("P1", "CellBoldX"), p("Plain-HTTP production endpoints", "CellBoldX"), p("Production EAS profiles still reference http://13.203.94.35. Move API/AI traffic to verified HTTPS and remove broad cleartext allowances before shipment.", "CellX")],
        [p("P1", "CellBoldX"), p("Authenticated smoke coverage", "CellBoldX"), p("Supply controlled smoke credentials and IDs, then run the 14 skipped auth, subscription, progress, payment, admin, and Bunny checks in staging.", "CellX")],
        [p("P2", "CellBoldX"), p("Release reproducibility", "CellBoldX"), p("Commit the intended remediation, remove generated build state from the release workspace, tag the commit, and rerun CI from a clean checkout using the prescribed Gradle wrapper.", "CellX")],
    ]
    story += [grid(blockers, [18 * mm, 47 * mm, doc.width - 65 * mm]), Spacer(1, 6 * mm)]

    ready_box = Table([
        [p("GO / NO-GO SUMMARY", "Kicker")],
        [p("Code and runtime remediation: GO", "H2X")],
        [p("Deployment artifact release: NO-GO", "H2X")],
        [p("The five failed regression tests, Mongo connectivity, Android native verification, and eleven moderate mobile advisories are resolved. Signing and secure production-delivery evidence remain mandatory release gates.", "BodyX")],
    ], colWidths=[doc.width - 12 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
        ("BOX", (0, 0), (-1, -1), 0.9, AMBER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [KeepTogether([ready_box]), Spacer(1, 7 * mm)]

    story += [p("5. Verification ledger", "H1X")]
    ledger = [
        ["Area", "Command / inspection", "Final outcome"],
        [p("Frontend", "CellX"), p("npm run test:player; npm run build", "CellX"), p("35/35; build pass", "CellX")],
        [p("Backend", "CellX"), p("node --test tests/*.test.cjs", "CellX"), p("116/116", "CellX")],
        [p("Database smoke", "CellX"), p("node scripts/smoke-api.mjs --start", "CellX"), p("Mongo healthy; 7 pass, 14 credential skips", "CellX")],
        [p("Mobile security", "CellX"), p("npm audit --audit-level=moderate", "CellX"), p("0 vulnerabilities", "CellX")],
        [p("Mobile export", "CellX"), p("npx expo export --platform android", "CellX"), p("Pass", "CellX")],
        [p("Native Android", "CellX"), p(":app:testDebugOptimizedUnitTest :app:lintDebugOptimized", "CellX"), p("BUILD SUCCESSFUL", "CellX")],
        [p("iOS identity", "CellX"), p("security find-identity -v -p codesigning", "CellX"), p("0 valid identities", "CellX")],
        [p("Diff hygiene", "CellX"), p("git diff --check", "CellX"), p("Pass", "CellX")],
    ]
    story += [grid(ledger, [38 * mm, 78 * mm, doc.width - 116 * mm]), Spacer(1, 6 * mm)]

    story += [p("Configuration references", "H2X")]
    story += [
        bullet("Expo SDK reference (SDK 57 / Android SDK expectations): https://docs.expo.dev/versions/latest/"),
        bullet("Expo build properties reference: https://docs.expo.dev/versions/latest/sdk/build-properties/"),
        bullet("Android 16 SDK setup: https://developer.android.com/about/versions/16/setup-sdk"),
    ]
    story += [Spacer(1, 5 * mm), p("Report boundary", "H2X")]
    story += [p("This report records tests run in the current local workspace. It is not an attestation of production infrastructure, app-store review, payment settlement, provider delivery, real-device behavior, or secrets management. A clean CI build and store validation remain required.", "BodyX")]

    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
