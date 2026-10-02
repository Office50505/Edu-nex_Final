from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT = "/Users/shekharchouhan/Documents/GitHub/Edu-nex_Final/output/pdf/marketing-phonepe-offer-flow-comparison.pdf"
HOSTED_SCREENSHOT = "/tmp/marketing-phonepe-hosted.png"

gold = colors.HexColor("#E5A11A")
ink = colors.HexColor("#111318")
muted = colors.HexColor("#5D6470")
line = colors.HexColor("#D8DDE5")
soft = colors.HexColor("#F4F6F8")
green = colors.HexColor("#137A4B")
red = colors.HexColor("#B4382D")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=ink, spaceAfter=6))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=15, textColor=muted, spaceAfter=16))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=ink, spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=ink, spaceAfter=7))
styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=muted))
styles.add(ParagraphStyle(name="CellHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.white))
styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.2, leading=11.5, textColor=ink))
styles.add(ParagraphStyle(name="Pass", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8.2, leading=11.5, textColor=green))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(line)
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(muted)
    canvas.drawString(18 * mm, 9 * mm, "Skillomate - Marketing PhonePe flow comparison - 2 October 2026")
    canvas.drawRightString(192 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=17 * mm,
    bottomMargin=20 * mm,
    title="Marketing PhonePe Offer Flow Comparison",
    author="Codex",
)

story = []
story.append(Paragraph("Marketing PhonePe Offer Flow", styles["TitleCustom"]))
story.append(Paragraph("Previous build vs updated build - implementation and verification report", styles["Subtitle"]))

summary = Table([
    [Paragraph("PREVIOUS", styles["CellHead"]), Paragraph("UPDATED", styles["CellHead"])],
    [Paragraph("Marketing calls-to-action opened a separate generic payment page. The PhonePe hosted checkout could fall through to a generic failure screen.", styles["Cell"]),
     Paragraph("Marketing calls-to-action now enter the existing offer-page onboarding flow. PhonePe opens a working INR 299 checkout with UPI, card, and net-banking options.", styles["Cell"])],
], colWidths=[86 * mm, 86 * mm])
summary.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), red),
    ("BACKGROUND", (1, 0), (1, 0), green),
    ("BACKGROUND", (0, 1), (-1, -1), soft),
    ("BOX", (0, 0), (-1, -1), 0.7, line),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, line),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 9),
    ("RIGHTPADDING", (0, 0), (-1, -1), 9),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story.append(summary)
story.append(Spacer(1, 10))

story.append(Paragraph("User-visible flow", styles["Section"]))
flow = Table([
    [Paragraph("Stage", styles["CellHead"]), Paragraph("Previous build", styles["CellHead"]), Paragraph("Updated build", styles["CellHead"])],
    [Paragraph("Entry", styles["Cell"]), Paragraph("Marketing CTA -> /payment?flow=marketing-onboarding", styles["Cell"]), Paragraph("Marketing CTA -> canonical offer page #paywall", styles["Cell"])],
    [Paragraph("Offer", styles["Cell"]), Paragraph("Generic access screen", styles["Cell"]), Paragraph("Existing premium offer layout with INR 299 / 30 days", styles["Cell"])],
    [Paragraph("Identity", styles["Cell"]), Paragraph("Guest payment page path", styles["Cell"]), Paragraph("Offer-page phone OTP and onboarding session", styles["Cell"])],
    [Paragraph("Payment", styles["Cell"]), Paragraph("PhonePe redirect could show a generic error", styles["Cell"]), Paragraph("PhonePe Standard Checkout V2 with payment options visible", styles["Cell"])],
    [Paragraph("Completion", styles["Cell"]), Paragraph("Separate payment recovery screen", styles["Cell"]), Paragraph("Offer status polling -> paid handoff -> signup/login", styles["Cell"])],
], colWidths=[27 * mm, 70 * mm, 75 * mm], repeatRows=1)
flow.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), ink),
    ("BOX", (0, 0), (-1, -1), 0.7, line),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, line),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, soft]),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(flow)
story.append(Spacer(1, 8))

story.append(Paragraph("Code and configuration changes", styles["Section"]))
for text in [
    "Marketing checkout URL now targets /static-pages/skillomate-ai-influencer-course/#paywall in the source, example environment, and production environment.",
    "PhonePe V2 API requests now use the OAuth O-Bearer authorization required by the current Standard Checkout contract without an extra X-MERCHANT-ID header that could conflict with the authenticated client.",
    "The one-time checkout remains fixed at 29,900 paise, uses PG_CHECKOUT, has no recurring subscription object, and returns through the existing verified onboarding handoff.",
    "Normal in-app billing remains separate; the INR 299 PhonePe product is limited to the marketing/onboarding flow.",
]:
    story.append(Paragraph("- " + text, styles["BodyCustom"]))

story.append(PageBreak())
story.append(Paragraph("Verification", styles["TitleCustom"]))
story.append(Paragraph("Automated checks, rendered browser checks, and hosted checkout smoke test", styles["Subtitle"]))

checks = Table([
    [Paragraph("Check", styles["CellHead"]), Paragraph("Result", styles["CellHead"]), Paragraph("Evidence", styles["CellHead"])],
    [Paragraph("Backend payment/onboarding", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("14 tests passed", styles["Cell"])],
    [Paragraph("Offer-page flow/recovery", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("35 tests passed", styles["Cell"])],
    [Paragraph("Marketing production build", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("Next.js static export completed", styles["Cell"])],
    [Paragraph("Combined app build", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("Vite build and marketing asset copy completed", styles["Cell"])],
    [Paragraph("CTA interaction", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("Start Learning navigated to canonical offer #paywall", styles["Cell"])],
    [Paragraph("Offer rendering", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("INR 299 and PhonePe visible; no framework overlay or console error", styles["Cell"])],
    [Paragraph("PhonePe hosted page", styles["Cell"]), Paragraph("PASS", styles["Pass"]), Paragraph("Skillomate total INR 299; UPI, card, and net banking available", styles["Cell"])],
], colWidths=[51 * mm, 25 * mm, 96 * mm], repeatRows=1)
checks.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), ink),
    ("BOX", (0, 0), (-1, -1), 0.7, line),
    ("INNERGRID", (0, 0), (-1, -1), 0.5, line),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, soft]),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(checks)
story.append(Spacer(1, 12))

story.append(Paragraph("Hosted checkout evidence", styles["Section"]))
story.append(Paragraph("The smoke test created a checkout session only and stopped before payment submission. The previous generic failure message was absent.", styles["BodyCustom"]))
img = Image(HOSTED_SCREENSHOT)
img._restrictSize(64 * mm, 88 * mm)
evidence = Table([[img, Paragraph("Observed state:<br/><br/>- Merchant: Skillomate<br/>- Total: INR 299.00<br/>- UPI payment available<br/>- Debit/credit card available<br/>- Net banking available<br/>- No generic failure screen<br/><br/><b>No payment was submitted.</b>", styles["BodyCustom"])]], colWidths=[84 * mm, 88 * mm])
evidence.setStyle(TableStyle([
    ("BOX", (0, 0), (-1, -1), 0.7, line),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("BACKGROUND", (1, 0), (1, 0), soft),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story.append(KeepTogether(evidence))
story.append(Spacer(1, 10))
story.append(Paragraph("Remaining live-payment boundary", styles["Section"]))
story.append(Paragraph("The integration is verified through creation and rendering of the real PhonePe hosted checkout. A completed charge, webhook delivery, final entitlement grant, and production return redirect were intentionally not executed because that would require a real payment.", styles["BodyCustom"]))

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
