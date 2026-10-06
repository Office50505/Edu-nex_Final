from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc21-edge-2x-gesture-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc21 Edge 2x Gesture Comparison",
    )

    rows = [
        ["Area", "Previous: vc20", "New: vc21"],
        ["Version", "1.0 (versionCode 20)", "1.0 (versionCode 21)"],
        ["2x edge gesture", "Edge hold zones did not own responder movement", "Left and right edge hold zones capture start and move events"],
        ["Finger movement", "A moved finger could be seen by parent pan/scroll handlers", "Movement is consumed by the edge zone so content should remain stable"],
        ["Active 2x hold", "Movement beyond the cancel threshold ended active 2x", "After 2x activates, it remains active until release"],
        ["Accidental swipes", "Pending hold cancelled after movement threshold", "Pending hold still cancels before activation after movement threshold"],
        ["Build outputs", "vc20 APK and AAB", "vc21 APK and AAB"],
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
        Paragraph("Skillomate Android vc21 Edge 2x Gesture Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc20 | New: vc21", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "vc21 fixes the Android video edge-hold gesture so a user can hold the screen edge for 2x playback without the screen content panning or dragging with finger movement.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/App.js: left and right video tap zones now claim start and move responder ownership and reject responder termination while active.", body),
        Paragraph("appcopyai/App.js: cancelPendingHoldSpeed still cancels a pending hold before 2x activation when the finger moves beyond the threshold, but no longer ends an already-active 2x hold due to movement.", body),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode advanced from 20 to 21.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc21-edge-2x-gesture.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc21-edge-2x-gesture.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("ADB uninstalled the previous package, installed vc21, and launched com.skillomate.app/.MainActivity on emulator-5554.", body),
        Paragraph("ADB package inspection verified com.skillomate.app versionName 1.0 and versionCode 21.", body),
        Paragraph("A screenshot confirmed the freshly installed app opened on the emulator. Because the requested uninstall clears app data, the app returned to the login screen, so the in-video 2x gesture retest requires logging in again.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
