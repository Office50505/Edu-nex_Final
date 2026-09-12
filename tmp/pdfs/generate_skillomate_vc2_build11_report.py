from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-1.0-build11-vc2-comparison-report-2026-09-12.pdf"


def para(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=18,
    leading=21,
    textColor=colors.HexColor("#111111"),
    spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=11.5,
    leading=13,
    textColor=colors.HexColor("#1F2933"),
    spaceBefore=7,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8.0,
    leading=10.2,
    textColor=colors.HexColor("#222222"),
))
styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=7.2,
    leading=9.2,
    textColor=colors.HexColor("#444444"),
))
styles.add(ParagraphStyle(
    name="TableCell",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=6.9,
    leading=8.7,
    textColor=colors.HexColor("#111111"),
))
styles.add(ParagraphStyle(
    name="TableHeader",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=7.1,
    leading=8.8,
    textColor=colors.white,
))

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=0.45 * inch,
    leftMargin=0.45 * inch,
    topMargin=0.35 * inch,
    bottomMargin=0.35 * inch,
)

story = []
story.append(para("Skillomate Mobile Version Build Report", styles["TitleCustom"]))
story.append(para("Date: 2026-09-12", styles["BodyCustom"]))
story.append(para(
    "Scope: Comparison of the previous mobile build numbers with the new Android and iOS build artifacts "
    "created after the Expo SDK 57 compatibility fix.",
    styles["BodyCustom"],
))
story.append(Spacer(1, 4))

story.append(para("Version Summary", styles["Section"]))
summary_rows = [
    ["Area", "Previous", "New"],
    ["iOS", "Version 1.0, build 10 in Xcode/app Info.plist.", "Version 1.0, build 11 verified inside the completed .xcarchive."],
    ["Android", "Version name 1.0, versionCode 1.", "Version name 1.0, versionCode 2 verified from APK badging."],
    ["Expo SDK 57 packages", "Several installed package versions were one patch behind Expo's expected SDK 57 set.", "expo install --check reports dependencies are up to date after the package refresh."],
    ["Native iOS pods", "Podfile.lock pointed some Expo pods at old nested node_modules paths.", "pod install refreshed Podfile.lock to the corrected Expo package paths and versions."],
]
summary_rows = [
    [para(cell, styles["TableHeader"] if row_index == 0 else styles["TableCell"]) for cell in row]
    for row_index, row in enumerate(summary_rows)
]
table = Table(summary_rows, colWidths=[1.2 * inch, 2.3 * inch, 2.8 * inch])
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9CED6")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F8FA")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(table)

story.append(para("Code And Configuration Changes", styles["Section"]))
changes = [
    "Updated appcopyai/app.json: android.versionCode 1 to 2 and ios.buildNumber 10 to 11.",
    "Updated appcopyai/android/app/build.gradle: versionCode 1 to 2, keeping versionName 1.0.",
    "Updated iOS Xcode project build settings from CURRENT_PROJECT_VERSION 10 to 11.",
    "Updated appcopyai/ios/ProtectedVideo/Info.plist from CFBundleShortVersionString 1.0.0 to 1.0 and CFBundleVersion 10 to 11.",
    "Refreshed Expo SDK 57 package versions and Podfile.lock after npx expo install --fix and pod install.",
]
for item in changes:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Build Outputs", styles["Section"]))
outputs = [
    "Android installable test APK: appcopyai/releases/android/skillomate-1.0-vc2-expo57-fix-debugsigned.apk",
    "Android unsigned APK: appcopyai/releases/android/skillomate-1.0-vc2-expo57-fix-unsigned.apk",
    "Android release AAB output: appcopyai/releases/android/skillomate-1.0-vc2-expo57-fix-release.aab",
    "Android debug-signed AAB for verification only: appcopyai/releases/android/skillomate-1.0-vc2-expo57-fix-debugsigned.aab",
    "iOS archive: appcopyai/releases/ios/Skillomate-1.0-build11-corrected.xcarchive",
    "iOS development IPA: appcopyai/releases/ios/Skillomate-1.0-build11-development-export/Skillomate.ipa",
]
for item in outputs:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Verification Performed", styles["Section"]))
checks = [
    "npx expo install --check completed with dependencies up to date.",
    "Android Gradle assembleRelease and bundleRelease completed successfully.",
    "APK badging reports package com.skillomate.app, versionCode 2, versionName 1.0.",
    "The debug-signed APK verifies with APK Signature Scheme v2 and v3.",
    "The debug-signed AAB verifies with jarsigner, with expected debug self-signed certificate warnings.",
    "xcodebuild archive completed successfully for iOS.",
    "xcodebuild -exportArchive completed successfully for a local development IPA.",
    "The corrected iOS archive's app Info.plist reports CFBundleShortVersionString 1.0 and CFBundleVersion 11.",
]
for item in checks:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Signing And Release Notes", styles["Section"]))
notes = [
    "The debug-signed APK can be installed on Android devices for testing.",
    "The release AAB was produced locally but is not Play Store signed with production upload credentials.",
    "The debug-signed AAB is only a verification artifact and should not be submitted to Google Play.",
    "The iOS archive and development IPA are signed with an Apple Development identity and were not uploaded to TestFlight.",
    "Uploading to EAS or Apple/TestFlight sends project/build data to an external service and needs explicit approval before running.",
]
for item in notes:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(Spacer(1, 5))
story.append(para("Prepared by Codex for the Skillomate 1.0 iOS build 11 and Android versionCode 2 build pass.", styles["Small"]))

doc.build(story)
