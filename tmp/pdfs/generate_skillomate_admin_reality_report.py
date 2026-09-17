from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = "output/pdf/skillomate-admin-panel-v2-comparison-report.pdf"


def para(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=24,
    textColor=colors.HexColor("#111111"),
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=16,
    textColor=colors.HexColor("#1F2933"),
    spaceBefore=10,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#222222"),
))
styles.add(ParagraphStyle(
    name="Small",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#444444"),
))
styles.add(ParagraphStyle(
    name="TableCell",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=7.4,
    leading=9.4,
    textColor=colors.HexColor("#111111"),
))
styles.add(ParagraphStyle(
    name="TableHeader",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=7.8,
    leading=9.8,
    textColor=colors.white,
))

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=0.55 * inch,
    leftMargin=0.55 * inch,
    topMargin=0.5 * inch,
    bottomMargin=0.5 * inch,
)

story = []
story.append(para("Skillomate Admin Panel V2 Comparison Report", styles["TitleCustom"]))
story.append(para("Date: 2026-09-16", styles["BodyCustom"]))
story.append(para(
    "Scope: Comparison of the earlier admin redesign pass against the latest real-values-only cleanup.",
    styles["BodyCustom"],
))
story.append(Spacer(1, 8))

story.append(para("Summary", styles["Section"]))
summary_rows = [
    ["Area", "Previous admin V2 state", "Latest state"],
    [
        "Dashboard values",
        "Main totals came from live admin APIs, but some percentage labels were frontend-computed as relative ratios.",
        "Frontend-computed comparison labels were removed. Dashboard cards now show only values returned by live APIs or clear Not returned text.",
    ],
    [
        "Trend charts",
        "Course completion mini chart could fall back to a single completion percentage when daily completion data was not returned.",
        "Mini charts now render only fields present in live dailySeries data. Missing fields show No live trend data returned.",
    ],
    [
        "Missing backend workflows",
        "Some pages used placeholder wording for review, subscriptions, settings, and learner detail tabs.",
        "Copy now states Backend API not connected where mutations or per-learner records do not exist yet.",
    ],
    [
        "Bulk course actions",
        "Bulk actions said selected changes were staged.",
        "Bulk actions now say a backend bulk endpoint is required and no course data was changed.",
    ],
]
table = Table(
    [[para(cell, styles["TableHeader"] if row_index == 0 else styles["TableCell"]) for cell in row] for row_index, row in enumerate(summary_rows)],
    colWidths=[1.35 * inch, 2.35 * inch, 2.55 * inch],
)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111111")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9CED6")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F8FA")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story.append(table)

story.append(para("Live Data Sources Kept", styles["Section"]))
for item in [
    "Dashboard analytics continue to load from /api/admin/analytics.",
    "Learners, subscribers, and progress views continue to use /api/admin/user-management.",
    "Course library and review data continue to use /api/admin/courses and /api/admin/courses?summary=1.",
    "Certification counts continue to use /api/admin/certifications?page=1.",
    "Payment and environment readiness continue to use /api/admin/system-health where available.",
]:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Backend Still Needed For 100 Percent Real Workflows", styles["Section"]))
for item in [
    "Previous-period analytics if you want real percentage comparisons instead of removed frontend ratios.",
    "Paginated /api/admin/orders with refunds, export, and search.",
    "Subscription mutation and audit endpoints.",
    "Learner-specific orders, certificates, activity, and audit history.",
    "Bulk course operations and review-state persistence.",
    "Course-level pricing, SEO tags, featured flags, and certificate toggles.",
    "Profile/settings mutation endpoints.",
]:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(para("Verification", styles["Section"]))
for item in [
    "Ran npm run build in edunex-f successfully.",
    "Searched admin source for demo/mock/staged/frontend-placeholder comparison wording after cleanup.",
    "Kept the running admin frontend and backend services unchanged on localhost ports 5173 and 3000.",
]:
    story.append(para("- " + item, styles["BodyCustom"]))

story.append(Spacer(1, 10))
story.append(para("Prepared by Codex for the Skillomate admin real-values-only cleanup.", styles["Small"]))

doc.build(story)
