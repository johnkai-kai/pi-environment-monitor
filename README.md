# pi-environment-monitor

An on-demand inventory panel for the [pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

**What is installed, and where does it actually live?**

## Why

pi loads skills, extensions, MCP servers, themes and prompt templates from
several places at once — the user level `~/.pi/agent`, the project level
`.pi/`, the agent-neutral `~/.agents/` shared with other tools, and the inside
of every installed package. Once loaded, nothing shows you where any of it came
from.

`/context` does not answer this. It is token accounting, supplied by a
third-party package, and extensions never appear in it because they cost no
tokens.

## What it does

Run `/pi-env` (or `/pi-environment-monitor`). Every installed skill, extension,
MCP server, package, theme and prompt template, each with:

- its **absolute path on disk**
- whether it is **currently disabled**
- which **scope or package** put it there

Type to filter. `enter` copies the selected path to the clipboard. `esc` closes.

Read-only: it never writes to your pi install. Turning things on and off is a
later phase.

```
11 skill  ·  12 extension  ·  2 mcp  ·  11 package  ·  2 theme

  skill      telegram-bridge
             …/npm/node_modules/@llblab/pi-telegram/skills/telegram-bridge/SKILL.md  ·  package npm:@llblab/pi-telegram
→ mcp        mylifenote
             ~/.pi/agent/mcp.json  ·  user  ·  overrides 1 other definition
  extension  pi-btw
             …/npm/node_modules/@narumitw/pi-btw/dist/index.ts  ·  package npm:@narumitw/pi-btw
```

That `overrides 1 other definition` is the kind of thing this exists for: the
server is defined in two config files, and only the later one is live. Editing
the other one looks like it does nothing.

## Install

```sh
pi install git:github.com/johnkai-kai/pi-environment-monitor
```

To try it for one session without installing anything:

```sh
pi -e git:github.com/johnkai-kai/pi-environment-monitor
```

## How it works

pi's own `PackageManager.resolve()` already returns every skill, extension,
prompt and theme with an absolute path, an `enabled` flag and the scope that
contributed it — so this package asks pi rather than re-deriving pi's rules,
and cannot drift out of step with them. It passes `onMissing: "skip"` so the
call never installs anything.

MCP servers are the exception: pi exposes no API for them, so their config
files are read directly. Details and the full findings are in
[docs/pi-api-findings.md](docs/pi-api-findings.md).

## Development

```sh
npm install --no-save --ignore-scripts typescript @types/node \
  @earendil-works/pi-coding-agent @earendil-works/pi-tui
npm test          # node --test over tests/*.test.ts
npx tsc --noEmit  # type check
node scripts/scan-secrets.mjs
```

pi loads extensions through Node's `--experimental-strip-types`, which strips
rather than compiles. No enums, no namespaces, no parameter properties, no
`import x = require()` — `tsc --noEmit` accepts all four and pi can load none of
them. `tests/loadable.test.ts` imports every file under `src` to catch it.

Set `PI_ENV_MONITOR_DEBUG=1` to log panel exceptions to
`<agentDir>/pi-environment-monitor.log`. Off by default; it never touches the
disk unless set.

## Credits

Conventions, the strip-only loadability guard, the text sanitiser and the MCP
discovery rules come from
[pi-statusline-hud](https://github.com/johnkai-kai/pi-statusline-hud) by the
same author. [docs/reuse-audit.md](docs/reuse-audit.md) records what was taken
and what was not.

## License

MIT. See [LICENSE](LICENSE).
