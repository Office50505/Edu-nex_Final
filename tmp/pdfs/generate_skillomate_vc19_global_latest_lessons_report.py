from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc19-global-latest-lessons-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc19 Global Latest Lessons Comparison",
    )

    rows = [
        ["Area", "Previous: vc18", "New: vc19"],
        ["Version", "1.0 (versionCode 18)", "1.0 (versionCode 19)"],
        ["Latest Lessons scope", "Only primary home course", "All loaded home courses"],
        ["AI FilmMaking visibility", "Could be hidden by pinned AI Influencer primary course", "Can appear in Latest Lessons when newer"],
        ["Course context", "Single course passed to rows", "Each row carries its source course"],
        ["Row metadata", "Lesson number and duration", "Course title, lesson number, and duration when cross-course"],
        ["Build outputs", "vc18 APK and AAB", "vc19 APK and AAB"],
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
        Paragraph("Skillomate Android vc19 Global Latest Lessons Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc18 | New: vc19", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "AI FilmMaking did not appear because the home screen pinned AI Influencer as the primary course and Latest Lessons only read lessons from that one course. "
            "vc19 changes Latest Lessons to rank lessons across all loaded home courses.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/App.js: Latest Lessons now flattens lessons from all homeCourses, attaches each lesson's source course, and sorts the combined list by upload recency.", body),
        Paragraph("appcopyai/App.js: LessonListSection now opens each latest lesson with its own course and shows the course title when the row comes from a different course.", body),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode advanced from 18 to 19.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc19-global-latest-lessons.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc19-global-latest-lessons.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("node --check passed for appcopyai/App.js.", body),
        Paragraph("A focused helper check confirmed a newer AI FilmMaking lesson sorts ahead of older AI Influencer lessons when API upload dates are absent.", body),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("aapt verified package com.skillomate.app, versionName 1.0, versionCode 19, minSdk 24, targetSdk 36.", body),
        Paragraph("ADB installed vc19 and launched com.skillomate.app/.MainActivity on the virtual phone.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
