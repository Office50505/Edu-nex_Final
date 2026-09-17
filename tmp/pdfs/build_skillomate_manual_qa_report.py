from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "skillomate_manual_testing_report_2026-09-17.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = A4
INK = colors.HexColor("#191714")
MUTED = colors.HexColor("#665F56")
GOLD = colors.HexColor("#C88C1E")
GOLD_LIGHT = colors.HexColor("#F7E8C5")
PAPER = colors.HexColor("#FCFAF6")
LINE = colors.HexColor("#DED7CC")
RED = colors.HexColor("#A92C35")
ORANGE = colors.HexColor("#B45A12")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=29, leading=34, textColor=INK, alignment=TA_LEFT, spaceAfter=8))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=11, leading=16, textColor=MUTED, spaceAfter=8))
styles.add(ParagraphStyle(name="Section", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=INK, spaceBefore=8, spaceAfter=10))
styles.add(ParagraphStyle(name="IssueTitle", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK, spaceAfter=4))
styles.add(ParagraphStyle(name="BodySmall", fontName="Helvetica", fontSize=8.7, leading=12.2, textColor=INK))
styles.add(ParagraphStyle(name="Meta", fontName="Helvetica", fontSize=8, leading=10.5, textColor=MUTED))
styles.add(ParagraphStyle(name="TableHead", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="TableCell", fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=INK))
styles.add(ParagraphStyle(name="Callout", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=INK, backColor=GOLD_LIGHT, borderColor=GOLD, borderWidth=0.6, borderPadding=9, spaceAfter=10))


issues = [
    (1, "Login", "Authenticated/course content appears on the login screen", "High", "High", "Open",
     "Open the login screen while signed out.",
     "Course details, tabs, and Continue Learning information are visible where authentication content should appear.",
     "Show only authentication content until login succeeds; protect course and progress data."),
    (2, "Login", "Wrong password exposes a technical accessToken error", "High", "High", "Open",
     "Enter a valid mobile number with an incorrect password and select Sign In.",
     "The page displays: Cannot read properties of null (reading 'accessToken').",
     "Display a safe message such as 'Incorrect mobile number or password' and handle null responses."),
    (3, "Homepage", "No accessible theme switch on the main screen", "Medium", "Medium", "Open",
     "Open the main screen and inspect the header and primary controls.",
     "The site is dark, but there is no visible light/dark/system control on the main screen.",
     "Provide a discoverable theme control in the header or profile menu and persist the preference."),
    (4, "Homepage", "Course poster carousel stops after click-and-swipe", "Medium", "Medium", "Open",
     "Drag/swipe the moving course posters, then release.",
     "Automatic movement stops and does not resume.",
     "Resume autoplay after a short delay, or provide an accessible Pause/Play control."),
    (5, "Mobile login", "Phone input accepts an unlimited number of digits", "High", "High", "Open",
     "On mobile, enter more digits than a valid phone number in Email or Phone.",
     "The field accepts an excessively long value without validation.",
     "Enforce the supported phone length (10 digits after +91 for India) and show clear validation."),
    (6, "Authentication", "Authenticated user can open the login form", "Medium", "High", "Open",
     "While logged in, select a Login link or navigate to /login.",
     "The login form renders while the header simultaneously shows the user as logged in and offers Log out.",
     "Hide Login links for authenticated users and redirect /login to Dashboard or Home."),
    (7, "Dashboard/course", "Open Course sends an enrolled user to a sales/details page", "High", "High", "Open",
     "With active course access, select Open Course from the dashboard.",
     "The public course detail page opens and shows the Rs.1 first-month offer, despite active access.",
     "Open the course workspace, lesson list, or last-viewed lesson directly."),
    (8, "Course details", "Raw Markdown syntax is visible", "Medium", "Medium", "Open",
     "Open the AI Influencer Course details page and inspect the description.",
     "Markdown markers such as ## and ** appear as literal text.",
     "Render supported Markdown or store and display clean rich text."),
    (9, "Profile", "Profile navigation flashes a login/loading route and loses account state", "Critical", "High", "Open",
     "While logged in, select the profile icon.",
     "A bright loading screen and login.html?next=profile.html flash; the profile then shows Login, no email, no subscription, and no mobile.",
     "Verify authentication before rendering, preserve theme/session state, and load the correct account data."),
    (10, "Session management", "Concurrent login silently logs out the first session", "High", "High", "Open",
     "Sign in on one device, then sign in elsewhere with the same account.",
     "The first session is terminated without an explanation.",
     "Explain the concurrent-session policy, warn before replacement where appropriate, and show a signed-out reason."),
    (11, "Dashboard", "Daily Activity and Learning Status are not dynamic", "High", "High", "Open",
     "Use the account, complete activity, and revisit the dashboard widgets.",
     "The chart appears fixed; Hours Spent shows 'Synced', Completed shows 'Real courses', and status remains 'Live'.",
     "Calculate user-specific chart values, duration, completion counts, progress, and a proper empty state."),
    (12, "Signup", "Enter key does not submit the phone registration form", "Medium", "Medium", "Open",
     "Enter a valid phone number on /signup and press Enter/Return.",
     "Nothing happens and no validation feedback appears.",
     "Submit like Send OTP & Continue; if consent is missing, focus the checkbox and show validation."),
    (13, "Profile setup", "Desktop age selector does not support hold-and-drag", "Medium", "Medium", "Open",
     "On desktop, press and drag inside the age selector.",
     "The age does not scroll or change. Mobile touch dragging passes.",
     "Support mouse drag, wheel, trackpad, and Arrow Up/Down on desktop while retaining mobile behavior."),
    (14, "Courses", "Unavailable filters and promotional content flash during loading", "Medium", "High", "Open",
     "Open or reload /courses and observe the loading state.",
     "Extra categories and promotional content appear briefly, then disappear when backend data loads.",
     "Use an empty/skeleton loading state and render filters only after the catalogue response succeeds."),
]


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 16 * mm, PAGE_W - 18 * mm, 16 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Skillomate AI - Manual Testing Report")
    canvas.drawRightString(PAGE_W - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=17 * mm, bottomMargin=21 * mm,
    title="Skillomate AI Manual Testing Report",
    author="QA review compiled with Codex",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=header_footer))

story = []
story += [Spacer(1, 17 * mm), Paragraph("SKILLOMATE AI", ParagraphStyle("Kicker", parent=styles["Meta"], fontName="Helvetica-Bold", fontSize=10, textColor=GOLD, leading=12, spaceAfter=8)),
          Paragraph("Manual Testing<br/>Defect Report", styles["CoverTitle"]),
          Paragraph("Web and mobile observations recorded during a guided manual QA session", styles["CoverSub"]),
          Spacer(1, 10 * mm)]

cover_data = [
    [Paragraph("TEST TARGET", styles["Meta"]), Paragraph("https://skillomate.in/", styles["BodySmall"])],
    [Paragraph("TEST DATE", styles["Meta"]), Paragraph("17 September 2026", styles["BodySmall"])],
    [Paragraph("PRIMARY BROWSER", styles["Meta"]), Paragraph("Google Chrome / Chromium", styles["BodySmall"])],
    [Paragraph("PLATFORMS", styles["Meta"]), Paragraph("Desktop web and mobile application/view", styles["BodySmall"])],
    [Paragraph("SCOPE", styles["Meta"]), Paragraph("Authentication, onboarding, homepage, courses, dashboard, profile, responsiveness, and interaction behavior", styles["BodySmall"])],
]
ct = Table(cover_data, colWidths=[39 * mm, 117 * mm], hAlign="LEFT")
ct.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ("BOX", (0, 0), (-1, -1), 0.8, LINE),
    ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 9),
    ("RIGHTPADDING", (0, 0), (-1, -1), 9),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
]))
story += [ct, Spacer(1, 12 * mm), Paragraph("14 open concerns were recorded: 1 Critical, 5 High, and 8 Medium severity. Authentication state, profile loading, course routing, validation, and dynamic dashboard data should be addressed first.", styles["Callout"]), PageBreak()]

story += [Paragraph("Executive summary", styles["Section"])]
summary = [
    [Paragraph("Severity", styles["TableHead"]), Paragraph("Count", styles["TableHead"]), Paragraph("Recommended response", styles["TableHead"])],
    [Paragraph("Critical", styles["TableCell"]), Paragraph("1", styles["TableCell"]), Paragraph("Fix before release; profile/session data may be unreliable.", styles["TableCell"])],
    [Paragraph("High", styles["TableCell"]), Paragraph("5", styles["TableCell"]), Paragraph("Prioritize in the next stabilization cycle.", styles["TableCell"])],
    [Paragraph("Medium", styles["TableCell"]), Paragraph("8", styles["TableCell"]), Paragraph("Schedule with usability, accessibility, and loading-state fixes.", styles["TableCell"])],
]
st = Table(summary, colWidths=[34 * mm, 22 * mm, 100 * mm])
st.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK), ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("BACKGROUND", (0, 1), (-1, -1), colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [st, Spacer(1, 8 * mm), Paragraph("Highest-risk observations", styles["IssueTitle"]),
          Paragraph("The profile flow briefly passes through a login/loading route and then displays missing account/subscription data. Wrong-password handling leaks a JavaScript error. Enrolled users are sent to course sales/details content, and dashboard progress widgets do not appear to use real user data.", styles["BodySmall"]),
          Spacer(1, 6 * mm), Paragraph("Test limitations", styles["IssueTitle"]),
          Paragraph("This report consolidates observed manual behavior and supplied screenshots. Destructive account actions and payment completion were not performed. Items should be reproduced in a controlled QA environment and verified against network/API responses before closure.", styles["BodySmall"]), PageBreak(),
          Paragraph("Defect register", styles["Section"])]

register = [[Paragraph("ID", styles["TableHead"]), Paragraph("Area / issue", styles["TableHead"]), Paragraph("Severity", styles["TableHead"]), Paragraph("Priority", styles["TableHead"]), Paragraph("Status", styles["TableHead"])]]
for n, area, title, severity, priority, status, *_ in issues:
    register.append([Paragraph(str(n), styles["TableCell"]), Paragraph(f"<b>{area}</b><br/>{title}", styles["TableCell"]), Paragraph(severity, styles["TableCell"]), Paragraph(priority, styles["TableCell"]), Paragraph(status, styles["TableCell"])])
rt = Table(register, colWidths=[10 * mm, 100 * mm, 22 * mm, 22 * mm, 20 * mm], repeatRows=1)
rt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), INK), ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F2EA")]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [rt, PageBreak(), Paragraph("Detailed findings", styles["Section"])]

for idx, (n, area, title, severity, priority, status, steps, actual, expected) in enumerate(issues):
    sev_color = RED if severity in ("Critical", "High") else ORANGE
    meta = Table([
        [Paragraph(f"#{n:02d}  {area}", styles["Meta"]), Paragraph(f"<b><font color='{sev_color.hexval()}'>{severity}</font></b> | Priority {priority} | {status}", styles["Meta"])],
    ], colWidths=[82 * mm, 74 * mm])
    meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    block = [meta, Spacer(1, 2), Paragraph(title, styles["IssueTitle"]),
             Paragraph(f"<b>Steps:</b> {steps}", styles["BodySmall"]),
             Paragraph(f"<b>Actual:</b> {actual}", styles["BodySmall"]),
             Paragraph(f"<b>Expected:</b> {expected}", styles["BodySmall"]), Spacer(1, 4 * mm)]
    story.append(KeepTogether(block))
    if idx in (3, 7, 10):
        story.append(PageBreak())
        story.append(Paragraph("Detailed findings (continued)", styles["Section"]))

story += [PageBreak(), Paragraph("Screenshot evidence", styles["Section"]),
          Paragraph("Representative Chromium captures from the testing session. Screenshots supplied only inside the chat could not be recovered as source files, so authenticated-only defects remain documented in the detailed findings.", styles["BodySmall"]),
          Spacer(1, 6 * mm)]

home_img = RLImage("/private/tmp/skillomate-home.png", width=108 * mm, height=75 * mm)
mobile_img = RLImage("/private/tmp/skillomate-mobile.png", width=42 * mm, height=91 * mm)
evidence_top = Table([
    [home_img, mobile_img],
    [Paragraph("Figure 1. Desktop homepage and course carousel.", styles["Meta"]),
     Paragraph("Figure 2. Mobile homepage responsive capture.", styles["Meta"])],
], colWidths=[112 * mm, 44 * mm], hAlign="LEFT")
evidence_top.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BOX", (0, 0), (0, 0), 0.5, LINE), ("BOX", (1, 0), (1, 0), 0.5, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story += [evidence_top, Spacer(1, 7 * mm)]

login_img = RLImage("/private/tmp/skillomate-login.png", width=75 * mm, height=52 * mm)
pricing_img = RLImage("/private/tmp/skillomate-pricing.png", width=75 * mm, height=52 * mm)
evidence_bottom = Table([
    [login_img, pricing_img],
    [Paragraph("Figure 3. Desktop login screen baseline.", styles["Meta"]),
     Paragraph("Figure 4. Pricing page baseline.", styles["Meta"])],
], colWidths=[78 * mm, 78 * mm], hAlign="LEFT")
evidence_bottom.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BOX", (0, 0), (0, 0), 0.5, LINE), ("BOX", (1, 0), (1, 0), 0.5, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story += [evidence_bottom, PageBreak(), Paragraph("Recommended fix order", styles["Section"])]
priority_rows = [
    ("1", "Authentication integrity", "Fix profile/session state (#9), wrong-password handling (#2), authenticated login routing (#6), and concurrent-session messaging (#10)."),
    ("2", "Core learning journey", "Route enrolled learners directly into course content (#7) and remove protected data from login contexts (#1)."),
    ("3", "Data accuracy", "Replace dashboard placeholders with user-specific backend values (#11) and render course descriptions correctly (#8)."),
    ("4", "Validation and input", "Constrain mobile phone input (#5), support Enter on signup (#12), and repair desktop age interaction (#13)."),
    ("5", "UI stability", "Remove loading-state flashes (#14), restore carousel behavior (#4), and improve theme access (#3)."),
]
for num, heading, body in priority_rows:
    t = Table([[Paragraph(num, ParagraphStyle("N", parent=styles["IssueTitle"], textColor=colors.white, alignment=TA_CENTER)), Paragraph(f"<b>{heading}</b><br/>{body}", styles["BodySmall"])]], colWidths=[12 * mm, 144 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), GOLD), ("BACKGROUND", (1, 0), (1, 0), colors.white), ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [t, Spacer(1, 3 * mm)]

story += [Spacer(1, 6 * mm), Paragraph("Closure criteria", styles["IssueTitle"]),
          Paragraph("For each item: reproduce on the reported platform, implement the correction, add or update automated coverage where practical, retest the original steps, run a regression pass on related flows, and attach fresh evidence before marking the defect closed.", styles["BodySmall"])]

doc.build(story)
print(OUT)
