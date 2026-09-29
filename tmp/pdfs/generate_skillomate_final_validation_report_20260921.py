from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path("/Users/ayankhan/Desktop/edunex/Edu-nex_Final")
OUTPUT = ROOT / "output/pdf/skillomate-final-500-concurrent-validation-report-2026-09-21.pdf"

PAGE_W, PAGE_H = A4
NAVY = colors.HexColor("#101B2D")
NAVY_2 = colors.HexColor("#17263E")
GOLD = colors.HexColor("#D69A21")
GOLD_SOFT = colors.HexColor("#FFF4D8")
RED = colors.HexColor("#C43D3D")
RED_SOFT = colors.HexColor("#FDEAEA")
GREEN = colors.HexColor("#1F7A55")
GREEN_SOFT = colors.HexColor("#EAF6F0")
INK = colors.HexColor("#1C2430")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#D8DEE8")
PAPER = colors.HexColor("#F7F9FC")
WHITE = colors.white


def register_fonts():
    candidates = [
        ("Inter", "/System/Library/Fonts/Supplemental/Arial.ttf"),
        ("Inter-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("Mono", "/System/Library/Fonts/Menlo.ttc"),
    ]
    for name, path in candidates:
        if Path(path).exists():
            try:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=0))
            except Exception:
                pass


register_fonts()
BODY_FONT = "Inter" if "Inter" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
BOLD_FONT = "Inter-Bold" if "Inter-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
MONO_FONT = "Mono" if "Mono" in pdfmetrics.getRegisteredFontNames() else "Courier"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverKicker", fontName=BOLD_FONT, fontSize=9, leading=11,
    textColor=GOLD, spaceAfter=4, tracking=1.2,
))
styles.add(ParagraphStyle(
    name="TitleCustom", fontName=BOLD_FONT, fontSize=26, leading=30,
    textColor=WHITE, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="SubtitleCustom", fontName=BODY_FONT, fontSize=11, leading=16,
    textColor=colors.HexColor("#D9E0EA"), spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="H1Custom", fontName=BOLD_FONT, fontSize=19, leading=23,
    textColor=NAVY, spaceBefore=2, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="H2Custom", fontName=BOLD_FONT, fontSize=12, leading=15,
    textColor=NAVY, spaceBefore=8, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BodyCustom", fontName=BODY_FONT, fontSize=9.2, leading=13.8,
    textColor=INK, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SmallCustom", fontName=BODY_FONT, fontSize=7.8, leading=11,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="TableHeader", fontName=BOLD_FONT, fontSize=7.8, leading=10,
    textColor=WHITE, alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    name="TableCell", fontName=BODY_FONT, fontSize=7.7, leading=10.5,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="CodeCustom", fontName=MONO_FONT, fontSize=7.5, leading=11,
    textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="Verdict", fontName=BOLD_FONT, fontSize=13, leading=17,
    textColor=RED,
))


def p(text, style="BodyCustom"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["BodyCustom"])


def callout(title, body, fill, border, title_color=INK):
    content = [
        Paragraph(title, ParagraphStyle(
            name=f"callout-{title}", parent=styles["H2Custom"],
            textColor=title_color, spaceBefore=0, spaceAfter=4,
        )),
        p(body),
    ]
    table = Table([[content]], colWidths=[170 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 1, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def metric_card(label, value, detail, fill=WHITE, value_color=NAVY):
    items = [
        Paragraph(label.upper(), ParagraphStyle(
            name=f"metric-label-{label}", parent=styles["SmallCustom"],
            fontName=BOLD_FONT, textColor=MUTED, spaceAfter=3,
        )),
        Paragraph(value, ParagraphStyle(
            name=f"metric-value-{label}", parent=styles["H1Custom"],
            fontSize=16, leading=18, textColor=value_color, spaceAfter=3,
        )),
        p(detail, "SmallCustom"),
    ]
    table = Table([[items]], colWidths=[53 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def code_box(lines):
    text = "<br/>".join(escape(line) for line in lines)
    table = Table([[Paragraph(text, styles["CodeCustom"])]], colWidths=[170 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0.8, NAVY_2),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def table(data, widths):
    formatted = []
    for row_index, row in enumerate(data):
        formatted.append([
            Paragraph(str(cell), styles["TableHeader"] if row_index == 0 else styles["TableCell"])
            for cell in row
        ])
    result = Table(formatted, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
    ]))
    return result


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, stroke=0, fill=1)
    canvas.setFont(BOLD_FONT, 7.5)
    canvas.setFillColor(WHITE)
    canvas.drawString(20 * mm, PAGE_H - 9 * mm, "SKILLOMATE | FINAL LOAD VALIDATION")
    canvas.setFont(BODY_FONT, 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 10 * mm, "Evidence captured 21 Sep 2026 | Asia/Kolkata")
    canvas.drawRightString(PAGE_W - 20 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=22 * mm, bottomMargin=18 * mm,
        title="Skillomate Final 500 Concurrent User Validation Report",
        author="OpenAI Codex",
        subject="Final load-test decision, verified evidence, and recovery gates",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=header_footer)])

    story = []

    cover = Table([[
        [
            p("FINAL VALIDATION REPORT", "CoverKicker"),
            p("Skillomate 500 Concurrent User Test", "TitleCustom"),
            p("Final decision: blocked at preflight because the production API was already unavailable.", "SubtitleCustom"),
            Paragraph("TEST NOT STARTED", ParagraphStyle(
                name="CoverVerdict", parent=styles["Verdict"], textColor=WHITE,
                backColor=RED, borderColor=RED, borderWidth=1,
                borderPadding=(6, 10, 6, 10), alignment=TA_CENTER,
            )),
        ]
    ]], colWidths=[170 * mm])
    cover.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 1, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ]))
    story.extend([cover, Spacer(1, 8 * mm)])

    metrics = Table([[
        metric_card("Homepage", "HTTP 200", "0.803s total", GREEN_SOFT, GREEN),
        metric_card("API health", "TIMEOUT", "12.002s, zero bytes", RED_SOFT, RED),
        metric_card("Courses API", "TIMEOUT", "12.007s, zero bytes", RED_SOFT, RED),
    ]], colWidths=[56.6 * mm] * 3)
    metrics.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.extend([metrics, Spacer(1, 6 * mm)])

    story.append(callout(
        "Executive verdict",
        "A valid 500-concurrent-user application test could not begin. The static homepage was available through CloudFront/S3, but the backend returned no response for both health and course requests. Sending 500 users into this state would add risk while producing no defensible capacity result.",
        RED_SOFT, RED, RED,
    ))
    story.extend([Spacer(1, 5 * mm), p("What this report certifies", "H2Custom")])
    story.extend([
        bullet("The final preflight was executed at 18:02 IST on 21 Sep 2026."),
        bullet("The requested 30-minute, 500-VU test was intentionally blocked before traffic ramp-up."),
        bullet("Historical homepage-only soak data is retained as limited evidence, not full application capacity."),
        bullet("A repeatable recovery gate and final retest protocol are provided."),
    ])
    story.append(PageBreak())

    story.append(p("1. Final preflight evidence", "H1Custom"))
    story.append(p(
        "The preflight used bounded, read-only HTTPS GET requests from the same load-generator host intended for the test. No authenticated or state-changing action was performed.",
    ))
    evidence = [
        ["Endpoint", "Observed result", "Connect", "First byte", "Decision"],
        ["https://skillomate.in/", "HTTP 200", "0.257s", "0.802s", "Frontend available"],
        ["/api/health", "HTTP 000; timeout; 0 bytes", "0.269s", "None", "Backend unavailable"],
        ["/api/courses", "HTTP 000; timeout; 0 bytes", "0.259s", "None", "Backend unavailable"],
    ]
    story.extend([
        Spacer(1, 2 * mm),
        table(evidence, [44 * mm, 51 * mm, 22 * mm, 24 * mm, 29 * mm]),
        Spacer(1, 6 * mm),
        callout(
            "Interpretation",
            "DNS/TLS/network connection setup succeeded, but the API origin produced no response body before the client timeout. Because the homepage and API have different delivery paths, homepage availability does not prove that login, courses, checkout, or other backend features are operational.",
            GOLD_SOFT, GOLD,
        ),
        Spacer(1, 5 * mm),
        p("Observed production path", "H2Custom"),
        code_box([
            "Browser -> CloudFront -> static S3 origin              [WORKING]",
            "Browser -> CloudFront /api/* -> ALB -> Nginx -> Node  [NO RESPONSE]",
        ]),
        Spacer(1, 5 * mm),
        p("Why the test was blocked", "H2Custom"),
        bullet("The lightweight health route did not answer, so baseline failure and latency measurements would be meaningless."),
        bullet("Starting 500 VUs could delay recovery, amplify queueing, and obscure the original fault."),
        bullet("The safety decision protects production availability and preserves the integrity of the result."),
    ])
    story.append(PageBreak())

    story.append(p("2. Historical 500-VU homepage soak", "H1Custom"))
    story.append(p(
        "A previous run reached 500 virtual users against the public homepage. It was stopped when production impact was reported. These figures are useful only for the cached static delivery path.",
    ))
    hist = [
        ["Metric", "Measured value", "Meaning"],
        ["Elapsed duration", "72m 53s", "Partial run; not the planned full duration"],
        ["Peak virtual users", "500", "Maximum scheduled concurrency"],
        ["HTTP requests", "385,652", "Homepage-only request count"],
        ["Failed requests", "5 (0.0013%)", "Very low failure rate on cached homepage"],
        ["Throughput", "88.19 req/s", "Average across the partial run"],
        ["Median latency", "260.601 ms", "Static homepage response"],
        ["p90 / p95", "274.398 / 277.982 ms", "Static homepage response"],
        ["p99 / maximum", "850.919 ms / 15.101s", "Long-tail delay was present"],
    ]
    story.extend([
        Spacer(1, 2 * mm),
        table(hist, [42 * mm, 42 * mm, 86 * mm]),
        Spacer(1, 6 * mm),
        callout(
            "Capacity limitation",
            "This historical result cannot certify that Skillomate supports 500 concurrent application users. The run exercised GET / on the cached frontend and did not validate API health, authentication, database access, course retrieval, checkout, or user workflows.",
            RED_SOFT, RED, RED,
        ),
        Spacer(1, 5 * mm),
        p("Defensible conclusion", "H2Custom"),
        p(
            "Static delivery handled the observed request volume with a low failure rate. Full-stack capacity remains unknown because the backend is currently unavailable and a clean final test could not start.",
        ),
    ])
    story.append(PageBreak())

    story.append(p("3. Recovery gate and final retest protocol", "H1Custom"))
    story.append(p("Recover one backend instance first, verify it, and only then proceed instance by instance."))
    story.append(code_box([
        "cd /home/ubuntu/skillomate_backend",
        "pm2 status",
        "pm2 logs skillomate_backend --lines 100 --nostream",
        "pm2 restart skillomate_backend --update-env",
        "pm2 save",
        "curl -i --max-time 5 http://127.0.0.1:3000/api/health",
        "curl -i --max-time 5 http://127.0.0.1/api/health",
        "curl -i --max-time 5 https://skillomate.in/api/health",
    ]))
    story.extend([Spacer(1, 5 * mm), p("Required acceptance gates", "H2Custom")])
    gates = [
        ["Gate", "Pass condition"],
        ["Node process", "PM2 process skillomate_backend is online and stable"],
        ["Local Node health", "127.0.0.1:3000/api/health returns HTTP 200 in under 1s"],
        ["Local Nginx health", "127.0.0.1/api/health returns HTTP 200 in under 1s"],
        ["ALB target", "Target Groups -> Targets reports Healthy"],
        ["Public health", "skillomate.in/api/health returns HTTP 200 in under 2s"],
        ["Functional API", "/api/courses returns valid JSON in under 2s"],
        ["Stability window", "All gates remain healthy for at least 10 minutes"],
    ]
    story.extend([
        table(gates, [55 * mm, 115 * mm]),
        Spacer(1, 5 * mm),
        p("Planned final 30-minute profile", "H2Custom"),
    ])
    profile = [
        ["Elapsed", "Target VUs", "Purpose"],
        ["0-2 min", "0 -> 50", "Initial stability"],
        ["2-5 min", "50 -> 150", "Early saturation signal"],
        ["5-10 min", "150 -> 300", "Mid-load validation"],
        ["10-15 min", "300 -> 500", "Controlled peak ramp"],
        ["15-25 min", "500", "Peak hold"],
        ["25-30 min", "500 -> 0", "Recovery observation"],
    ]
    story.extend([
        table(profile, [36 * mm, 38 * mm, 96 * mm]),
        Spacer(1, 5 * mm),
        callout(
            "Automatic stop conditions",
            "Stop if request failures exceed 2%, API p95 exceeds 2 seconds, public health repeatedly fails, or real users report production impact. A passing result requires the full 30-minute schedule and post-test health verification.",
            GOLD_SOFT, GOLD,
        ),
    ])

    doc.build(story)


if __name__ == "__main__":
    build()
    print(OUTPUT)
