from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)


OUTPUT = "output/pdf/Skillomate-VC20-Android-AAB-Build-Report-2026-10-10.pdf"


def p(text, style):
    return Paragraph(text, style)


def add_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(18 * mm, 10 * mm, "Skillomate VC20 Android AAB Build Report")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="TitleMain",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=8,
        textColor=colors.HexColor("#172033"),
    )
)
styles.add(
    ParagraphStyle(
        name="Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor("#1D3557"),
    )
)
styles.add(
    ParagraphStyle(
        name="BodySmall",
        parent=styles["BodyText"],
        fontSize=9,
        leading=12,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Cell",
        parent=styles["BodyText"],
        fontSize=8,
        leading=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CellBold",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
    )
)


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=16 * mm,
)

story = []
story.append(p("Skillomate VC20 Android AAB Build Report", styles["TitleMain"]))
story.append(p("Generated: 2026-10-10, Asia/Kolkata", styles["BodySmall"]))
story.append(
    p(
        "Scope: signed Google Play Android App Bundle build validation for versionCode 20, compared against the previous VC19 intro-offer release artifact.",
        styles["BodySmall"],
    )
)

story.append(p("Executive Summary", styles["Section"]))
summary_rows = [
    ["Item", "Result"],
    ["Verdict", "READY for Google Play Internal Testing handoff. No upload or Play Console change was performed."],
    ["Final artifact", "appcopyai/releases/android/Skillomate-VC20-GooglePlay-Intro9rs-3days.aab"],
    ["Package", "com.skillomate.app"],
    ["Version code", "20"],
    ["AAB SHA-256", "0926a93aa1eb83c6a86f5c05e25ea5a311d55452b7db906690817bdbeef542f1"],
]
table = Table([[p(c, styles["CellBold"] if i == 0 else styles["Cell"]) for c in row] for i, row in enumerate(summary_rows)], colWidths=[35 * mm, 137 * mm])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9EEF7")),
    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B8C2D6")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(table)

story.append(p("VC19 to VC20 Comparison", styles["Section"]))
comparison_rows = [
    ["Area", "Previous VC19", "New VC20"],
    ["Versioning", "versionCode 19 release artifact retained for comparison.", "versionCode 20 in app.json, Android Gradle config, and bundled app config."],
    ["Signing", "Existing Skillomate upload certificate on VC19 artifact.", "Same existing keystore and upload certificate; no new key generated."],
    ["Billing offer", "Intro 9 rupees / 3 days logic present in VC19 artifact name and prior flow.", "Packaged bundle contains intro-9rs-3days and monthly product id; old new-subscriber-1rs-24h token absent."],
    ["Java/Gradle", "Previous local build was blocked by missing Java in the earlier run.", "JDK 17 configured through Homebrew OpenJDK 17; Gradle 9.3.1 launcher JVM verified with Java 17."],
    ["Testing", "Prior artifact used as certificate baseline only.", "Google Play billing regression tests passed; JS syntax checks passed; signed AAB built successfully."],
]
table = Table([[p(c, styles["CellBold"] if i == 0 else styles["Cell"]) for c in row] for i, row in enumerate(comparison_rows)], colWidths=[28 * mm, 70 * mm, 74 * mm], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E9EEF7")),
    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B8C2D6")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(table)

story.append(PageBreak())
story.append(p("Verification Details", styles["Section"]))
details = [
    "Java status: OpenJDK 17.0.20.1 from Homebrew was used with JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home.",
    "Gradle compatibility: Gradle 9.3.1 ran on Java 17 and produced a successful release bundle with packageReleaseBundle, signReleaseBundle, and bundleRelease.",
    "Signing readiness: existing credentials.json and credentials/android/keystore.jks were reused without printing passwords. No keystore or signing key was generated.",
    "Upload certificate match: new VC20 AAB certificate SHA-256 equals the existing keystore and previous VC19 AAB certificate fingerprint: BA:50:3D:E5:86:B3:0E:E0:27:27:F8:87:F0:78:3C:56:8D:28:A0:57:A9:C1:F4:BE:41:3F:93:DB:0F:88:90:56.",
    "Production API: bundled app config and JS bundle contain https://api.skillomate.in.",
    "Packaged offer verification: extracted base/assets/index.android.bundle from the final AAB contains intro-9rs-3days and skillomate_premium_monthly, and contains zero occurrences of new-subscriber-1rs-24h.",
    "P3D/P1M behavior: source and regression tests validate one paid non-recurring P3D introductory phase followed by the recurring P1M monthly phase, with fallback to the base monthly offer when the intro offer is invalid.",
    "Tests run: node appcopyai/tests/googlePlaySubscriptionOffers.test.js; node --check appcopyai/services/subscriptions.js appcopyai/services/useGooglePlaySubscriptions.js appcopyai/App.js.",
    "Restrictions observed: no backend/AWS changes, no Google Play Console upload or publish, no Apple StoreKit or Razorpay changes, and no Auto Scaling inspection.",
]
for item in details:
    story.append(p("- " + item, styles["BodySmall"]))

story.append(p("Local Changes", styles["Section"]))
story.append(
    p(
        "The stale checked-in Android JS bundle at appcopyai/android/app/src/main/assets/index.android.bundle was removed so the release could only package the fresh Metro/Hermes bundle generated by Gradle. Existing unrelated files were preserved.",
        styles["BodySmall"],
    )
)

doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
