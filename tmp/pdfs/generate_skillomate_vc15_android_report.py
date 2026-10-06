from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc15-build-comparison-2026-10-05.pdf"


def main():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontSize=12, leading=15, spaceBefore=9, spaceAfter=4))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=11))
    styles.add(ParagraphStyle(name="TableHeader", parent=styles["Small"], textColor=colors.white))
    body = styles["BodyText"]

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Skillomate Android vc15 Build Comparison",
    )

    rows = [
        ["Area", "Previous build: vc14", "New build: vc15"],
        ["Version", "1.0 (14)", "1.0 (15)"],
        ["Lecture player", "Download action shown", "Download action removed"],
        ["Course lecture list", "Download action shown", "Download action removed"],
        ["Saved lessons", "Indicators and playback available", "Indicators and playback retained"],
        ["Signing", "Play upload key", "Play upload key"],
    ]
    table = Table(
        [[Paragraph(str(value), styles["TableHeader"] if index == 0 else styles["Small"]) for value in row] for index, row in enumerate(rows)],
        colWidths=[40 * mm, 64 * mm, 66 * mm],
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
        Paragraph("Skillomate Android vc15 Build Comparison", styles["Title"]),
        Paragraph("5 October 2026 | Previous: vc14 | New: vc15", styles["Small"]),
        Spacer(1, 8),
        Paragraph("Summary", styles["Section"]),
        Paragraph("This build removes the nonworking lecture download action from the video player and course lecture rows. Existing saved-lesson playback and status indicators remain available.", body),
        Spacer(1, 8),
        table,
        Paragraph("Code And Feature Changes", styles["Section"]),
        Paragraph("App.js: removed the player rail download button, course lecture row download buttons, and their unused handlers and props. The course rows now use a navigation chevron. No new features were added. The vc14 lecture crash fix remains in vc15.", body),
        Paragraph("Configuration And Build", styles["Section"]),
        Paragraph("app.json and android/app/build.gradle: Android versionCode changed from 14 to 15. The version name stays 1.0. Gradle produced the release AAB and arm64 APK with the existing Play upload key.", body),
        Paragraph("AAB: appcopyai/releases/android/Skillomate-1.0-vc15-production.aab", styles["Small"]),
        Paragraph("APK: appcopyai/releases/android/Skillomate-1.0-vc15-production.apk", styles["Small"]),
        Paragraph("Testing And Verification", styles["Section"]),
        Paragraph("App.js parsed successfully with Babel. git diff --check passed. Gradle :app:clean :app:bundleRelease :app:assembleRelease completed successfully.", body),
        Paragraph("aapt verified com.skillomate.app, versionName 1.0 and versionCode 15. apksigner verified the APK; keytool verified the AAB. Both signer SHA1 values match the Play upload certificate: 56:99:2E:CB:07:3A:28:3C:9D:34:12:8E:EE:C4:BD:A5:C1:6F:E4:5C.", body),
        Paragraph("No on-device lecture UI retest was performed for vc15.", body),
    ]
    doc.build(story)


if __name__ == "__main__":
    main()
