"""Builds product files (PDF, XLSX, CSV, MD, ...) from Content agent sections, plus a ZIP bundle and an
assets manifest for the Philosopher.

Sections are matched to CEO deliverables by file stem (``guide.md`` section -> ``guide.pdf``).
Sections whose stem matches no deliverable are written as extra files; deliverables without any
section are reported in ``missing_deliverables`` (the Philosopher sees this as a promise mismatch).

PDFs are rendered with fpdf2 and a Unicode TTF font (PDF_FONT_PATH or DejaVu Sans if present).
Without such a font the PDF falls back to a core font and non-Latin-1 characters are replaced;
a warning is returned so the issue is visible.
"""
from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Any

from fpdf import FPDF

from core.tools import ToolContext

EXCERPT_CHARS = 3000
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
]
TEXT_FORMATS = {"md", "txt", "py", "json"}


def latest_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the last output per section_index (revision rounds replace earlier ones), in index order."""
    latest: dict[int, dict[str, Any]] = {}
    for s in sections:
        latest[s["section_index"]] = s
    return [latest[i] for i in sorted(latest)]


def _find_font(font_path: str | None) -> tuple[str | None, str | None]:
    candidates = [font_path] if font_path else FONT_CANDIDATES
    for c in candidates:
        if c and Path(c).is_file():
            bold = Path(c).with_name(Path(c).stem + "-Bold.ttf")
            return c, (str(bold) if bold.is_file() else None)
    return None, None


class _Pdf(FPDF):
    def __init__(self, title: str, font: str | None, bold: str | None):
        super().__init__()
        self.title_text = title
        self.unicode = font is not None
        self.mono = "courier"
        if font:
            self.add_font("Body", "", font)
            self.add_font("Body", "B", bold or font)
            self.family = "Body"
            mono = Path(font).with_name(Path(font).stem + "Mono.ttf")
            if mono.is_file():
                self.add_font("Mono", "", str(mono))
                self.mono = "Mono"
            else:
                self.mono = "Body"
        else:
            self.family = "helvetica"
        self.set_auto_page_break(auto=True, margin=18)

    def text(self, s: str) -> str:  # type: ignore[override]
        return s if self.unicode else s.encode("latin-1", "replace").decode("latin-1")

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font(self.family, "", 8)
        self.cell(0, 6, self.text(f"{self.title_text} - {self.page_no()}"), align="C")


def markdown_to_pdf(md: str, path: Path, title: str, subtitle: str = "", font_path: str | None = None) -> list[str]:
    font, bold = _find_font(font_path)
    warnings = [] if font else ["no Unicode TTF font found; PDF uses a core font and may lose characters"]
    pdf = _Pdf(title, font, bold)
    pdf.add_page()
    pdf.set_font(pdf.family, "B", 22)
    pdf.multi_cell(0, 11, pdf.text(title), new_x="LMARGIN", new_y="NEXT")
    if subtitle:
        pdf.set_font(pdf.family, "", 12)
        pdf.multi_cell(0, 7, pdf.text(subtitle), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    in_code = False
    for raw in md.splitlines():
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        w = pdf.epw
        if in_code:
            pdf.set_font(pdf.mono, "", 9)
            pdf.multi_cell(w, 5, pdf.text(line or " "), new_x="LMARGIN", new_y="NEXT")
            continue
        if not line.strip():
            pdf.ln(3)
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        clean = re.sub(r"(\*\*|__)(.+?)\1", r"\2", line)
        if m:
            size = {1: 18, 2: 15, 3: 13}.get(len(m.group(1)), 12)
            pdf.ln(2)
            pdf.set_font(pdf.family, "B", size)
            pdf.multi_cell(w, size * 0.55, pdf.text(re.sub(r"(\*\*|__)", "", m.group(2))),
                           new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
            continue
        bullet = re.match(r"^\s*([-*+]|\d+[.)])\s+(.*)$", clean)
        pdf.set_font(pdf.family, "", 11)
        if bullet:
            marker = "•" if bullet.group(1) in "-*+" and pdf.unicode else bullet.group(1).replace("*", "-")
            pdf.set_x(pdf.l_margin + 4)
            pdf.multi_cell(w - 4, 6, pdf.text(f"{marker} {bullet.group(2)}"), new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.multi_cell(w, 6, pdf.text(clean), new_x="LMARGIN", new_y="NEXT")
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(path))
    return warnings


def _merge_csv(parts: list[str]) -> str:
    rows: list[list[str]] = []
    header: list[str] | None = None
    for part in parts:
        reader = list(csv.reader(io.StringIO(part.strip())))
        if not reader:
            continue
        if header is None:
            header = reader[0]
            rows.append(header)
            rows.extend(reader[1:])
        else:
            rows.extend(reader[1:] if reader[0] == header else reader)
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    return buf.getvalue()


def csv_to_xlsx(csv_text: str, path: Path, sheet_title: str = "Sheet1") -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    for i, row in enumerate(csv.reader(io.StringIO(csv_text))):
        ws.append(row)
        if i == 0:
            for cell in ws[1]:
                cell.font = Font(bold=True)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = min(60, max(10, *(len(str(c.value or "")) for c in col)) + 2)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def _source_text(sections: list[dict[str, Any]], fmt: str) -> str:
    parts = [s["content"] for s in sections]
    if fmt in ("csv", "xlsx") or all(s["content_format"] == "csv" for s in sections):
        return _merge_csv(parts)
    if fmt == "json" and len(parts) > 1:
        try:
            return json.dumps([json.loads(p) for p in parts], ensure_ascii=False, indent=2)
        except ValueError:
            pass
    return "\n\n".join(p.strip() for p in parts) + "\n"


def build_bundle(spec: dict[str, Any], listing: dict[str, Any], sections: list[dict[str, Any]],
                 out_dir: str | Path, font_path: str | None = None) -> dict[str, Any]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sections = latest_sections(sections)
    by_stem: dict[str, list[dict[str, Any]]] = {}
    for s in sections:
        by_stem.setdefault(Path(s["target_file"]).stem, []).append(s)

    manifest, missing, warnings, written = [], [], [], []
    used_stems: set[str] = set()
    title = listing.get("name") or spec["working_title"]

    def write(file_name: str, fmt: str, parts: list[dict[str, Any]]) -> None:
        path = out / Path(file_name).name
        text = _source_text(parts, fmt)
        if fmt == "pdf":
            warnings.extend(markdown_to_pdf(text, path, title, listing.get("summary", ""), font_path))
        elif fmt == "xlsx":
            csv_to_xlsx(text, path, sheet_title=Path(file_name).stem)
        elif fmt == "zip":
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
                for p in parts:
                    z.writestr(Path(p["target_file"]).name, p["content"])
        else:
            path.write_text(text, encoding="utf-8")
        manifest.append({"file_name": path.name, "bytes": path.stat().st_size, "excerpt": text[:EXCERPT_CHARS]})
        written.append(path)

    for d in spec["deliverables"]:
        stem = Path(d["file_name"]).stem
        parts = by_stem.get(stem)
        if not parts:
            missing.append(d["file_name"])
            continue
        used_stems.add(stem)
        write(d["file_name"], d["format"], parts)

    for stem, parts in by_stem.items():
        if stem not in used_stems:
            target = Path(parts[0]["target_file"]).name
            ext = Path(target).suffix.lstrip(".") or "md"
            write(target, ext if ext in TEXT_FORMATS | {"csv"} else "md", parts)

    permalink = listing.get("custom_permalink") or "product"
    bundle = out / f"{permalink}.zip"
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
        for p in written:
            z.write(p, arcname=p.name)
    return {"bundle_path": str(bundle), "files": [p.name for p in written], "assets_manifest": manifest,
            "missing_deliverables": missing, "warnings": warnings}


def build_product_files_tool(data_dir: str | Path, font_path: str | None = None):
    def build(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        round_ = int(ctx.state.get("revision_round", 0))
        out_dir = Path(data_dir) / "products" / ctx.run_id / f"round-{round_}"
        res = build_bundle(payload["product_spec"], payload["listing"], payload["sections"], out_dir, font_path)
        return {"status": "ok", **res}

    return build
