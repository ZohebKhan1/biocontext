# biocontext query examples

These examples assume this corpus is attached as the `Bioconductor` resource, which biocontext
selects automatically for every new thread. Type the question straight into the TUI. Each query
requests supporting paths so the result can be checked against the local corpus.

## DESeq2: test and shrink an interaction coefficient

```text
In DESeq2, how do I test and shrink a genotype-by-treatment interaction coefficient? Show minimal code using resultsNames(), results(), and lfcShrink(); name the compatible shrinkage estimator. Respond concisely in at most 180 words, do not offer follow-up, and cite exact supporting source paths from the DESeq2 and apeglm documentation.
```

This resolves coefficient naming, interaction testing, and the shrinkage estimators that support
interaction designs.

## SummarizedExperiment: preserve feature and sample alignment

```text
How do I subset a SummarizedExperiment, add a logcounts assay, and add row and column metadata without misaligning features or samples? Show minimal code and state the enforced dimensional invariants. Answer in at most 220 words and cite source paths.
```

This returns the synchronized subsetting pattern and the dimensional rules enforced across assays,
`rowData()`, and `colData()`.

## GSVA: use the current API with parallel execution

```text
Show the current GSVA R code for gsvaParam() followed by gsva() with MulticoreParam(), including minSize and maxSize. Explain inputs in three bullets and cite the exact source paths. Keep the answer under 180 words.
```

This avoids obsolete GSVA calling conventions and retrieves the parameter-object API, gene-set size
controls, and `BiocParallel` configuration.

## ComplexHeatmap: align multi-panel heatmaps

```text
Show concise ComplexHeatmap code that uses one row dendrogram for two aligned heatmaps, adds HeatmapAnnotation(), applies row_split, combines panels with +, and calls draw(..., merge_legend=TRUE). Cite exact source paths and stay under 200 words.
```

This retrieves the composition and draw sequence needed to preserve row alignment while sharing
clustering and merging legends.
