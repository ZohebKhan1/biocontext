# Bundled resources

`bioconductor-docs` is a tracked snapshot of the sibling
[`bioconductor-docs`](https://github.com/ZohebKhan1/bioconductor-docs) source repository. Maintain
that source repository first, then refresh this snapshot with `bun run sync:bioconductor-docs`.

This directory contains resources intentionally bundled with `biocontext`. It is not the writable
cache for packages installed with `/add`. Managed Bioconductor and CRAN resources live in
`~/.local/share/biocontext/resources/` by default, or under `<dataDirectory>/resources/` when
configured.

The snapshot includes the cleaned documentation and its routing metadata. It excludes Git metadata
and machine-specific files. Its source commit is recorded in `bioconductor-docs.snapshot.json`.
