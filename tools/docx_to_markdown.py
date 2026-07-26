"""Convert the repository's DOCX documentation to clean, portable Markdown.

This intentionally keeps document order, tables, lists, hyperlinks, and embedded
images.  It is a conservative converter: unrecognised Word constructs remain as
plain text rather than being silently discarded.
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph


NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def escape_cell(text: str) -> str:
    return clean(text).replace("|", r"\|") or " "


def heading_level(style_name: str) -> int | None:
    match = re.search(r"heading\s*([1-6])", style_name or "", flags=re.I)
    return int(match.group(1)) if match else None


def is_list(paragraph: Paragraph) -> tuple[bool, bool]:
    style = (paragraph.style.name or "").lower()
    numbered = any(word in style for word in ("number", "list number"))
    bulleted = any(word in style for word in ("bullet", "list bullet"))
    ppr = paragraph._p.pPr
    if ppr is not None and ppr.numPr is not None:
        return True, numbered
    return bulleted or numbered, numbered


def paragraph_text(paragraph: Paragraph) -> str:
    """Extract text, including hyperlinks, and turn hard line breaks into Markdown breaks."""
    parts: list[str] = []
    for child in paragraph._p:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "hyperlink":
            text = "".join(node.text or "" for node in child.iter() if node.tag == qn("w:t"))
            rel_id = child.get(qn("r:id"))
            target = paragraph.part.rels[rel_id].target_ref if rel_id in paragraph.part.rels else None
            parts.append(f"[{text}]({target})" if target and text else text)
        elif tag == "r":
            for node in child.iter():
                if node.tag == qn("w:t"):
                    parts.append(node.text or "")
                elif node.tag == qn("w:tab"):
                    parts.append("\t")
                elif node.tag in (qn("w:br"), qn("w:cr")):
                    parts.append("  \n")
        elif tag == "ins":
            parts.append("".join(node.text or "" for node in child.iter() if node.tag == qn("w:t")))
    return "".join(parts).strip()


def image_rel_ids(paragraph: Paragraph) -> list[str]:
    return [node.get(qn("r:embed")) for node in paragraph._p.xpath(".//a:blip") if node.get(qn("r:embed"))]


def copy_images(document: Document, destination: Path) -> dict[str, str]:
    destination.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    n = 0
    for rel_id, rel in document.part.rels.items():
        if "image" not in rel.reltype:
            continue
        n += 1
        blob = rel.target_part.blob
        ext = Path(rel.target_ref).suffix or ".png"
        name = f"image-{n}{ext}"
        (destination / name).write_bytes(blob)
        saved[rel_id] = name
    return saved


def table_to_markdown(table: Table) -> list[str]:
    rows = [[escape_cell(cell.text) for cell in row.cells] for row in table.rows]
    if not rows:
        return []
    width = max(len(row) for row in rows)
    rows = [row + [" "] * (width - len(row)) for row in rows]
    header = rows[0]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return lines


def convert(source: Path, out_root: Path) -> Path:
    document = Document(source)
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", source.stem).strip("-")
    out_path = out_root / f"{stem}.md"
    asset_dir = out_root / "assets" / stem
    images = copy_images(document, asset_dir)
    lines = [f"# {source.stem.replace('_', ' ')}", ""]
    previous_list = False
    for element in document.element.body.iterchildren():
        if element.tag == qn("w:p"):
            paragraph = Paragraph(element, document)
            text = paragraph_text(paragraph)
            level = heading_level(paragraph.style.name)
            listed, numbered = is_list(paragraph)
            if level and text:
                lines.extend(["#" * level + " " + text, ""])
            elif text:
                if listed:
                    indent = 0
                    ppr = paragraph._p.pPr
                    if ppr is not None and ppr.numPr is not None:
                        ilvl = ppr.numPr.ilvl
                        indent = int(ilvl.val) if ilvl is not None else 0
                    marker = "1." if numbered else "-"
                    lines.append("  " * indent + marker + " " + text)
                else:
                    if previous_list:
                        lines.append("")
                    lines.extend([text, ""])
            for rel_id in image_rel_ids(paragraph):
                image = images.get(rel_id)
                if image:
                    lines.extend([f"![Embedded diagram or figure](assets/{stem}/{image})", ""])
            previous_list = listed
        elif element.tag == qn("w:tbl"):
            if previous_list:
                lines.append("")
            lines.extend(table_to_markdown(Table(element, document)))
            lines.append("")
            previous_list = False
    lines = polish_markdown(lines)
    while len(lines) > 1 and not lines[-1].strip():
        lines.pop()
    lines.append("")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def polish_markdown(lines: list[str]) -> list[str]:
    """Normalise common Word-export artifacts without altering prose or code."""
    cleaned: list[str] = []
    in_fence = False
    seen_title = False
    # A Word paragraph can contain hard line breaks; make each a real Markdown line.
    expanded_lines = [part for raw_line in lines for part in (raw_line.splitlines() or [""])]
    for raw_line in expanded_lines:
        line = raw_line.rstrip()
        if line.startswith("```"):
            # Word sometimes appends the closing fence directly to the last diagram line.
            line = line.strip()
            in_fence = not in_fence
            cleaned.append(line)
            continue
        if in_fence:
            if line.endswith("```") and line != "```":
                cleaned.append(line[:-3].rstrip())
                cleaned.append("```")
                in_fence = False
            else:
                cleaned.append(line)
            continue
        line = re.sub(r"^[•◦▪‣]\s*", "- ", line)
        line = re.sub(r"^[\u2022\u25e6\u25aa\u2023]\s*", "- ", line)
        if line.startswith("# "):
            if seen_title:
                line = "## " + line[2:]
            else:
                seen_title = True
        cleaned.append(line)

    # Upgrade simple Word-style two-column text tables, e.g. `Risk | Mitigation`.
    output: list[str] = []
    i = 0
    simple_row = re.compile(r"^(?!\|)([^|\n]+?)\s*\|\s*([^|\n]+?)$")
    while i < len(cleaned):
        match = simple_row.match(cleaned[i])
        if not match:
            output.append(cleaned[i])
            i += 1
            continue
        block: list[tuple[str, str]] = []
        while i < len(cleaned):
            row = simple_row.match(cleaned[i])
            if not row:
                break
            block.append((row.group(1).strip(), row.group(2).strip()))
            i += 1
        if len(block) >= 2:
            output.append(f"| {block[0][0]} | {block[0][1]} |")
            output.append("| --- | --- |")
            output.extend(f"| {left} | {right} |" for left, right in block[1:])
        else:
            output.append(cleaned[i - 1])
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sources = sorted(args.input.rglob("*.docx")) if args.input.is_dir() else [args.input]
    for source in sources:
        print(convert(source, args.output))


if __name__ == "__main__":
    main()
