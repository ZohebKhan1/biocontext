# biocontext

The `biocontext` executable starts the macOS terminal UI. It selects the bundled Bioconductor
documentation resource for new threads and answers questions from resources already stored locally.

```bash
bun add -g biocontext
biocontext
```

Run `/connect` to select a model provider. Use `@DESeq2` to focus a question on local DESeq2
documentation. The answer cites the supporting file, inclusive line range, package version, and
Bioconductor release.

The `@` palette lists configured resources and complete package caches on disk. It does not download
packages. Use `/add` and choose `bioconductor` to search the full Bioconductor catalog and install a
package's published documentation plus its verified exact-version source snapshot.

On a fresh data directory, the UI starts a bounded background setup for `edgeR`, `DESeq2`, `limma`,
`fgsea`, `ComplexHeatmap`, `tximport`, `tximeta`, `apeglm`, `AnnotationDbi`, `biomaRt`, and
`SummarizedExperiment`. Failed packages remain isolated and can be retried with `/add`.

Configuration lives in `~/.config/biocontext/biocontext.config.jsonc`. Application data lives in
`~/.local/share/biocontext`.

The package supports `darwin-arm64` and `darwin-x64`.
