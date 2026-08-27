# pi-environment-monitor

An inventory panel for the [pi](https://github.com/earendil-works/pi) coding agent.
What is installed, and where does it actually live?

```
 Overview │ All 31 │[skill 12]│ ext 13 │ mcp 2 │ theme 4 │ prompt 0 ║ Packages 12

  search  hud█                                                            2 of 12

▌ pi-statusline-hud        package git:github.com/johnkai-kai/pi-statusline-hud
  pi-statusline-hud-setup  package git:github.com/johnkai-kai/pi-statusline-hud
  ──────────────────────────────────────────────────────────────────────
  ▌ pi-statusline-hud   skill · package git:github.com/johnkai-kai/pi-statusline-hud
  ~/.pi/agent/git/github.com/johnkai-kai/pi-statusline-hud/skills/pi-statusline-hud/SKILL.md
```

## Install

```bash
pi install git:github.com/johnkai-kai/pi-environment-monitor
```

Restart pi afterwards, then run `/pi-env`.

Installing writes no files of its own, and neither does the panel: it reads
your install and never modifies it. To try it for a single session without
installing anything, use `pi -e git:github.com/johnkai-kai/pi-environment-monitor`.

## Update

`git:` sources are not updated automatically.

```bash
pi update --extensions                                       # every package at once
pi update git:github.com/johnkai-kai/pi-environment-monitor  # just this one
```

Restart pi afterwards.

## Uninstall

```bash
pi remove git:github.com/johnkai-kai/pi-environment-monitor
```

Nothing is left behind. The package stores no settings and writes no state, so
there is no file to clean up.

## Why

pi loads skills, extensions, MCP servers, themes and prompt templates from
several places at once — the user level `~/.pi/agent`, the project level
`.pi/`, the agent-neutral `~/.agents/` shared with other tools, and the inside
of every installed package. Once loaded, nothing shows you where any of it came
from.

`/context` does not answer this. It is token accounting, supplied by a
third-party package, and extensions never appear in it because they cost no
tokens.

## Keys

One cursor moves through the whole panel — a light-orange block that is always
on whatever the next key acts on.

| Key | Action |
| --- | --- |
| `←` `→` | Move along the tabs |
| `↓` | Drop from the tabs into the list |
| `↑` | Move up; off the top row, back to the tabs |
| `Home` `End` `PgUp` `PgDn` | Jump within the list |
| type | Search the current tab |
| `Enter` | On the tabs, enter the list. On a row, copy its path. On a package, open it |
| `Esc` | Leave a package, or close the panel |

## The tabs

Everything left of the divider is a thing pi loaded. `Packages` past it is the
boxes those things arrived in — so `All` counts the contents rather than every
row, and counting boxes together with their contents no longer misleads.

- **Overview** — counts, and the conditions that stop an installed thing from
  working: an untrusted project, a name defined twice, a package configured but
  missing, MCP config files with nothing reading them.
- **skill / ext / mcp / theme / prompt** — one kind each, with its path, its
  scope, and whether it is disabled. An empty tab means "none installed", not
  "unsupported".
- **Packages** — what each package actually contributed. `Enter` opens one.

`mcp` appears only when a server is found, because pi has no MCP support of its
own; see below.

## Notes

**pi has no MCP.** Servers come from a third-party extension — on the machine
this was built against, `pi-mcp-adapter`. So `mcp.json`'s location, format and
read order are that adapter's conventions, not pi's, and without it the file
does nothing. The Overview names whichever package reads them.

**Built-in themes are included.** pi ships `dark` and `light`, and neither
`PackageManager.resolve()` nor `ResourceLoader.getThemes()` returns them, so
counting only installed themes says "2" to someone who can choose from four.

**Project trust matters.** pi loads `.pi/` resources and ancestor
`.agents/skills` only for a trusted project, and does not read project settings
otherwise. The Overview says so in capitals when it applies.

Findings behind all three are in [docs/pi-api-findings.md](docs/pi-api-findings.md).

## Development

```bash
npm install --no-save --ignore-scripts typescript @types/node \
  @earendil-works/pi-coding-agent @earendil-works/pi-tui
npm test          # node --test over tests/*.test.ts
npx tsc --noEmit  # type check
node scripts/scan-secrets.mjs

node scripts/render-panel.mjs . 120 right,down,type:hud   # render any view, no terminal
node scripts/audit.mjs                                    # cross-check against pi's own loader
```

pi loads extensions through Node's `--experimental-strip-types`, which strips
rather than compiles. No enums, no namespaces, no parameter properties, no
`import x = require()` — `tsc --noEmit` accepts all four and pi can load none of
them. `tests/loadable.test.ts` imports every file under `src` to catch it.

Set `PI_ENV_MONITOR_DEBUG=1` to log panel exceptions to
`<agentDir>/pi-environment-monitor.log`. Off by default; it never touches the
disk unless set.

## Thanks

Conventions, the strip-only loadability guard, the text sanitiser and the MCP
discovery rules come from
[pi-statusline-hud](https://github.com/johnkai-kai/pi-statusline-hud) by the
same author. [docs/reuse-audit.md](docs/reuse-audit.md) records what was taken
and what was not.

## License

MIT — see `LICENSE`.
