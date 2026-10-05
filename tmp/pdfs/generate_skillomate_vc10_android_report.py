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
        ["AAB output", "Skillomate-1.0-vc9-debugsigned.aab", "Skillomate-1.0-vc10-production.aab"],
        ["APK output", "Skillomate-1.0-vc9-debugsigned.apk", "Skillomate-1.0-vc10-production.apk"],
        ["Signing", "Debug keystore", "Play upload keystore"],
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
            para("AAB: appcopyai/releases/android/Skillomate-1.0-vc10-production.aab", styles["Small"]),
            para("APK: appcopyai/releases/android/Skillomate-1.0-vc10-production.apk", styles["Small"]),
            para("AAB size: about 45 MB. APK size: about 41 MB.", styles["BodyText"]),
            para("Signing Note", styles["Section"]),
            para(
                "The corrected vc10 files were signed with appcopyai/credentials/android/keystore.jks, the Play upload key available in this workspace.",
                styles["BodyText"],
            ),
            para(
                "Upload key SHA1: 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C.",
                styles["Small"],
            ),
            para(
                "This SHA1 matches the certificate fingerprint Google Play reported as expected for the Skillomate app.",
                styles["BodyText"],
            ),
            para("Testing And Verification", styles["Section"]),
            para("Gradle build completed successfully: :app:clean :app:bundleRelease :app:assembleRelease.", styles["BodyText"]),
            para("APK metadata verified with aapt: package com.skillomate.app, versionName 1.0, versionCode 10.", styles["BodyText"]),
            para("APK signature verified with apksigner using v2 and v3 schemes; signer SHA1 matches the Play upload key.", styles["BodyText"]),
            para("AAB signature verified with jarsigner and keytool; signer SHA1 matches the Play upload key. AAB embedded app config shows android.versionCode 10.", styles["BodyText"]),
        ]
    )

    doc.build(story)


if __name__ == "__main__":
    main()
