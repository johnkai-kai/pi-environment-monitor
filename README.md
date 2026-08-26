# pi-environment-monitor

An on-demand inventory panel for the [pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

## Why

pi loads skills, extensions, MCP servers, themes and prompt templates from
several scopes at once — the user level `~/.pi/agent`, the project level
`.pi/`, and the inside of every installed package. Nothing shows you the union.
`/context` does not: it is token accounting supplied by a third-party package,
and extensions never appear there because they cost no tokens.

This package answers the question `/context` cannot: **what is installed, and
where does it actually live?** Every skill, extension, MCP server, package,
theme and prompt template, with its real path on disk and whether it is
currently disabled.

Read-only. Toggling things on and off is a later phase.

## Status

**Scaffolding only.** No panel yet. The architecture waits on
`docs/investigation.md`, which settles where pi reads config from and whether
pi exposes an API that hands over the resolved lists directly.

## Development

```sh
npm install --no-save typescript @types/node @earendil-works/pi-coding-agent @earendil-works/pi-tui
npm test          # node --test over tests/*.test.ts
npx tsc --noEmit  # type check
node scripts/scan-secrets.mjs
```

Source is loaded by pi through Node's `--experimental-strip-types`, which is a
stripper and not a compiler. No enums, no namespaces, no parameter properties,
no `import x = require()` — `tsc --noEmit` accepts all four and pi cannot load
any of them. `tests/loadable.test.ts` is the guard.

## License

MIT. See [LICENSE](LICENSE).
