from __future__ import annotations

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
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "AcademicRadar_Backend_Lab_Report.tex"
OUTPUT = ROOT / "AcademicRadar_Backend_Lab_Report.pdf"


LATEX_INLINE_REPLACEMENTS = [
    (re.compile(r"\\textbf\{([^{}]*)\}"), r"\1"),
    (re.compile(r"\\textit\{([^{}]*)\}"), r"\1"),
    (re.compile(r"\\texttt\{([^{}]*)\}"), r"\1"),
    (re.compile(r"\\url\{([^{}]*)\}"), r"\1"),
]


SECTION_RE = re.compile(r"^\\section\{(.+?)\}$")
SUBSECTION_RE = re.compile(r"^\\subsection\{(.+?)\}$")
FIGURE_RE = re.compile(r"^\\figplaceholder\{(.+?)\}\{(.+?)\}$")
ITEM_RE = re.compile(r"^\\item(?:\s+)?(.*)$")
BEGIN_LIST_RE = re.compile(r"^\\begin\{(itemize|enumerate)\}")
END_LIST_RE = re.compile(r"^\\end\{(itemize|enumerate)\}")
BEGIN_CODE_RE = re.compile(r"^\\begin\{lstlisting\}")
END_CODE_RE = re.compile(r"^\\end\{lstlisting\}")
BEGIN_TABULAR_RE = re.compile(r"^\\begin\{(tabular|longtable)\}")
END_TABULAR_RE = re.compile(r"^\\end\{(tabular|longtable)\}")
BEGIN_TABLE_RE = re.compile(r"^\\begin\{table\}")
END_TABLE_RE = re.compile(r"^\\end\{table\}")
CAPTION_RE = re.compile(r"^\\caption\{(.+?)\}(?:\\\\)?$")


class ParseState:
    def __init__(self) -> None:
        self.blocks: list[tuple[str, object]] = []
        self.toc_entries: list[tuple[int, str]] = []
        self.in_document = False
        self.in_titlepage = False
        self.in_code = False
        self.code_lines: list[str] = []
        self.list_mode: str | None = None
        self.list_items: list[str] = []
        self.paragraph_lines: list[str] = []
        self.table_mode: str | None = None
        self.table_rows: list[list[str]] = []
        self.table_caption: str | None = None
        self.table_skip_repeated_header = False

    def flush_paragraph(self) -> None:
        if not self.paragraph_lines:
            return
        text = clean_inline(" ".join(line.strip() for line in self.paragraph_lines if line.strip()))
        if text:
            self.blocks.append(("paragraph", text))
        self.paragraph_lines = []

    def flush_list(self) -> None:
        if not self.list_items:
            return
        self.blocks.append(("list", {"kind": self.list_mode or "itemize", "items": self.list_items.copy()}))
        self.list_items = []
        self.list_mode = None

    def flush_code(self) -> None:
        if not self.code_lines:
            return
        self.blocks.append(("code", "\n".join(self.code_lines)))
        self.code_lines = []
        self.in_code = False

    def flush_table(self) -> None:
        if not self.table_rows:
            self.table_mode = None
            self.table_caption = None
            self.table_skip_repeated_header = False
            return
        self.blocks.append(
            (
                "table",
                {
                    "rows": self.table_rows.copy(),
                    "caption": self.table_caption,
                },
            )
        )
        self.table_rows = []
        self.table_mode = None
        self.table_caption = None
        self.table_skip_repeated_header = False


def escape_xml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def clean_inline(text: str) -> str:
    text = text.replace(r"\%", "%")
    text = text.replace(r"\&", "&")
    text = text.replace(r"\_", "_")
    text = text.replace(r"\#", "#")
    text = text.replace(r"\$", "$")
    text = text.replace(r"\{", "{")
    text = text.replace(r"\}", "}")
    text = text.replace(r"\textbackslash{}", "\\")

    for pattern, replacement in LATEX_INLINE_REPLACEMENTS:
        text = pattern.sub(replacement, text)

    # Remove common one-word LaTeX commands that are not part of content.
    text = re.sub(r"\\[a-zA-Z@]+(?:\[[^\]]*\])?(?:\{[^{}]*\})*", "", text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_braced_content(line: str) -> str:
    start = line.find("{")
    end = line.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return ""
    return line[start + 1 : end]


def split_table_row(line: str) -> list[str]:
    row = line.strip()
    row = row.rstrip("\\").strip()
    row = row.replace(r"\toprule", "").replace(r"\midrule", "").replace(r"\bottomrule", "")
    cells = re.split(r"(?<!\\)&", row)
    cleaned = [clean_inline(cell.strip()) for cell in cells]
    return [cell for cell in cleaned if cell]


def parse_document(source_text: str) -> tuple[list[tuple[str, object]], list[tuple[int, str]]]:
    state = ParseState()
    lines = source_text.splitlines()

    for raw_line in lines:
        line = raw_line.rstrip("\n")
        stripped = line.strip()

        if not state.in_document:
            if stripped == r"\begin{document}":
                state.in_document = True
            continue

        if stripped == r"\end{document}":
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            break

        if state.in_titlepage:
            if stripped == r"\end{titlepage}":
                state.in_titlepage = False
            continue

        if stripped == r"\begin{titlepage}":
            state.in_titlepage = True
            continue

        if stripped == r"\tableofcontents":
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            state.blocks.append(("toc", None))
            continue

        if stripped == r"\newpage":
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            state.blocks.append(("pagebreak", None))
            continue

        match = SECTION_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            title = clean_inline(match.group(1))
            state.toc_entries.append((1, title))
            state.blocks.append(("section", title))
            continue

        match = SUBSECTION_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            title = clean_inline(match.group(1))
            state.toc_entries.append((2, title))
            state.blocks.append(("subsection", title))
            continue

        match = FIGURE_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            state.blocks.append(
                (
                    "figure",
                    {
                        "title": clean_inline(match.group(1)),
                        "note": clean_inline(match.group(2)),
                    },
                )
            )
            continue

        match = BEGIN_CODE_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_table()
            state.in_code = True
            state.code_lines = []
            continue

        match = END_CODE_RE.match(stripped)
        if match:
            state.flush_code()
            continue

        if state.in_code:
            state.code_lines.append(line)
            continue

        match = BEGIN_LIST_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_code()
            state.flush_table()
            state.list_mode = match.group(1)
            state.list_items = []
            continue

        match = END_LIST_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_code()
            state.flush_table()
            state.flush_list()
            continue

        if state.list_mode:
            match = ITEM_RE.match(stripped)
            if match:
                state.list_items.append(clean_inline(match.group(1)))
            continue

        match = BEGIN_TABLE_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            continue

        match = END_TABLE_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.flush_table()
            continue

        match = BEGIN_TABULAR_RE.match(stripped)
        if match:
            state.flush_paragraph()
            state.flush_list()
            state.flush_code()
            state.table_mode = match.group(1)
            state.table_rows = []
            state.table_caption = None
            state.table_skip_repeated_header = False
            continue

        match = CAPTION_RE.match(stripped)
        if match and state.table_mode:
            state.table_caption = clean_inline(match.group(1))
            continue

        if state.table_mode:
            if stripped == r"\endfirsthead":
                state.table_skip_repeated_header = True
                continue
            if stripped == r"\endhead":
                state.table_skip_repeated_header = False
                continue
            if stripped.startswith(r"\toprule") or stripped.startswith(r"\midrule") or stripped.startswith(r"\bottomrule"):
                continue
            if not stripped:
                continue
            if state.table_skip_repeated_header:
                continue
            if "&" in line:
                row = split_table_row(line)
                if row:
                    state.table_rows.append(row)
            continue

        if not stripped:
            state.flush_paragraph()
            continue

        if stripped.startswith("%"):
            continue

        if stripped in {r"\centering", r"\small", r"\normalsize"}:
            continue

        state.paragraph_lines.append(line)

    return state.blocks, state.toc_entries


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape_xml(text), style)


def build_table(rows: list[list[str]], caption: str | None, width: float, body_style: ParagraphStyle) -> list[object]:
    if not rows:
        return []

    normalized_rows = [list(row) for row in rows]
    max_cols = max(len(row) for row in normalized_rows)
    for row in normalized_rows:
        while len(row) < max_cols:
            row.append("")

    table_rows = []
    for idx, row in enumerate(normalized_rows):
        table_rows.append([paragraph(cell, body_style) for cell in row])

    table = Table(table_rows, repeatRows=1, colWidths=[width / max_cols] * max_cols)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dfe8f5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17365d")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 11),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#9bb3d1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )

    flowables: list[object] = [table]
    if caption:
        flowables.append(Spacer(1, 0.08 * inch))
        flowables.append(
            Paragraph(
                f"<i>Table:</i> {escape_xml(caption)}",
                ParagraphStyle(
                    "TableCaption",
                    fontName="Times-Italic",
                    fontSize=9,
                    leading=11,
                    textColor=colors.HexColor("#4b4b4b"),
                    alignment=TA_CENTER,
                    spaceAfter=8,
                ),
            )
        )
    else:
        flowables.append(Spacer(1, 0.12 * inch))
    return flowables


def build_figure_box(title: str, note: str, width: float) -> Table:
    box_style = ParagraphStyle(
        "FigureBox",
        fontName="Times-Roman",
        fontSize=10,
        leading=13,
        alignment=TA_CENTER,
        spaceAfter=0,
    )
    content = Paragraph(f"<b>{escape_xml(title)}</b><br/><br/>{escape_xml(note)}", box_style)
    table = Table([[content]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.0, colors.HexColor("#46627f")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fbff")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
            ]
        )
    )
    return table


def build_title_page(styles: dict[str, ParagraphStyle], width: float) -> list[object]:
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName="Times-Bold",
        fontSize=24,
        leading=28,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#17365d"),
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "CoverSubTitle",
        parent=styles["Heading2"],
        fontName="Times-Roman",
        fontSize=15,
        leading=18,
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    note_style = ParagraphStyle(
        "CoverNote",
        parent=styles["BodyText"],
        fontName="Times-Roman",
        fontSize=11,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=4,
    )
    label_style = ParagraphStyle(
        "CoverLabel",
        parent=styles["BodyText"],
        fontName="Times-Bold",
        fontSize=11,
        leading=14,
        alignment=TA_LEFT,
    )
    value_style = ParagraphStyle(
        "CoverValue",
        parent=styles["BodyText"],
        fontName="Times-Roman",
        fontSize=11,
        leading=14,
        alignment=TA_LEFT,
    )

    flowables: list[object] = []
    flowables.append(Spacer(1, 0.25 * inch))
    flowables.append(paragraph("Internet Programming (Sessional) [CSE-326]", subtitle_style))
    flowables.append(Spacer(1, 0.15 * inch))
    flowables.append(paragraph("Final Report - Academic Radar", title_style))
    flowables.append(paragraph("Backend Lab Report", subtitle_style))
    flowables.append(Spacer(1, 0.3 * inch))
    flowables.append(paragraph("Proposed Project Name: Academic Radar", note_style))
    flowables.append(Spacer(1, 0.18 * inch))

    info_table = Table(
        [
            [paragraph("Submitted By:", label_style), paragraph("[Your Name / Group Name]", value_style)],
            [paragraph("Student ID:", label_style), paragraph("[Your Student ID]", value_style)],
            [paragraph("Section/Batch:", label_style), paragraph("[Your Section / Batch]", value_style)],
        ],
        colWidths=[width * 0.28, width * 0.72],
        hAlign="CENTER",
    )
    info_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    flowables.append(info_table)
    flowables.append(Spacer(1, 0.35 * inch))
    flowables.append(paragraph("Submitted To", subtitle_style))
    flowables.append(paragraph("Md. Rashadur Rahman", note_style))
    flowables.append(paragraph("Assistant Professor", note_style))
    flowables.append(paragraph("Department of Computer Science and Engineering (CSE)", note_style))
    flowables.append(paragraph("Chittagong University of Engineering & Technology (CUET)", note_style))
    flowables.append(Spacer(1, 0.1 * inch))
    flowables.append(paragraph("Chattogram-4349, Bangladesh", note_style))
    return flowables


def build_contents_page(entries: list[tuple[int, str]], body_style: ParagraphStyle, heading_style: ParagraphStyle) -> list[object]:
    flowables: list[object] = [Paragraph("Contents", heading_style), Spacer(1, 0.12 * inch)]
    content_items = []
    for level, title in entries:
        indent = "&nbsp;&nbsp;&nbsp;" * (level - 1)
        content_items.append(Paragraph(f"{indent}{escape_xml(title)}", body_style))
    if content_items:
        flowables.append(ListFlowable(content_items, bulletType="bullet", start="-", leftIndent=12))
    else:
        flowables.append(Paragraph("No section entries were detected.", body_style))
    return flowables


def build_flowables(blocks: list[tuple[str, object]], toc_entries: list[tuple[int, str]]) -> list[object]:
    stylesheet = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "ReportBody",
        parent=stylesheet["BodyText"],
        fontName="Times-Roman",
        fontSize=10.5,
        leading=14,
        alignment=TA_LEFT,
        spaceAfter=5,
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=stylesheet["Heading1"],
        fontName="Times-Bold",
        fontSize=16,
        leading=19,
        spaceBefore=7,
        spaceAfter=6,
        textColor=colors.HexColor("#17365d"),
    )
    subsection_style = ParagraphStyle(
        "ReportSubsection",
        parent=stylesheet["Heading2"],
        fontName="Times-Bold",
        fontSize=12.5,
        leading=15,
        spaceBefore=6,
        spaceAfter=4,
        textColor=colors.HexColor("#244a73"),
    )
    code_style = ParagraphStyle(
        "ReportCode",
        parent=stylesheet["Code"],
        fontName="Courier",
        fontSize=7.4,
        leading=9.1,
        leftIndent=0,
        rightIndent=0,
        spaceBefore=0,
        spaceAfter=0,
    )
    figure_caption_style = ParagraphStyle(
        "ReportFigureCaption",
        parent=stylesheet["BodyText"],
        fontName="Times-Italic",
        fontSize=9.5,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#4b4b4b"),
        spaceAfter=6,
    )

    flowables: list[object] = []
    flowables.extend(build_title_page(stylesheet, 6.27 * inch))
    flowables.append(PageBreak())
    flowables.extend(build_contents_page(toc_entries, body_style, section_style))
    flowables.append(PageBreak())

    for kind, value in blocks:
        if kind == "paragraph":
            flowables.append(Paragraph(escape_xml(value), body_style))
        elif kind == "section":
            flowables.append(Spacer(1, 0.06 * inch))
            flowables.append(Paragraph(escape_xml(value), section_style))
        elif kind == "subsection":
            flowables.append(Spacer(1, 0.04 * inch))
            flowables.append(Paragraph(escape_xml(value), subsection_style))
        elif kind == "list":
            payload = value  # type: ignore[assignment]
            items = []
            bullet = "1." if payload["kind"] == "enumerate" else "-"
            for idx, item in enumerate(payload["items"]):
                text = escape_xml(item)
                if payload["kind"] == "enumerate":
                    text = f"{idx + 1}. {text}"
                items.append(ListItem(Paragraph(text, body_style)))
            flowables.append(ListFlowable(items, bulletType="bullet", leftIndent=14, bulletFontName="Times-Roman", bulletFontSize=10))
            flowables.append(Spacer(1, 0.04 * inch))
        elif kind == "code":
            code_text = value  # type: ignore[assignment]
            code_table = Table([[Preformatted(code_text, code_style, maxLineLength=110)]], colWidths=[6.27 * inch])
            code_table.setStyle(
                TableStyle(
                    [
                        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#8ea5c2")),
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f9fc")),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]
                )
            )
            flowables.append(code_table)
            flowables.append(Spacer(1, 0.08 * inch))
        elif kind == "table":
            payload = value  # type: ignore[assignment]
            rows = payload["rows"]
            caption = payload["caption"]
            table_flowables = build_table(rows, caption, 6.27 * inch, body_style)
            flowables.extend(table_flowables)
        elif kind == "figure":
            payload = value  # type: ignore[assignment]
            flowables.append(build_figure_box(payload["title"], payload["note"], 6.27 * inch))
            flowables.append(Spacer(1, 0.08 * inch))
            flowables.append(Paragraph(payload["title"], figure_caption_style))
        elif kind == "toc":
            continue
        elif kind == "pagebreak":
            flowables.append(PageBreak())

    return flowables


def on_page(canvas, doc):
    canvas.saveState()
    if canvas.getPageNumber() > 1:
        canvas.setFont("Times-Roman", 9)
        canvas.setFillColor(colors.HexColor("#6a6a6a"))
        canvas.drawCentredString(doc.pagesize[0] / 2.0, 0.45 * inch, str(canvas.getPageNumber()))
    canvas.restoreState()


def main() -> int:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Source report not found: {SOURCE}")

    source_text = SOURCE.read_text(encoding="utf-8")
    blocks, toc_entries = parse_document(source_text)
    flowables = build_flowables(blocks, toc_entries)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title="Academic Radar Backend Lab Report",
        author="Academic Radar Team",
        subject="Backend Lab Report",
        creator="ReportLab",
    )

    doc.build(flowables, onFirstPage=on_page, onLaterPages=on_page)
    print(f"Generated PDF: {OUTPUT}")
    print(f"Blocks rendered: {len(blocks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
