---
name: pi-environment-monitor
description: Explain pi's configured resource inventory, resource paths, disabled entries and package contributions. Use when the user asks what is installed, where it lives, or why an installed resource is missing. This skill does not toggle resources or measure runtime health.
---

# Environment inventory

Run `/pi-environment-monitor` in an interactive pi session. This is the only command name.

The extension draws the panel. This skill explains when to use it and how to interpret it; the panel works without the skill.

## Read the panel

- Overview shows configured resources, package contributions, project trust and collection errors.
- Arrow keys move between tabs and rows. Typing filters the selected tab.
- Enter on a resource copies its path. Enter on a package opens its contributions.
- Escape leaves a package or closes the panel.
- Disabled entries remain visible. Enabled means configuration permits loading, not that initialization succeeded.
- Temporary command-line resources and additions from `resources_discover` are not included.

Skills, extensions, prompts and themes come from pi's package resolver. Untrusted project resources are excluded. MCP means Model Context Protocol; its configuration discovery follows the third-party adapter, not built-in pi support. A configured MCP server is not proof of a connected server.

## Enable or disable

The panel is read-only. Run `pi config` in a terminal to change resource filters. Tab switches between global and project settings; `pi config -l` starts with project overrides. Restart pi afterwards.

Do not claim the panel can toggle resources or detect every loading failure. For a missing entry, check the collection errors, project trust, package configuration and actual file path before suggesting a change.
