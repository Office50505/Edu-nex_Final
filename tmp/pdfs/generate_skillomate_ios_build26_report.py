from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "skillomate-ios-build26-comparison-2026-10-08.pdf"


def p(text, style):
    return Paragraph(text, style)


def section(title, items, styles, story):
    story.append(p(title, styles["Section"]))
    for item in items:
        story.append(p(f"- {item}", styles["Body"]))
    story.append(Spacer(1, 4 * mm))


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title="Skillomate iOS Build 26 Comparison",
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
            spaceAfter=5 * mm,
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
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#302a22"),
            spaceAfter=1.7 * mm,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontSize=8.4,
            leading=11.3,
            textColor=colors.HexColor("#4a433b"),
        ),
    }

    story = [
        p("Skillomate iOS Build 26 Comparison Report", styles["Title"]),
        p(
            "Date: 2026-10-08 | Platform: iOS | Previous build: 25 | New build: 26 | Marketing version: 1.0",
            styles["Sub"],
        ),
    ]

    header = ParagraphStyle("Header", parent=styles["Small"], fontName="Helvetica-Bold")
    area = ParagraphStyle("Area", parent=styles["Small"], fontName="Helvetica-Bold")
    cell = styles["Small"]
    rows = [
        ["Area", "Previous Build 25", "New Build 26"],
        [
            "Version metadata",
            "Expo iOS buildNumber and Xcode CURRENT_PROJECT_VERSION were 25.",
            "Expo iOS buildNumber and Xcode CURRENT_PROJECT_VERSION are now 26. CFBundleVersion resolves from CURRENT_PROJECT_VERSION.",
        ],
        [
            "Code changes",
            "Existing app code and release behavior from build 25.",
            "No feature code changes were made for build 26; this is a build-number-only iOS release preparation.",
        ],
        [
            "Build output",
            "Prior exported artifacts are stored under appcopyai/releases/ios for older builds.",
            "New archive and App Store export were created for Skillomate 1.0 build 26, including Skillomate.ipa.",
        ],
        [
            "Verification",
            "Build 25 metadata was the previous checked-in state.",
            "Xcode workspace listing, Release archive, App Store export, and archive Info.plist metadata check completed successfully.",
        ],
    ]
    table_rows = []
    for i, row in enumerate(rows):
        row_styles = [header, header, header] if i == 0 else [area, cell, cell]
        table_rows.append([p(value, row_styles[j]) for j, value in enumerate(row)])

    table = Table(table_rows, colWidths=[35 * mm, 66 * mm, 66 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4b64a")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fffaf2")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#fffaf2"), colors.HexColor("#fbf2e6")]),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dccfbf")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
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
        "Notable Code And Configuration Changes",
        [
            "Updated appcopyai/app.json ios.buildNumber from 25 to 26.",
            "Updated appcopyai/ios/ProtectedVideo.xcodeproj/project.pbxproj CURRENT_PROJECT_VERSION from 25 to 26 in both relevant build configurations.",
            "Kept MARKETING_VERSION at 1.0 and bundle identifier at com.alihussainkhan.edunexfinal.",
            "No JavaScript, backend, dependency, entitlement, or Expo plugin changes were made for this build.",
        ],
        styles,
        story,
    )

    section(
        "Build Artifacts Delivered",
        [
            "Archive: appcopyai/releases/ios/Skillomate-1.0-build26.xcarchive.",
            "Export folder: appcopyai/releases/ios/Skillomate-1.0-build26-app-store-export.",
            "IPA: appcopyai/releases/ios/Skillomate-1.0-build26-app-store-export/Skillomate.ipa.",
            "Archive Info.plist confirms CFBundleShortVersionString 1.0, CFBundleVersion 26, bundle identifier com.alihussainkhan.edunexfinal, arm64 architecture, and team LJ48CVC23W.",
        ],
        styles,
        story,
    )

    section(
        "Testing And Verification Performed",
        [
            "Validated app.json, ExportOptionsLocalAppStore.plist, and ExportOptionsTestFlight.plist with plutil.",
            "Confirmed Xcode workspace ProtectedVideo.xcworkspace lists the ProtectedVideo scheme.",
            "Ran xcodebuild archive for workspace ProtectedVideo.xcworkspace, scheme ProtectedVideo, Release configuration, generic iOS destination; archive succeeded.",
            "Ran xcodebuild -exportArchive with ios/ExportOptionsLocalAppStore.plist; export succeeded and produced a 19 MB IPA.",
            "Reviewed the generated archive metadata to confirm version 1.0 and build 26.",
            "No runtime device smoke test or App Store Connect/TestFlight upload was performed as part of this local build task.",
        ],
        styles,
        story,
    )

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    main()
