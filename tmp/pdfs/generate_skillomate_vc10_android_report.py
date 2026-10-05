from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc10-build-comparison-2026-10-05.pdf"


def para(text, style):
    return Paragraph(text, style)


def main():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontSize=8,
            leading=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            fontSize=13,
            leading=16,
            spaceBefore=8,
            spaceAfter=6,
        )
    )

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Skillomate Android vc10 Build Comparison",
    )

    story = [
        para("Skillomate Android vc10 Build Comparison", styles["Title"]),
        para("Date: 2026-10-05", styles["Small"]),
        Spacer(1, 6),
        para(
            "This report compares the previous Android vc9 build with the newly generated Android vc10 build requested for Skillomate version 1.0.",
            styles["BodyText"],
        ),
        para("Summary", styles["Section"]),
    ]

    summary_rows = [
        ["Area", "Previous", "New"],
        ["Version name", "1.0", "1.0"],
        ["Android version code", "9", "10"],
        ["AAB output", "Skillomate-1.0-vc9-debugsigned.aab", "Skillomate-1.0-vc10-debugsigned.aab"],
        ["APK output", "Skillomate-1.0-vc9-debugsigned.apk", "Skillomate-1.0-vc10-debugsigned.apk"],
        ["Signing", "Debug keystore", "Debug keystore"],
    ]
    table = Table(summary_rows, colWidths=[42 * mm, 60 * mm, 60 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ]
        )
    )
    story.extend([table, Spacer(1, 8)])

    story.extend(
        [
            para("Code And Configuration Changes", styles["Section"]),
            para("appcopyai/app.json: android.versionCode changed from 9 to 10.", styles["BodyText"]),
            para("appcopyai/android/app/build.gradle: defaultConfig versionCode changed from 9 to 10.", styles["BodyText"]),
            para("No feature or bug-fix code was intentionally changed for this build.", styles["BodyText"]),
            para("Build Outputs", styles["Section"]),
            para("AAB: appcopyai/releases/android/Skillomate-1.0-vc10-debugsigned.aab", styles["Small"]),
            para("APK: appcopyai/releases/android/Skillomate-1.0-vc10-debugsigned.apk", styles["Small"]),
            para("AAB size: about 45 MB. APK size: about 41 MB.", styles["BodyText"]),
            para("Signing Note", styles["Section"]),
            para(
                "The only Android signing key available in this workspace is appcopyai/android/app/debug.keystore. The vc10 files were signed with that debug key so the APK is locally installable.",
                styles["BodyText"],
            ),
            para(
                "Debug key SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25.",
                styles["Small"],
            ),
            para(
                "Google Play previously expected a different upload certificate, SHA1 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C. Uploading this debug-signed AAB to that Play app will likely fail with the same wrong-key error.",
                styles["BodyText"],
            ),
            para("Testing And Verification", styles["Section"]),
            para("Gradle build completed successfully: :app:clean :app:bundleRelease :app:assembleRelease.", styles["BodyText"]),
            para("APK metadata verified with aapt: package com.skillomate.app, versionName 1.0, versionCode 10.", styles["BodyText"]),
            para("APK signature verified with apksigner using v2 and v3 schemes.", styles["BodyText"]),
            para("AAB signature verified with jarsigner. AAB embedded app config shows android.versionCode 10.", styles["BodyText"]),
        ]
    )

    doc.build(story)


if __name__ == "__main__":
    main()
