from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc23-report-keyboard-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc23 Report Keyboard Comparison",
    )

    rows = [
        ["Area", "Previous: vc22", "New: vc23"],
        ["Version", "1.0 (versionCode 22)", "1.0 (versionCode 23)"],
        ["Report dialog keyboard", "Android keyboard avoidance was disabled", "Android uses KeyboardAvoidingView height behavior"],
        ["Dialog sizing", "Bottom sheet used a static percent max height", "Bottom sheet uses device-height aware max height and can shrink"],
        ["Form scroll", "Scroll content had no extra keyboard-safe action padding", "Scroll area has bottom padding so actions remain reachable"],
        ["Input behavior", "Focused text area could be hidden by the keyboard", "Focused text area can scroll above the keyboard"],
        ["Build outputs", "vc22 APK and AAB", "vc23 APK and AAB"],
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
        Paragraph("Skillomate Android vc23 Report Keyboard Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc22 | New: vc23", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "vc23 fixes the Report a problem dialog layout so the Android keyboard resizes the modal area and the focused report input and actions remain reachable by scrolling.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/App.js: ProblemReportModal now uses Android KeyboardAvoidingView height behavior with an Android keyboard vertical offset.", body),
        Paragraph("appcopyai/App.js: the report sheet now calculates max height from the current window height and can flex-shrink as the keyboard appears.", body),
        Paragraph("appcopyai/App.js: the report form ScrollView now has explicit scroll styling, interactive keyboard dismissal, and Android bottom padding for the action row.", body),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode advanced from 22 to 23.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc23-report-keyboard.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc23-report-keyboard.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("ADB installed vc23 over the emulator package and launched com.skillomate.app/.MainActivity.", body),
        Paragraph("ADB package inspection verified com.skillomate.app versionName 1.0 and versionCode 23.", body),
        Paragraph("The emulator remains logged out because an earlier requested uninstall cleared app data, so the in-app Report a problem keyboard retest requires logging in again.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
