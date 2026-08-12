# Bioconductor documentation for biocontext

Agent-ready Markdown documentation for 22 R and Bioconductor packages used in RNA-seq analysis.
This corpus grounds package questions in exact API references, official guides, books, and method
papers. It ships inside [biocontext](https://github.com/ZohebKhan1/biocontext) as the default
`Bioconductor` resource; this repository stays the canonical place to maintain it.

See [DIRECTORY.md](DIRECTORY.md) for the package and document index.

## Use with biocontext

Install the TUI, run `/connect` once to choose a model provider, then ask a question. The
`Bioconductor` resource is attached to every new thread, so no `@resource` prefix is needed:

```sh
bun add -g biocontext
biocontext
```

```text
How does DESeq2's lfcThreshold change the null hypothesis? Cite source paths.
```

To point the TUI at a local checkout of this repository instead of the bundled snapshot, use
`/add` and select a local resource.

## Showcase: a DESeq2 interaction test

This query resolves a subtle analysis task across DESeq2 and apeglm documentation:

```text
In DESeq2, how do I test and shrink a genotype-by-treatment interaction coefficient? Show minimal code using resultsNames(), results(), and lfcShrink(); name the compatible shrinkage estimator. Respond concisely in at most 180 words, do not offer follow-up, and cite exact supporting source paths from the DESeq2 and apeglm documentation.
```

### Full response

Use the interaction coefficient's **name** from `resultsNames(dds)`, test it with
`results(..., name=)`, and shrink that same coefficient with
`lfcShrink(..., coef=, type="apeglm")`.

```r
dds <- DESeq(dds)

resultsNames(dds)
# e.g. "Intercept" "genotype_II_vs_I" "condition_B_vs_A" "genotypeII.conditionB"

# test the genotype-by-treatment interaction:
res_int <- results(dds, name = "genotypeII.conditionB")

# shrink that interaction coefficient:
res_int_shrunk <- lfcShrink(
  dds,
  coef = "genotypeII.conditionB",
  type = "apeglm"
)
```

Key point: for an interaction term, `results(dds, name="genotypeII.conditionB")` asks whether the
treatment effect differs between genotypes. For shrinkage, **`apeglm`** is the compatible estimator
here; DESeq2 states `apeglm` requires `coef`, and the older `normal` shrinkage cannot be applied to
interaction-term coefficients in formula designs.

#### Sources

- `./Bioconductor/02_differential_expression/DESeq2/reference.md`
- `./Bioconductor/02_differential_expression/DESeq2/vignette.md`
- `./Bioconductor/02_differential_expression/apeglm/paper.md`

See [EXAMPLES.md](EXAMPLES.md) for four tested queries covering DESeq2, SummarizedExperiment, GSVA,
and ComplexHeatmap.

## Coverage

| Area | Packages |
| --- | --- |
| Data import and annotation | AnnotationDbi, GO.db, S4Vectors, SummarizedExperiment, biomaRt, tximeta, tximport |
| Differential expression | apeglm, DESeq2, edgeR, limma |
| Time series | ImpulseDE2, maSigPro |
| Pathway and gene-set analysis | clusterProfiler, enrichplot, fgsea, GSVA, msigdbr, ReactomePA, singscore |
| Visualization | ComplexHeatmap, PCAtools |

Each package directory contains some combination of `reference.md`, official guides, a book, a
workflow, and a method paper. Its `_metadata.yml` records independent provenance for every Markdown
document, including the original URL, document type, package version, and numbered Bioconductor
release. Genuinely unavailable values use the literal `unknown`.

## Why the retrieval protocol and corpus work together

biocontext follows a repeatable protocol: search only the named `Bioconductor` resource, answer a
precise package question, and return exact source paths. This folder supplies the focused evidence
base. Together they let an agent work without searching the web or guessing from memory, choose
exact APIs from `reference.md`, recover workflow context from guides, and verify statistical
assumptions in method papers. Path-level citations keep each answer auditable and make uncertain or
conflicting guidance visible.

## Maintain the corpus

Ignored `repo/` directories hold reproducible upstream inputs; only the cleaned documentation is
versioned. After refreshing content, run:

```sh
bun run validate
python3 tools/clean_markdown.py --check
python3 tools/generate_directory.py --check
```

Use `tools/render_references.R`, `tools/render_guides.py`, and `tools/render_web_guides.py` to rebuild
the corresponding document types before validation.
