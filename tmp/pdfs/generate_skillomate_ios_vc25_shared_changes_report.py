from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "skillomate-ios-vc25-shared-changes-comparison-2026-10-06.pdf"


def para(text, style):
    return Paragraph(text, style)


def section(title, body, styles, story):
    story.append(para(title, styles["Section"]))
    for item in body:
        story.append(para(f"- {item}", styles["Body"]))
    story.append(Spacer(1, 5 * mm))


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title="Skillomate iOS Build 25 Comparison",
        author="Codex",
    )

    base = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#17130d"),
            spaceAfter=6 * mm,
        ),
        "Sub": ParagraphStyle(
            "Sub",
            parent=base["BodyText"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#5b5247"),
            spaceAfter=5 * mm,
        ),
        "Section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#17130d"),
            spaceBefore=2 * mm,
            spaceAfter=2 * mm,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontSize=9.6,
            leading=13.5,
            textColor=colors.HexColor("#302a22"),
            spaceAfter=1.8 * mm,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontSize=8.8,
            leading=12,
            textColor=colors.HexColor("#4a433b"),
        ),
    }

    story = [
        para("Skillomate iOS Build 25 Comparison Report", styles["Title"]),
        para(
            "Date: 2026-10-06 | Platform: iOS | Previous iOS build: 21 | New iOS build: 25",
            styles["Sub"],
        ),
    ]

    table_header = ParagraphStyle(
        "TableHeader",
        parent=styles["Small"],
        fontName="Helvetica-Bold",
        fontSize=7.7,
        leading=9.4,
        textColor=colors.HexColor("#17130d"),
    )
    table_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Small"],
        fontSize=7.2,
        leading=9.2,
        textColor=colors.HexColor("#302a22"),
    )
    table_area = ParagraphStyle(
        "TableArea",
        parent=table_cell,
        fontName="Helvetica-Bold",
    )

    raw_rows = [
        ["Area", "Previous iOS version", "New iOS version"],
        [
            "Build metadata",
            "iOS build number and Xcode project version were 21.",
            "app.json buildNumber, Xcode CURRENT_PROJECT_VERSION, and Info.plist CFBundleVersion are now 25.",
        ],
        [
            "Shared React Native app behavior",
            "iOS app was still tied to the older shared app behavior.",
            "Shared fixes are included for latest lessons, video gestures, playback overlay taps, report dialog keyboard handling, course suggestions, and editable personal details.",
        ],
        [
            "Native dependency state",
            "CocoaPods lockfile referenced an older local package layout.",
            "pod install refreshed native dependency lock state so the current Expo module layout builds.",
        ],
        [
            "Verification",
            "No successful iOS Release simulator build was recorded for this change set.",
            "Release simulator build completed successfully with code signing disabled.",
        ],
    ]
    summary_rows = []
    for row_index, row in enumerate(raw_rows):
        row_styles = [table_header, table_header, table_header] if row_index == 0 else [table_area, table_cell, table_cell]
        summary_rows.append([para(cell, row_styles[col_index]) for col_index, cell in enumerate(row)])

    table = Table(summary_rows, colWidths=[35 * mm, 66 * mm, 66 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4b64a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17130d")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.2),
                ("LEADING", (0, 0), (-1, -1), 10.2),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dccfbf")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fffaf2")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#fffaf2"), colors.HexColor("#fbf2e6")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 6 * mm))

    section(
        "Feature And Bug Fix Coverage",
        [
            "Latest Lessons now uses the shared uploaded-time ordering logic, so the newest lesson across course content is selected first instead of relying on older static ordering.",
            "Video player gesture behavior now keeps the screen stable during the edge hold 2x playback gesture and hides the overlay on the second non-control tap without pausing playback.",
            "Report a problem dialog now uses the shared keyboard-aware layout improvements so focused inputs and actions remain reachable when the keyboard opens.",
            "Navigation search suggestions now return course suggestions only, with lectures used as matching keywords rather than displayed suggestion rows.",
            "Profile personal details now expose editable name, email, gender, and age fields with validation and persistence through the authenticated profile update API.",
            "The New Lesson AI backend/admin flow was added in the shared admin/backend code path; this is not a native iOS-only feature but remains part of the same release set.",
            "Android system Back handling is Android-specific and does not change native iOS navigation behavior.",
        ],
        styles,
        story,
    )

    section(
        "Code And Configuration Changes",
        [
            "Updated appcopyai/app.json iOS buildNumber from 21 to 25 while keeping bundle identifier com.alihussainkhan.edunexfinal.",
            "Updated appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj CURRENT_PROJECT_VERSION from 21 to 25 for both build configurations.",
            "Updated appcopyai/ios/ProtectedVideo/Info.plist CFBundleVersion from 21 to 25.",
            "Refreshed appcopyai/ios/Podfile.lock with CocoaPods 1.17.0 after pod install resolved the stale ExpoLogBox/ExpoModulesCore path state.",
        ],
        styles,
        story,
    )

    section(
        "Verification Performed",
        [
            "Confirmed iOS metadata reports build number 25 in app.json, Xcode project settings, and Info.plist.",
            "Ran xcodebuild -list against appcopyai/ios/ProtectedVideo.xcworkspace and confirmed the ProtectedVideo scheme is present.",
            "Ran pod install in appcopyai/ios to refresh native dependencies.",
            "Ran xcodebuild for the ProtectedVideo Release iphonesimulator target with CODE_SIGNING_ALLOWED=NO; build completed successfully.",
            "No signed device archive, IPA export, TestFlight upload, or logged-in iOS runtime retest was performed in this environment.",
        ],
        styles,
        story,
    )

    story.append(para("Files Reviewed/Updated", styles["Section"]))
    files = [
        "appcopyai/App.js",
        "appcopyai/homeContentConfig.js",
        "appcopyai/app.json",
        "appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj",
        "appcopyai/ios/ProtectedVideo/Info.plist",
        "appcopyai/ios/Podfile.lock",
        "appcopyai/backend/models/Course.js",
        "appcopyai/backend/server.js",
        "appcopyai/backend/services/mobileCompatibilityService.js",
        "edunex-b/server.js",
        "edunex-f/src/pages/admin/AdminUploadPage.jsx",
        "edunex-f/src/pages/admin/admin-react.css",
    ]
    story.append(para(", ".join(files), styles["Small"]))

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    main()
