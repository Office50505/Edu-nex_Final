from __future__ import annotations

import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "skillomate-api-incident-diagnosis-and-fixes-2026-09-21.pdf"

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#64748B")
GOLD = colors.HexColor("#D49420")
GOLD_LIGHT = colors.HexColor("#FFF7E6")
NAVY = colors.HexColor("#172033")
RED = colors.HexColor("#B42318")
RED_LIGHT = colors.HexColor("#FEF3F2")
GREEN = colors.HexColor("#067647")
GREEN_LIGHT = colors.HexColor("#ECFDF3")
BLUE = colors.HexColor("#175CD3")
BLUE_LIGHT = colors.HexColor("#EFF8FF")
LINE = colors.HexColor("#D0D5DD")
SOFT = colors.HexColor("#F8FAFC")
WHITE = colors.white


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=MUTED,
            spaceAfter=14,
        ),
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=GOLD,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=21,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=8,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.2,
            leading=15,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.1,
            leading=13.2,
            textColor=INK,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10.4,
            textColor=MUTED,
            spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.8,
            leading=12.4,
            textColor=INK,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.2,
            leading=14.2,
            textColor=RED,
            backColor=RED_LIGHT,
            borderColor=colors.HexColor("#FDA29B"),
            borderWidth=0.8,
            borderPadding=8,
            spaceAfter=10,
        ),
        "safe": ParagraphStyle(
            "Safe",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=13,
            textColor=GREEN,
            backColor=GREEN_LIGHT,
            borderColor=colors.HexColor("#ABEFC6"),
            borderWidth=0.7,
            borderPadding=7,
            spaceAfter=8,
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=9.6,
            textColor=WHITE,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10.1,
            textColor=INK,
        ),
        "table_bold": ParagraphStyle(
            "TableBold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10.1,
            textColor=INK,
        ),
        "metric": ParagraphStyle(
            "Metric",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=15,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabel",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.1,
            leading=9,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.2,
            leading=9.6,
            textColor=colors.HexColor("#E5E7EB"),
            backColor=colors.HexColor("#101828"),
            borderColor=colors.HexColor("#344054"),
            borderWidth=0.5,
            borderPadding=7,
            spaceBefore=4,
            spaceAfter=7,
        ),
        "reference": ParagraphStyle(
            "Reference",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=10,
            textColor=MUTED,
            leftIndent=8,
            firstLineIndent=-8,
            spaceAfter=4,
        ),
    }


S = styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, S[style])


def code_box(text: str) -> Table:
    escaped = html.escape(text).replace(" ", "&nbsp;").replace("\n", "<br/>")
    code_style = ParagraphStyle(
        "CodeBox",
        parent=S["small"],
        fontName="Courier",
        fontSize=7.1,
        leading=9.4,
        textColor=colors.HexColor("#F2F4F7"),
        spaceAfter=0,
    )
    table = Table([[Paragraph(escaped, code_style)]], colWidths=[171 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#101828")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#475467")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def bullets(items: list[str], level: int = 0) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, "bullet"), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14 + level * 10,
        bulletFontName="Helvetica",
        bulletFontSize=6,
        bulletColor=GOLD,
        spaceAfter=6,
    )


def styled_table(
    rows: list[list[object]],
    widths: list[float],
    header: bool = True,
    row_backgrounds: bool = True,
    paddings: tuple[int, int] = (5, 5),
) -> Table:
    converted: list[list[object]] = []
    for row_index, row in enumerate(rows):
        row_style = "table_head" if header and row_index == 0 else "table_body"
        converted.append([
            cell if not isinstance(cell, str) else p(cell, row_style)
            for cell in row
        ])
    table = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), paddings[0]),
        ("RIGHTPADDING", (0, 0), (-1, -1), paddings[0]),
        ("TOPPADDING", (0, 0), (-1, -1), paddings[1]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), paddings[1]),
    ]
    if header:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
    if row_backgrounds:
        commands.append(("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [WHITE, SOFT]))
    table.setStyle(TableStyle(commands))
    return table


def metric_cards() -> Table:
    cards = [
        ("72m 53s", "Elapsed before safe abort"),
        ("500", "Maximum virtual users"),
        ("385,652", "Homepage requests"),
        ("0.0013%", "Request failure rate"),
        ("278 ms", "Homepage p95 latency"),
    ]
    data = [[p(value, "metric") for value, _ in cards], [p(label, "metric_label") for _, label in cards]]
    table = Table(data, colWidths=[34.2 * mm] * 5, rowHeights=[10 * mm, 10 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def architecture_flow() -> Table:
    labels = [
        p("Browser", "table_bold"),
        p("CloudFront", "table_bold"),
        p("ALB", "table_bold"),
        p("Nginx :80", "table_bold"),
        p("Node :3000", "table_bold"),
    ]
    arrows = [p("->", "table_bold") for _ in range(4)]
    cells: list[object] = []
    for index, label in enumerate(labels):
        cells.append(label)
        if index < len(arrows):
            cells.append(arrows[index])
    table = Table([cells], colWidths=[28 * mm, 7 * mm, 31 * mm, 7 * mm, 22 * mm, 7 * mm, 28 * mm, 7 * mm, 29 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), BLUE_LIGHT),
        ("BACKGROUND", (2, 0), (2, 0), BLUE_LIGHT),
        ("BACKGROUND", (4, 0), (4, 0), GOLD_LIGHT),
        ("BACKGROUND", (6, 0), (6, 0), GOLD_LIGHT),
        ("BACKGROUND", (8, 0), (8, 0), RED_LIGHT),
        ("BOX", (0, 0), (0, 0), 0.5, colors.HexColor("#B2DDFF")),
        ("BOX", (2, 0), (2, 0), 0.5, colors.HexColor("#B2DDFF")),
        ("BOX", (4, 0), (4, 0), 0.5, colors.HexColor("#FEDF89")),
        ("BOX", (6, 0), (6, 0), 0.5, colors.HexColor("#FEDF89")),
        ("BOX", (8, 0), (8, 0), 0.5, colors.HexColor("#FDA29B")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def header_footer(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0B0B0B"))
    canvas.rect(0, height - 11 * mm, width, 11 * mm, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 11.8 * mm, width, 0.8 * mm, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8.3)
    canvas.drawString(doc.leftMargin, height - 7.1 * mm, "SKILLOMATE | API INCIDENT REPORT")
    canvas.setFont("Helvetica", 7.6)
    canvas.drawRightString(width - doc.rightMargin, height - 7.1 * mm, "21 September 2026")
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 12 * mm, width - doc.rightMargin, 12 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawString(doc.leftMargin, 7.4 * mm, "Production incident diagnosis and recovery plan")
    canvas.drawRightString(width - doc.rightMargin, 7.4 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_story() -> list[object]:
    story: list[object] = []

    story.extend([
        Spacer(1, 3 * mm),
        p("PRODUCTION INCIDENT", "eyebrow"),
        p("Skillomate API Failure:<br/>Diagnosis and Fix Plan", "title"),
        p(
            "Evidence-based assessment of the CloudFront 504 errors, failed login, backend access issue, "
            "partial soak-test results, and prioritized recovery actions.",
            "subtitle",
        ),
        p(
            "CONFIRMED: The static website is available, but CloudFront cannot obtain a response from the API origin. "
            "Login fails because its API request follows the failing origin path.",
            "callout",
        ),
        metric_cards(),
        Spacer(1, 5 * mm),
        p("1. Executive finding", "h1"),
        p(
            "The public page shell and the application API are on different delivery paths. A probe to "
            "<font name='Courier'>https://skillomate.in/</font> returned HTTP 200 from CloudFront/S3, while "
            "<font name='Courier'>https://skillomate.in/api/health</font> returned HTTP 504 after 30.79 seconds with "
            "<font name='Courier'>x-cache: Error from cloudfront</font>. This is why the page can appear while login, "
            "course data, dashboard data, and other API-backed features fail.",
        ),
        p(
            "The exact failing sub-layer is not yet proven because the target-group health page and an EC2 shell "
            "were not available. The evidence narrows the problem to the API origin path: CloudFront behavior/origin, "
            "ALB target availability, Nginx on port 80, or Node on port 3000.",
        ),
        Spacer(1, 2 * mm),
        architecture_flow(),
        Spacer(1, 4 * mm),
        p("Failure boundary", "h2"),
        styled_table([
            ["Layer", "Observed result", "Meaning"],
            ["Static page shell", "HTTP 200 in 0.78 s", "CloudFront/S3 remained available."],
            ["API health path", "HTTP 504 in 30.79 s", "CloudFront did not receive an origin response in time."],
            ["Login", "Could not sign in", "The browser could not complete the API authentication request."],
            ["EC2 platform checks", "3/3 checks passed in screenshot", "The VM platform is running; this does not prove the application is healthy."],
            ["EC2 Instance Connect", "SSH connection failed", "Browser-based SSH source is not currently allowed or the SSH path is unavailable."],
        ], [32 * mm, 46 * mm, 93 * mm]),
        Spacer(1, 4 * mm),
        p("Why this is not yet a database diagnosis", "h2"),
        p(
            "The repository implementation of <font name='Courier'>GET /api/health</font> returns process uptime and "
            "cache status immediately and does not execute a MongoDB query. Therefore, a 30-second timeout on this "
            "route points first to origin reachability, ALB/Nginx routing, or an unavailable/hung Node process. "
            "Database health still matters to the application, but it is not the first explanation for this specific probe.",
        ),
    ])

    story.append(PageBreak())
    story.extend([
        p("2. Evidence and likely causes", "h1"),
        p("Confirmed evidence", "h2"),
        bullets([
            "CloudFront served the cached/static homepage successfully.",
            "CloudFront returned a 504 Gateway Timeout for <font name='Courier'>/api/health</font> after approximately 30 seconds.",
            "A second read-only API probe, <font name='Courier'>/api/courses</font>, also produced no response within the client timeout.",
            "The production login screen displayed a sign-in failure consistent with an unavailable API.",
            "The EC2 security-group screenshot shows ALB-to-instance traffic allowed on TCP port 80 from a security-group source.",
            "The same screenshot shows SSH port 22 restricted to one client IPv4 address, not the EC2 Instance Connect regional prefix list.",
        ]),
        p("Cause assessment", "h2"),
        styled_table([
            ["Confidence", "Candidate cause", "Why it fits", "How to prove or reject"],
            ["High", "ALB has no healthy backend targets", "A distribution-wide API timeout is expected when the origin has no responsive targets.", "Open Target Groups > Targets and read each health reason."],
            ["High", "Nginx on port 80 is stopped, hung, or misconfigured", "The instance security group and likely target group use port 80.", "On EC2: curl localhost on port 80; inspect Nginx status and logs."],
            ["High", "Node process on port 3000 is stopped or hung", "Nginx can accept traffic but cannot proxy to the application.", "On EC2: curl localhost:3000/api/health; inspect process and service logs."],
            ["Medium", "ALB listener, target port, SG, or NACL mismatch", "Network policy can block the origin even while EC2 platform checks pass.", "Verify listener rule, target port 80, SG references, subnet routes, and NACLs."],
            ["Medium", "CloudFront /api behavior points to the wrong origin/protocol", "Static and API paths use different origins or behaviors.", "Verify /api/* behavior, origin domain, origin protocol, allowed methods, and headers."],
            ["Low for this probe", "Slow MongoDB query", "/api/health does not query MongoDB.", "Test /api/health locally before testing /api/health/db."],
        ], [21 * mm, 43 * mm, 58 * mm, 49 * mm]),
        Spacer(1, 4 * mm),
        p("Load-test causation statement", "h2"),
        p(
            "The homepage soak and the API outage occurred during the same period, but causation is not established. "
            "The k6 scenario requested only <font name='Courier'>GET /</font>, and the pre-test response showed a "
            "CloudFront cache hit from an S3 origin. It did not intentionally exercise <font name='Courier'>/api/*</font>. "
            "At the first report of production impact, the test was interrupted and all generated traffic stopped.",
        ),
        p(
            "Safe handling: no further production load test should start until the API health route, target health, "
            "alarms, and abort thresholds are verified.",
            "safe",
        ),
        p("Partial soak-test record", "h2"),
        styled_table([
            ["Metric", "Recorded value", "Interpretation"],
            ["Scenario", "Public homepage GET only", "Measured CDN/static delivery, not authenticated backend capacity."],
            ["Elapsed", "4,372.9 s (72m 53s)", "Stopped early for production safety."],
            ["Maximum VUs", "500", "Configured concurrency ceiling."],
            ["Requests", "385,652", "Approximately 88.2 requests/second over the partial run."],
            ["Failed requests", "5 (0.0013%)", "Low error rate for the static homepage path."],
            ["Latency", "p50 260.6 ms; p95 278.0 ms; p99 850.9 ms", "Core latency remained stable; isolated timeouts reached 15.1 s."],
        ], [38 * mm, 58 * mm, 75 * mm]),
    ])

    story.extend([
        p("3. Immediate recovery runbook", "h1"),
        p(
            "Follow these steps in order. Capture evidence before restarting services. If three targets exist, diagnose "
            "one target first, verify it, and then apply the same correction to the others.",
        ),
        p("Step 1 - Inspect target health without SSH", "h2"),
        bullets([
            "AWS Console > EC2 > Target Groups > select the Skillomate target group > Targets.",
            "Record HealthyHostCount and each target's health status and reason.",
            "Confirm the target-group traffic port is 80 and the health-check path is <font name='Courier'>/api/health</font>.",
            "If every target is unhealthy, the CloudFront 504 is expected until at least one target recovers.",
        ]),
        p("Step 2 - Obtain safe instance access", "h2"),
        p(
            "The existing port 22 rule is scoped to one public IPv4 address, so direct SSH from that address can work "
            "with the correct key. Browser-based EC2 Instance Connect requires the regional managed prefix list "
            "<font name='Courier'>com.amazonaws.ap-south-1.ec2-instance-connect</font> or a correctly configured Instance "
            "Connect Endpoint. Do not open SSH to the world. Remove temporary access after recovery.",
        ),
        p("Step 3 - Test each local layer", "h2"),
        code_box(
            "hostname\n"
            "curl -i --max-time 3 http://127.0.0.1/api/health\n"
            "curl -i --max-time 3 http://127.0.0.1:3000/api/health\n"
            "sudo ss -ltnp | grep -E ':(80|3000)'\n"
            "sudo systemctl status nginx --no-pager\n"
            "sudo nginx -t\n"
            "ps aux | grep -E '[n]ode|[p]m2'\n"
            "sudo systemctl --no-pager --type=service --all | grep -Ei 'skillomate|node|pm2'\n"
            "sudo docker ps"
        ),
        p("Step 4 - Interpret the result", "h2"),
        styled_table([
            ["Port 80", "Port 3000", "Diagnosis", "Fix direction"],
            ["Fails", "Fails", "Application process is down/hung, or the host is unhealthy.", "Capture application logs; identify and restart the actual service; verify memory/disk/CPU."],
            ["Fails", "Works", "Node works; Nginx or local firewall is failing.", "Validate Nginx config, upstream address, service status, and error log; reload only after nginx -t passes."],
            ["Works", "Works", "Instance stack works locally.", "Inspect ALB target health, SG references, listener/target port, NACL, and CloudFront origin behavior."],
            ["Works", "Fails", "Port 80 may serve a different/default site or cached response.", "Inspect Nginx upstream and confirm /api routes actually proxy to Node."],
        ], [24 * mm, 27 * mm, 57 * mm, 63 * mm]),
        Spacer(1, 4 * mm),
        p("Step 5 - Inspect logs before service changes", "h2"),
        code_box(
            "sudo journalctl -u nginx --since '60 minutes ago' --no-pager | tail -200\n"
            "sudo tail -200 /var/log/nginx/error.log\n"
            "# Replace <service> only after identifying the real application unit:\n"
            "sudo journalctl -u <service> --since '60 minutes ago' --no-pager | tail -300"
        ),
        p(
            "After logs are captured, restart or reload only the component proven unhealthy. Do not guess a service "
            "name, do not reboot all three instances simultaneously, and do not expose port 3000 publicly.",
            "callout",
        ),
    ])

    story.append(PageBreak())
    story.extend([
        p("4. Configuration fixes", "h1"),
        p("Security groups", "h2"),
        styled_table([
            ["Resource", "Inbound rule", "Recommended source"],
            ["Application Load Balancer", "HTTPS 443 (and HTTP 80 only if redirecting)", "CloudFront-controlled access, approved clients, or the intended public policy."],
            ["Backend instances", "TCP 80", "ALB security group only."],
            ["Backend instances", "SSH 22", "Administrator IP /32, SSM, or the ap-south-1 EC2 Instance Connect prefix list."],
            ["Backend instances", "TCP 3000", "No public rule. Keep private behind Nginx on the same host."],
        ], [43 * mm, 48 * mm, 80 * mm]),
        p("ALB and health checks", "h2"),
        bullets([
            "Use <font name='Courier'>/api/health</font> as the lightweight target health-check path and expect HTTP 200.",
            "Verify target-group port 80 matches the instance security-group rule and Nginx listener.",
            "Verify all three availability zones are enabled on the ALB and targets are registered in the correct group.",
            "Alarm when HealthyHostCount drops below 2 and page immediately when it reaches 0.",
            "Track TargetResponseTime, HTTPCode_ELB_5XX_Count, HTTPCode_Target_5XX_Count, rejected connections, and active connections.",
        ]),
        p("CloudFront /api behavior", "h2"),
        bullets([
            "Route <font name='Courier'>/api/*</font> to the ALB origin, not the S3 frontend origin.",
            "Use the correct origin protocol and port; confirm the ALB certificate and origin hostname agree when HTTPS is used.",
            "Disable caching for authentication and personalized APIs; forward required Authorization headers, cookies, query strings, and all required HTTP methods.",
            "Do not treat a longer origin timeout as the primary fix. Restore origin reachability and application responsiveness first.",
        ]),
        p("Process supervision and availability", "h2"),
        bullets([
            "Run Node under a defined systemd unit, PM2, or a container supervisor with automatic restart and bounded retry behavior.",
            "Send application and Nginx logs to CloudWatch with retention and searchable request IDs.",
            "Add graceful shutdown and readiness handling so deployments drain connections before replacing processes.",
            "Use rolling replacement across the three targets; keep at least two healthy during normal deployments.",
            "Install the CloudWatch agent for memory and disk metrics, and alarm on sustained CPU, low memory, low disk, and Node restarts.",
        ]),
        p("T4g operational guardrails", "h2"),
        p(
            "The three backend instances are burstable <font name='Courier'>t4g.small</font> hosts. Monitor "
            "<font name='Courier'>CPUCreditBalance</font>, <font name='Courier'>CPUSurplusCreditBalance</font>, and "
            "<font name='Courier'>CPUSurplusCreditsCharged</font>. A two-hour test can expose credit-related behavior "
            "that a short spike misses. If sustained CPU regularly exceeds the burstable baseline, move to an "
            "appropriately sized non-burstable or larger instance class after measuring the workload.",
        ),
    ])

    story.append(PageBreak())
    story.extend([
        p("5. Verification and safe retest plan", "h1"),
        p("Recovery acceptance checks", "h2"),
        styled_table([
            ["Check", "Pass condition"],
            ["Instance-local Node health", "Each target returns HTTP 200 from 127.0.0.1:3000/api/health in under 500 ms."],
            ["Instance-local Nginx health", "Each target returns HTTP 200 from 127.0.0.1/api/health in under 500 ms."],
            ["ALB health", "All intended targets are healthy; HealthyHostCount is stable."],
            ["Public API", "https://skillomate.in/api/health returns HTTP 200 repeatedly without CloudFront errors."],
            ["User flow", "Login completes and authenticated dashboard/course requests succeed."],
            ["Observability", "ALB, EC2, CPU-credit, memory, Node restart, and 5xx alarms are active."],
        ], [61 * mm, 110 * mm]),
        p("Staged backend validation", "h2"),
        p(
            "Do not resume the two-hour 500-user homepage-only soak as a capacity test. After recovery, run a separate "
            "read-only API scenario from an external generator and increase load only after each stage passes.",
        ),
        styled_table([
            ["Stage", "VUs", "Duration", "Required outcome"],
            ["Smoke", "10", "2 min", "0 errors; all targets remain healthy."],
            ["Baseline", "50", "5 min", "Error rate <0.1%; API p95 <500 ms."],
            ["Step 1", "100", "10 min", "No target churn; stable CPU/memory/DB pools."],
            ["Step 2", "250", "10 min", "Thresholds still pass; CPU credits remain understood."],
            ["Step 3", "500", "15 min", "Only proceed if previous stages pass and alarms are quiet."],
            ["Soak", "Validated peak", "2 hr", "No memory growth, credit exhaustion, pool exhaustion, or latency drift."],
        ], [38 * mm, 22 * mm, 30 * mm, 81 * mm]),
        p("Abort conditions", "h2"),
        bullets([
            "Stop immediately if users report impact, HealthyHostCount falls, or any target becomes repeatedly unhealthy.",
            "Stop if the API failure rate exceeds 1% for two minutes or p95 exceeds 2 seconds for five minutes.",
            "Stop if CPU exceeds 80% for five minutes, memory exceeds 85%, CPU credits approach exhaustion, or database pools saturate.",
            "Keep load-generator metrics separate from server metrics and timestamp every incident marker.",
        ]),
        p("Capacity statement after this incident", "h2"),
        p(
            "The partial test validates only that the CDN/static homepage path sustained 500 virtual users until the "
            "safe abort. It does not certify the three EC2 backends for 500 concurrent application users. Backend "
            "capacity remains unverified until the API origin is restored and the staged API test passes with server-side metrics.",
            "callout",
        ),
        p("6. References", "h2"),
        p(
            "[1] <link href='https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-504-gateway-timeout.html'>"
            "AWS CloudFront: HTTP 504 status code (Gateway Timeout)</link>",
            "reference",
        ),
        p(
            "[2] <link href='https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-tutorial.html'>"
            "AWS EC2: Configure EC2 Instance Connect</link>",
            "reference",
        ),
        p(
            "[3] <link href='https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html'>"
            "AWS EC2: Burstable instance CPU-credit concepts</link>",
            "reference",
        ),
        p(
            "[4] Local application evidence: edunex-b/server.js, /api/health implementation near line 670.",
            "reference",
        ),
        p(
            "[5] Partial run artifacts: tmp/load-tests/skillomate-soak-summary.json and "
            "tmp/load-tests/skillomate-latency-timeseries.csv.",
            "reference",
        ),
    ])

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=19 * mm,
        bottomMargin=18 * mm,
        title="Skillomate API Incident Diagnosis and Fix Plan",
        author="OpenAI Codex",
        subject="Production API outage, CloudFront 504 diagnosis, and prioritized fixes",
    )
    document.build(build_story(), onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
