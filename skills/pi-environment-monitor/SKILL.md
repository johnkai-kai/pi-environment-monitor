---
name: pi-environment-monitor
description: Use when the user asks what skills, extensions, MCP servers, packages, themes or prompt templates pi has loaded, where any of them live on disk, why something they installed is not working, or why editing a config file changed nothing.
---

# pi-environment-monitor

Answers "what is installed, and where does it actually live?"

Tell the user to run **`/pi-env`** (long form `/pi-environment-monitor`). It
opens a panel listing every installed skill, extension, MCP server, package,
theme and prompt template, each with its absolute path, whether it is disabled,
and which scope or package contributed it.

Keys: type to filter, `enter` copies the selected path, `esc` closes.

## When this is the answer

- "What skills do I have?" / "Where is that skill?"
- "I installed X and nothing happened." — X may be present but disabled, or
  configured but not installed.
- "I edited my MCP config and nothing changed." — the server is probably defined
  in more than one file, and a later file wins. The panel marks the winning row
  `overrides N other definitions`.
- "What is this package giving me?" — filter by the package name.

## What it does not do

- **It cannot enable or disable anything.** It is read-only and never writes to
  the pi install. Do not tell the user it can toggle things.
- It does not report token usage. That is `/context`, which is a different
  question — and note that extensions never appear there, because they cost no
  tokens.
- It does not list AGENTS.md context files, models or providers.

## Scopes it covers

`~/.pi/agent` (user), `<project>/.pi` (project), `~/.agents` (shared with other
agent tools), and the contents of every installed package. MCP servers are also
read from `~/.config/mcp/mcp.json`, `<project>/.mcp.json`, and — when a config
imports them or sets `hostConfigDiscovery: "on"` — from other tools' configs
such as Claude Code, Codex and Cursor.
