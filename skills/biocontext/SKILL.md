---
name: biocontext
description: 'Use biocontext to ground consequential Bioconductor package decisions in versioned documentation and source during coding, review, debugging, or planning. Invoke for requested source verification; unresolved API or S4 contracts, object compatibility, workflow or parameter semantics, implementation or release behavior, and cross-package handoffs; or to validate an important package-specific assumption when evidence would materially improve correctness or confidence despite a plausible answer. Also use it to verify, add, or refresh a required biocontext resource. Do not trigger from an R or Bioconductor mention alone, for low-impact routine facts, or to repeat evidence already in context. Exclude generic R, statistics, or biology; execution-only work; R-package installation; CRAN-only behavior; literature-only scientific or clinical claims; and questions answered by relevant package source in the workspace.'
---

# biocontext

Use the local `biocontext` command to ground Bioconductor decisions in package documentation and source. Treat answers as package/version-scoped evidence. `/add` can add searchable documentation and source; it does not install an R package.

## Use from a coding assistant

A coding assistant can use biocontext before it edits R code. It asks a focused package question, reads the cited answer from local documentation and source, and uses that evidence to guide the change. Each answer stays tied to the package version and supporting files.

### Start the local session

1. Run `command -v biocontext` and `uname -s`. Require `Darwin`. If the executable is missing, report that biocontext must be installed or linked. Offer `bun add -g biocontext`, but do not install it without authorization.

2. Resolve this skill's directory from the loaded `SKILL.md`, then start its capture wrapper in a persistent session:

   ```text
   exec_command(cmd="zsh <skill-dir>/scripts/run-headless.zsh", tty=true, yield_time_ms=1000)
   ```

   Retain the session ID and printed `BIOCONTEXT_CAPTURE_FILE` path. Poll until `Ask a Bioconductor question... or / for commands` is visible. The wrapper intercepts `/copy` output without changing the macOS clipboard and removes its temporary directory on exit. If startup takes more than 30 seconds or exits, report it; do not loop indefinitely.

3. Send the question and its submission as separate writes. Poll with empty input while the response is generated:

   ```text
   write_stdin(session_id=<id>, chars="<input>", yield_time_ms=1000)
   write_stdin(session_id=<id>, chars="\r", yield_time_ms=1000)
   write_stdin(session_id=<id>, chars="", yield_time_ms=5000)
   ```

   Reuse the session for related questions. Never invent shell subcommands such as `biocontext ask` or `biocontext status`.

4. If a question reports missing or disconnected provider authentication, stop and ask the user to use `/connect`; do not authenticate unattended.

5. When finished, send one Ctrl-C (`\x03`), confirm that the process exits, and verify that `BIOCONTEXT_CAPTURE_FILE` no longer exists.

## Ask and capture

- Before querying, identify the downstream code or planning decision and exact package claim to verify. Query when an error could materially change correctness, interpretation, compatibility, or robustness, or when source confirmation would strengthen confidence in such a decision. Plausible knowledge is not a reason to skip; a package mention is not enough. Prioritize model and contrast semantics, normalization and offsets, object contracts, argument constraints and defaults, release-sensitive behavior, and cross-package handoffs. Skip routine, low-impact, or already source-grounded facts.
- Use the narrowest local scope: `@bioconductor:<Package>` for one package. For interactions, query the packages together, such as `@bioconductor:tximport @bioconductor:DESeq2`. Use `@Bioconductor` only when the package is unknown or broad local discovery is necessary. Explicit mentions replace the previous scope; a mention-free follow-up retains it.
- Ask decision-shaped questions, not topical summaries. State the relevant code or object state, planned choice, current assumption, and exact point to verify. A useful pattern is: `Given <state or code>, I plan <choice> because <assumption>. For <package/version if known>, is this supported? Explain the behavior, consequences, material exceptions, and cite the decisive manual, vignette, or source evidence.` Adapt the request to the decision instead of demanding irrelevant sections. Combine interdependent claims or packages when they need the same evidence; separate unrelated decisions.
- Submit the question using separate writes. Wait up to the configured provider timeout for `run /copy to copy message to clipboard` and for the normal input prompt to return. Use the captured exchange as the result, not intermediate output. On timeout or process exit, report the failure rather than resubmitting automatically.
- Send `/copy` and Enter as separate writes. After `Copied latest exchange to clipboard.` appears, read `BIOCONTEXT_CAPTURE_FILE` with a separate non-interactive command and use that exchange as the result. If the capture file is missing or empty, report the failure; never fall back to overwriting the system clipboard without consent.
- Preserve package/version scope and citations. Ask a targeted follow-up when the answer changes the decision or exposes a material unresolved claim; do not repeat resolved points. Never describe documentation-grounded code as executed or scientifically validated unless verified separately.

If the local scope is unavailable or insufficient, or the user explicitly requires a refresh of the current configured release, read [references/manage-resources.md](references/manage-resources.md) completely before changing anything.

## Apply the evidence

- Use manuals for API contracts, source for implementation, vignettes for supported workflows, and NEWS or DESCRIPTION for release-sensitive claims. Keep documented behavior, implementation observations, author guidance, and inference distinct.
- Make the smallest justified code or plan change. Preserve the user's analysis design; an API contract alone does not establish scientific suitability. Verify code, objects, tests, and rendered outputs through the appropriate R workflow.
- When local evidence lacks the required version or coverage, use official versioned documentation or direct source. Verify current/latest identities with an official current source, inspect modified local repositories directly, and use primary literature for scientific or clinical claims.

## Guardrails

- Do not use `/add`, `/remove`, or manual config/cache edits for normal package research.
- Retry one clearly transient failure at most. Never clear caches, credentials, threads, or package directories to recover.
- Send no secrets, credentials, private datasets, or unrelated repository content to the configured provider.
