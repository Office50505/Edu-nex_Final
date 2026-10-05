from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc14-build-comparison-2026-10-05.pdf"


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontSize=12, leading=15, spaceBefore=9, spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=11))
    styles.add(ParagraphStyle(name="TableHeader", parent=styles["Small"], textColor=colors.white))

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Skillomate Android vc14 Build Comparison",
    )
    body = styles["BodyText"]
    section = styles["Section"]
    story = [
        Paragraph("Skillomate Android vc14 Build Comparison", styles["Title"]),
        Paragraph("5 October 2026 | Previous build: vc13 | New build: vc14", styles["Small"]),
        Spacer(1, 8),
        Paragraph("Summary", section),
        Paragraph("The vc14 release fixes the JavaScript crash observed when opening a video lecture. The visible symptom was the app closing to the phone home screen.", body),
    ]

    rows = [
        ["Area", "vc13", "vc14"],
        ["Version name", "1.0", "1.0"],
        ["Android version code", "13", "14"],
        ["Lecture opening", "Undefined state setter could crash VideoItem", "Stale setter calls removed"],
        ["New features", "No change", "None added"],
        ["Signing", "Play upload key", "Play upload key"],
    ]
    table = Table(
        [[Paragraph(str(value), styles["TableHeader"] if index == 0 else styles["Small"]) for value in row] for index, row in enumerate(rows)],
        colWidths=[40 * mm, 64 * mm, 66 * mm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#C8D3DD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F7F8")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        Spacer(1, 8), table,
        Paragraph("Code And Configuration", section),
        Paragraph("App.js: removed two calls to an undefined setVolumeDrawerOpen function from VideoItem effects. This prevents the ReferenceError captured in the connected phone's AndroidRuntime log. No playback feature was removed; the volume drawer state was not present in the component.", body),
        Paragraph("app.json and android/app/build.gradle: advanced Android versionCode from 13 to 14; versionName remains 1.0.", body),
        Paragraph("Build Outputs", section),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc14-production.aab", styles["Small"]),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc14-production.apk", styles["Small"]),
        Paragraph("Testing And Verification", section),
        Paragraph("Gradle :app:bundleRelease and :app:assembleRelease completed successfully. Metro bundled the updated JavaScript. git diff --check passed, and no setVolumeDrawerOpen references remain in App.js.", body),
        Paragraph("aapt verified com.skillomate.app, versionName 1.0, versionCode 14. apksigner verified the APK; keytool verified the AAB. Both signer SHA1 values match the Google Play upload certificate: 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C.", body),
        Paragraph("The connected Android phone accepted vc14 as an update over vc13. Android reports versionCode 14 and versionName 1.0. The app launched, remained running, and recent crash logs showed no repeat of the setVolumeDrawerOpen error. Lecture playback itself was not exercised during this check.", body),
    ])
    doc.build(story)


if __name__ == "__main__":
    main()
