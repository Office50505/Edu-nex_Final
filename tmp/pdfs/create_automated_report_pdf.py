from __future__ import annotations

import html
import os
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
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
SOURCE = ROOT / "edunex-b" / "reports" / "automated-testing-security-report-2026-09-02.md"
OUTPUT = ROOT / "output" / "pdf" / "edunex-automated-testing-security-report-2026-09-02.pdf"


def clean_text(value: str) -> str:
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u20b9": "INR ",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def inline_markup(value: str) -> str:
    value = clean_text(value.strip())
    value = html.escape(value)
    value = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


def table_cell(value: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(inline_markup(value), style)


def is_separator_row(line: str) -> bool:
    raw = line.strip().strip("|")
    return bool(raw) and all(re.fullmatch(r"\s*:?-{3,}:?\s*", part) for part in raw.split("|"))


def split_table_row(line: str) -> list[str]:
    return [part.strip() for part in line.strip().strip("|").split("|")]


def column_widths(rows: list[list[str]], available_width: float) -> list[float]:
    columns = len(rows[0])
    max_lengths = [1] * columns
    for row in rows:
        for index, cell in enumerate(row):
            max_lengths[index] = max(max_lengths[index], min(len(cell), 42))
    total = sum(max_lengths)
    widths = [available_width * length / total for length in max_lengths]
    minimum = 0.55 * inch
    widths = [max(minimum, width) for width in widths]
    scale = available_width / sum(widths)
    return [width * scale for width in widths]


def build_table(rows: list[list[str]], styles: dict[str, ParagraphStyle], available_width: float) -> Table:
    header, *body = rows
    data = [
        [table_cell(cell, styles["table_header"]) for cell in header],
        *[[table_cell(cell, styles["table_body"]) for cell in row] for row in body],
    ]
    table = Table(data, colWidths=column_widths(rows, available_width), repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#18243a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.2),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    return table


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleCustom",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#102033"),
            spaceAfter=12,
        ),
        "subtitle": ParagraphStyle(
            "SubtitleCustom",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"),
            spaceAfter=20,
        ),
        "h2": ParagraphStyle(
            "Heading2Custom",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#12355b"),
            spaceBefore=14,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "Heading3Custom",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#334155"),
            spaceBefore=10,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "BodyCustom",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=13.2,
            textColor=colors.HexColor("#1f2937"),
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "BulletCustom",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.1,
            leading=12.7,
            textColor=colors.HexColor("#1f2937"),
        ),
        "code": ParagraphStyle(
            "CodeCustom",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=10,
            backColor=colors.HexColor("#f1f5f9"),
            borderColor=colors.HexColor("#dbe4ef"),
            borderWidth=0.5,
            borderPadding=6,
            leftIndent=2,
            rightIndent=2,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "table_header": ParagraphStyle(
            "TableHeaderCustom",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9,
            textColor=colors.white,
            alignment=TA_LEFT,
        ),
        "table_body": ParagraphStyle(
            "TableBodyCustom",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.1,
            leading=8.6,
            textColor=colors.HexColor("#1f2937"),
        ),
    }


def parse_markdown(markdown: str, styles: dict[str, ParagraphStyle], available_width: float):
    story = []
    lines = clean_text(markdown).splitlines()
    index = 0
    in_code = False
    code_lines: list[str] = []

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                story.append(Paragraph(html.escape("\n".join(code_lines)), styles["code"]))
                code_lines = []
                in_code = False
            else:
                in_code = True
            index += 1
            continue

        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if not stripped:
            index += 1
            continue

        if stripped.startswith("|"):
            table_rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                if not is_separator_row(lines[index]):
                    table_rows.append(split_table_row(lines[index]))
                index += 1
            if len(table_rows) >= 2:
                story.append(build_table(table_rows, styles, available_width))
                story.append(Spacer(1, 8))
            continue

        if stripped.startswith("# "):
            story.append(Paragraph(inline_markup(stripped[2:]), styles["title"]))
            story.append(Paragraph("Automated testing and security summary", styles["subtitle"]))
            index += 1
            continue

        if stripped.startswith("## "):
            heading = stripped[3:]
            if heading in {"Dependency Audit", "Main Findings", "Recommended Next Fix Order"}:
                story.append(PageBreak())
            story.append(Paragraph(inline_markup(heading), styles["h2"]))
            index += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), styles["h3"]))
            index += 1
            continue

        if stripped.startswith("- "):
            items = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                item_text = lines[index].strip()[2:]
                items.append(ListItem(Paragraph(inline_markup(item_text), styles["bullet"]), leftIndent=12))
                index += 1
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=14, bulletFontSize=7, spaceAfter=7))
            continue

        numbered_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if numbered_match:
            items = []
            while index < len(lines):
                match = re.match(r"^(\d+)\.\s+(.*)$", lines[index].strip())
                if not match:
                    break
                items.append(ListItem(Paragraph(inline_markup(match.group(2)), styles["bullet"]), leftIndent=14))
                index += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=16, bulletFontSize=8, spaceAfter=7))
            continue

        story.append(Paragraph(inline_markup(stripped), styles["body"]))
        index += 1

    return story


def draw_header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(colors.HexColor("#0f172a"))
    canvas.rect(0, height - 0.36 * inch, width, 0.36 * inch, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(doc.leftMargin, height - 0.23 * inch, "EduNex Automated Testing And Security Report")
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
    styles = make_styles()
    story = parse_markdown(markdown, styles, A4[0] - margins["leftMargin"] - margins["rightMargin"])
    doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
