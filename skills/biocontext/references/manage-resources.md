# Manage package resources

Read this file only when an exact local package scope is unavailable or insufficient, or the user explicitly requires a refresh of the current configured release. `/add` cannot select an arbitrary release. If the requested exact version is not already the local pinned scope, use official versioned documentation or direct source instead of changing configuration.

1. Try `@bioconductor:<Package>` first; questions never download resources. If an unavailable mention remains in the input, send one Ctrl-C (`\x03`) to clear it before entering another command.

2. Preserve the canonical package capitalization shown by the package catalog or local autocomplete. In the same session, submit:

   ```text
   /add verify <Package> --json
   ```

   A differently cased name can target the wrong path and falsely report `package_missing` or an identity conflict. Retry such a result with canonical spelling.

3. Route the result conservatively:

   - `complete`: reuse it. Refresh only after approval when the task requires new evidence for the resource's already configured release selector. `/add` cannot switch it to a requested arbitrary release.
   - `invalid` with only `package_missing`: retry the exact local question because bundled documentation may still work. If it does, copy any needed bundled evidence before adding; a new managed resource can become the preferred scope. Add only when required evidence, such as package source, is missing.
   - `partial` or another `invalid`: attempt add or refresh only when required. Malformed, unsafe, or identity-conflicting directories can be rejected instead of repaired in place.
   - If default package setup is running, wait. Continue only if that package fails or a deliberate refresh remains necessary.

4. Before mutation, read `./biocontext.config.jsonc` and `~/.config/biocontext/biocontext.config.jsonc` when present. Derive active resources by name; project entries override global entries with the same name. Compare `name` and `package` case-insensitively:

   - If an active `type: "bioconductor"` entry has the target `name` but a different `package`, stop and report the identity conflict.
   - If its `package` matches under another `name`, try `@<name>`. Reuse a valid alias without mutation. If it is invalid or requires refresh, report that `/add` cannot safely mutate an aliased resource; do not search for the canonical package or create a duplicate entry.
   - If a project config exists and the target entry comes only from global config, reuse it when valid. If it requires refresh, report that `/add` cannot update a global resource from this project; do not create an override or edit either config.

5. State the exact package resource and reason for changing it. Ask for authorization and wait. Only after approval, submit `/add`, enter `bioconductor` in the resource-type prompt, then wait for `Bioconductor packages`. Type the exact canonical package name and poll until the selected row begins `> <Package>`. Use the separate text/Enter writes defined in `SKILL.md` at each step.

6. Inspect the selected row before Enter. `local` can mean bundled documentation or a complete managed cache and can hide configured state.

   - If `local` or `configured` evidence is sufficient, send Escape (`\x1b`).
   - If addition, repair, or refresh is justified, send Enter once. Wait for the package search to close with `Installed <Package>`, `Reinstalled <Package>`, or a visible error; a busy indicator is not success.
   - `Installed` can mean a new materialization or a reused complete cache pinned in config. For an explicitly forced refresh, if the first success is `Installed`, reopen `/add`, choose `bioconductor`, select the package, and submit once more; the configured update should report `Reinstalled`.
   - On collision or repair rejection, send Escape and report the error. Never rename, remove, overwrite, or manually alter the directory.

7. Query only after installation finishes, package search closes, and local autocomplete refreshes. Add only packages directly required by the task.

Use `/add` only for the authorized mutation steps above. Do not use `/remove`, manual config/cache edits, or cache clearing. Do not refresh a complete resource for reassurance. Retry one clearly transient operation at most; a failed refresh must leave the previous complete resource untouched.
