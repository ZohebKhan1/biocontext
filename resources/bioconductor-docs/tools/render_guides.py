#!/usr/bin/env python3
"""Build curated guides from canonical R Markdown and Quarto sources."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

GUIDES: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "04_pathway_gene_set_analysis/GSVA/hpc.md": (
        "GSVA parallel and high-performance computing",
        [("Parallel execution", "repo/vignettes/GSVA_HPC.Rmd")],
    ),
}


def strip_front_matter(text: str) -> str:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() == "---":
                return "\n".join(lines[index + 1 :])
    return "\n".join(lines)


def normalize_source(text: str) -> str:
    text = strip_front_matter(text)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<style\b.*?</style>", "", text, flags=re.S | re.I)
    text = re.sub(r"^%.*$", "", text, flags=re.M)
    text = re.sub(r'`r (?:Biocpkg|CRANpkg)\("([^"]+)"\)`', r"**\1**", text)
    text = re.sub(r"`r [^`]+`", "", text)

    output: list[str] = []
    dropping_chunk = False
    in_chunk = False
    for line in text.splitlines():
        stripped = line.strip()
        chunk = re.match(r"^```\{r([^}]*)\}\s*$", stripped, re.I)
        if chunk:
            options = chunk.group(1).lower().replace(" ", "")
            dropping_chunk = "include=false" in options or "echo=false" in options
            in_chunk = True
            if not dropping_chunk:
                output.append("```r")
            continue
        if in_chunk and stripped == "```":
            if not dropping_chunk:
                output.append("```")
            dropping_chunk = False
            in_chunk = False
            continue
        if dropping_chunk:
            continue
        if not in_chunk and re.match(r"^#{1,6}\s+", line):
            marks, title = line.split(maxsplit=1)
            line = "#" + marks + " " + title
        output.append(line.rstrip())

    normalized = "\n".join(output)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def build(output_rel: str, title: str, sources: list[tuple[str, str]]) -> None:
    output = ROOT / output_rel
    package_dir = output.parent
    sections = [f"# {title}", "", "Built from canonical package vignette sources."]
    for label, source_rel in sources:
        source = package_dir / source_rel
        if not source.exists():
            raise FileNotFoundError(source)
        content = normalize_source(source.read_text(encoding="utf-8"))
        sections.extend(
            [
                "",
                f"## {label}",
                "",
                f"**Canonical source:** `{source_rel}`",
                "",
                content,
            ]
        )
    output.write_text("\n".join(sections).rstrip() + "\n", encoding="utf-8")
    print(output.relative_to(ROOT))


def main() -> None:
    for output, (title, sources) in GUIDES.items():
        build(output, title, sources)


if __name__ == "__main__":
    main()
