from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "skillomate-ios-app-store-readiness-build-comparison-2026-09-25.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5F6B7A")
NAVY = colors.HexColor("#18213A")
GOLD = colors.HexColor("#D6A74C")
PALE_GOLD = colors.HexColor("#F7EEDB")
PALE_BLUE = colors.HexColor("#EAF0F8")
PALE_GREEN = colors.HexColor("#E8F4EC")
GREEN = colors.HexColor("#217A4A")
RED = colors.HexColor("#A53B3B")
PALE_RED = colors.HexColor("#F8EAEA")
LINE = colors.HexColor("#D8DEE8")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=28, leading=32, textColor=WHITE, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica",
    fontSize=12, leading=17, textColor=colors.HexColor("#DCE4F3"), spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=20, leading=24, textColor=NAVY, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=12, leading=15, textColor=NAVY, spaceBefore=6, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Bodyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=9.3, leading=13.2, textColor=INK, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Smallx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.7, leading=10.3, textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Tinyx", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=6.8, leading=8.5, textColor=INK,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=10.5, leading=14.5, textColor=NAVY,
))
styles.add(ParagraphStyle(
    name="SectionTag", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=7.5, leading=9, textColor=GOLD, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=7.6, leading=9.5, textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableBody", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.4, leading=9.7, textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableBodyBold", parent=styles["TableBody"], fontName="Helvetica-Bold",
))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"<font color='#D6A74C'>+</font>&nbsp;&nbsp;{text}", styles["Bodyx"])


def status_box(label, headline, body, fill=PALE_GREEN, accent=GREEN):
    data = [[P(label.upper(), "SectionTag")], [P(headline, "Callout")], [P(body, "Smallx")]]
    table = Table(data, colWidths=[174 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
    ]))
    return table


def comparison_table(rows, widths=(33, 62, 69)):
    data = [[P("Area", "TableHead"), P("Audited baseline", "TableHead"), P("Current release candidate", "TableHead")]]
    for area, before, after in rows:
        data.append([P(area, "TableBodyBold"), P(before, "TableBody"), P(after, "TableBody")])
    table = Table(data, colWidths=[w * mm for w in widths], repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row in range(1, len(data)):
        style.append(("BACKGROUND", (0, row), (-1, row), WHITE if row % 2 else colors.HexColor("#F7F9FC")))
    table.setStyle(TableStyle(style))
    return table


def evidence_table(rows):
    data = [[P("Check", "TableHead"), P("Result", "TableHead"), P("Evidence", "TableHead")]]
    for check, result, evidence in rows:
        result_color = GREEN if result == "PASS" else RED
        data.append([
            P(check, "TableBodyBold"),
            Paragraph(f"<font color='{result_color.hexval()}'><b>{result}</b></font>", styles["TableBody"]),
            P(evidence, "TableBody"),
        ])
    table = Table(data, colWidths=[48 * mm, 22 * mm, 94 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 13 * mm, PAGE_W, 13 * mm, stroke=0, fill=1)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(WHITE)
    canvas.drawString(18 * mm, PAGE_H - 8.2 * mm, "SKILLOMATE - iOS APP STORE READINESS")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Audited baseline vs current release candidate - 25 September 2026")
    canvas.drawRightString(PAGE_W - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=20 * mm, bottomMargin=18 * mm,
    title="Skillomate iOS App Store Readiness Build Comparison",
    author="Skillomate engineering verification",
    subject="Comparison of audited baseline and App Store remediation candidate",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])

story = []

# Cover
cover = Table([
    [P("RELEASE ENGINEERING REPORT", "SectionTag")],
    [P("iOS App Store readiness<br/>build comparison", "CoverTitle")],
    [P("Audited baseline vs current release candidate", "CoverSub")],
    [Spacer(1, 4 * mm)],
    [P("Skillomate  |  iPhone  |  Bundle com.alihussainkhan.edunexfinal", "CoverSub")],
    [P("Verified 25 September 2026  |  Asia/Kolkata", "CoverSub")],
], colWidths=[174 * mm], rowHeights=[10 * mm, 33 * mm, 12 * mm, 6 * mm, 9 * mm, 9 * mm])
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), NAVY),
    ("BOX", (0, 0), (-1, -1), 1, NAVY),
    ("LEFTPADDING", (0, 0), (-1, -1), 16),
    ("RIGHTPADDING", (0, 0), (-1, -1), 16),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.extend([Spacer(1, 18 * mm), cover, Spacer(1, 10 * mm)])
story.append(status_box(
    "Engineering disposition",
    "READY for the next signed TestFlight build",
    "Code-level blockers are remediated and automated/native verification is green. App Review submission remains gated on App Store Connect setup, a real-device Sandbox IAP pass, screenshots, and owner/legal confirmations.",
))
story.extend([Spacer(1, 7 * mm), P("Comparison basis", "H2x")])
story.append(P(
    "The baseline is the repository state described by the mandatory App Store audit: iOS web purchase steering, no working StoreKit subscription path, permissive entitlement checks, missing AI consent, fragile deletion, inconsistent age rules, plaintext mobile credentials, local-only profile photos, and incomplete submission evidence. The current candidate is the verified working tree after remediation. No new build has been uploaded; build number 14 must be incremented for the next upload.",
))
story.append(PageBreak())

# Executive comparison
story.extend([P("01", "SectionTag"), P("Executive comparison", "H1x")])
story.append(comparison_table([
    ("iOS purchase", "Website/Razorpay steering; no valid StoreKit subscription flow.", "Native StoreKit subscription, localized Apple price, restore, retry, cancellation, and status refresh."),
    ("Verification", "No complete Apple server-verification architecture.", "Apple signed transaction/certificate validation, Server API refresh, V2 notifications, idempotency, ownership binding."),
    ("Entitlement", "Broad status logic could treat non-none states as active.", "Explicit fail-closed state machine; server time and verified expiry drive access."),
    ("AI privacy", "Third-party AI could receive data without dedicated consent.", "Versioned Allow/Not Now consent before transmission; backend enforcement; withdrawal and deletion controls."),
    ("Account deletion", "Legacy billing cancellation failure could block deletion.", "Sessions revoked first; deletion proceeds; failed cancellation becomes a retry/operations job."),
    ("Age", "Rules allowed ages below 13 and could default to 18.", "Intentional 13-80 input across mobile/web/backend; under-age audit strategy; no fabricated age."),
    ("Credentials", "Sensitive mobile session material persisted in AsyncStorage.", "Keychain-backed SecureStore migration with verified write and plaintext removal."),
    ("Profile photos", "Backend could retain a device-local file URI.", "System picker, compression, byte validation, durable S3/CDN URL, replacement/deletion."),
    ("Release shell", "Native entry point lagged installed Expo/RN versions.", "Expo 57 Swift AppDelegate bootstrap and current Podfile defaults; Release device build passes."),
]))
story.extend([Spacer(1, 5 * mm), status_box(
    "Scope note",
    "No compliance feature was faked or unlocked client-side",
    "The release bundle no longer imports QA fixtures. StoreKit access remains server-authoritative. Review credentials and Apple keys are not embedded in the app.",
    fill=PALE_BLUE, accent=NAVY,
)])
story.append(PageBreak())

# StoreKit
story.extend([P("02", "SectionTag"), P("StoreKit and entitlement remediation", "H1x")])
story.append(P("Purchase path", "H2x"))
for item in [
    "The iOS subscription screen fetches Apple's product metadata and shows the localized App Store price, billing period, benefits, auto-renewal disclosure, Terms of Use, Privacy Policy, purchase state, Restore Purchases, and Manage Apple Subscription.",
    "The app does not expose Skillomate web pricing or checkout as an iOS purchase route. A centralized URL policy blocks purchase, checkout, unknown domains, and unsafe schemes even when a URL comes from course data.",
    "Client purchase completion waits for the backend to verify Apple's signed transaction. Cancelled purchases remain neutral; network/verification failures retain retry state and do not grant access.",
]: story.append(bullet(item))
story.append(P("Backend authority", "H2x"))
for item in [
    "Official Apple root certificates are bundled. Production and Sandbox signed transaction paths validate bundle ID, product ID, environment, app-account token, dates, ownership, and certificate chain.",
    "Original transaction IDs and notification IDs are persisted uniquely. Cross-user replay is rejected. A later client replay cannot overwrite a server-recorded refund or revocation.",
    "App Store Server API status refresh and Server Notification V2 ingestion update the authoritative Apple subscription record. Restore grants access only when the verified current state is active.",
]: story.append(bullet(item))
story.append(Spacer(1, 3 * mm))
story.append(comparison_table([
    ("ACTIVE", "Unsafe broad status logic.", "Access granted through verified expiry."),
    ("CANCELS AT PERIOD END", "Could be confused with expired/cancelled.", "Access remains through verified paid expiry; no future-renewal claim."),
    ("GRACE PERIOD", "Not consistently represented.", "Access granted only when Apple reports grace and verified expiry remains valid."),
    ("BILLING RETRY", "Could accidentally remain active.", "Fails closed."),
    ("EXPIRED / REVOKED / REFUNDED", "Risk of non-none access.", "Fails closed immediately according to verified server state."),
    ("NONE / UNKNOWN", "Risk of default access.", "Fails closed."),
], widths=(38, 55, 71)))
story.append(PageBreak())

# Privacy/security
story.extend([P("03", "SectionTag"), P("Privacy, security, and user control", "H1x")])
privacy_rows = [
    ("AI consent", "No dedicated pre-transmission consent.", "Plain-language provider/data disclosure; Allow/Not Now; no request on decline; versioned backend enforcement."),
    ("AI minimization", "Learner identity could enter provider payloads.", "Profile name removed; prompt/history/context are bounded; sensitive prompt bodies are not logged."),
    ("AI controls", "Incomplete reporting and deletion controls.", "Report reasons, response hashes, consent withdrawal, idempotent history deletion, safe fallback."),
    ("Downloads", "User/session identifiers could be placed in URLs.", "Random one-time download grants, hashed at rest, short expiry, scoped resource validation."),
    ("External links", "Arbitrary backend resource URLs could open.", "HTTPS allowlist and category policy; exact support mail and Apple management URL; unsafe schemes blocked."),
    ("IP/location", "Login IP could be sent to ipwho.is.", "Third-party geolocation removed; no precise location permission."),
    ("Mobile auth", "Credentials in general-purpose storage.", "SecureStore/Keychain migration; logout and deletion clear secure credentials."),
    ("Privacy manifest", "Needed reconciliation with real profile-photo behavior.", "Optional Photos/Videos collection declared; no Device ID or tracking claim; required-reason APIs aggregate."),
]
story.append(comparison_table(privacy_rows))
story.extend([Spacer(1, 6 * mm), P("Sensitive endpoint controls", "H2x")])
story.append(P(
    "Login, OTP, password reset, Nex AI, App Store verification, account deletion, and profile-photo upload now have bounded request controls. Production refuses unsafe rate-limit disablement unless a separate explicit override is present. Raw provider errors, Apple payloads, credentials, and sensitive prompts are not returned to users.",
))
story.append(PageBreak())

# Product correctness
story.extend([P("04", "SectionTag"), P("Account and product correctness", "H1x")])
for title, text in [
    ("Deletion", "Application access and sessions are revoked first. Personal profile/learning/AI/photo data is deleted. Required transaction records are anonymized. Provider timeouts and unsupported legacy PhonePe cancellation create retry work without forcing the user to contact support before deletion."),
    ("Age", "Signup requires an intentional age from 13 through 80 in mobile, web, and backend validation. Age 12 is rejected, age 13 is accepted, and existing under-age accounts are flagged through an operator-run migration instead of being silently changed."),
    ("Profile images", "The app uses the system picker without broad library access, compresses before upload, and the backend validates type, signature, and size. Production requires shared S3/CDN storage and removes replaced/deleted objects."),
    ("Notifications", "Hard-coded unread activity and misleading recent timestamps were removed. Badge state is no longer fabricated for a fresh account."),
    ("Cross-platform", "Web billing remains Razorpay-based, Android behavior remains separate, and iOS uses StoreKit. Shared entitlement/access behavior is explicit without forcing an iOS-specific rule onto web or Android."),
    ("Release content", "The production bundle no longer imports development UI fixtures or fake fallback course titles. Missing course art uses a neutral in-app fallback instead of fabricated course data."),
]:
    story.append(P(title, "H2x"))
    story.append(P(text))
story.append(status_box(
    "Legal/content gate",
    "Rights and operator authorization still require owner evidence",
    "Repository review cannot prove licenses, model/instructor releases, App Store seller authority, or legal-policy approval. The new rights inventory marks every uncertain item for owner confirmation.",
    fill=PALE_GOLD, accent=GOLD,
))
story.append(PageBreak())

# Evidence
story.extend([P("05", "SectionTag"), P("Verification evidence", "H1x")])
story.append(evidence_table([
    ("Backend automated suite", "PASS", "354 of 354 tests; includes Apple IAP, entitlement states, deletion, age, downloads, AI, profile storage, and abuse controls."),
    ("Frontend automated suite", "PASS", "256 of 256 tests across 35 files."),
    ("Mobile compliance focus", "PASS", "8 of 8 App Store/mobile checks plus 1 of 1 sensitive rate-limit check."),
    ("Frontend production build", "PASS", "Vite production build completed. Existing HLS chunk-size advisory only."),
    ("Expo Doctor", "PASS", "20 of 20 checks."),
    ("Expo iOS export", "PASS", "47 assets and one 2.5 MB Hermes bundle."),
    ("Native Release device build", "PASS", "Unsigned arm64 Release build completed with current Expo 57 Swift bootstrap."),
    ("App metadata", "PASS", "Bundle com.alihussainkhan.edunexfinal; version 1.0; build 14; ATS arbitrary loads false; privacy manifest packaged."),
    ("Symbols", "PASS", "App executable and app dSYM UUID both 88E25A87-1D51-3DAD-9A45-57BFC52006F7."),
    ("Release string audit", "PASS", "No QA fixtures, fake courses, purchase steering, localhost, or loopback API; expected API, StoreKit product, Apple management, and support mail present."),
]))
story.extend([Spacer(1, 6 * mm), P("Build warnings", "H2x")])
story.append(P(
    "The native build reports third-party deprecation, nullability, umbrella-header, generated Nitro IAP, and script-phase notices from React Native, Expo, WebView, and dependencies. They did not produce an app compile/link failure. The frontend reports an HLS chunk above 500 KB. These are optimization/maintenance risks, not current submission blockers; recheck symbol processing on the signed archive.",
))
story.append(PageBreak())

# Manual gates and decision
story.extend([P("06", "SectionTag"), P("Manual gates and release decision", "H1x")])
story.append(status_box(
    "Decision",
    "GO for the next iOS/TestFlight build; NO-GO for App Review submission today",
    "The next signed build is appropriate for Sandbox/TestFlight validation. Submission must wait until the external gates below are evidenced.",
    fill=PALE_GOLD, accent=GOLD,
))
story.extend([Spacer(1, 6 * mm), P("App Store Connect gates", "H2x")])
for item in [
    "Create and submit com.skillomate.premium.monthly as a one-month auto-renewable subscription; configure localized metadata, pricing, territories, review screenshot, agreements, tax, and banking.",
    "Configure Production and Sandbox App Store Server Notifications V2 to https://api.skillomate.in/api/apple-iap/notifications and deploy the Apple issuer/key/private-key/app-ID secrets.",
    "Complete App Privacy and age-rating answers, public policy/support URLs, a normal review account, and rights-cleared iPhone screenshots. Increment build number above 14.",
]: story.append(bullet(item))
story.append(P("Physical iPhone gates", "H2x"))
for item in [
    "Test Sandbox buy, cancel, restore, reinstall, two-device restore, expiration, grace/billing retry, refund, revoke, network failure, and localized disclosure against the production backend.",
    "Test profile-photo persistence, account deletion with Apple billing, AI decline/allow/withdraw/delete/report, playback/downloads/progress/certificates, screen-capture protection, and link blocking.",
]: story.append(bullet(item))
story.append(P("Owner/legal gates", "H2x"))
for item in [
    "Reconcile the canonical operator (Smartcart, sole proprietorship owned by Insha Noor) with the App Store seller, EAS owner office50505, Apple team LJ48CVC23W, and bundle namespace authorization.",
    "Approve privacy/terms/refund/retention/AI/13+ language and document rights for icons, logos, avatars, robot art, live course media, instructors, thumbnails, third-party names, and screenshots.",
]: story.append(bullet(item))
story.extend([Spacer(1, 7 * mm), P("Primary handoff documents", "H2x")])
story.append(P(
    "docs/IOS_APP_STORE_FINAL_CHECKLIST.md - exact remaining gates<br/>docs/IOS_APP_STORE_SUBMISSION.md - implementation and reviewer workflow<br/>docs/APP_REVIEW_NOTES.txt - factual review notes<br/>docs/IOS_CONTENT_RIGHTS_INVENTORY.md - rights evidence inventory<br/>docs/IOS_SCREENSHOT_PLAN.md - production screenshot sequence",
))

doc.build(story)
print(OUTPUT)
