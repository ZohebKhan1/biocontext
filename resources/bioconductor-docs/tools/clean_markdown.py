#!/usr/bin/env python3
"""Normalize documentation Markdown for precise, low-noise LLM retrieval."""

from __future__ import annotations

import argparse
import html
import re
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DROP_SECTION_RE = re.compile(
    r"^(?:"
    r"contents|table of contents|installation|session\s*(?:info|information)|references?|"
    r"bibliography|acknowledg(?:e)?ments?|funding|cit(?:ation|ing)(?:\s+.*)?|how to cite|"
    r"authors?(?:\(s\))?|authors?'? contributions?|authors?'? information|author details?|"
    r"competing interests?|publisher'?s note|supplementary information|"
    r"additional files?|review history|ethics approval.*|consent.*|"
    r"availability of data and materials|data availability|code availability|"
    r"software availability|"
    r"reporting summary|further reading|how to get help.*|want to help\??|"
    r"need help\??|need helps\??|on this page"
    r")$",
    re.IGNORECASE,
)

BOILERPLATE_HEADING_RE = re.compile(
    r"^(?:chapter\s+\d+|open access|software|applications note|gene expression|"
    r"online content|articles?|nature methods|reporting for specific.*|"
    r"materials\s*&\s*experimental systems|received:.*|revised:.*|"
    r"first edition .*last revised.*)$",
    re.IGNORECASE,
)

DATE_RE = re.compile(
    r"^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
    r"\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|[A-Za-z]+\s+\d{4}|"
    r"\d{1,2}\s+[A-Za-z]+\s+\d{4})$"
)


def heading(line: str) -> tuple[int, str] | None:
    match = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
    if not match:
        return None
    return len(match.group(1)), match.group(2)


def normalize_heading_text(text: str) -> str:
    text = html.unescape(text).strip()
    text = re.sub(r"\[\]\(#[^)]+\)", "", text)
    text = re.sub(r"^\[(\d+(?:\.\d+)*)\]\s*", "", text)
    text = re.sub(r"^(?:chapter\s+)?\d+(?:\.\d+)*[.)]?\s+", "", text, flags=re.I)
    text = re.sub(r"\s*\{[^}]+\}\s*$", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" #")


def normalized_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalize_heading_text(text).lower()).strip()


def repair_pdf_encoding_artifacts(text: str) -> str:
    """Repair malformed TeX PDF glyph mappings without transliterating prose."""
    def decode_utf8_tokens(match: re.Match[str]) -> str:
        tokens = re.findall(r"<([0-9a-f]{2})>", match.group(0), flags=re.I)
        try:
            return bytes(int(token, 16) for token in tokens).decode("utf-8")
        except UnicodeDecodeError:
            return match.group(0)

    text = re.sub(r"(?:<[0-9a-f]{2}>){2,}", decode_utf8_tokens, text, flags=re.I)
    text = text.translate(
        str.maketrans(
            {
                "Ą": "fi",
                "Ć": "fl",
                "Ś": '"',
                "Ş": '"',
                "Ť": '"',
                "ś": "'",
                "Ű": "-",
                "Ů": "-",
                "ﬀ": "ff",
                "ﬁ": "fi",
                "ﬂ": "fl",
                "ﬃ": "ffi",
                "ﬄ": "ffl",
            }
        )
    )
    # Š is ambiguous in the damaged font map: between letters it is a right
    # single quote; elsewhere it is a closing double quote.
    text = re.sub(r"(?<=[^\W_])Š(?=[^\W_])", "'", text)
    return text.replace("Š", '"')


def strip_inline_citations(line: str) -> str:
    # Resolve Bookdown cross-references for plain-Markdown readers. Figure
    # anchors point to image blocks intentionally omitted from this corpus.
    line = re.sub(
        r"\bFigure\s+@ref\(fig:[^)]+\)(?:\s+[A-Z](?:\s+and\s+[A-Z])?)?",
        "the corresponding example",
        line,
        flags=re.I,
    )
    line = re.sub(r"@ref\(fig:[^)]+\)", "the corresponding example", line)
    line = re.sub(
        r"@ref\(([^)]+)\)",
        lambda match: (
            f"[{match.group(1).replace('-', ' ')}](#{match.group(1)})"
        ),
        line,
    )

    # Pandoc citation keys and empty generated anchors.
    line = re.sub(r"\s*\[@[^\]]+\]", "", line)
    line = re.sub(r"(?<![\w@])@[A-Za-z][\w:.-]+", "the referenced study", line)
    line = re.sub(r"\s*\[\([^\]]*#ref-[^\]]+\)\]", "", line)
    line = re.sub(
        r"\[([^\[\]]*?)\s*\(\(#ref-[^)]+\)\{role=\"doc-biblioref\"\}\)\]",
        r"\1",
        line,
    )
    line = re.sub(
        r"\s*\(\(#ref-[^)]+\)\{role=\"doc-biblioref\"\}\)",
        "",
        line,
    )
    line = re.sub(r"\[\]\([^)]+\)", "", line)

    # Broken HTML-to-Markdown footnotes such as 11[[1] Note ...].
    line = re.sub(r"\d+\[\[\d+\]\s*([^\]]+)\]", r" \1", line)
    line = re.sub(r"\[\[\d+\]\]", "", line)

    # Linked or bracketed author-year citations.
    line = re.sub(
        r"\s*\[\((?:[^()]|\([^()]*\)){0,180}?(?:19|20)\d{2}[a-z]?\)\]",
        "",
        line,
    )
    line = re.sub(
        r"\s*\[(?:[A-Z][^\[\]]{0,140}?(?:19|20)\d{2}[a-z]?)\]",
        "",
        line,
    )
    line = re.sub(
        r"\s*\((?:[A-Z][A-Za-z'’-]+(?:\s+et\s+al\.)?"
        r"(?:,?\s+(?:and\s+)?[A-Z][A-Za-z'’-]+){0,4},?\s+"
        r"(?:19|20)\d{2}[a-z]?(?:;\s*[^()]*(?:19|20)\d{2}[a-z]?)*?)\)",
        "",
        line,
    )

    # Numeric bibliography markers, but only outside code (caller enforces this).
    line = re.sub(r"\[(?:\d+\s*(?:[-–,]\s*\d+)*)\]", "", line)
    line = re.sub(r"\\\[(?:\d+\s*(?:[-–,]\s*\d+)*)\\\]", "", line)
    line = re.sub(r"\^\d+(?:\s*[,–-]\s*\d+)*\^", "", line)

    # Common PDF spacing damage in prose.
    line = re.sub(r"\s+([,.;:!?])", r"\1", line)
    line = re.sub(r"\b([PpQq])\s+-\s*value", r"\1-value", line)
    line = re.sub(r"\bRNA\s*-\s*seq\b", "RNA-seq", line, flags=re.I)
    line = re.sub(r'`r (?:Biocpkg|CRANpkg)\("([^"]+)"\)`\\?', r"**\1**", line)
    line = re.sub(r"\\([$_<>])", r"\1", line)
    line = re.sub(r"\\([,; ])", r"\1", line)
    line = re.sub(r"\s{2,}", " ", line)
    return line.rstrip()


def html_fragment_text(fragment: str) -> str:
    fragment = re.sub(
        r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        lambda match: f"[{re.sub(r'<[^>]+>', '', match.group(2))}]({match.group(1)})",
        fragment,
        flags=re.S | re.I,
    )
    fragment = re.sub(r"<code\b[^>]*>(.*?)</code>", r"`\1`", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<li\b[^>]*>", "\n- ", fragment, flags=re.I)
    fragment = re.sub(r"</(?:li|p|div)>|<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    lines = [re.sub(r"\s+", " ", html.unescape(line)).strip() for line in fragment.splitlines()]
    return "\n".join(line for line in lines if line)


def convert_html_tables(text: str) -> str:
    def render_rows(fragment: str) -> str:
        rows: list[str] = []
        for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", fragment, flags=re.S | re.I):
            cells = re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, flags=re.S | re.I)
            if not cells:
                continue
            values = [html_fragment_text(cell) for cell in cells]
            if len(values) == 2:
                detail = values[1].replace("\n", "\n  ")
                rows.append(f"- {values[0]}: {detail}")
            else:
                rows.append("- " + "; ".join(values))
        return "\n" + "\n".join(rows) + "\n" if rows else ""

    def replace_table(match: re.Match[str]) -> str:
        return render_rows(match.group(0))

    # Match real block-level HTML tables only. Inline API prose can contain
    # placeholders such as ``CREATE TABLE <table>``; a broad DOTALL match from
    # that placeholder to a later closing tag silently deletes whole topics.
    text = re.sub(
        r"^[ \t]*<table\b[^>]*>.*?^[ \t]*</table>[ \t]*$",
        replace_table,
        text,
        flags=re.S | re.I | re.M,
    )
    text = re.sub(
        r"(?:<(?:tbody|thead)\b[^>]*>\s*)?(?:<tr\b.*?</tr>\s*)+(?:</(?:tbody|thead)>\s*)?",
        lambda match: render_rows(match.group(0)),
        text,
        flags=re.S | re.I,
    )
    return re.sub(r"</?(?:table|tbody|thead|tr|td|th|colgroup|col)\b[^>]*>", "", text, flags=re.I)


def repair_pipe_tables(lines: list[str]) -> list[str]:
    output: list[str] = []
    index = 0
    separator = re.compile(r"^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$")
    while index < len(lines):
        if not lines[index].lstrip().startswith("|"):
            output.append(lines[index])
            index += 1
            continue
        end = index
        while end < len(lines) and lines[end].lstrip().startswith("|"):
            end += 1
        block = lines[index:end]
        if block and separator.fullmatch(block[0]):
            columns = max(1, block[0].count("|") - 1)
            if columns == 2:
                block[0] = "| Argument | Description |"
            else:
                block[0] = "| " + " | ".join(
                    f"Column {number}" for number in range(1, columns + 1)
                ) + " |"
        if len(block) >= 2 and not separator.fullmatch(block[1]):
            columns = max(1, block[0].count("|") - 1)
            block.insert(1, "| " + " | ".join(["---"] * columns) + " |")
        output.extend(block)
        index = end
    return output


def truncate_output_blocks(lines: list[str], limit: int = 24) -> list[str]:
    """Bound long indented R-output runs while retaining representative schema."""
    output: list[str] = []
    i = 0
    while i < len(lines):
        if re.match(r"^\s+##(?:\s|$)", lines[i]):
            j = i
            while j < len(lines) and (
                re.match(r"^\s+##(?:\s|$)", lines[j]) or not lines[j].strip()
            ):
                j += 1
            block = lines[i:j]
            nonblank = [line for line in block if line.strip()]
            if len(nonblank) > limit:
                kept = nonblank[: limit - 4] + [
                    "    ## … output truncated; full runtime metadata is intentionally omitted …",
                ] + nonblank[-3:]
                output.extend(kept)
                output.append("")
            else:
                output.extend(block)
            i = j
            continue
        output.append(lines[i])
        i += 1
    return output


def wrap_long_prose(lines: list[str], width: int = 100) -> list[str]:
    """Wrap prose without touching code, tables, headings, or equations."""
    output: list[str] = []
    in_fence = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("```", "~~~")):
            in_fence = not in_fence
            output.append(line)
            continue
        if (
            in_fence
            or len(line) <= width
            or not stripped
            or stripped.startswith(("#", "|", "<", "$$", "\\[", "!["))
            or line.startswith("    ")
        ):
            output.append(line)
            continue

        match = re.match(r"^(\s*(?:[-*+] |\d+[.)] ))", line)
        initial = match.group(1) if match else ""
        subsequent = " " * len(initial)
        output.extend(
            textwrap.wrap(
                line,
                width=width,
                subsequent_indent=subsequent,
                break_long_words=False,
                break_on_hyphens=False,
            )
        )
    return output


def clean_text(path: Path, text: str) -> str:
    text = repair_pdf_encoding_artifacts(text)
    text = re.sub(r"<figure\b.*?</figure>", "", text, flags=re.S | re.I)
    text = re.sub(
        r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        lambda match: (
            f"[{html_fragment_text(match.group(2))}]({match.group(1)})"
            if html_fragment_text(match.group(2))
            else ""
        ),
        text,
        flags=re.S | re.I,
    )
    text = re.sub(
        r"\[!\[([^]]*)\]\([^)]+\)\]\([^)]+\)",
        lambda match: match.group(1).replace("\\", "").strip("[]") + ".",
        text,
    )
    text = re.sub(
        r"\[([^]]+)\]\((?:\.\./|/)?reference/[^)]+\)",
        r"\1",
        text,
    )
    text = re.sub(
        r"\[([^]]+)\]\((?:(?:\.\./)+)?(?:reference|articles)/[^)]+\.html(?:#[^)]*)?\)",
        r"\1",
        text,
    )
    text = re.sub(r"\[([^]]+)\]\([^/)]+\.html(?:#[^)]*)?\)", r"\1", text)
    text = text.replace("](www.", "](https://www.")
    text = re.sub(r"(?m)^```r\s*\n\s*\n", "```r\n", text)
    text = re.sub(
        r"(?ms)^Source:\s*\n\[[^]]+\]\([^)]+\)\s*\n(?:`[^`]+\.(?:Rmd|qmd)`\s*\n)?",
        "",
        text,
    )
    text = re.sub(r"(?m)^.*affil-mark.*\n?", "", text)
    text = re.sub(
        r'<span\s+class=["\']citation["\']>.*?</span>',
        "the referenced study",
        text,
        flags=re.S | re.I,
    )
    text = re.sub(
        r'\d+<span\s+id=["\']sidenote-\d+["\'][^>]*>\s*'
        r'<span\s+class=["\']sidenote-number["\']>\d+</span>\s*(.*?)</span>',
        r" \1",
        text,
        flags=re.S | re.I,
    )
    text = re.sub(
        r'<span\s+class=["\']pkg["\']>(.*?)</span>',
        r"**\1**",
        text,
        flags=re.S | re.I,
    )
    text = re.sub(
        r'<span\s+class=["\']header-section-number["\']>.*?</span>\s*',
        "",
        text,
        flags=re.S | re.I,
    )
    text = re.sub(r"</?span\b[^>]*>", "", text, flags=re.I)
    text = convert_html_tables(text)
    text = re.sub(r"\{#sidenote-[^}]+\}", "", text)
    text = re.sub(
        r"(?ms)^### Examples\s*\n+```r\s*\n+# (?:There is )?[Nn]o example\s*\n+NULL\s*\n+```\s*\n?",
        "",
        text,
    )
    if path.name == "paper.md":
        text = text.translate(
            str.maketrans(
                {
                    "ð": "(",
                    "Þ": ")",
                    "¼": "=",
                    "\x00": "−",
                    "\x0f": "",
                    "\x12": "θ",
                    "\x16": "μ",
                    "\x18": "χ",
                }
            )
        )
        text = re.sub(r"<figure\b.*?</figure>", "", text, flags=re.S | re.I)
        text = re.sub(r"<table\b.*?</table>", "", text, flags=re.S | re.I)
        text = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", text, flags=re.S | re.I)
        text = re.sub(r"<strong>(.*?)</strong>", r"**\1**", text, flags=re.S | re.I)
        text = re.sub(r"<em>(.*?)</em>", r"*\1*", text, flags=re.S | re.I)
        text = re.sub(r"<sub>(.*?)</sub>", r"_{\1}", text, flags=re.S | re.I)
        text = re.sub(r"<sup>(.*?)</sup>", r"^{\1}", text, flags=re.S | re.I)
        text = re.sub(r"</?span\b[^>]*>", "", text, flags=re.I)
        text = re.sub(
            r"\\\[\d+(?:\s*[-–,]\s*\d+)*\\\]",
            "",
            text,
            flags=re.S,
        )
    text = re.sub(
        r"\\documentclass\[12pt\]\{minimal\}.*?\\begin\{document\}",
        "",
        text,
        flags=re.S,
    )
    text = text.replace("\\end{document}", "")
    # Bookdown caption definitions duplicate descriptions for figures that are
    # deliberately excluded from this text-only retrieval corpus.
    text = re.sub(r"(?ms)^\(ref:[^)]+\).*?(?=\n\s*\n|\Z)", "", text)
    text = re.sub(
        r"\$`\$\$\s*(.*?)\s*\$\$`\$",
        lambda match: "$" + re.sub(r"\s+", " ", match.group(1)) + "$",
        text,
        flags=re.S,
    )
    if path.parent.name == "msigdbr":
        text = text.replace(
            "](../reference/",
            "](https://igordot.github.io/msigdbr/reference/",
        )
    text = re.sub(r"\[\\{2,}\[", "$$", text)
    text = re.sub(r"\\{2,}\]\]", "$$", text)
    text = re.sub(
        r"\$\$(.*?)\$\$",
        lambda match: "$$" + match.group(1).replace("\\\\", "\\") + "$$",
        text,
        flags=re.S,
    )
    # pkgdown navigation is website chrome, not documentation content.
    if "[Skip to contents]" in text:
        title_match = re.search(r"(?m)^#\s+[^#\n].*$", text)
        if title_match:
            text = text[title_match.start() :]

    text = re.sub(
        r"(?ms)^```r\n\s*citation\([^\n]+\)\s*\n```\s*\n?",
        "",
        text,
    )
    text = re.sub(
        r"\[([^\[\]]{0,200}?)\s*\(\(#ref-[^)]+\)\{role=\"doc-biblioref\"\}\)\]",
        lambda match: re.sub(r"\s+", " ", match.group(1)),
        text,
        flags=re.S,
    )
    text = re.sub(
        r"\[([A-ZÀ-ÖØ-Þ][^\[\]]{1,180}?)\s*\((?:19|20)\d{2}[a-z]?\)\]",
        lambda match: re.sub(r"\s+", " ", match.group(1)),
        text,
        flags=re.S,
    )
    text = re.sub(r"\[\(\*\*[^\]]+\?\*\*\)\]", "", text)

    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    result: list[str] = []
    in_fence = False
    fence_marker = ""
    drop_level: int | None = None
    first_title_key: str | None = None
    seen_heading_keys: set[str] = set()
    semantic_heading_count = 0
    body_started = False
    skip_package_value = False
    drop_raw_html_fence = False
    drop_session_fence = False
    drop_citation_output = False
    drop_html_block = False
    drop_publisher_block = False

    repeated_headers = {
        "annotationdbi introduction to bioconductor annotation packages",
        "edger user s guide",
        "limma linear models for microarray and rna seq data user s guide",
        "masigpro user s guide",
    }

    for line_number, raw in enumerate(lines):
        line = (
            raw.replace("\u00a0", " ")
            .replace("\u00ad", "")
            .replace("\u2060", "")
            .rstrip()
        )
        valid_fence = re.fullmatch(
            r"\s*(?:```|~~~)\s*(?:[A-Za-z0-9_+.-]+|\{=[^}]+\})?\s*", line
        )
        if not valid_fence and "``" in line:
            line = re.sub(r"`{2,}", "`", line)
            line = re.sub(
                r"`([A-Za-z]\w*\(\))`?\s*or\s*`([A-Za-z]\w*\(\))'",
                r"`\1` or `\2`",
                line,
            )
            line = re.sub(r"`([^`\n]+)'(?=\s|$)", r"`\1`", line)
        if line.startswith((" - ", " * ", " + ")):
            line = " " + line
        stripped = line.strip()

        # Generated reference topics are independent records. Reset any
        # section/fence suppression inherited from the previous Rd page so a
        # dropped Authors/References block cannot consume the next topic.
        if path.name == "reference.md" and stripped.startswith(
            ("**Aliases:**", "**Canonical source:**")
        ):
            in_fence = False
            fence_marker = ""
            drop_level = None
            drop_raw_html_fence = False
            drop_session_fence = False
            drop_citation_output = False
            drop_html_block = False
            drop_publisher_block = False
            result.append(line)
            continue

        if "affil-mark" in line:
            continue

        if drop_html_block:
            if ">" in line:
                drop_html_block = False
            continue
        if re.search(r"<(?:img|svg|style|script|div)\b", line, re.I):
            drop_html_block = ">" not in line
            continue
        if re.search(r"<p\s+class=[\"']caption[\"']", line, re.I):
            continue

        if drop_publisher_block:
            if heading(line):
                drop_publisher_block = False
            else:
                continue
        if path.name == "paper.md" and stripped.startswith(
            "Any methods, additional references"
        ):
            drop_publisher_block = True
            continue

        if re.match(
            r"^The version number of R and packages loaded for generating the vignette were:",
            stripped,
            re.I,
        ):
            break

        if stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            if not in_fence:
                in_fence = True
                fence_marker = marker
                drop_raw_html_fence = stripped in {"```{=html}", "```html"}
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
                drop_session_fence = False
                if drop_raw_html_fence:
                    drop_raw_html_fence = False
                    continue
            if drop_level is None and not drop_raw_html_fence:
                if re.fullmatch(r"```\s*(?:r|downlit)\s*", stripped, re.I):
                    result.append("```r")
                else:
                    result.append(line)
            continue

        if in_fence:
            if drop_level is None and not drop_raw_html_fence:
                if re.fullmatch(r"(?:>\s*)?sessionInfo\(\)", stripped):
                    drop_session_fence = True
                    continue
                if "> sessionInfo()" in line:
                    prefix = line.split("> sessionInfo()", 1)[0].rstrip()
                    if prefix:
                        result.append(prefix)
                    continue
                if not drop_session_fence:
                    result.append(line)
            continue

        if drop_citation_output:
            if re.match(r"^##(?:\s|$)", stripped):
                continue
            drop_citation_output = False
        if re.match(r"^##\s+To cite package\b", stripped, re.I):
            drop_citation_output = True
            continue

        head = heading(line)
        if head:
            level, raw_title = head
            title = normalize_heading_text(raw_title)
            key = normalized_key(title)

            if raw_title.lstrip().startswith(">"):
                command = raw_title.lstrip()[1:].strip()
                result.extend(["```r", command, "```"])
                body_started = True
                continue
            if raw_title.lstrip().startswith("["):
                if "loaded via a namespace" not in raw_title.lower():
                    result.extend(["```text", raw_title.strip(), "```"])
                    body_started = True
                continue

            if title.lower() == "abstract" and semantic_heading_count == 1:
                result = result[:1]
                title = "Overview"
                key = "overview"
                level = 2
                body_started = False

            if title.lower() == "setup" and any(
                "sessionInfo()" in candidate
                or "software setup" in candidate.lower()
                for candidate in lines[line_number + 1 : line_number + 16]
            ):
                title = "Session information"
                key = normalized_key(title)

            if drop_level is not None:
                # PDF page headers and chapter labels inside a dropped contents
                # section do not mark the beginning of real content.
                if (
                    BOILERPLATE_HEADING_RE.fullmatch(title)
                    or key in repeated_headers
                    or title.lower() == "user's guide"
                ):
                    continue
                if level <= drop_level:
                    drop_level = None
                else:
                    continue

            if DROP_SECTION_RE.fullmatch(title):
                drop_level = level
                continue

            if BOILERPLATE_HEADING_RE.fullmatch(title):
                continue

            if DATE_RE.fullmatch(title):
                continue
            if title.lower() == "package":
                skip_package_value = True
                continue
            if semantic_heading_count <= 2 and re.search(
                r"(?:^[A-Z][A-Za-z .,'’&-]+(?:,\s*[A-Z][A-Za-z .,'’&-]+)+$|"
                r"^first edition .*last revised)",
                title,
                re.I,
            ):
                continue
            if semantic_heading_count <= 2 and re.fullmatch(
                r"[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z.'’()-]+){1,4}",
                title,
            ):
                continue

            if key in repeated_headers:
                if semantic_heading_count:
                    continue

            if first_title_key is None:
                first_title_key = key
                level = 1
            elif key == first_title_key:
                continue

            # Repeated PDF page headers add no retrieval value. Repeated ordinary
            # headings are retained because different chapters can reuse labels.
            seen_heading_keys.add(key)

            if not title:
                continue
            result.append(f"{'#' * level} {title}")
            semantic_heading_count += 1
            skip_package_value = title.lower() == "package"
            continue

        if drop_level is not None:
            continue

        if re.match(r"^\s*[-*]\s+\[[^]]+\]\(#[^)]+\)\s*$", line):
            continue
        if re.match(r"^\s*!\[[^]]*\]\([^)]+\)\s*$", line):
            continue
        if re.match(r"^\s*\[(?:Skip to contents|Get started|Reference|Changelog)\]", line, re.I):
            continue
        if re.match(r"^\s*\[[^]]+\]\(\.\./(?:index|articles|reference|news)", line):
            continue
        if stripped == "-":
            continue

        # Remove display metadata only between the title and the first body
        # paragraph. Applying author-like heuristics inside early sections can
        # misclassify ordinary prose.
        if semantic_heading_count == 1 and not body_started:
            if skip_package_value and stripped:
                skip_package_value = False
                continue
            if DATE_RE.fullmatch(stripped):
                continue
            if stripped.lower() in {"package", "abstract"}:
                if stripped.lower() == "abstract":
                    result.append("## Overview")
                continue
            if stripped and len(stripped) < 180 and re.search(
                r"(?:\b(?:university|institute|department|school|laboratory)\b|"
                r"^[A-Z][A-Za-z .,'’&-]+(?:,\s*[A-Z][A-Za-z .,'’&-]+)+$)",
                stripped,
                re.I,
            ):
                continue
            if re.fullmatch(
                r"[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z.'’()-]+){1,4}",
                stripped,
            ):
                continue
            if re.fullmatch(r"[A-Za-z][A-Za-z0-9.]+\s+\d+\.\d+\.\d+", stripped):
                continue
            if stripped and len(stripped) < 280 and stripped.count(",") >= 4 and re.search(r"\d", stripped):
                continue

        if re.fullmatch(r"(?:\d+[.)]?|[ivxlcdm]+[.)]?)", stripped, re.I):
            continue
        if stripped in {"[]", "[ ]", "()", ">", "&gt;"}:
            continue
        if stripped.lower() == "invalid date":
            continue
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9.]+\s+\d+\.\d+\.\d+", stripped):
            continue
        if re.match(r"^\*\*License\*\*\s*:", stripped, re.I):
            continue
        if re.fullmatch(r"[\[\]*\\]*<?[^\s<>@]+@[^\s<>@]+>?\\?", stripped):
            continue
        if re.search(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", stripped):
            continue
        if re.fullmatch(r"</?(?:img|svg|style|script|div)\b[^>]*>", stripped, re.I):
            continue
        if stripped.startswith("<!--") and stripped.endswith("-->"):
            continue
        if stripped and all(not char.isalnum() for char in stripped):
            if re.fullmatch(r"\|?(?:\s*:?-+:?\s*\|)+", stripped):
                result.append(line)
            continue

        # Captions refer to images that are not present in this text-only corpus.
        if re.match(r"^(?:Figure|Fig\.)\s+\d+[A-Za-z]?\s*[.:|]", stripped, re.I):
            continue
        if re.match(r"^Table\s+\d+[A-Za-z]?[.:]", stripped, re.I):
            continue
        if re.match(
            r"^(?:To cite|For information on how to cite|If .*please cite|If you use .* cite|Please cite)\b",
            stripped,
            re.I,
        ):
            continue
        if re.match(r"^\*\*References?:\*\*", stripped, re.I):
            continue
        if re.match(r"^\*\*Note:\*\*.*\b(?:cite|citation)\b", stripped, re.I):
            continue
        if stripped.startswith(">") and re.search(r"\b(?:19|20)\d{2}\b", stripped):
            continue

        cleaned = strip_inline_citations(html.unescape(line))
        if path.name == "paper.md":
            cleaned = re.sub(r"(?<=\w)\s*\((?:\d+\s*(?:[-–,]\s*\d+)*)\)", "", cleaned)
            cleaned = re.sub(
                r"(?<=[A-Za-z)])\s+\d{1,3}(?:\s*[-–,]\s*\d{1,3})*(?=[,.;])",
                "",
                cleaned,
            )
        if cleaned.strip():
            result.append(cleaned)
            body_started = True
        else:
            result.append("")

    result = truncate_output_blocks(result)
    result = repair_pipe_tables(result)
    result = wrap_long_prose(result)

    # Remove empty fenced blocks and collapse blank runs.
    compact: list[str] = []
    i = 0
    while i < len(result):
        if result[i].strip().startswith(("```", "~~~")):
            marker = result[i].strip()[:3]
            j = i + 1
            while j < len(result) and not result[j].strip().startswith(marker):
                j += 1
            if j < len(result) and not any(line.strip() for line in result[i + 1 : j]):
                i = j + 1
                continue
        if not result[i].strip() and compact and not compact[-1].strip():
            i += 1
            continue
        compact.append(result[i])
        i += 1

    while compact and not compact[0].strip():
        compact.pop(0)
    while compact and not compact[-1].strip():
        compact.pop()
    return "\n".join(compact) + "\n"


def markdown_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*.md")
        if ".git" not in path.parts
        and "repo" not in path.parts
        and "book_source" not in path.parts
        and "tools" not in path.parts
        and path.name not in {"README.md", "DIRECTORY.md"}
    )


def clean_fixed_point(path: Path, text: str) -> str:
    """Apply dependent normalizations until another pass makes no change."""
    current = text
    for _ in range(6):
        updated = clean_text(path, current)
        if updated == current:
            return updated
        current = updated
    return current


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report files that would change")
    args = parser.parse_args()

    changed: list[Path] = []
    for path in markdown_files():
        original = path.read_text(encoding="utf-8")
        cleaned = clean_fixed_point(path, original)
        if cleaned != original:
            changed.append(path)
            if not args.check:
                path.write_text(cleaned, encoding="utf-8")

    if changed:
        print("\n".join(str(path.relative_to(ROOT)) for path in changed))
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
