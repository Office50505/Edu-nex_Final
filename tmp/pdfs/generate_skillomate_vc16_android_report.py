from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc16-build-comparison-2026-10-05.pdf"


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontSize=12, leading=15, spaceBefore=9, spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=11))
    styles.add(ParagraphStyle(name="TableHeader", parent=styles["Small"], textColor=colors.white))
    body = styles["BodyText"]

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Skillomate Android vc16 Build Comparison",
    )
    rows = [
        ["Area", "Previous: vc15", "New: vc16"],
        ["Version", "1.0 (code 15)", "1.0 (code 16)"],
        ["Output", "AAB and APK", "AAB only"],
        ["Lecture download UI", "Removed", "Still removed"],
        ["Feature changes", "Previous release's changes", "None"],
        ["Bug fixes", "Previous release's fixes", "None in this version bump"],
        ["Signing", "Play upload key", "Play upload key"],
    ]
    table = Table(
        [[Paragraph(str(value), styles["TableHeader"] if index == 0 else styles["Small"]) for value in row] for index, row in enumerate(rows)],
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
        Paragraph("Skillomate Android vc16 Build Comparison", styles["Title"]),
        Paragraph("5 October 2026 | Previous: vc15 | New: vc16", styles["Small"]),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph("This release advances the Android version code from 15 to 16 and produces a new signed AAB for Google Play. Version name remains 1.0. No application behavior was intentionally changed.", body),
        Spacer(1, 8),
        table,
        Paragraph("Code And Configuration", styles["Section"]),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode changed from 15 to 16. App.js did not change for this build; the vc15 lecture download-button removal remains included.", body),
        Paragraph("Build Output", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc16-production.aab", styles["Small"]),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("Gradle :app:clean :app:bundleRelease completed successfully. The generated merged manifest reports package com.skillomate.app, versionName 1.0, and versionCode 16. unzip detected no archive errors; git diff --check passed.", body),
        Paragraph("keytool verified the signed AAB. Signer SHA1 matches the Play upload certificate: 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C.", body),
        Paragraph("No APK was requested or produced for vc16, and no on-device test was performed for this AAB-only build.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
