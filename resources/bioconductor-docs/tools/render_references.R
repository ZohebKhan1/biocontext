#!/usr/bin/env Rscript

# Build one compact Markdown API reference per package from canonical man/*.Rd.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) {
  stop("usage: render_references.R ROOT", call. = FALSE)
}

root <- normalizePath(args[[1L]], mustWork = TRUE)
repos <- sort(Sys.glob(file.path(root, "*", "*", "repo")))
if (!length(repos)) {
  stop("no package repo directories found under ", root, call. = FALSE)
}

html_escape <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  gsub(">", "&gt;", x, fixed = TRUE)
}

rd_field <- function(text, field) {
  pattern <- paste0("\\\\", field, "\\{([^}]*)\\}")
  match <- regexec(pattern, text, perl = TRUE)
  value <- regmatches(text, match)[[1L]]
  if (length(value) >= 2L) value[[2L]] else ""
}

render_package <- function(repo) {
  description <- file.path(repo, "DESCRIPTION")
  man_dir <- file.path(repo, "man")
  if (!file.exists(description) || !dir.exists(man_dir)) {
    stop("missing DESCRIPTION or man directory: ", repo, call. = FALSE)
  }

  dcf <- read.dcf(description)
  package <- unname(dcf[1L, "Package"])
  version <- unname(dcf[1L, "Version"])
  rd_files <- sort(list.files(man_dir, pattern = "\\.Rd$", full.names = TRUE))
  if (!length(rd_files)) {
    stop("no Rd files found: ", repo, call. = FALSE)
  }

  sections <- character()
  for (rd_file in rd_files) {
    raw <- paste(readLines(rd_file, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
    topic <- rd_field(raw, "name")
    if (!nzchar(topic)) {
      topic <- sub("\\.Rd$", "", basename(rd_file))
    }

    alias_matches <- gregexpr("\\\\alias\\{[^}]+\\}", raw, perl = TRUE)
    aliases <- regmatches(raw, alias_matches)[[1L]]
    if (length(aliases) && aliases[[1L]] != "") {
      aliases <- unique(sub("^\\\\alias\\{([^}]+)\\}$", "\\1", aliases))
    } else {
      aliases <- character()
    }

    html_file <- tempfile(fileext = ".html")
    tools::Rd2HTML(
      rd_file,
      out = html_file,
      package = package,
      stages = "render"
    )
    page <- paste(readLines(html_file, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
    unlink(html_file)

    body <- sub("(?s).*?<body[^>]*>", "", page, perl = TRUE)
    body <- sub("(?s)</body>.*$", "", body, perl = TRUE)
    body <- sub("(?s)^.*?</table>", "", body, perl = TRUE)
    body <- sub("(?s)<hr><div style=\"text-align: center;\">\\[Package.*$", "", body, perl = TRUE)
    body <- sub(
      "<h2([^>]*)>",
      paste0("<h2\\1><code>", html_escape(topic), "</code>: "),
      body,
      perl = TRUE
    )

    alias_html <- ""
    if (length(aliases)) {
      alias_html <- paste0(
        "<p><strong>Aliases:</strong> <code>",
        paste(html_escape(aliases), collapse = "</code>, <code>"),
        "</code></p>"
      )
    }
    source_path <- file.path("repo", "man", basename(rd_file))
    source_html <- paste0(
      "<p><strong>Canonical source:</strong> <code>",
      html_escape(source_path),
      "</code></p>"
    )
    sections <- c(sections, paste0(alias_html, source_html, body))
  }

  combined <- tempfile(fileext = ".html")
  output_tmp <- tempfile(fileext = ".md")
  output <- file.path(dirname(repo), "reference.md")
  header <- paste0(
    "<html><body><h1>", html_escape(package), " API reference</h1>",
    "<p>Generated from the canonical package <code>man/*.Rd</code> sources. ",
    "Package version <code>", html_escape(version), "</code>; ",
    length(rd_files), " reference topics.</p>"
  )
  writeLines(c(header, sections, "</body></html>"), combined, useBytes = TRUE)

  status <- system2(
    Sys.which("pandoc"),
    c(
      "--from=html",
      "--to=gfm+pipe_tables",
      "--wrap=auto",
      "--columns=100",
      "--output", shQuote(output_tmp),
      shQuote(combined)
    )
  )
  unlink(combined)
  if (!identical(status, 0L)) {
    stop("pandoc failed for ", package, call. = FALSE)
  }

  markdown <- readLines(output_tmp, warn = FALSE, encoding = "UTF-8")
  unlink(output_tmp)
  markdown <- sub("^``` R$", "```r", markdown)
  markdown <- gsub("[[:space:]]+$", "", markdown)
  while (length(markdown) && !nzchar(markdown[[length(markdown)]])) {
    markdown <- markdown[-length(markdown)]
  }
  markdown <- c(markdown, "")

  dir.create(dirname(output), recursive = TRUE, showWarnings = FALSE)
  temporary <- paste0(output, ".tmp")
  writeLines(markdown, temporary, useBytes = TRUE)
  if (!file.rename(temporary, output)) {
    unlink(temporary)
    stop("could not replace ", output, call. = FALSE)
  }
  message(package, ": ", length(rd_files), " topics -> ", output)
}

for (repo in repos) {
  render_package(repo)
}
