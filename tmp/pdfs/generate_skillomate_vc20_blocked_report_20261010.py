from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    PageBreak,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "Skillomate-VC20-Android-AAB-Blocked-Report-2026-10-10.pdf"


def p(text, style):
    return Paragraph(text, style)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="TitleCustom",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        spaceAfter=12,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="H2Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor("#1f2937"),
    ))
    styles.add(ParagraphStyle(
        name="BodyCustom",
        parent=styles["BodyText"],
        fontSize=9.3,
        leading=12.2,
        textColor=colors.HexColor("#111827"),
    ))
    styles.add(ParagraphStyle(
        name="SmallCustom",
        parent=styles["BodyText"],
        fontSize=8.2,
        leading=10.5,
        textColor=colors.HexColor("#374151"),
    ))

    body = styles["BodyCustom"]
    small = styles["SmallCustom"]
    story = []
    story.append(p("Skillomate VC20 Android AAB Build and Billing Validation Report", styles["TitleCustom"]))
    story.append(p("Date: 2026-10-10. Verdict: BLOCKED - no signed AAB was produced locally.", body))
    story.append(Spacer(1, 8))

    summary = [
        ["Area", "Result"],
        ["Git revision", "a61cc4aee98f98338a23c47689a85f3b0c9e3662 on main"],
        ["Requested artifact", "Skillomate-VC20-GooglePlay-Intro9rs-3days.aab"],
        ["Previous Android artifact located", "appcopyai/releases/android/Skillomate-1.0-vc19-intro-9rs-production.aab"],
        ["New artifact", "Not generated"],
        ["Primary blockers", "No discoverable Java runtime; release signing credentials unavailable locally"],
        ["Package and version", "com.skillomate.app, versionCode 20, versionName 1.0 configured in source"],
    ]
    table = Table(summary, colWidths=[1.9 * inch, 4.6 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.3),
        ("LEADING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)

    story.append(p("Pre-build Audit", styles["H2Custom"]))
    story.append(p("Working tree had pre-existing uncommitted user changes in App.js, app.json, Android launcher resources, color resources, adaptive icon, and iOS Info.plist. Those changes were preserved. The Android applicationId/package remains com.skillomate.app. Production API configuration remains https://api.skillomate.in in release EAS profiles and non-dev runtime fallback.", body))
    story.append(p("Release signing config is guarded in android/app/build.gradle and refuses release packaging unless SKILLOMATE_RELEASE_* variables, android.injected signing properties, or android/keystore.properties are present. None were visible locally. A checked-in keystore file exists at appcopyai/credentials/android/keystore.jks, but no authorized alias/password configuration was available.", body))

    story.append(p("Google Play Billing Validation", styles["H2Custom"]))
    story.append(p("Source uses product ID skillomate_premium_monthly, basePlanId monthly, offerId intro-9rs-3days, a paid non-recurring P3D introductory phase, and an infinite P1M recurring phase. Purchase flow re-fetches product terms before checkout and compares term keys so a displayed intro offer cannot silently switch to the base price before requestPurchase.", body))
    story.append(p("Added a non-sensitive diagnostic helper for Internal Testing. It captures product ID, configured offer ID, returned offer count, basePlanId, offerId, introductory phase period and formatted price, billingCycleCount, recurrenceMode, offerTokenPresent, selected offer IDs, and rejection reason. It does not log offer tokens, purchase tokens, account IDs, user IDs, emails, phone numbers, auth headers, or credentials.", body))

    story.append(p("INR 499 Fallback Investigation", styles["H2Custom"]))
    story.append(p("No source defect was confirmed in the current offer normalization for the confirmed intro-9rs-3days / P3D / P1M offer. A confirmed release hazard was found: appcopyai/android/app/src/main/assets/index.android.bundle is stale and still contains new-subscriber-1rs-24h / old 1-day logic. Any valid VC20 release must regenerate and package a fresh bundle, then inspect the actual AAB. That inspection could not be completed because the local build was blocked.", body))

    story.append(PageBreak())
    story.append(p("Tests and Build Attempt", styles["H2Custom"]))
    tests = [
        ["Check", "Result"],
        ["node appcopyai/tests/googlePlaySubscriptionOffers.test.js", "Passed"],
        ["node --check appcopyai/services/subscriptions.js", "Passed"],
        ["node --check appcopyai/services/useGooglePlaySubscriptions.js", "Passed"],
        ["node --check appcopyai/App.js", "Passed"],
        ["./gradlew :app:bundleRelease with production API env", "Failed before Gradle execution: no Java runtime"],
    ]
    tests_wrapped = [[p(cell, small) for cell in row] for row in tests]
    t2 = Table(tests_wrapped, colWidths=[3.5 * inch, 3.0 * inch])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5e7eb")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 9.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t2)

    story.append(p("Required Next Steps", styles["H2Custom"]))
    story.append(p("Install or expose a supported JDK, provide the existing Google Play upload signing credentials through the established SKILLOMATE_RELEASE_* or injected Gradle signing path, then rerun the clean release AAB build. After a successful build, inspect the AAB for package name, versionCode 20, versionName 1.0, upload signing certificate, SHA-256, production API, and fresh packaged JS containing intro-9rs-3days / P3D / P1M and not new-subscriber-1rs-24h.", body))

    story.append(p("Files Changed by This Attempt", styles["H2Custom"]))
    story.append(p("appcopyai/app.json and appcopyai/android/app/build.gradle were updated to versionCode 20. appcopyai/services/subscriptions.js and appcopyai/services/useGooglePlaySubscriptions.js received safe diagnostic support. appcopyai/tests/googlePlaySubscriptionOffers.test.js was added for focused Google Play offer regression coverage.", small))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=0.55 * inch, leftMargin=0.55 * inch, topMargin=0.55 * inch, bottomMargin=0.55 * inch)
    doc.build(story)


if __name__ == "__main__":
    build()
    print(OUT)
