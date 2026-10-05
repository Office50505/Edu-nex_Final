from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-ios-build21-comparison-2026-10-05.pdf"


def mb(size):
    return f"{size / (1024 * 1024):.2f} MB"


def short_hash(value):
    return f"{value[:12]}...{value[-12:]}"


def p(text, style):
    return Paragraph(text, style)


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10))
    styles.add(ParagraphStyle(name="Tight", parent=styles["BodyText"], fontSize=9, leading=11))

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="Skillomate iOS Build 21 Comparison",
    )

    hashes = {
        "build20_ipa": "f7eaac16eeb712252c5a1d223bff0f45fc6a1858ce7a2f95246a82a38b9b0088",
        "build21_ipa": "614367010d54d32b30fd3aab10171fabd2b74fe69d7ee220765197b074d0b0b5",
    }

    story = [
        p("Skillomate iOS Build 21 Comparison", styles["Title"]),
        p("Generated: 5 October 2026, Asia/Kolkata", styles["Small"]),
        Spacer(1, 12),
        p("Summary", styles["Heading2"]),
        p(
            "A corrected iOS build was produced for Skillomate version 1.0 with build number 21. "
            "The first build attempt still reported build 20 because ProtectedVideo/Info.plist had a literal CFBundleVersion of 20; that incorrect build21 output was deleted and rebuilt after fixing the plist. "
            "The final archive and exported IPA both verify as CFBundleShortVersionString 1.0 and CFBundleVersion 21.",
            styles["Tight"],
        ),
        Spacer(1, 10),
        p("Artifacts", styles["Heading2"]),
    ]

    table = Table(
        [
            ["Artifact", "Version / Build", "Size", "SHA-256"],
            ["Skillomate-1.0-build20-app-store-export/Skillomate.ipa", "1.0 / 20", mb(19155931), short_hash(hashes["build20_ipa"])],
            ["Skillomate-1.0-build21.xcarchive", "1.0 / 21", "118 MB archive", "Verified by archive Info.plist"],
            ["Skillomate-1.0-build21-app-store-export/Skillomate.ipa", "1.0 / 21", mb(19145023), short_hash(hashes["build21_ipa"])],
        ],
        colWidths=[2.7 * inch, 1.0 * inch, 0.9 * inch, 2.0 * inch],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2933")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d0d8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("LEADING", (0, 0), (-1, -1), 8.2),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
    ]))
    story += [table, Spacer(1, 12)]

    story.append(p("Code And Configuration Changes", styles["Heading2"]))
    changes = Table(
        [
            ["File", "Previous", "New"],
            ["appcopyai/app.json", "ios.buildNumber: 20", "ios.buildNumber: 21"],
            ["ios project.pbxproj", "CURRENT_PROJECT_VERSION: 20", "CURRENT_PROJECT_VERSION: 21"],
            ["ios ProtectedVideo/Info.plist", "CFBundleVersion: 20", "CFBundleVersion: 21"],
            ["ios Podfile.lock", "CocoaPods metadata 1.16.2", "CocoaPods metadata 1.17.0 after pod install"],
        ],
        colWidths=[2.15 * inch, 2.1 * inch, 2.35 * inch],
        repeatRows=1,
    )
    changes.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d0d8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("LEADING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story += [changes, Spacer(1, 12)]

    story.append(p("Build And Verification", styles["Heading2"]))
    checks = [
        "Removed mistaken Android vc21 artifacts and restored Android versionCode to 9.",
        "Ran pod install to resync Pods/Manifest.lock with Podfile.lock after Xcode failed the first archive attempt.",
        "Ran xcodebuild archive for workspace ProtectedVideo.xcworkspace, scheme ProtectedVideo, Release, generic iOS destination.",
        "Ran xcodebuild -exportArchive using ExportOptionsLocalAppStore.plist; export succeeded.",
        "Archive Info.plist verifies version 1.0 and build 21.",
        "Exported IPA Info.plist verifies version 1.0 and build 21.",
        "Codesign inspection verifies bundle identifier com.alihussainkhan.edunexfinal and TeamIdentifier LJ48CVC23W.",
    ]
    for item in checks:
        story.append(p(f"- {item}", styles["Tight"]))

    story += [Spacer(1, 10), p("Release Notes", styles["Heading2"])]
    notes = [
        "Feature changes: none intentionally introduced in this build.",
        "Bug fixes: none intentionally introduced in this build.",
        "Build/config changes: iOS build advanced from 20 to 21 while keeping version 1.0.",
        "Signing note: archive verification reports Apple Development: Ali Hussain Khan (JGXF4R39DG); the export completed with the existing App Store Connect export options.",
    ]
    for item in notes:
        story.append(p(f"- {item}", styles["Tight"]))

    story += [Spacer(1, 10), p("Full Hash Reference", styles["Heading2"])]
    story.append(p(f"- build21 IPA: {hashes['build21_ipa']}", styles["Small"]))

    doc.build(story)


if __name__ == "__main__":
    main()
