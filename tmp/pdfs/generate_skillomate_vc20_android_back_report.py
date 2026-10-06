from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc20-back-button-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc20 Back Button Comparison",
    )

    rows = [
        ["Area", "Previous: vc19", "New: vc20"],
        ["Version", "1.0 (versionCode 19)", "1.0 (versionCode 20)"],
        ["Android Back", "Could restore prior routes or allow confusing inner-screen behavior", "Inner logged-in screens reset to Home and consume Back"],
        ["Route history", "Used before Home fallback", "Cleared when Back returns Home"],
        ["Inner state", "Selected course/player state could remain active", "Course, player, preview, AI, modal state is cleared"],
        ["Retest", "Not verified for this behavior", "Non-home tab -> Back once -> Home remains active"],
        ["Build outputs", "vc19 APK and AAB", "vc20 APK and AAB"],
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
        Paragraph("Skillomate Android vc20 Back Button Comparison", styles["Title"]),
        Paragraph("6 October 2026 | Previous: vc19 | New: vc20", small),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph(
            "vc20 changes Android hardware Back behavior so a logged-in user pressing Back from an inner screen returns to Home instead of exiting or walking route history.",
            body,
        ),
        Spacer(1, 8),
        table,
        Paragraph("Code Changes", styles["Section"]),
        Paragraph("appcopyai/App.js: added resetToHomeFromBack to clear inner app state, route history, selected course, player index, preview state, AI target, and upgrade modal before setting mainScreen to home.", body),
        Paragraph("appcopyai/App.js: handleAppBack now closes overlays first, then sends any non-home logged-in state directly to Home and returns true so Android does not terminate the activity.", body),
        Paragraph("appcopyai/app.json and appcopyai/android/app/build.gradle: Android versionCode advanced from 19 to 20.", body),
        Paragraph("Build Outputs", styles["Section"]),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc20-android-back-home.aab", small),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc20-android-back-home.apk", small),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("node --check passed for appcopyai/App.js.", body),
        Paragraph("Gradle :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("aapt verified package com.skillomate.app, versionName 1.0, versionCode 20, minSdk 24, targetSdk 36.", body),
        Paragraph("ADB installed vc20, opened the app, tapped a non-home tab, sent KEYCODE_BACK once, and verified com.skillomate.app/.MainActivity stayed foregrounded.", body),
        Paragraph("A post-Back screenshot showed the Home tab active and Home content visible.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
