# biocontext

`biocontext` is a macOS terminal UI that answers Bioconductor package questions with documentation
and exact package source stored on your computer. Every answer cites the supporting file, line
range, package version, and Bioconductor release.

## Install

Install [Bun](https://bun.sh), then install biocontext:

```bash
bun add -g biocontext
biocontext
```

Run `/connect` once to choose a model provider.

## Ask a question

Ask about a package that is available locally:

```text
@DESeq2 How does lfcThreshold change the null hypothesis?
```

Use `@bioconductor:DESeq2` when you want to name the package resource explicitly. Use
`@Bioconductor` for the broad local Bioconductor resource.

The `@` palette lists local resources and package caches. It does not download anything while you
type or ask a question. The answer uses the documentation and source already on disk.

## Add a package

Use `/add` when a package is not available locally or needs a refresh. Choose `bioconductor` for a
Bioconductor package, `cran` for a CRAN package, `git` for a repository, or `local` for a directory.

For a Bioconductor package, `/add` finds the package in the Bioconductor catalog and installs its
published documentation together with the exact package source needed for source-grounded answers.

## Citations

biocontext returns compact citations such as:

```text
DESeq2.Rmd:903-920 (DESeq2 1.52.0)
```

The path and line range identify the local evidence. The package version and Bioconductor release
identify the version of the evidence.

## Install the Codex skill

The repository includes a [`biocontext` skill](skills/biocontext) that lets coding assistants
ground R-code changes in cited local package documentation and source.

Clone [the repository](https://github.com/ZohebKhan1/biocontext), then run these commands from its
root. If you already have the repository, skip the first two lines:

```bash
git clone https://github.com/ZohebKhan1/biocontext.git
cd biocontext
skill_dir="${CODEX_HOME:-$HOME/.codex}/skills/biocontext"
mkdir -p "$skill_dir"
cp -R skills/biocontext/. "$skill_dir/"
```

Start a new Codex session after installing the skill. Codex will then discover it from
`${CODEX_HOME:-$HOME/.codex}/skills/biocontext/SKILL.md`.
