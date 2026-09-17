from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
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
SOURCE = ROOT / "edunex-b" / "reports" / "production-readiness-concise-report-2026-09-02.md"
OUTPUT = ROOT / "output" / "pdf" / "edunex-production-readiness-concise-report-2026-09-02.pdf"


def clean_text(value: str) -> str:
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def inline_markup(value: str) -> str:
    value = html.escape(clean_text(value.strip()))
    value = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


def is_separator_row(line: str) -> bool:
    raw = line.strip().strip("|")
    return bool(raw) and all(re.fullmatch(r"\s*:?-{3,}:?\s*", part) for part in raw.split("|"))


def split_table_row(line: str) -> list[str]:
    return [part.strip() for part in line.strip().strip("|").split("|")]


def table_cell(value: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(inline_markup(value), style)


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=27,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"),
            spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13.5,
            leading=17,
            textColor=colors.HexColor("#12355b"),
            spaceBefore=11,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=13,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=7,
        ),
        "verdict": ParagraphStyle(
            "Verdict",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#7f1d1d"),
            backColor=colors.HexColor("#fee2e2"),
            borderColor=colors.HexColor("#fecaca"),
            borderWidth=0.7,
            borderPadding=7,
            spaceAfter=9,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.9,
            leading=12.5,
            textColor=colors.HexColor("#1f2937"),
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.0,
            leading=8.6,
            textColor=colors.white,
            alignment=TA_LEFT,
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=6.9,
            leading=8.5,
            textColor=colors.HexColor("#1f2937"),
            alignment=TA_LEFT,
        ),
    }


def build_table(rows: list[list[str]], styles: dict[str, ParagraphStyle], width: float) -> Table:
    data = [[table_cell(cell, styles["table_header"]) for cell in rows[0]]]
    data.extend([[table_cell(cell, styles["table_body"]) for cell in row] for row in rows[1:]])
    col_widths = [width * 0.25, width * 0.12, width * 0.63]
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18243a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    return table


def parse_markdown(markdown: str, styles: dict[str, ParagraphStyle], available_width: float):
    story = []
    lines = clean_text(markdown).splitlines()
    index = 0
    after_verdict_heading = False

    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            index += 1
            continue

        if stripped.startswith("# "):
            story.append(Paragraph(inline_markup(stripped[2:]), styles["title"]))
            story.append(Paragraph("Concise production-readiness evaluation", styles["subtitle"]))
            index += 1
            continue

        if stripped.startswith("## "):
            heading = stripped[3:]
            if heading in {"Production Blockers", "Fixed Blockers"}:
                story.append(PageBreak())
            story.append(Paragraph(inline_markup(heading), styles["h2"]))
            after_verdict_heading = heading == "Verdict"
            index += 1
            continue

        if stripped.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                if not is_separator_row(lines[index]):
                    rows.append(split_table_row(lines[index]))
                index += 1
            if len(rows) >= 2:
                story.append(build_table(rows, styles, available_width))
                story.append(Spacer(1, 8))
            continue

        numbered = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if numbered:
            number, text = numbered.groups()
            story.append(Paragraph(f"<b>{number}.</b>&nbsp;&nbsp;{inline_markup(text)}", styles["body"]))
            index += 1
            continue

        if stripped.startswith("- "):
            items = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                items.append(ListItem(Paragraph(inline_markup(lines[index].strip()[2:]), styles["bullet"]), leftIndent=12))
                index += 1
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=14, bulletFontSize=7, spaceAfter=7))
            continue

        style = styles["verdict"] if after_verdict_heading and "Not production-ready yet" in stripped else styles["body"]
        story.append(Paragraph(inline_markup(stripped), style))
        after_verdict_heading = False
        index += 1

    return story


def draw_header_footer(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0f172a"))
    canvas.rect(0, height - 0.36 * inch, width, 0.36 * inch, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(doc.leftMargin, height - 0.23 * inch, "EduNex Production Readiness Report")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, height - 0.23 * inch, "2026-09-02")
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, 0.38 * inch, f"Page {doc.page}")
    canvas.restoreState()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    markdown = SOURCE.read_text(encoding="utf-8")
    margins = {
        "leftMargin": 0.58 * inch,
        "rightMargin": 0.58 * inch,
        "topMargin": 0.68 * inch,
        "bottomMargin": 0.58 * inch,
    }
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, **margins)
    story = parse_markdown(
        markdown,
        make_styles(),
        A4[0] - margins["leftMargin"] - margins["rightMargin"],
    )
    doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
