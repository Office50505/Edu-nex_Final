from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "skillomate-vc21-build28-comparison-report.pdf"


def para(text, style):
    return Paragraph(text.replace("&", "&amp;"), style)


def cell(text, style):
    return Paragraph(text.replace("&", "&amp;").replace("/", "/<br/>"), style)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontSize=8.6,
            leading=11,
            textColor=colors.HexColor("#263238"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyTight",
            parent=styles["BodyText"],
            fontSize=9.5,
            leading=12.5,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Cell",
            parent=styles["BodyText"],
            fontSize=7.5,
            leading=9.2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontSize=13,
            leading=16,
            spaceBefore=10,
            spaceAfter=6,
            textColor=colors.HexColor("#1B365D"),
        )
    )

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title="Skillomate VC21 / Build 28 Comparison Report",
    )

    story = []
    story.append(Paragraph("Skillomate VC21 / iOS Build 28 Comparison Report", styles["Title"]))
    story.append(para("Generated: 2026-10-10", styles["Small"]))
    story.append(Spacer(1, 0.12 * inch))

    story.append(para(
        "This report compares the previous delivered Skillomate mobile release "
        "(Android versionCode 20 and iOS build 27) with the new release requested "
        "in this session: Android versionCode 21, Android versionName 1.0, and "
        "iOS build 28.",
        styles["BodyTight"],
    ))

    story.append(Paragraph("Release Summary", styles["Section"]))
    summary_rows = [
        ["Area", "Previous", "New"],
        ["Android versionName", "1.0", "1.0"],
        ["Android versionCode", "20", "21"],
        ["iOS marketing version", "1.0", "1.0"],
        ["iOS build number", "27", "28"],
        ["Android package", "com.skillomate.app", "com.skillomate.app"],
        ["iOS bundle ID", "com.alihussainkhan.edunexfinal", "com.alihussainkhan.edunexfinal"],
    ]
    table = Table(summary_rows, colWidths=[1.65 * inch, 2.25 * inch, 2.25 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B365D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0BEC5")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F7FAFC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    story.append(Paragraph("Code And Configuration Changes", styles["Section"]))
    changes = [
        "Updated appcopyai/app.json Android versionCode from 20 to 21.",
        "Updated appcopyai/app.json iOS buildNumber from 27 to 28.",
        "Updated appcopyai/android/app/build.gradle versionCode from 20 to 21 so local Gradle release builds emit the requested Android version code.",
        "Updated appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj CURRENT_PROJECT_VERSION from 27 to 28 for both relevant build configurations.",
        "No functional feature code, UI behavior, backend contract, or payment logic was intentionally changed for this build request.",
    ]
    for item in changes:
        story.append(para("- " + item, styles["BodyTight"]))

    story.append(Paragraph("Delivered Artifacts", styles["Section"]))
    artifact_rows = [
        ["Artifact", "Path", "Result"],
        [
            "Android AAB",
            "appcopyai/releases/android/Skillomate-1.0-vc21-production.aab",
            "Built and signed",
        ],
        [
            "Android APK",
            "appcopyai/releases/android/Skillomate-1.0-vc21-production.apk",
            "Built and signed",
        ],
        [
            "iOS archive",
            "appcopyai/releases/ios/Skillomate-1.0-build28.xcarchive",
            "Archive succeeded",
        ],
        [
            "iOS IPA export",
            "appcopyai/releases/ios/Skillomate-1.0-build28-app-store-export/Skillomate.ipa",
            "Export succeeded",
        ],
    ]
    artifact_rows_wrapped = [artifact_rows[0]]
    for row in artifact_rows[1:]:
        artifact_rows_wrapped.append([row[0], cell(row[1], styles["Cell"]), row[2]])
    artifact_table = Table(artifact_rows_wrapped, colWidths=[1.15 * inch, 3.95 * inch, 1.2 * inch])
    artifact_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#263238")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0BEC5")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FAFAFA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(artifact_table)

    story.append(Paragraph("Verification Performed", styles["Section"]))
    checks = [
        "Gradle bundleRelease completed successfully for the signed AAB after retrying with increased JVM heap/metaspace.",
        "Gradle assembleRelease completed successfully for the signed APK.",
        "APK metadata was inspected with aapt and confirmed package com.skillomate.app, versionCode 21, versionName 1.0.",
        "APK signature verification passed using Android apksigner with APK Signature Scheme v2.",
        "AAB JAR signature verification completed successfully with jarsigner; signed-entry warnings were present but jarsigner exited successfully.",
        "Xcode archive completed successfully for iOS build 28.",
        "Xcode exportArchive completed successfully and produced the App Store Connect IPA.",
        "The exported IPA Info.plist was inspected and confirmed CFBundleShortVersionString 1.0 and CFBundleVersion 28.",
    ]
    for item in checks:
        story.append(para("- " + item, styles["BodyTight"]))

    story.append(Paragraph("Notes And Risks", styles["Section"]))
    notes = [
        "The initial Android AAB packaging attempt ran out of Gradle JVM metaspace. The successful retry used --no-daemon with Xmx4g and MaxMetaspaceSize=1024m.",
        "iOS archive logs include dependency warnings from generated react-native-iap Swift files; the archive and export still completed successfully.",
        "A pre-existing local change to appcopyai/ios/Podfile.lock was present before this build work and was not intentionally modified for the version bump.",
    ]
    for item in notes:
        story.append(para("- " + item, styles["BodyTight"]))

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    build()
