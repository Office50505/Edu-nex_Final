from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc18-latest-lessons-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc18 Latest Lessons Comparison",
    )

    rows = [
        ["Area", "Previous: vc17", "New: vc18"],
        ["Version", "1.0 (versionCode 17)", "1.0 (versionCode 18)"],
        ["Latest Lessons", "Fell back to highest lesson numbers when dates were missing", "Sorts by upload timestamp, then subdocument ObjectId timestamp, then order"],
        ["Backend lesson data", "Mobile serializer omitted video upload timestamps", "Mobile serializer includes uploadedAt and related date fields"],
        ["Admin course saves", "Video edits could lose stable upload-date context", "Sanitizer preserves existing video _id and uploadedAt context"],
        ["Build outputs", "vc17 APK and AAB", "vc18 APK and AAB"],
        ["Device verification", "Installed on Pixel_10_Pro", "Installed and launched on Pixel_10_Pro"],
    ]
    table = Table(
        [[cell(value, styles["TableHeader"] if index == 0 else small) for value in row] for index, row in enumerate(rows)],
        colWidths=[39 * mm, 65 * mm, 66 * mm],
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
        Paragraph("Skillomate Android vc18 Latest Lessons Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc17 | New: vc18", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "This build updates the home screen so Latest Lessons is driven by lesson upload recency rather than simply showing the highest lesson numbers when date fields are absent.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/homeContentConfig.js: added getLessonUploadTime and sortLessonsByUploadTime helpers.", body),
        Paragraph("appcopyai/App.js: Latest Lessons now uses sortLessonsByUploadTime(lessons).slice(0, 3).", body),
        Paragraph("appcopyai/backend/models/Course.js: added uploadedAt to each course video subdocument.", body),
        Paragraph("appcopyai/backend/services/mobileCompatibilityService.js: selected and serialized video upload date fields for mobile clients.", body),
        Paragraph("appcopyai/backend/server.js: admin video sanitization now preserves existing video _id and stable upload dates.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc18-latest-lessons.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc18-latest-lessons.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("node --check passed for backend/server.js and backend/services/mobileCompatibilityService.js.", body),
        Paragraph("A focused helper check confirmed a newer uploadedAt date sorts ahead of higher lesson numbers.", body),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("aapt verified package com.skillomate.app, versionName 1.0, versionCode 18, minSdk 24, targetSdk 36.", body),
        Paragraph("ADB installed vc18 on emulator-5554 and launched com.skillomate.app/.MainActivity. Package verification reported versionCode 18.", body),
        Paragraph("Note: this local emulator build is debug-signed because Play release signing credentials were not available locally.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
