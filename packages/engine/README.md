# @biocontext/engine

The local retrieval and materialization engine behind the `biocontext` terminal UI. It loads
validated documentation and source snapshots, builds a virtual filesystem for each question, and
streams provider responses with evidence metadata.

Important areas:

| Path | Responsibility |
| --- | --- |
| `src/bioconductor` | Bioconductor catalog, document materialization, source filtering, and verification |
| `src/cran` | CRAN catalog and exact source-release materialization |
| `src/collections` | Virtual filesystem assembly and resource routing |
| `src/config` | `biocontext.config.jsonc` loading and persistence |
| `src/providers` | Model provider adapters and authentication |
| `src/tools` | Local `read`, `list`, `glob`, `grep`, `search`, and `evidence` tools |

The TUI starts the engine on an ephemeral loopback port inside the same process. The engine reads
local resources during a question. Network access belongs to `/add` and resource refresh operations.

Run engine checks from the repository root:

```bash
bun run check:engine
bun run test:engine
```
