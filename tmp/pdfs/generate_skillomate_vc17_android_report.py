from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc17-build-comparison-2026-10-06.pdf"


def cell(text, style):
    return Paragraph(str(text), style)


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontSize=12, leading=15, spaceBefore=9, spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=11))
    styles.add(ParagraphStyle(name="TableHeader", parent=styles["Small"], textColor=colors.white))
    body = styles["BodyText"]
    small = styles["Small"]

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Skillomate Android vc17 Build Comparison",
    )

    rows = [
        ["Area", "Previous: vc16", "New: vc17"],
        ["Version", "1.0 (versionCode 16)", "1.0 (versionCode 17)"],
        ["Workspace target", "appcopyai", "appcopyai"],
        ["Outputs", "AAB only, per prior report", "AAB plus installable APK"],
        ["Signing", "Play upload key, per prior report", "Local debug signing for emulator verification"],
        ["Code changes", "versionCode 15 to 16", "versionCode 16 to 17 in app.json and build.gradle"],
        ["Device verification", "No on-device test recorded", "Installed and launched on Pixel_10_Pro emulator"],
    ]
    table = Table(
        [[cell(value, styles["TableHeader"] if index == 0 else small) for value in row] for index, row in enumerate(rows)],
        colWidths=[40 * mm, 64 * mm, 66 * mm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#C8D3DD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F7F8")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    story = [
        Paragraph("Skillomate Android vc17 Build Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc16 | New: vc17", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "A fresh Android build was created from the current appcopyai workspace after confirming the old emulator APK came from the stale razorpay-app release set. "
            "The new build advances Android versionCode from 16 to 17 and produces both an AAB and an APK so the same code can be opened on the virtual phone.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code And Configuration Changes", styles["Section"]),
        Paragraph("appcopyai/app.json: Android versionCode changed from 16 to 17.", body),
        Paragraph("appcopyai/android/app/build.gradle: defaultConfig versionCode changed from 16 to 17.", body),
        Paragraph("No feature code was intentionally changed in this build pass.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc17-emulator-release.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc17-emulator-release.apk", small),
        Paragraph("Build And Environment Notes", styles["Section"]),
        Paragraph(
            "Dependencies were installed with npm ci. Gradle was run with OpenJDK 17 and ANDROID_HOME pointing to the local Android SDK. "
            "Release signing credentials for the Play upload key were not available locally, so a temporary debug keystore was generated for emulator-only signing.",
            body,
        ),
        Paragraph(
            "The first packaging attempt filled the disk during bundle creation. Old Gradle 8.x generated caches were removed, freeing about 6 GB, and the build completed successfully afterward.",
            body,
        ),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("aapt verified package com.skillomate.app, versionName 1.0, versionCode 17, minSdk 24, targetSdk 36.", body),
        Paragraph("ADB installed the vc17 APK on emulator-5554 and launched com.skillomate.app/.MainActivity.", body),
        Paragraph("ADB package verification reported versionCode 17 with install/update time 2026-10-06 12:02:40.", body),
        Paragraph("Window focus verification reported com.skillomate.app/com.skillomate.app.MainActivity in the foreground.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
