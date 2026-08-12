#!/usr/bin/env python3
"""Render selected official HTML guides into compact local Markdown."""

from __future__ import annotations

import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

GUIDES: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "01_data_import_annotation/S4Vectors/vignette.md": (
        "S4Vectors guide",
        [
            (
                "S4Vectors overview",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "S4Vectors/inst/doc/S4VectorsOverview.html",
            )
        ],
    ),
    "01_data_import_annotation/S4Vectors/tutorial.md": (
        "S4Vectors focused guides",
        [
            (
                "Quick overview",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "S4Vectors/inst/doc/S4QuickOverview.html",
            ),
            (
                "Rle techniques",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "S4Vectors/inst/doc/RleTricks.html",
            ),
        ],
    ),
    "01_data_import_annotation/SummarizedExperiment/vignette.md": (
        "SummarizedExperiment guide",
        [
            (
                "Core container workflow",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "SummarizedExperiment/inst/doc/SummarizedExperiment.html",
            )
        ],
    ),
    "01_data_import_annotation/SummarizedExperiment/tutorial.md": (
        "Extending SummarizedExperiment",
        [
            (
                "Extension patterns",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "SummarizedExperiment/inst/doc/Extensions.html",
            )
        ],
    ),
    "04_pathway_gene_set_analysis/GSVA/proteomics.md": (
        "GSVA for proteomics",
        [
            (
                "Proteomics workflow",
                "https://bioconductor.org/packages/release/bioc/vignettes/"
                "GSVA/inst/doc/GSVA_proteomics.html",
            )
        ],
    ),
}


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "bioconductor-docs/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def article_html(page: str) -> str:
    main = re.search(r'<main\b[^>]*id=["\']main["\'][^>]*>(.*?)</main>', page, re.S | re.I)
    if main:
        content = main.group(1)
    else:
        body = re.search(r"<body\b[^>]*>(.*?)</body>", page, re.S | re.I)
        content = body.group(1) if body else page
    content = re.sub(r"<(?:script|style|svg|nav)\b.*?</(?:script|style|svg|nav)>", "", content, flags=re.S | re.I)
    return f"<html><body>{content}</body></html>"


def to_markdown(page: str, source_url: str) -> str:
    with tempfile.TemporaryDirectory(prefix="render-web-guide-") as temporary:
        html_path = Path(temporary) / "guide.html"
        markdown_path = Path(temporary) / "guide.md"
        html_path.write_text(article_html(page), encoding="utf-8")
        subprocess.run(
            [
                "pandoc",
                "--from=html",
                "--to=gfm+pipe_tables",
                "--wrap=auto",
                "--columns=100",
                "--output",
                str(markdown_path),
                str(html_path),
            ],
            check=True,
        )
        markdown = markdown_path.read_text(encoding="utf-8")

    markdown = re.sub(
        r"(?m)^[A-ZÀ-ÖØ-Þ][^\n]{0,220}(?:, [^\n]+)+\n\n###### Revised:.*\n",
        "",
        markdown,
    )
    lines = markdown.splitlines()

    first_heading = next((i for i, line in enumerate(lines) if line.startswith("# ")), None)
    if first_heading is not None:
        lines.pop(first_heading)
    if "bioconductor.org" in source_url:
        first_section = next((i for i, line in enumerate(lines) if line.startswith("# ")), None)
        if first_section is not None:
            lines = lines[first_section:]
    output: list[str] = []
    for line in lines:
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            depth = min(6, len(heading.group(1)) + 2)
            line = f"{'#' * depth} {heading.group(2)}"
        output.append(line.rstrip())
    return "\n".join(output).strip()


def build(output_rel: str, title: str, sources: list[tuple[str, str]]) -> None:
    output = ROOT / output_rel
    sections = [f"# {title}", "", "Rendered from official package documentation HTML."]
    for label, url in sources:
        sections.extend(
            [
                "",
                f"## {label}",
                "",
                f"**Official source:** {url}",
                "",
                to_markdown(fetch(url), url),
            ]
        )
    output.write_text("\n".join(sections).rstrip() + "\n", encoding="utf-8")
    print(output.relative_to(ROOT))


def main() -> None:
    for output, (title, sources) in GUIDES.items():
        build(output, title, sources)


if __name__ == "__main__":
    main()
