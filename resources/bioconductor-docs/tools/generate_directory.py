#!/usr/bin/env python3
"""Generate the repository's compact Markdown routing index."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "DIRECTORY.md"

CATEGORIES = {
    "01_data_import_annotation": "Data import and annotation",
    "02_differential_expression": "Differential expression",
    "03_time_series": "Time series",
    "04_pathway_gene_set_analysis": "Pathway and gene-set analysis",
    "05_visualization": "Visualization",
}

FILE_ORDER = {
    "reference.md": 0,
    "book.md": 1,
    "workflow.md": 2,
    "vignette.md": 3,
    "tutorial.md": 4,
    "intro.md": 5,
    "overview.md": 6,
    "guides.md": 7,
    "proteomics.md": 8,
    "hpc.md": 9,
    "paper.md": 10,
}


def build() -> str:
    packages = 0
    documents = 0
    sections: list[str] = []

    for directory, label in CATEGORIES.items():
        category = ROOT / directory
        lines = [f"## {label}", ""]
        for package in sorted(
            (path for path in category.iterdir() if path.is_dir()),
            key=lambda path: path.name.lower(),
        ):
            docs = sorted(
                package.glob("*.md"),
                key=lambda path: (FILE_ORDER.get(path.name, 99), path.name.lower()),
            )
            if not docs:
                continue
            packages += 1
            documents += len(docs)
            links = ", ".join(
                f"[{doc.stem}]({doc.relative_to(ROOT).as_posix()})" for doc in docs
            )
            lines.append(f"- **{package.name}** — {links}")
        sections.append("\n".join(lines))

    header = [
        "# Bioconductor documentation directory",
        "",
        "Compact routing index for the `@Bioconductor` resource used by the "
        "biocontext TUI.",
        "",
        f"**Coverage:** {packages} packages and {documents} Markdown documents.",
        "",
        "Document labels: `reference` contains exact functions and arguments; `book` is a "
        "long-form reference; `workflow`, `vignette`, `tutorial`, and focused articles are "
        "usage guides; `paper` explains methods.",
        "",
    ]
    return "\n".join(header).rstrip() + "\n\n" + "\n\n".join(sections).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if DIRECTORY.md is stale")
    args = parser.parse_args()

    generated = build()
    current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
    if args.check:
        if current != generated:
            print("DIRECTORY.md is stale")
            return 1
        return 0

    if current != generated:
        OUTPUT.write_text(generated, encoding="utf-8")
        print(OUTPUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
