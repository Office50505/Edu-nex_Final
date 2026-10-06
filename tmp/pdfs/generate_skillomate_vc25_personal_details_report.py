from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-android-vc25-personal-details-comparison-2026-10-06.pdf"


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
        title="Skillomate Android vc25 Build Comparison",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#17130B"), spaceAfter=6)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#2B2419"), spaceBefore=9, spaceAfter=5)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=12.4, textColor=colors.HexColor("#2F2A22"))
    small = ParagraphStyle("Small", parent=body, fontSize=8.3, leading=11, textColor=colors.HexColor("#5F574D"))

    story = [
        Paragraph("Skillomate Android Build Comparison", title),
        para("Previous build: vc24 course search suggestions. New build: vc25 editable personal details. Date: 2026-10-06.", small),
        Spacer(1, 5 * mm),
    ]

    rows = [
        ["Area", "vc24 behavior", "vc25 behavior"],
        [
            "Personal details editing",
            "Profile Account Info rows were read-only. Name editing was available only inside the avatar picker flow.",
            "Account Info now has an Edit action that opens a dedicated Personal Details sheet for supported fields.",
        ],
        [
            "Editable fields",
            "Displayed profile data did not expose an obvious update path for all supported personal details.",
            "Users can edit full name, email, gender, and age. Phone remains read-only because it is used as the login identifier.",
        ],
        [
            "Validation and save",
            "No dedicated save flow for personal details from Account Info.",
            "The save flow validates name length, email format, and age range, then persists through PATCH /api/auth/me.",
        ],
        [
            "Persistence",
            "Edited data could be unclear because Account Info did not refresh from a dedicated details editor.",
            "The returned persisted user is merged into the local session, so leaving and reopening Profile displays saved values.",
        ],
        [
            "Build configuration",
            "Android versionCode 24.",
            "Android versionCode 25 in app.json and android/app/build.gradle.",
        ],
    ]
    table = Table([[para(cell, body if row else small) for cell in line] for row, line in enumerate(rows)], colWidths=[34 * mm, 70 * mm, 70 * mm], repeatRows=1)
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
        para("Added ProfileScreen state and handlers for a Personal Details editor. The editor initializes from the latest user object when opened.", body),
        para("Added validation for full name, optional email, gender selection, and age. Successful saves call PATCH /api/auth/me and merge the returned user into the active session.", body),
        para("Updated Account Info to show email, gender, and age consistently, with an Edit control and read-only phone explanation.", body),
        para("Added modal, sheet, form, and action styles for the new editor.", body),
        Paragraph("Verification", h2),
        para("Ran git diff --check with no whitespace errors.", body),
        para("Built Android release APK and AAB with Gradle tasks :app:bundleRelease and :app:assembleRelease. Build completed successfully.", body),
        para("Installed Skillomate-1.0-vc25-edit-personal-details.apk on emulator-5554. adb reported versionCode=25 and the resumed activity as com.skillomate.app/.MainActivity.", body),
        para("Authenticated in-app edit/save retest is pending because the emulator app data was previously cleared and the app is logged out.", body),
        Paragraph("Artifacts", h2),
        para("APK: appcopyai/releases/android/Skillomate-1.0-vc25-edit-personal-details.apk", small),
        para("AAB: appcopyai/releases/android/Skillomate-1.0-vc25-edit-personal-details.aab", small),
    ])
    doc.build(story)


if __name__ == "__main__":
    main()
