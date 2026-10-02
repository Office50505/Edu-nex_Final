from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "marketing-inline-phonepe-flow-comparison.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleGold", parent=styles["Title"], textColor=colors.HexColor("#D09327"), fontSize=24, leading=29, spaceAfter=12))
styles.add(ParagraphStyle(name="H2Gold", parent=styles["Heading2"], textColor=colors.HexColor("#B97817"), fontSize=15, leading=19, spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name="BodySoft", parent=styles["BodyText"], textColor=colors.HexColor("#2C3440"), fontSize=9.5, leading=14, spaceAfter=6))
styles.add(ParagraphStyle(name="SmallSoft", parent=styles["BodyText"], textColor=colors.HexColor("#5E6672"), fontSize=8, leading=11))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9DDE3"))
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#69717D"))
    canvas.drawString(18 * mm, 9 * mm, "Skillomate - Marketing checkout build comparison")
    canvas.drawRightString(192 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=20*mm)
story = [
    Paragraph("Marketing Rs 299 PhonePe Flow", styles["TitleGold"]),
    Paragraph("Previous build vs inline account-first checkout build", styles["Heading3"]),
    Spacer(1, 5*mm),
    Paragraph("Executive summary", styles["H2Gold"]),
    Paragraph("The previous build sent marketing CTAs to a separate checkout route and handed successful payments to the main site's signup screen. The new build keeps account setup inside the marketing homepage, opens PhonePe only after phone verification and secure profile storage, then creates and signs in the account automatically after payment confirmation.", styles["BodySoft"]),
]

comparison = [
    ["Area", "Previous build", "New build"],
    ["CTA behavior", "Navigated to /marketing-web/checkout/", "Opens one inline modal on the current marketing page"],
    ["Account sequence", "Phone OTP before payment; profile completed later", "Name, phone, password, age and gender collected before PhonePe"],
    ["Credential handling", "No complete pre-payment profile", "Password is bcrypt-hashed server-side; plaintext is not persisted"],
    ["Payment", "PhonePe one-time Rs 299", "PhonePe one-time Rs 299, unchanged"],
    ["Successful return", "Redirected to the main signup flow", "Confirms payment, creates account, stores auth, opens main app"],
    ["Standalone page", "Exported checkout route", "Removed from the marketing export"],
]
table = Table(comparison, colWidths=[31*mm, 68*mm, 75*mm], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#11151C")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8),
    ("LEADING", (0,0), (-1,-1), 11),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("GRID", (0,0), (-1,-1), .4, colors.HexColor("#CDD2D9")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F5F6F8")]),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
    ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story += [table, Spacer(1, 5*mm), Paragraph("Notable code and configuration changes", styles["H2Gold"])]
for text in [
    "Added MarketingCheckoutFlow.tsx and a scoped responsive CSS module; mounted once from the marketing homepage.",
    "Changed all marketing CTA destinations to #checkout and removed the standalone checkout route from the static export.",
    "Added onboarding/profile to store a validated pending profile with a bcrypt password hash.",
    "Added onboarding/complete to require active paid access before creating the reserved user and authenticated session.",
    "Extended OnboardingSession with a pendingProfile that is deleted immediately after successful account completion.",
]:
    story.append(Paragraph("• " + text, styles["BodySoft"]))

story += [PageBreak(), Paragraph("Rendered UI", styles["TitleGold"]), Paragraph("Desktop account setup", styles["H2Gold"])]
desktop = Path("/private/tmp/inline-desktop-account.png")
mobile = Path("/private/tmp/inline-mobile-account.png")
if desktop.exists():
    img = Image(str(desktop), width=174*mm, height=108.75*mm)
    story += [img, Spacer(1, 4*mm)]
story += [PageBreak(), Paragraph("Mobile account setup", styles["H2Gold"])]
if mobile.exists():
    img = Image(str(mobile), width=76*mm, height=164.7*mm)
    story.append(img)

story += [PageBreak(), Paragraph("Verification", styles["TitleGold"])]
checks = [
    ["Check", "Result", "Evidence"],
    ["Marketing production build", "PASS", "Next.js static export completed; checkout route absent"],
    ["Combined frontend build", "PASS", "Vite app and embedded marketing-web build completed"],
    ["Backend tests", "PASS", "16/16 onboarding and PhonePe one-time tests"],
    ["Live config", "PASS", "gateway=phonepe, checkoutEnabled=true, amount=29900 paise, access=30 days"],
    ["Desktop interaction", "PASS", "CTA -> details -> OTP -> profile -> one_time PhonePe request"],
    ["Mobile rendering", "PASS", "393 x 852 modal is aligned, legible and scrollable"],
    ["Payment return", "PASS", "Confirmed state stores auth token and opens /"],
    ["Console health", "PASS", "No browser console or page errors in tested flows"],
]
verify = Table(checks, colWidths=[47*mm, 20*mm, 107*mm], repeatRows=1)
verify.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#11151C")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (1,1), (1,-1), "Helvetica-Bold"),
    ("TEXTCOLOR", (1,1), (1,-1), colors.HexColor("#16794A")),
    ("FONTSIZE", (0,0), (-1,-1), 8.3),
    ("LEADING", (0,0), (-1,-1), 11),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("GRID", (0,0), (-1,-1), .4, colors.HexColor("#CDD2D9")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F5F6F8")]),
    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
]))
story += [verify, Spacer(1, 6*mm), Paragraph("Remaining production check", styles["H2Gold"]), Paragraph("No real charge was submitted during QA. The final external dependency is a live Rs 299 transaction through the configured PhonePe merchant account and its webhook callback. The hosted handoff, payload shape, local return, payment polling, entitlement gate and automatic login behavior were verified without charging a payment method.", styles["BodySoft"])]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
