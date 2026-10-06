from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc24-course-search-suggestions-comparison-2026-10-06.pdf"


def para(text, style):
    return Paragraph(text.replace("&", "&amp;"), style)


def main():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Skillomate Android vc24 Build Comparison",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#17130B"),
        spaceAfter=6,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#2B2419"),
        spaceBefore=9,
        spaceAfter=5,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=12.4,
        textColor=colors.HexColor("#2F2A22"),
    )
    small = ParagraphStyle(
        "Small",
        parent=body,
        fontSize=8.3,
        leading=11,
        textColor=colors.HexColor("#5F574D"),
    )

    story = [
        Paragraph("Skillomate Android Build Comparison", title),
        para("Previous build: vc23 report keyboard fix. New build: vc24 course search suggestions. Date: 2026-10-06.", small),
        Spacer(1, 5 * mm),
    ]

    rows = [
        ["Area", "vc23 behavior", "vc24 behavior"],
        [
            "Navigation search suggestions",
            "The visible root bottom navigation search could still use generic shortcut references when the persistent nav wrapper did not receive course data.",
            "The root persistent navigation search now receives the loaded course catalog and displays live course suggestions as the user types.",
        ],
        [
            "Suggestion content",
            "Results could include generic destinations such as course lessons, continue learning, Nex AI, or downloads.",
            "The suggestion provider now returns real course entries only. Lecture rows and generic app shortcuts were removed from the nav search dataset.",
        ],
        [
            "Selection behavior",
            "A suggestion could navigate to a generic section instead of a specific course.",
            "Selecting a suggestion invokes the course open handler for that course, preserving existing subscription/access checks.",
        ],
        [
            "Search ranking and labels",
            "Suggestions were simple contains matches and the empty state said No matching references.",
            "Course suggestions are ranked by exact title, title prefix, word prefix, then fallback match. Placeholder/accessibility labels now say Search courses and the empty state says No matching courses.",
        ],
        [
            "Build configuration",
            "Android versionCode 23.",
            "Android versionCode 24 in app.json and android/app/build.gradle.",
        ],
    ]
    table = Table(
        [[para(cell, body if row else small) for cell in line] for row, line in enumerate(rows)],
        colWidths=[34 * mm, 70 * mm, 70 * mm],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3E8D0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17130B")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8C7A7")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([Paragraph("Summary Of Differences", h2), table])

    story.extend([
        Paragraph("Notable Code Changes", h2),
        para("Updated BottomNav search defaults to Search courses, removed the old generic fallback suggestion list, and changed the no-result copy to No matching courses.", body),
        para("Updated buildCourseSearchReferences so it emits only course suggestion objects. Lesson titles remain searchable keywords for discovering the containing course, but the displayed/selectable suggestions are courses only.", body),
        para("Added navSearchCourses state in App, a catalog update callback from HomeScreen and CourseListScreen, and passed course references into the persistent root BottomNav and Profile BottomNav.", body),
        Paragraph("Verification", h2),
        para("Ran git diff --check with no whitespace errors.", body),
        para("Built Android release APK and AAB with Gradle tasks :app:bundleRelease and :app:assembleRelease. Build completed successfully.", body),
        para("Installed Skillomate-1.0-vc24-course-search-suggestions.apk on emulator-5554. adb reported versionCode=24 and the foreground activity as com.skillomate.app/.MainActivity.", body),
        para("Authenticated in-app retest of course search suggestions is still pending because the emulator app data was previously cleared and the app is logged out.", body),
        Paragraph("Artifacts", h2),
        para("APK: appcopyai/releases/android/Skillomate-1.0-vc24-course-search-suggestions.apk", small),
        para("AAB: appcopyai/releases/android/Skillomate-1.0-vc24-course-search-suggestions.aab", small),
    ])

    doc.build(story)


if __name__ == "__main__":
    main()
