from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = "output/pdf/skillomate-android-vc9-build-comparison-2026-10-05.pdf"


def mb(size):
    return f"{size / (1024 * 1024):.2f} MB"


def short_hash(value):
    return f"{value[:12]}...{value[-12:]}"


def p(text, style):
    return Paragraph(text, style)


def main():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#30343b"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="Tight",
            parent=styles["BodyText"],
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#1f2933"),
        )
    )

    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title="Skillomate Android vc9 Build Comparison",
    )

    story = []
    story.append(p("Skillomate Android vc9 Build Comparison", styles["Title"]))
    story.append(p("Generated: 5 October 2026, Asia/Kolkata", styles["Small"]))
    story.append(Spacer(1, 12))

    story.append(p("Summary", styles["Heading2"]))
    story.append(
        p(
            "A new Android local release build was generated for Skillomate versionName 1.0 with versionCode 9. "
            "The code/config change is limited to the Android version code bump from vc8 to vc9 in both Expo config and native Gradle config. "
            "The local build completed successfully, and final debug-signed artifacts were produced for device installation/testing. "
            "The previous vc8 production artifacts were signed with a non-debug certificate that is not available in this workspace, so the vc9 APK/AAB provided here are not Play-update replacements for vc8.",
            styles["Tight"],
        )
    )
    story.append(Spacer(1, 10))

    story.append(p("Artifacts", styles["Heading2"]))
    data = [
        ["Artifact", "Version", "Signing", "Size", "SHA-256"],
        [
            "Skillomate-1.0-vc8-production.aab",
            "1.0 / vc8",
            "Production/self-signed upload cert",
            mb(47398681),
            short_hash("79ab8378c24c24cd94ea21efd02c69de05c502056b2747bac281de5f5159630e"),
        ],
        [
            "Skillomate-1.0-vc8-production.apk",
            "1.0 / vc8",
            "Production cert",
            mb(42727755),
            short_hash("fcd6a0464068cb40a9924cf8ee1aa45f307e65c9ad8cb3f737b7758b065540af"),
        ],
        [
            "Skillomate-1.0-vc9-debugsigned.aab",
            "1.0 / vc9",
            "Android debug key",
            mb(47445615),
            short_hash("ab8e8cf0454cb81c49d8bbb2df09ec95dfb4c369094686d65c29905582713d18"),
        ],
        [
            "Skillomate-1.0-vc9-debugsigned.apk",
            "1.0 / vc9",
            "Android debug key",
            mb(42809675),
            short_hash("c315c1fa15e14c333d4e02f1082f418926ac73810c6269b39130b2ae57cc2447"),
        ],
        [
            "Skillomate-1.0-vc9-local-unsigned.aab",
            "1.0 / vc9",
            "Unsigned local Gradle output",
            mb(47293508),
            short_hash("0bc235168bdcdefbc06f3bfa489379b4ad06729443fa187100e10eb1dccaae92"),
        ],
        [
            "Skillomate-1.0-vc9-release-unsigned.apk",
            "1.0 / vc9",
            "Unsigned local Gradle output",
            mb(42676592),
            short_hash("5b792fcbcec4145c1e972ae8042be4466e259a4d3a3fe6d271d5e2b5b56ff115"),
        ],
    ]
    table = Table(data, colWidths=[1.65 * inch, 0.68 * inch, 1.4 * inch, 0.65 * inch, 1.85 * inch], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2933")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d0d8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 6.7),
                ("LEADING", (0, 0), (-1, -1), 7.8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 12))

    story.append(p("Code And Configuration Changes", styles["Heading2"]))
    changes = [
        ["File", "Previous", "New"],
        ["appcopyai/app.json", "expo.android.versionCode: 8", "expo.android.versionCode: 9"],
        ["appcopyai/android/app/build.gradle", "defaultConfig versionCode 8", "defaultConfig versionCode 9"],
    ]
    change_table = Table(changes, colWidths=[2.2 * inch, 2.0 * inch, 2.0 * inch], repeatRows=1)
    change_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d0d8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(change_table)
    story.append(Spacer(1, 12))

    story.append(p("Build And Verification", styles["Heading2"]))
    checks = [
        "Ran Gradle local release build: ./gradlew bundleRelease assembleRelease with JDK 17 and Android SDK configured.",
        "Gradle build completed successfully in 59 seconds.",
        "APK package metadata verified with aapt: package com.skillomate.app, versionName 1.0, versionCode 9, minSdk 24, targetSdk 36.",
        "APK signature verified with apksigner. The delivered installable APK is debug-signed, with SHA-256 certificate fingerprint fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c.",
        "AAB signature verified with jarsigner for the debug-signed AAB; expected self-signed debug certificate warnings were present.",
        "The attempted production keystore path in credentials.json did not unlock the visible keystore.jks. EAS local build was not run because it would contact Expo and use remote signing credentials without explicit approval.",
    ]
    for item in checks:
        story.append(p(f"- {item}", styles["Tight"]))
    story.append(Spacer(1, 10))

    story.append(p("Release Notes", styles["Heading2"]))
    notes = [
        "Feature changes: none intentionally introduced in this build.",
        "Bug fixes: none intentionally introduced in this build.",
        "Build/config changes: Android versionCode advanced from 8 to 9 while keeping versionName at 1.0.",
        "Production caveat: to create a Play-ready vc9 AAB/APK that updates vc8 installations, rebuild/sign using the same upload/release key that signed vc8 or explicitly approve an EAS build that can access the remote credentials.",
    ]
    for item in notes:
        story.append(p(f"- {item}", styles["Tight"]))

    story.append(Spacer(1, 8))
    story.append(p("Full Hash Reference", styles["Heading2"]))
    full_hashes = [
        "vc9 debugsigned AAB: ab8e8cf0454cb81c49d8bbb2df09ec95dfb4c369094686d65c29905582713d18",
        "vc9 debugsigned APK: c315c1fa15e14c333d4e02f1082f418926ac73810c6269b39130b2ae57cc2447",
        "vc9 unsigned AAB: 0bc235168bdcdefbc06f3bfa489379b4ad06729443fa187100e10eb1dccaae92",
        "vc9 unsigned APK: 5b792fcbcec4145c1e972ae8042be4466e259a4d3a3fe6d271d5e2b5b56ff115",
    ]
    for item in full_hashes:
        story.append(p(f"- {item}", styles["Small"]))

    doc.build(story)


if __name__ == "__main__":
    main()
