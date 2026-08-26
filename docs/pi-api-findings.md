# What pi exposes, and what it does not

Findings from reading the type definitions published by
`@earendil-works/pi-coding-agent`, version 0.84.3. This settled the
architecture, so it is recorded here rather than left in a commit message.

## The question

The plan assumed this package would have to re-derive pi's discovery rules —
walk the scopes, apply the conventions, work out what pi would load. That is
what the reference package `pi-statusline-hud` does in `src/collect/env.ts`.

It turns out to be unnecessary for four of the six kinds.

## What pi hands over

`DefaultPackageManager.resolve()` returns `ResolvedPaths`:

```ts
interface PathMetadata {
  source: string;                          // package spec, or "local"
  scope: "user" | "project" | "temporary";
  origin: "package" | "top-level";
  baseDir?: string;
}

interface ResolvedResource {
  path: string;      // absolute
  enabled: boolean;
  metadata: PathMetadata;
}

interface ResolvedPaths {
  extensions: ResolvedResource[];
  skills: ResolvedResource[];
  prompts: ResolvedResource[];
  themes: ResolvedResource[];
}
```

That is the panel's entire row, already resolved: the absolute path, whether it
is live, and which layer put it there. It is the same call pi makes at startup,
so the answer is what pi loads rather than an approximation of it.

Packages come from `PackageManager.listConfiguredPackages()`, which returns the
source spec, its scope, and `installedPath` — absent when a package is
configured but not installed, which is itself worth showing.

`SettingsManager.create(cwd, agentDir)` supplies the settings the package
manager needs, and reads only.

### resolve() writes unless told not to

`resolve(onMissing?)` installs anything configured but missing when `onMissing`
is omitted. Passing `async () => "skip"` makes it pure: it reports missing
sources as absent and touches nothing. This package always passes it. A
diagnostic panel that npm-installs while you look at it would be a nasty
surprise, and this repository's rule is that it never writes to the live
install.

## What pi does not expose

**MCP servers — and pi does not have them at all.**

The first pass here said pi exposes no MCP *API*. Reading the source showed
something stronger: pi has no MCP *support*. Across the whole monorepo — ten
packages, 240+ TypeScript files — `find -ipath '*mcp*'` returns nothing, and
grepping for `mcpServers` or `hostConfigDiscovery` in `packages/coding-agent`
returns nothing. `ResolvedPaths` has four kinds, and MCP is not one of them.

MCP arrives through a third-party package. On the machine this was developed
against that is [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter),
an ordinary pi extension. So `~/.pi/agent/mcp.json` — its location, its format,
the order the files are read in — is that adapter's convention, not pi's. A pi
user without the adapter has no MCP at all, and the file does nothing.

This matters for anything built on it:

- The rules in `src/collect/mcp.ts` mirror a **third-party package**, so they
  can change when that package does. They are maintenance debt in a way the
  rest of this codebase deliberately is not.
- The adapter writes its own resolved list to `<agentDir>/mcp-cache.json`
  (`{version, servers: {...}}`). Asking it beats copying it, the same way asking
  pi's `PackageManager` beats copying pi's rules — with the caveat that a cache
  can be stale and does not record which file each server came from.
- `pi-statusline-hud`'s `collect/env.ts` calls these "pi's own rule" and "pi's
  source order" in its comments. That is wrong, and the ported copy here should
  not repeat it.

The files the adapter reads, in its order:

| Path | Scope |
| --- | --- |
| `~/.config/mcp/mcp.json` | user |
| `~/.agents/mcp.json` | user |
| `~/.agents/mcp/mcp.json` | user |
| `<agentDir>/mcp.json` | user |
| `<cwd>/.mcp.json` | project |
| `<cwd>/.pi/mcp.json` | project |

Two of those live under `~/.agents/`, which is shared with other agent tools
rather than owned by pi — a server can be live in pi that was never put in a pi
config at all.

Beyond the files, a config's `imports` array pulls in another tool's servers
(claude-code, codex, cursor, claude-desktop, opencode, vscode, windsurf), and
`settings.hostConfigDiscovery: "on"` pulls in every one of them without being
asked.

**Later file wins.** The adapter merges the configs in order, so a name defined twice is
live in the *last* file. Reporting the first match points at the definition
being overridden — the most misleading thing this panel could say, since editing
it changes nothing. The scan reports the winner and counts what it overrode.

## Things that looked useful and are not

- `resources_discover` is an event for *contributing* resource paths, not for
  reading the resolved set.
- `ExtensionAPI` exposes no handle on the live `ResourceLoader` or
  `PackageManager`. Constructing our own with the same `cwd` and `agentDir` is
  the supported route, and runs pi's code rather than a copy of its rules.
- `ctx.ui.getAllThemes()` returns theme names and paths, but only themes, and
  only inside a TUI session. `resolve()` covers them along with everything else.

## Measured

A full scan of a real install — 11 packages, 38 entries across five kinds —
takes about 25 ms. Fast enough that caching would be a liability rather than an
optimisation.
