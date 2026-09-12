from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-expo57-fix-build-comparison-2026-09-12.pdf"


def para(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=24,
    textColor=colors.HexColor("#111111"),
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=16,
    textColor=colors.HexColor("#1F2933"),
    spaceBefore=10,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#222222"),
))
styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#444444"),
))
styles.add(ParagraphStyle(
    name="TableCell",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=7.2,
    leading=9.2,
    textColor=colors.HexColor("#111111"),
))
styles.add(ParagraphStyle(
    name="TableHeader",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=7.6,
    leading=9.5,
    textColor=colors.white,
))

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=0.55 * inch,
    leftMargin=0.55 * inch,
    topMargin=0.5 * inch,
    bottomMargin=0.5 * inch,
)

story = []
story.append(para("Skillomate Mobile Build Comparison Report", styles["TitleCustom"]))
story.append(para("Date: 2026-09-12", styles["BodyCustom"]))
story.append(para(
    "Scope: Comparison of the previous mobile dependency state and Android release artifacts "
    "against the new Expo SDK 57 compatibility-fix build.",
    styles["BodyCustom"],
))
story.append(Spacer(1, 8))

story.append(para("Summary", styles["Section"]))
summary_rows = [
    ["Area", "Previous", "New"],
    ["Expo compatibility", "expo install --check reported mismatched SDK 57 packages.", "Dependency check now reports: Dependencies are up to date."],
    ["Android release build", "Previous signed APK existed in releases/android from 2026-09-11.", "Fresh release APK built on 2026-09-12 after dependency fixes."],
    ["Android test install", "Existing APK was signed.", "New debug-signed test APK verifies with APK Signature Scheme v2 and v3."],
    ["iOS status", "Simulator launch previously succeeded but package mismatch remained.", "No new TestFlight build created in this pass; dependency source is ready for iOS rebuild."],
]
summary_rows = [
    [para(cell, styles["TableHeader"] if row_index == 0 else styles["TableCell"]) for cell in row]
    for row_index, row in enumerate(summary_rows)
]
table = Table(summary_rows, colWidths=[1.25 * inch, 2.25 * inch, 2.75 * inch])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("LEADING", (0, 0), (-1, -1), 10),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9CED6")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F8FA")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(table)

story.append(para("Code And Dependency Changes", styles["Section"]))
changes = [
    "Updated Expo core package from ^57.0.9 to ~57.0.22.",
    "Updated expo-video from ~57.0.3 to ~57.0.4, the highest-risk crash-related module because the app uses it in the lesson player.",
    "Updated expo-screen-capture from ~57.0.2 to ~57.0.3.",
    "Updated expo-print from ~57.0.1 to ~57.0.2.",
    "package-lock.json changed to lock the corrected package artifacts.",
]
for item in changes:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Build Outputs", styles["Section"]))
outputs = [
    "Android unsigned APK: appcopyai/releases/android/skillomate-1.0-vc1-expo57-fix-unsigned.apk",
    "Android debug-signed test APK: appcopyai/releases/android/skillomate-1.0-vc1-expo57-fix-debugsigned.apk",
    "Android Gradle output: appcopyai/android/app/build/outputs/apk/release/app-arm64-v8a-release-unsigned.apk",
]
for item in outputs:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Verification Performed", styles["Section"]))
checks = [
    "npx expo install --check completed with: Dependencies are up to date.",
    "npx expo export --platform android completed and generated the Android JS bundle.",
    "Gradle assembleRelease completed successfully in 3m 9s.",
    "The debug-signed APK verifies with apksigner using v2 and v3 signature schemes.",
    "An earlier iOS simulator run launched to the Skillomate login screen without an immediate startup crash.",
]
for item in checks:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Remaining Notes", styles["Section"]))
notes = [
    "The debug-signed APK is for device testing only, not Play Store submission.",
    "For production Android or TestFlight, run the configured EAS profiles so store credentials are applied.",
    "The npm audit output still reports moderate vulnerabilities; do not use npm audit fix --force without review because it may introduce breaking dependency changes.",
    "If the app still crashes on a physical phone after installing the new build, capture Android logcat or iOS device logs immediately after the crash.",
]
for item in notes:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(Spacer(1, 10))
story.append(para("Prepared by Codex for the Skillomate mobile crash-fix build pass.", styles["Small"]))

doc.build(story)
