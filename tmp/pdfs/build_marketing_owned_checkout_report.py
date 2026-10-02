from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = "/Users/shekharchouhan/Documents/GitHub/Edu-nex_Final/output/pdf/marketing-owned-phonepe-checkout-comparison.pdf"
DESKTOP = "/tmp/marketing-owned-checkout-desktop.png"
MOBILE = "/tmp/marketing-owned-checkout-mobile.png"
OTP = "/tmp/marketing-owned-checkout-otp.png"

ink = colors.HexColor("#111318")
muted = colors.HexColor("#5D6470")
line = colors.HexColor("#D8DDE5")
soft = colors.HexColor("#F4F6F8")
green = colors.HexColor("#147A4B")
red = colors.HexColor("#B4382D")

s = getSampleStyleSheet()
s.add(ParagraphStyle(name="TitleX", parent=s["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=ink, spaceAfter=6))
s.add(ParagraphStyle(name="SubX", parent=s["Normal"], fontSize=10, leading=15, textColor=muted, spaceAfter=16))
s.add(ParagraphStyle(name="HeadX", parent=s["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=ink, spaceBefore=8, spaceAfter=8))
s.add(ParagraphStyle(name="BodyX", parent=s["BodyText"], fontSize=9.2, leading=13.5, textColor=ink, spaceAfter=7))
s.add(ParagraphStyle(name="CellX", parent=s["BodyText"], fontSize=8.2, leading=11.5, textColor=ink))
s.add(ParagraphStyle(name="CellHeadX", parent=s["BodyText"], fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=colors.white))
s.add(ParagraphStyle(name="PassX", parent=s["BodyText"], fontName="Helvetica-Bold", fontSize=8.2, textColor=green))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(line)
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(muted)
    canvas.drawString(18 * mm, 9 * mm, "Skillomate - Marketing-owned PhonePe checkout - 2 October 2026")
    canvas.drawRightString(192 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(OUTPUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=17 * mm, bottomMargin=20 * mm, title="Marketing-owned PhonePe Checkout Comparison", author="Codex")
story = [
    Paragraph("Marketing-owned PhonePe Checkout", s["TitleX"]),
    Paragraph("Corrected build comparison: redirected offer page vs copied marketing-web flow", s["SubX"]),
]

summary = Table([
    [Paragraph("PREVIOUS BUILD", s["CellHeadX"]), Paragraph("CORRECTED BUILD", s["CellHeadX"])],
    [Paragraph("Marketing CTA redirected users to the main application's existing offer route.", s["CellX"]), Paragraph("Marketing CTA remains inside marketing-web and opens its own copied checkout at /marketing-web/checkout/.", s["CellX"])],
], colWidths=[86 * mm, 86 * mm])
summary.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), red), ("BACKGROUND", (1, 0), (1, 0), green),
    ("BACKGROUND", (0, 1), (-1, -1), soft), ("BOX", (0, 0), (-1, -1), .7, line),
    ("INNERGRID", (0, 0), (-1, -1), .5, line), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story += [summary, Spacer(1, 10), Paragraph("Flow comparison", s["HeadX"])]

flow = Table([
    [Paragraph("Stage", s["CellHeadX"]), Paragraph("Previous", s["CellHeadX"]), Paragraph("Corrected", s["CellHeadX"])],
    [Paragraph("CTA", s["CellX"]), Paragraph("External main-app offer route", s["CellX"]), Paragraph("/marketing-web/checkout/", s["CellX"])],
    [Paragraph("Page owner", s["CellX"]), Paragraph("edunex-f AdOfferPage", s["CellX"]), Paragraph("marketing-web Next.js checkout page", s["CellX"])],
    [Paragraph("Identity", s["CellX"]), Paragraph("Handled after redirect", s["CellX"]), Paragraph("Copied phone OTP sheet inside marketing-web", s["CellX"])],
    [Paragraph("Payment", s["CellX"]), Paragraph("PhonePe via shared onboarding API", s["CellX"]), Paragraph("PhonePe via the same secure onboarding API", s["CellX"])],
    [Paragraph("Return", s["CellX"]), Paragraph("Main offer page recovery", s["CellX"]), Paragraph("Marketing checkout polling and paid signup handoff", s["CellX"])],
], colWidths=[27 * mm, 68 * mm, 77 * mm], repeatRows=1)
flow.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), ink), ("BOX", (0, 0), (-1, -1), .7, line),
    ("INNERGRID", (0, 0), (-1, -1), .5, line), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, soft]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [flow, Spacer(1, 9), Paragraph("Implementation changes", s["HeadX"])]
for item in [
    "Added a statically exported /checkout route inside marketing-web with the premium INR 299 offer presentation.",
    "Copied phone OTP, onboarding session, payment-pending polling, recovery actions, and paid signup handoff into the marketing page.",
    "Changed all shared marketing CTA links to /marketing-web/checkout/ and removed the offer-page redirect.",
    "Kept the shared backend entitlement and PhonePe Standard Checkout implementation so payment security and account ownership remain server-controlled.",
]:
    story.append(Paragraph("- " + item, s["BodyX"]))

story += [PageBreak(), Paragraph("Verification Evidence", s["TitleX"]), Paragraph("Production builds and rendered interaction checks", s["SubX"])]
checks = Table([
    [Paragraph("Check", s["CellHeadX"]), Paragraph("Result", s["CellHeadX"]), Paragraph("Observed", s["CellHeadX"])],
    [Paragraph("Marketing build", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("Next.js exported /checkout", s["CellX"])],
    [Paragraph("Combined build", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("Vite build copied marketing route", s["CellX"])],
    [Paragraph("CTA navigation", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("Stayed at /marketing-web/checkout/", s["CellX"])],
    [Paragraph("Old route", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("No skillomate-ai-influencer-course redirect", s["CellX"])],
    [Paragraph("Offer data", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("INR 299 and PhonePe visible", s["CellX"])],
    [Paragraph("Primary interaction", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("Pay button opened phone OTP sheet", s["CellX"])],
    [Paragraph("Console/framework", s["CellX"]), Paragraph("PASS", s["PassX"]), Paragraph("No relevant errors or overlay", s["CellX"])],
], colWidths=[48 * mm, 25 * mm, 99 * mm], repeatRows=1)
checks.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), ink), ("BOX", (0, 0), (-1, -1), .7, line),
    ("INNERGRID", (0, 0), (-1, -1), .5, line), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, soft]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [checks, Spacer(1, 10), Paragraph("Desktop and mobile checkout", s["HeadX"])]

desktop = Image(DESKTOP); desktop._restrictSize(80 * mm, 55 * mm)
mobile = Image(MOBILE); mobile._restrictSize(28 * mm, 61 * mm)
otp = Image(OTP); otp._restrictSize(80 * mm, 55 * mm)
gallery = Table([
    [desktop, mobile],
    [Paragraph("Desktop marketing-owned offer", s["CellX"]), Paragraph("Mobile checkout", s["CellX"])],
], colWidths=[120 * mm, 52 * mm])
gallery.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, 0), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
story += [gallery, Spacer(1, 7), Paragraph("OTP interaction", s["HeadX"])]
otp_row = Table([[otp, Paragraph("The primary Pay INR 299 once button opens the copied Login / Sign up sheet within marketing-web. The next steps use the existing OTP and onboarding APIs before opening PhonePe.<br/><br/><b>Live boundary:</b> OTP delivery and a completed charge were not performed. The hosted checkout was verified separately without submitting payment.", s["BodyX"])]], colWidths=[112 * mm, 60 * mm])
otp_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (1, 0), (1, 0), soft), ("BOX", (0, 0), (-1, -1), .6, line), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
story.append(otp_row)

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
