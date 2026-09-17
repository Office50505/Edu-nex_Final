from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

OUTPUT = "output/pdf/admin-user-management-controls-comparison-2026-09-14.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCenter", parent=styles["Title"], alignment=TA_CENTER, textColor=colors.HexColor("#172554"), spaceAfter=14))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], textColor=colors.HexColor("#1d4ed8"), spaceBefore=10, spaceAfter=7))
styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9.5, leading=13))
styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=9, leading=12, textColor=colors.HexColor("#475569"), backColor=colors.HexColor("#f1f5f9"), borderPadding=8))

doc = SimpleDocTemplate(OUTPUT, pagesize=A4, rightMargin=17*mm, leftMargin=17*mm, topMargin=16*mm, bottomMargin=16*mm, title="Admin User Management Build Comparison")
story = [
    Paragraph("Admin User Management Build Comparison", styles["TitleCenter"]),
    Paragraph("Previous version vs. enhanced build - 14 September 2026", styles["Heading3"]),
    Spacer(1, 6),
    Paragraph("Executive summary", styles["Section"]),
    Paragraph("The user-management page has been upgraded from a read-heavy CRM view with permanent deletion into an operational control center. Administrators can now grant or remove course access, ban or unban accounts, revoke sessions when banning, search phone numbers reliably despite formatting, filter banned users, inspect login activity, and review an audit trail of sensitive actions.", styles["BodySmall"]),
    Spacer(1, 10),
]

comparison_raw = [
    ["Area", "Previous version", "Enhanced build"],
    ["Search", "Name, email, mobile and course text", "Same coverage plus normalized phone-number matching and deferred filtering for responsive typing"],
    ["Subscription", "Status display and filter only", "Grant or extend 1-3650 days; remove app access immediately; expiry visible"],
    ["Account access", "Active state displayed; deletion available", "Ban/unban controls, mandatory ban reason, immediate session and device-token revocation"],
    ["Safety", "Delete confirmation", "Confirmations for all sensitive actions, required reasons, bounded input, protected APIs"],
    ["Auditability", "No user action history", "Latest 25 admin access/subscription actions with previous and next state"],
    ["Operations", "Subscription filter and CRM segments", "Added active/banned account filter, login count, last-login date, ban reason and subscription end date"],
]
comparison = [comparison_raw[0]] + [[Paragraph(cell, styles["BodySmall"]) for cell in row] for row in comparison_raw[1:]]
table = Table(comparison, colWidths=[31*mm, 65*mm, 77*mm], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1e3a8a")),
    ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8),
    ("LEADING", (0,0), (-1,-1), 10.5),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#cbd5e1")),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story += [table, PageBreak(), Paragraph("Feature details", styles["Section"])]

features = [
    ("Grant or extend subscription access", "An administrator chooses a duration in days and records a required reason. The backend creates or updates the Subscription record, synchronizes the User status and expiry, and records the change."),
    ("Remove subscription access", "Access is expired immediately in both the User and Subscription records. The interface explicitly warns that this does not cancel an external payment mandate; payment-provider cancellation remains a separate operational responsibility."),
    ("Ban and unban", "Banning requires a reason, sets the account inactive, records the timestamp and reason, clears active web/mobile sessions, and removes the device token. Existing authentication middleware already rejects inactive users. Unban restores sign-in eligibility."),
    ("Enhanced search and filters", "Search covers user name, email, mobile number, subscription status, demographic values and course titles. Phone matching ignores punctuation and country-code formatting. An account-access filter isolates active or banned users."),
    ("Operational account detail", "Expanded records now show subscription expiry, last login, login count, ban reason, learning progress, watch time and verification status."),
    ("Admin action history", "The latest 25 ban, unban, grant and revoke actions are available inside each user record. Entries retain reason, admin subject, previous state, next state and timestamp."),
    ("Existing capabilities retained", "CRM segments, subscription filters, sorting, pagination, CSV export, course-progress drill-down, deletion requests, refresh and permanent deletion remain available."),
]
for title, body in features:
    story += [KeepTogether([Paragraph(title, styles["Heading3"]), Paragraph(body, styles["BodySmall"]), Spacer(1, 6)])]

story += [PageBreak(), Paragraph("Code and data changes", styles["Section"])]
changes_raw = [
    ["Component", "Change"],
    ["User model", "Added bannedAt and bounded banReason fields."],
    ["AdminUserAction model", "New immutable-style audit collection for sensitive account operations."],
    ["Backend API", "Added protected access, subscription and action-history endpoints."],
    ["Admin React page", "Added controls, responsive search, filters, detail fields, warnings and action history."],
    ["Admin stylesheet", "Added layouts for management controls, alerts and audit rows."],
    ["Tests", "Added targeted checks for authorization, required reason, session revocation, duration bounds and audit metadata."],
]
changes = [changes_raw[0]] + [[Paragraph(cell, styles["BodySmall"]) for cell in row] for row in changes_raw[1:]]
ct = Table(changes, colWidths=[43*mm, 130*mm], repeatRows=1)
ct.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f172a")), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#cbd5e1")), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story += [ct, Spacer(1, 12), Paragraph("Verification", styles["Section"])]
verification_raw = [
    ["Check", "Result"],
    ["Backend JavaScript syntax", "Pass"],
    ["Targeted admin/auth/session tests", "10 passed, 0 failed"],
    ["Frontend production build", "Pass - 116 modules transformed"],
    ["Dependency vulnerability audit", "0 vulnerabilities reported during npm install"],
    ["Interactive browser QA", "Not run: browser-control runtime was unavailable in this session"],
]
verification = [verification_raw[0]] + [[Paragraph(cell, styles["BodySmall"]) for cell in row] for row in verification_raw[1:]]
vt = Table(verification, colWidths=[80*mm, 93*mm], repeatRows=1)
vt.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#166534")), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 9),
    ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#cbd5e1")), ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f0fdf4")]),
    ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
]))
story += [vt, Spacer(1, 12), Paragraph("Operational note", styles["Section"]), Paragraph("Manual subscription removal controls application access only. If the customer has a live PhonePe or Razorpay recurring mandate, cancel that mandate through the payment-provider workflow as well. No database migration is required for the new optional user fields; MongoDB will populate them when an action occurs.", styles["Note"])]

def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(17*mm, 9*mm, "Skillomate - Admin User Management Build")
    canvas.drawRightString(A4[0]-17*mm, 9*mm, f"Page {document.page}")
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
