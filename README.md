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

`/connect` supports OpenAI (GPT), Anthropic (Claude), Google (Gemini), OpenCode Zen, GitHub Copilot,
OpenRouter, MiniMax, and OpenAI-compatible endpoints.

## Ask a question

Ask about a package that is available locally:

```text
@DESeq2 How does lfcThreshold change the null hypothesis?
```

Use `@bioconductor:DESeq2` when you want to name the package resource explicitly. Use
`@Bioconductor` for the broad local Bioconductor resource.

The `@` palette lists local resources and package caches.

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

The package version and Bioconductor release identify the version of the evidence.

## Install the Codex skill

In a Codex chat, use the built-in skill installer:

```text
$skill-installer install https://github.com/ZohebKhan1/biocontext/tree/main/skills/biocontext
```

Start a new Codex session after installation.
