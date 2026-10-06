from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc22-center-tap-controls-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc22 Center Tap Controls Comparison",
    )

    rows = [
        ["Area", "Previous: vc21", "New: vc22"],
        ["Version", "1.0 (versionCode 21)", "1.0 (versionCode 22)"],
        ["Center tap", "Always revealed controls and toggled play/pause", "Shows hidden controls or hides visible controls"],
        ["Second tap while playing", "Paused the video", "Hides playback controls and keeps playback running"],
        ["Play/pause action", "Shared with blank center surface tap", "Remains available through the dedicated play/pause button"],
        ["Accessibility", "Center surface label implied play/pause", "Center surface label now describes hiding controls"],
        ["Build outputs", "vc21 APK and AAB", "vc22 APK and AAB"],
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
        Paragraph("Skillomate Android vc22 Center Tap Controls Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc21 | New: vc22", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "vc22 fixes the video surface tap behavior so a second tap on the playback area hides visible controls without pausing the playing video.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/App.js: handleCenterTap now closes settings when open, hides visible auto-hide controls when tapped, and otherwise reveals the controls.", body),
        Paragraph("appcopyai/App.js: removed the center-surface call to togglePlay so blank-area taps no longer change playback state.", body),
        Paragraph("appcopyai/App.js: updated the center tap accessibility label to Hide playback controls when controls are visible.", body),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode advanced from 21 to 22.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc22-center-tap-hide-controls.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc22-center-tap-hide-controls.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("ADB installed vc22 over the emulator package and launched com.skillomate.app/.MainActivity.", body),
        Paragraph("ADB package inspection verified com.skillomate.app versionName 1.0 and versionCode 22.", body),
        Paragraph("The emulator remains logged out because the previous requested uninstall cleared app data, so the in-video tap retest requires logging in again.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
