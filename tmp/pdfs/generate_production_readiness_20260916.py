from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
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
OUTPUT = ROOT / "output/pdf/skillomate-production-readiness-2026-09-16.pdf"

NAVY = colors.HexColor("#14213D")
BLUE = colors.HexColor("#2563EB")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5B6475")
LINE = colors.HexColor("#DDE3ED")
PANEL = colors.HexColor("#F5F7FB")
RED = colors.HexColor("#B42318")
RED_BG = colors.HexColor("#FEF3F2")
AMBER = colors.HexColor("#B54708")
AMBER_BG = colors.HexColor("#FFFAEB")
GREEN = colors.HexColor("#027A48")
GREEN_BG = colors.HexColor("#ECFDF3")


def register_fonts():
    candidates = [
        ("Inter", "/System/Library/Fonts/Supplemental/Arial.ttf"),
        ("Inter-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for name, path in candidates:
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
    return "Inter" if "Inter" in pdfmetrics.getRegisteredFontNames() else "Helvetica"


FONT = register_fonts()
BOLD = "Inter-Bold" if "Inter-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName=BOLD, fontSize=9, leading=11, textColor=BLUE, spaceAfter=8, tracking=1.1))
styles.add(ParagraphStyle(name="CoverTitle", fontName=BOLD, fontSize=29, leading=33, textColor=NAVY, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverSub", fontName=FONT, fontSize=11, leading=16, textColor=MUTED, spaceAfter=14))
styles.add(ParagraphStyle(name="H1x", fontName=BOLD, fontSize=19, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=10))
styles.add(ParagraphStyle(name="H2x", fontName=BOLD, fontSize=12, leading=15, textColor=NAVY, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", fontName=FONT, fontSize=9, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName=FONT, fontSize=7.7, leading=10.5, textColor=MUTED))
styles.add(ParagraphStyle(name="Cellx", fontName=FONT, fontSize=7.6, leading=10.1, textColor=INK))
styles.add(ParagraphStyle(name="CellBold", fontName=BOLD, fontSize=7.6, leading=10.1, textColor=INK))
styles.add(ParagraphStyle(name="HeaderCell", fontName=BOLD, fontSize=7.6, leading=10.1, textColor=colors.white))
styles.add(ParagraphStyle(name="Verdict", fontName=BOLD, fontSize=18, leading=21, textColor=RED, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="Metric", fontName=BOLD, fontSize=15, leading=18, textColor=NAVY, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="MetricLabel", fontName=FONT, fontSize=7, leading=9, textColor=MUTED, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="Bulletx", fontName=FONT, fontSize=8.7, leading=12.5, textColor=INK, leftIndent=10, firstLineIndent=-7, bulletIndent=0, spaceAfter=4))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text, color=INK):
    style = ParagraphStyle("tmp", parent=styles["Bulletx"], textColor=color)
    return Paragraph("&#8226;&nbsp;&nbsp;" + text, style)


def status_label(text, kind):
    fg, bg = {
        "pass": (GREEN, GREEN_BG),
        "fail": (RED, RED_BG),
        "blocked": (AMBER, AMBER_BG),
        "warn": (AMBER, AMBER_BG),
    }[kind]
    return Table([[Paragraph(text.upper(), ParagraphStyle("pill", fontName=BOLD, fontSize=6.7, leading=8, textColor=fg, alignment=TA_CENTER))]],
                 colWidths=[19 * mm], rowHeights=[5.6 * mm], style=TableStyle([
                     ("BACKGROUND", (0, 0), (-1, -1), bg),
                     ("BOX", (0, 0), (-1, -1), 0.5, fg),
                     ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                     ("LEFTPADDING", (0, 0), (-1, -1), 2),
                     ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                 ]))


def table(data, widths, header=True):
    if header and data:
        data = [
            [Paragraph(cell.text, styles["HeaderCell"]) if isinstance(cell, Paragraph) else cell for cell in data[0]],
            *data[1:],
        ]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    rules = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        rules += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    for row in range(1 if header else 0, len(data)):
        if row % 2 == 0:
            rules.append(("BACKGROUND", (0, row), (-1, row), PANEL))
    t.setStyle(TableStyle(rules))
    return t


def page_decor(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFont(FONT, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9 * mm, "Skillomate production readiness - 16 Sep 2026")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


class ReportDoc(BaseDocTemplate):
    pass


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = ReportDoc(
        str(OUTPUT), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=19 * mm,
        title="Skillomate Production Readiness Report - 2026-09-16",
        author="Automated verification",
        subject="Latest repository update, version comparison, automated test results and release verdict",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page_decor)])

    story = []
    story += [
        Spacer(1, 10 * mm),
        P("PRODUCTION READINESS REVIEW", "CoverKicker"),
        P("Skillomate latest update", "CoverTitle"),
        P("Repository update, build comparison, automated test evidence, signed-artifact checks and deployment recommendation.", "CoverSub"),
        Spacer(1, 3 * mm),
    ]

    verdict = Table([
        [P("VERDICT", "CoverKicker")],
        [P("NOT PRODUCTION READY", "Verdict")],
        [P("Release should be blocked until the failing suites, runtime smoke test, and release-signing defects are resolved and independently retested.", "Bodyx")],
    ], colWidths=[doc.width - 12 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), RED_BG),
        ("BOX", (0, 0), (-1, -1), 1.1, RED),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [verdict, Spacer(1, 6 * mm)]

    metrics = Table([
        [P("146 / 151", "Metric"), P("2 / 2", "Metric"), P("10 / 10", "Metric"), P("11", "Metric")],
        [P("automated tests passed", "MetricLabel"), P("web builds passed", "MetricLabel"), P("k6 checks passed", "MetricLabel"), P("moderate npm findings", "MetricLabel")],
    ], colWidths=[doc.width / 4] * 4, style=TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
    ]))
    story += [metrics, Spacer(1, 7 * mm)]

    story += [P("Scope and baseline", "H2x")]
    scope = [
        [P("Assessment date", "CellBold"), P("16 September 2026 (Asia/Kolkata)", "Cellx")],
        [P("Repository", "CellBold"), P("Office50505/Edu-nex_Final, branch main", "Cellx")],
        [P("Previous baseline", "CellBold"), P("ff2f67e", "Cellx")],
        [P("Latest pulled commit", "CellBold"), P("9eb9e05 - Configure Android SDK versions", "Cellx")],
        [P("Working-tree qualification", "CellBold"), P("Tests cover latest main plus preserved pre-existing local edits. The tree is not clean; results are not a pristine-commit certification.", "Cellx")],
        [P("Decision rule", "CellBold"), P("Any failing required test, invalid production signing identity, or unverified critical runtime dependency blocks release.", "Cellx")],
    ]
    story += [table(scope, [42 * mm, doc.width - 42 * mm], header=False), PageBreak()]

    story += [P("1. Previous vs latest version", "H1x")]
    compare = [
        [P("Area", "CellBold"), P("Previous", "CellBold"), P("Latest", "CellBold"), P("Assessment", "CellBold")],
        [P("Git baseline", "Cellx"), P("ff2f67e", "Cellx"), P("9eb9e05", "Cellx"), P("Fast-forwarded successfully; 4 commits added.", "Cellx")],
        [P("Android release", "Cellx"), P("Version code 2", "Cellx"), P("Version code 3; VC3 APK and AAB added", "Cellx"), P("Artifacts present, but both use Android Debug signing.", "Cellx")],
        [P("iOS release", "Cellx"), P("Build metadata already set to 12", "Cellx"), P("Build 12 archive and development IPA added", "Cellx"), P("Development export is not a production distribution proof.", "Cellx")],
        [P("Mobile playback", "Cellx"), P("Earlier player behavior", "Cellx"), P("Playback-error handling changed", "Cellx"), P("Two mobile-player regression tests still fail.", "Cellx")],
        [P("Backend controls", "Cellx"), P("Static rate-limit behavior", "Cellx"), P("Environment-controlled rate-limit toggle added", "Cellx"), P("Two single-session tests now fail because the new module is not supplied in the test harness.", "Cellx")],
        [P("Build configuration", "Cellx"), P("Earlier Android SDK configuration", "Cellx"), P("Android SDK versions configured in root build", "Cellx"), P("Native rebuild was blocked because Gradle distribution download timed out.", "Cellx")],
    ]
    story += [table(compare, [29 * mm, 36 * mm, 48 * mm, doc.width - 113 * mm]), Spacer(1, 4 * mm)]
    story += [
        bullet("Change volume: 104 files changed, 16,066 insertions and 54 deletions."),
        bullet("Incoming commits: yyo; playback error; rate limiting toggle; Configure Android SDK versions."),
        bullet("New release payloads include Android VC3 APK/AAB, an iOS build 12 archive, a development IPA, and two prior comparison PDFs."),
    ]

    story += [P("2. Automated test matrix", "H1x")]
    tests = [
        [P("Check", "CellBold"), P("Result", "CellBold"), P("Evidence", "CellBold")],
        [P("Frontend Vitest", "Cellx"), status_label("Fail", "fail"), P("34/35 passed. Deletion-status copy assertion failed.", "Cellx")],
        [P("Backend Node tests", "Cellx"), status_label("Fail", "fail"), P("112/116 passed. Two mobile-player and two single-session tests failed.", "Cellx")],
        [P("Main web production build", "Cellx"), status_label("Pass", "pass"), P("Vite build completed; 116 modules transformed. One 592.43 kB HLS chunk warning.", "Cellx")],
        [P("AI frontend lint/build", "Cellx"), status_label("Pass", "pass"), P("ESLint clean; Vite build completed with 174 modules.", "Cellx")],
        [P("AI backend declared test", "Cellx"), status_label("Pass", "pass"), P("Node syntax check passed.", "Cellx")],
        [P("Mobile backend syntax", "Cellx"), status_label("Pass", "pass"), P("Server and JavaScript source syntax checks passed.", "Cellx")],
        [P("Login k6 smoke", "Cellx"), status_label("Pass", "pass"), P("10 requests; 0% failures; 100% checks; p95 7.82 ms; p99 10.14 ms.", "Cellx")],
        [P("Backend API smoke", "Cellx"), status_label("Blocked", "blocked"), P("Server listened on port 3100, but MongoDB DNS failed and health never became ready.", "Cellx")],
        [P("Android native test/lint", "Cellx"), status_label("Blocked", "blocked"), P("Gradle 9.3.1 distribution download timed out; native tasks did not run.", "Cellx")],
    ]
    story += [table(tests, [46 * mm, 24 * mm, doc.width - 70 * mm]), PageBreak()]

    story += [P("3. Blocking findings", "H1x")]
    blockers = [
        ("P0", "Android release signing", "The VC3 APK verifies under signature schemes v2/v3, but its signer DN is CN=Android Debug. The AAB is also signed by the Android Debug identity. These are not acceptable production signing artifacts."),
        ("P0", "Required automated tests are red", "Five tests fail across frontend and backend. A release cannot be certified while its required regression suite is failing."),
        ("P0", "Backend runtime readiness unverified", "The local API smoke runner could not reach healthy state because MongoDB DNS lookup failed. Database-backed production behavior was not exercised."),
        ("P1", "iOS distribution evidence", "The supplied IPA is explicitly a development export. Code signature inspection found TeamIdentifier LJ48CVC23W, but trust validation returned CSSMERR_TP_NOT_TRUSTED and authority was unavailable on this machine."),
        ("P1", "Native build validation incomplete", "Gradle unit/lint tasks were unable to start because the required Gradle distribution could not be downloaded."),
        ("P2", "Dependency advisory debt", "The mobile npm lockfile reports 11 moderate vulnerabilities in the Expo/xcode/uuid chain. No audited package reported high or critical vulnerabilities."),
    ]
    blocker_rows = [[P("Priority", "CellBold"), P("Finding", "CellBold"), P("Why it blocks or matters", "CellBold")]]
    for priority, title, detail in blockers:
        blocker_rows.append([P(priority, "CellBold"), P(title, "CellBold"), P(detail, "Cellx")])
    story += [table(blocker_rows, [18 * mm, 44 * mm, doc.width - 62 * mm]), Spacer(1, 5 * mm)]

    story += [P("4. Release artifact evidence", "H1x")]
    artifact = [
        [P("Artifact", "CellBold"), P("Integrity", "CellBold"), P("Release identity", "CellBold")],
        [P("Android VC3 APK", "Cellx"), P("ZIP integrity passed; SHA-256 927ee0af...cac9d1", "Cellx"), P("Debug certificate; production gate failed.", "Cellx")],
        [P("Android VC3 AAB", "Cellx"), P("ZIP integrity passed; SHA-256 0a47c935...1d3d5", "Cellx"), P("Debug certificate; production gate failed.", "Cellx")],
        [P("iOS build 12 IPA", "Cellx"), P("SHA-256 d1176639...203a8", "Cellx"), P("Development export; distribution trust not established.", "Cellx")],
        [P("iOS archive plist set", "Cellx"), P("Archive, app and export plists all passed plutil lint.", "Cellx"), P("Bundle com.alihussainkhan.edunexfinal, version 1.0, build 12.", "Cellx")],
    ]
    story += [table(artifact, [46 * mm, 58 * mm, doc.width - 104 * mm]), PageBreak()]

    story += [P("5. Security and operational checks", "H1x")]
    security = [
        [P("Package", "CellBold"), P("Audit result", "CellBold"), P("Release interpretation", "CellBold")],
        [P("Main frontend", "Cellx"), P("0 vulnerabilities", "Cellx"), P("Pass", "Cellx")],
        [P("Main backend", "Cellx"), P("0 vulnerabilities", "Cellx"), P("Pass", "Cellx")],
        [P("AI frontend", "Cellx"), P("0 vulnerabilities", "Cellx"), P("Pass", "Cellx")],
        [P("AI backend", "Cellx"), P("0 vulnerabilities", "Cellx"), P("Pass", "Cellx")],
        [P("Mobile backend", "Cellx"), P("0 vulnerabilities", "Cellx"), P("Pass", "Cellx")],
        [P("Mobile app", "Cellx"), P("11 moderate; 0 high/critical", "Cellx"), P("Risk acceptance or dependency remediation required.", "Cellx")],
    ]
    story += [table(security, [50 * mm, 44 * mm, doc.width - 94 * mm]), Spacer(1, 5 * mm)]
    story += [
        P("Important limitations", "H2x"),
        bullet("No live production environment, payment provider, OTP provider, CDN, object store, or real MongoDB cluster was exercised."),
        bullet("No device-farm or physical-device end-to-end run was available for Android/iOS playback, billing, account deletion, or session flows."),
        bullet("The current working tree includes preserved uncommitted edits and 102+ untracked items; release reproducibility requires a clean, tagged commit."),
        bullet("The k6 result is a smoke profile, not a capacity or soak test."),
    ]

    story += [P("6. Required actions before release", "H1x")]
    actions = [
        [P("Gate", "CellBold"), P("Required completion evidence", "CellBold")],
        [P("1. Restore green tests", "CellBold"), P("Resolve or deliberately update the deletion copy assertion, mobile-player regression assertions, and single-session test harness for rateLimitToggle. Rerun: 35/35 frontend and 116/116 backend.", "Cellx")],
        [P("2. Produce real production Android artifacts", "CellBold"), P("Build APK/AAB using the controlled release/upload key. apksigner/jarsigner must no longer report CN=Android Debug. Record certificate SHA-256 and protect key provenance.", "Cellx")],
        [P("3. Validate iOS distribution", "CellBold"), P("Create App Store/TestFlight distribution archive and export. Verify signing authority, entitlements, provisioning profile, and upload acceptance.", "Cellx")],
        [P("4. Restore backend health", "CellBold"), P("Run API smoke/integration checks against an isolated staging MongoDB and all required providers. Health must become ready and every smoke assertion must pass.", "Cellx")],
        [P("5. Complete native CI", "CellBold"), P("Run Android Gradle test/lint/assemble and iOS build/test using pinned toolchains with dependency caches.", "Cellx")],
        [P("6. Clean and tag the release", "CellBold"), P("Commit intended local changes, remove/generated-artifact noise, verify a clean tree, then rerun all gates from the exact signed tag/commit.", "Cellx")],
    ]
    story += [table(actions, [55 * mm, doc.width - 55 * mm]), Spacer(1, 6 * mm)]

    final_call = Table([[P("GO / NO-GO RECOMMENDATION", "CoverKicker")], [P("NO-GO", "Verdict")], [P("Do not publish the current web/backend/mobile release as production. Reassess only after all P0 gates pass and remaining P1 items are closed or formally accepted by the release owner.", "Bodyx")]],
                       colWidths=[doc.width - 12 * mm], style=TableStyle([
                           ("BACKGROUND", (0, 0), (-1, -1), RED_BG),
                           ("BOX", (0, 0), (-1, -1), 1.1, RED),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 7),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                       ]))
    story += [final_call, Spacer(1, 6 * mm), P("Generated from automated checks performed on 16 September 2026. This report is a point-in-time engineering assessment, not a substitute for release-owner approval or platform-store review.", "Smallx")]

    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
