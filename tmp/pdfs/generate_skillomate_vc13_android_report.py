from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc13-build-comparison-2026-10-05.pdf"


def p(text, style):
    return Paragraph(text, style)


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10))
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
        title="Skillomate Android vc13 Build Comparison",
    )

    story = [
        p("Skillomate Android vc13 Build Comparison", styles["Title"]),
        p("Date: 2026-10-05", styles["Small"]),
        Spacer(1, 6),
        p(
            "This report compares the previous Android vc12 production build with the newly generated Android vc13 production build from the latest workspace state.",
            styles["BodyText"],
        ),
        p("Summary", styles["Section"]),
    ]

    rows = [
        ["Area", "Previous", "New"],
        ["Version name", "1.0", "1.0"],
        ["Android version code", "12", "13"],
        ["AAB output", "Skillomate-1.0-vc12-production.aab", "Skillomate-1.0-vc13-production.aab"],
        ["APK output", "Skillomate-1.0-vc12-production.apk", "Skillomate-1.0-vc13-production.apk"],
        ["Signing", "Play upload keystore", "Play upload keystore"],
    ]
    table = Table(rows, colWidths=[42 * mm, 60 * mm, 60 * mm])
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
            p("Code And Configuration Changes", styles["Section"]),
            p("appcopyai/app.json: android.versionCode changed from 12 to 13.", styles["BodyText"]),
            p("appcopyai/android/app/build.gradle: defaultConfig versionCode changed from 12 to 13.", styles["BodyText"]),
            p("The build was produced from the latest current workspace state.", styles["BodyText"]),
            p("No feature or bug-fix code was intentionally changed by this build step.", styles["BodyText"]),
            p("Build Outputs", styles["Section"]),
            p("AAB: appcopyai/releases/android/Skillomate-1.0-vc13-production.aab", styles["Small"]),
            p("APK: appcopyai/releases/android/Skillomate-1.0-vc13-production.apk", styles["Small"]),
            p("AAB size: about 45 MB. APK size: about 41 MB.", styles["BodyText"]),
            p("Signing", styles["Section"]),
            p(
                "The vc13 files were signed through Gradle with injected release credentials using appcopyai/credentials/android/keystore.jks.",
                styles["BodyText"],
            ),
            p(
                "Upload key SHA1: 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C.",
                styles["Small"],
            ),
            p("Testing And Verification", styles["Section"]),
            p("Gradle build completed successfully: :app:clean :app:bundleRelease :app:assembleRelease.", styles["BodyText"]),
            p("APK metadata verified with aapt: package com.skillomate.app, versionName 1.0, versionCode 13.", styles["BodyText"]),
            p("APK signature verified with apksigner using v2; signer SHA1 matches the Play upload key.", styles["BodyText"]),
            p("AAB signature verified with keytool; signer SHA1 matches the Play upload key.", styles["BodyText"]),
        ]
    )

    doc.build(story)


if __name__ == "__main__":
    main()
