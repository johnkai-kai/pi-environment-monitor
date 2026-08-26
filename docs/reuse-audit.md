# Reuse audit — pi-statusline-hud → pi-environment-monitor

Every file under `../pi-statusline-hud/src`, with a verdict for this package.
Read-only survey; nothing in that repo was modified.

Verdicts:

- **copy-as-is** — take the file with at most a rename, no design decision left.
- **extend** — the idea and much of the code carry over, but the shape has to
  change because this package needs names and paths where the HUD needed a count
  or a colour.
- **ignore** — solves a problem this package does not have.

**Settled after the first version was built.** The open architecture question — does
pi hand over the resolved lists — turned out to be yes for four of the six kinds.
`PackageManager.resolve()` returns skills, extensions, prompts and themes already
resolved, with path, `enabled` and scope, so far less of the reference package was
needed than the original verdicts assumed. Findings are in
[pi-api-findings.md](pi-api-findings.md); the verdicts below say what actually
happened.

## The core

| File | Verdict | Reasoning |
| --- | --- | --- |
| `collect/env.ts` | **partly used** | Expected to be the centrepiece; supplied about a sixth of the work. Its skill / extension / package scanning is superseded by pi's own `PackageManager.resolve()`, which returns what the HUD had to reconstruct — so none of it was copied. Its **MCP** half is the exception and was ported into `src/collect/mcp.ts`, because pi exposes no MCP API and those rules still have to live somewhere. One behaviour changed on the way: the HUD collects names into a `Set`, where order does not matter, but reporting a *path* forces the question of which definition wins, and pi's answer is the last file, not the first. |
| `collect/fs-readers.ts` | **copy-as-is** | The `EnvReaders` implementation behind `scanEnv`, including the symlink-aware `listDir`. It moves with `env.ts` unchanged; the injection seam is what makes the scanner testable against a virtual filesystem instead of a real install. |
| `sanitize.ts` | **copy-as-is** | Mandatory, and more so here than in the HUD. This panel prints names and paths straight out of third-party packages and the filesystem; unsanitised, an OSC or CSI sequence in a package name owns the terminal's control channel. Zero-dependency, self-contained, no HUD assumptions. |

## Interactive panel

| File | Verdict | Reasoning |
| --- | --- | --- |
| `settings-menu.ts` | **extend** | The only file in the reference that touches the pi runtime, and the template for the panel: `ctx.ui.custom` mounted once rather than a `ctx.ui.select` loop that resets the cursor and flickers on every remount. Its `Submenu` wrapper — `Container` has no `handleInput`, so key delegation is manual — is a trap worth inheriting the fix for. The content becomes a list of installed things, not settings. |
| `settings-items.ts` | **extend** | The pattern is the transferable part: a pure layer that describes rows and declares its own row types instead of importing pi-tui's, so it is testable without pi. Its actual rows (palettes, rainbow targets, mottos) are all HUD. Here the rows are inventory entries. |
| `settings-io.ts` | **extend** | Thin read/write over the agent directory with `try`/`catch` returning a default. The read half and `readAgentPackages` carry over almost verbatim; the write half is dead weight until the toggling phase, and this package must not write to the user's live install before then. |
| `wizard.ts` | **ignore** | A first-run setup flow for the HUD's seven config keys. This package has no configuration to walk anyone through. Revisit only if the toggling phase grows persistent state. |
| `config.ts` | **ignore** | Typed schema, defaults and parsing for HUD settings — lines, motto, palette, rainbow, budgets. Every field is HUD-specific. If a config file appears later, copy the shape (`parseConfig` + `DEFAULT_CONFIG` + `serialisableConfig`), not the contents. |
| `install.ts` | **ignore** | Plans a `settings.json` edit at postinstall time to resolve footer ownership conflicts. This package registers a slash command, which conflicts with nothing, and writing to a user's live install unasked during `npm install` is a pattern worth not repeating. |
| `index.ts` | **copy-as-is** | One re-export line. Kept as the manifest's `pi.extensions` entry point. |

## Diagnostics

| File | Verdict | Reasoning |
| --- | --- | --- |
| `debug.ts` | **extend** | Off unless its env var is set, size-capped so a broken session cannot fill the disk, and every write swallowed. A panel that catches exceptions to avoid taking pi down needs the same landing place. Rename the env var; keep the logic. |

## Rendering and colour

| File | Verdict | Reasoning |
| --- | --- | --- |
| `palette.ts` | **extend** | Two halves. `paint`, `visibleLength`, `truncateAnsi` and `padBetween` are general ANSI utilities any list view needs for width-correct truncation. The sixteen named palettes are a HUD feature; a panel should follow pi's own theme via `getSettingsListTheme`, not ship its own. |
| `palette-recipe.ts` | **ignore** | Derives nine palette roles from four OKLCH parameters. Excellent, and entirely in service of a feature this package does not have. |
| `rainbow.ts` | **ignore** | Animated per-target colour cycling. Decoration for a status line; noise in an inventory list. |
| `meters.ts` | **ignore** | Bar-fill maths and compact count formatting (k/M) for the HUD's meters. This panel shows names and paths, not magnitudes. |
| `statusline.ts` | **ignore** | The HUD's own extension body: event wiring, per-turn state, footer registration, render loop. This package renders on demand from a slash command, so almost none of that structure applies — but it is the reference for *how* an extension registers itself with pi, so it is worth reading once even though no line of it is copied. |
| `lines/types.ts` | **extend** | `fitGroups`, `renderSpans`, `labelSpans` and the `Span` model — a width-aware layout for text that must degrade instead of wrap. A panel with a name column, a path column and a disabled flag in an unknown terminal width has the same problem. The `HudData` interface itself is HUD. |
| `lines/index.ts` | **ignore** | Dispatch table mapping enabled HUD line names to renderers. Structure only; there are no HUD lines here. |
| `lines/header.ts` | **ignore** | Model, provider, elapsed time, motto. HUD content. |
| `lines/env.ts` | **ignore** | Renders the five `EnvCounts` numbers into one row. The closest thing in the reference to this package's subject, and exactly the wrong end of it: it is the code that presents counts. This package exists because counts are not the answer. |
| `lines/meters.ts` | **ignore** | Context-window and cache meters. HUD content. |
| `lines/repo.ts` | **ignore** | Branch and git status marks. HUD content. |
| `lines/status.ts` | **ignore** | Speed, sparkline, live agent count. HUD content. |
| `lines/tools.ts` | **ignore** | Per-tool call and error tallies. HUD content. |
| `lines/session-bar.ts` | **ignore** | A horizontal rule with an inverse-video label. A separator style the panel could borrow if it ever groups by scope, but not needed for the first version. |
| `lines/sparkline.ts` | **ignore** | Eight block glyphs for a trend window. Nothing in an inventory trends. |

## Per-turn collectors

These watch the live session. This package scans the disk on demand and holds no
per-turn state, so the group is almost entirely out.

| File | Verdict | Reasoning |
| --- | --- | --- |
| `collect/agents.ts` | **ignore** | Tracks live sub-agent ids across start/end events. Session state. |
| `collect/animation.ts` | **ignore** | Frame pacing and idle stop for the rainbow. No animation here. |
| `collect/git.ts` | **ignore** | Parses `git status --porcelain=v1`. The panel does not care about the repo. |
| `collect/history.ts` | **ignore** | Ring buffer of recent speeds, feeding the sparkline. |
| `collect/scheduler.ts` | **extend** | Injected `Clock`, debouncer and cooldown, extracted precisely so "when should this run" is testable without sleeping. A disk scan that repaints needs debouncing for the same reason. Take it if the panel ever refreshes itself; not needed while it is strictly on-demand. |
| `collect/shrink.ts` | **ignore** | Infers context compaction from the payload actually sent. Session state, and a subtle piece of work with no analogue here. |
| `collect/speed.ts` | **ignore** | Token-per-second estimation with per-model tokenizer recalibration. Session state. |
| `collect/timing.ts` | **ignore** | `formatElapsed` — `1h20m` from milliseconds. Two lines; copy them if a timestamp column ever appears. |
| `collect/tools.ts` | **ignore** | Per-tool call and error counts. Session state. |
| `collect/usage.ts` | **ignore** | Token and cost accumulation. Session state — and the part `/context` already reports. |

## Outside `src`

Taken as project scaffolding rather than code, and already in place in this repo:
`package.json` shape (the `pi` key, optional `peerDependencies`, `files`, zero
runtime dependencies), `tsconfig.json`, `.gitattributes`, `.gitignore`, `LICENSE`,
`.github/workflows/ci.yml`, and `scripts/scan-secrets.mjs`.

`tests/loadable.test.ts` is copied and is the most valuable single test in the
reference: it imports every file under `src` to catch syntax that
`--experimental-strip-types` cannot parse but `tsc --noEmit` happily accepts.
`tests/docs-contract.test.ts` is the second — locking documented defaults against
the code — and should be adopted once this package has documented defaults to lock.
`scripts/postinstall.mjs` is deliberately not copied: see the `install.ts` verdict.
