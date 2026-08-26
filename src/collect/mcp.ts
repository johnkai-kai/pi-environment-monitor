import { basename, join } from "node:path";
import type { Entry, Scope } from "../inventory.ts";
import { field, safe, strings, type Readers } from "./readers.ts";

// MCP servers are the one kind pi does not resolve for us — because pi does not have them.
//
// Skills, extensions, prompts and themes all come back from pi's own PackageManager already
// resolved, with a path and an enabled flag (see resources.ts). MCP has no equivalent, and the
// reason is stronger than a missing API: pi has no MCP support at all. The whole monorepo — ten
// packages — contains no MCP code. It arrives through a third-party extension, pi-mcp-adapter,
// which owns the file locations, the format and the read order used below.
//
// So this is the one place where discovery rules are re-implemented rather than borrowed, and
// the rules being mirrored belong to that adapter, which means they can change when it does.
// docs/pi-api-findings.md has the evidence and the better long-term option.
//
// The logic is ported from pi-statusline-hud's collect/env.ts, which computes the same sets and
// then returns only their size. Its comments attribute these rules to pi; that attribution is
// wrong and is not repeated here.

const PKG_SEPARATOR = "__";
const HOST_DISCOVERY_ON = "on";
// Only the first key segment of [mcp_servers.<name>]; sub-tables (.env, say) are not servers.
const TOML_SERVER_TABLE = /^[ \t]*\[\[?[ \t]*mcp_servers[ \t]*\.[ \t]*(?:"([^"]+)"|'([^']+)'|([^.\s\]"']+))/gm;

function namedServers(config: unknown, keys: string[]): string[] {
  for (const key of keys) {
    const servers = field(config, key);
    if (typeof servers === "object" && servers !== null) return Object.keys(servers);
  }
  return [];
}

function serverNames(config: unknown): string[] {
  return namedServers(config, ["mcpServers"]);
}

function tomlServerNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(TOML_SERVER_TABLE)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name !== undefined && name.length > 0) names.push(name);
  }
  return names;
}

interface HostContext {
  home: string;
  cwd: string;
  readers: Readers;
}

interface HostResult {
  path: string;
  names: string[];
  /** Servers the host's own config marks as off. */
  disabled?: string[];
}

// Try candidates in order; the first that reads wins — pi's own rule.
function firstCandidate(loaders: Array<() => HostResult | null>): HostResult | null {
  for (const load of loaders) {
    const result = safe<HostResult | null>(load, null);
    if (result !== null) return result;
  }
  return null;
}

function jsonHost(ctx: HostContext, path: string, keys: string[]): HostResult {
  return { path, names: namedServers(ctx.readers.readJson(path), keys) };
}

function opencodeHost(ctx: HostContext, path: string): HostResult {
  const servers = field(ctx.readers.readJson(path), "mcp");
  if (typeof servers !== "object" || servers === null) return { path, names: [] };
  const all = Object.entries(servers as Record<string, unknown>);
  return {
    path,
    names: all.map(([name]) => name),
    disabled: all.filter(([, entry]) => field(entry, "enabled") === false).map(([name]) => name),
  };
}

const MCP_KEYS = ["mcpServers", "mcp-servers"];

// opencode only reads the user-level ~/.config/opencode/opencode.json. pi has a second
// candidate, ./opencode.json relative to the git root; servers declared only there are missed.
const HOSTS: Record<string, (ctx: HostContext) => HostResult | null> = {
  "claude-code": (ctx) =>
    firstCandidate([
      () => jsonHost(ctx, join(ctx.home, ".claude", "mcp.json"), ["mcpServers"]),
      () => jsonHost(ctx, join(ctx.home, ".claude.json"), ["mcpServers"]),
      () => jsonHost(ctx, join(ctx.home, ".claude", "claude_desktop_config.json"), ["mcpServers"]),
    ]),
  codex: (ctx) =>
    firstCandidate([
      () => {
        const path = join(ctx.home, ".codex", "config.toml");
        return { path, names: tomlServerNames(ctx.readers.readText(path)) };
      },
      () => jsonHost(ctx, join(ctx.home, ".codex", "config.json"), ["mcp_servers", "mcpServers"]),
    ]),
  cursor: (ctx) => jsonHost(ctx, join(ctx.home, ".cursor", "mcp.json"), MCP_KEYS),
  "claude-desktop": (ctx) =>
    jsonHost(
      ctx,
      join(ctx.home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      ["mcpServers"],
    ),
  opencode: (ctx) => opencodeHost(ctx, join(ctx.home, ".config", "opencode", "opencode.json")),
  vscode: (ctx) => jsonHost(ctx, join(ctx.cwd, ".vscode", "mcp.json"), MCP_KEYS),
  windsurf: (ctx) => jsonHost(ctx, join(ctx.home, ".windsurf", "mcp.json"), MCP_KEYS),
};

// The six config files the adapter reads, in its order, each with the scope it belongs to.
// `.agents` is shared with other agent tools rather than owned by pi, which is exactly why a
// server can appear that the user never put in a pi-specific config at all.
function configFiles(agentDir: string, cwd: string, home: string): Array<[string, Scope]> {
  return [
    [join(home, ".config", "mcp", "mcp.json"), "user"],
    [join(home, ".agents", "mcp.json"), "user"],
    [join(home, ".agents", "mcp", "mcp.json"), "user"],
    [join(agentDir, "mcp.json"), "user"],
    [join(cwd, ".mcp.json"), "project"],
    [join(cwd, ".pi", "mcp.json"), "project"],
  ];
}

function sanitizePackageName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function entry(name: string, path: string, scope: Scope, source: string, enabled: boolean): Entry {
  return { kind: "mcp", name, path, scope, origin: source === "local" ? "top-level" : "package", source, enabled };
}

function packageServers(roots: readonly string[], readers: Readers, out: Entry[]): void {
  for (const root of roots) {
    safe(() => {
      const manifest = readers.readJson(join(root, "package.json"));
      const declared = field(field(manifest, "pi"), "mcp");
      const files =
        typeof declared === "string"
          ? [declared]
          : Array.isArray(declared)
            ? declared.filter((item): item is string => typeof item === "string")
            : [];
      const rawName = field(manifest, "name");
      const packageName = typeof rawName === "string" ? rawName : basename(root);
      const prefix = `${sanitizePackageName(packageName)}${PKG_SEPARATOR}`;
      for (const rel of files) {
        const path = join(root, rel);
        safe(() => {
          for (const server of serverNames(readers.readJson(path))) {
            out.push(entry(prefix + server, path, "user", packageName, true));
          }
        }, undefined);
      }
    }, undefined);
  }
}

export interface McpScanInput {
  agentDir: string;
  cwd: string;
  home: string;
  packageRoots: readonly string[];
  readers: Readers;
}

/**
 * Every MCP server pi would load, with the config file each one came from.
 *
 * Names are deduplicated the way pi merges them: the first file to define a name owns it, so
 * the reported path is where the winning definition lives.
 */
export function scanMcp(input: McpScanInput): Entry[] {
  const { agentDir, cwd, home, packageRoots, readers } = input;
  const byName = new Map<string, Entry>();

  /** Adds a server only if the name is free. Used for sources that cannot override a config. */
  const push = (candidate: Entry): void => {
    if (!byName.has(candidate.name)) byName.set(candidate.name, candidate);
  };

  const files = configFiles(agentDir, cwd, home).map(([path, scope]) => ({
    path,
    scope,
    config: safe<unknown>(() => readers.readJson(path), undefined),
  }));

  let discovery: unknown;
  for (const file of files) {
    const value = field(field(file.config, "settings"), "hostConfigDiscovery");
    if (value !== undefined) discovery = value;
  }

  // The adapter merges the config files in order, later file wins. Reporting the first one found
  // would point at the file whose value is being overridden — the single most misleading thing
  // this panel could say, since editing it changes nothing.
  for (const file of files) {
    safe(() => {
      for (const name of serverNames(file.config)) {
        const previous = byName.get(name);
        const winner = entry(name, file.path, file.scope, "local", true);
        if (previous !== undefined) {
          winner.shadows = [...(previous.shadows ?? []), previous.path];
        }
        byName.set(name, winner);
      }
    }, undefined);
  }

  const ctx: HostContext = { home, cwd, readers };
  const addHost = (kind: string): void => {
    const load = HOSTS[kind];
    if (load === undefined) return;
    safe(() => {
      const result = load(ctx);
      if (result === null) return;
      const off = new Set(result.disabled ?? []);
      for (const name of result.names) {
        push(entry(name, result.path, "unknown", `import:${kind}`, !off.has(name)));
      }
    }, undefined);
  };

  // Explicit imports always expand; pi's expandImports does not consult settings.
  for (const file of files) {
    for (const kind of strings(file.config, "imports")) addHost(kind);
  }
  if (discovery === HOST_DISCOVERY_ON) {
    for (const kind of Object.keys(HOSTS)) addHost(kind);
  }

  const fromPackages: Entry[] = [];
  safe(() => packageServers(packageRoots, readers, fromPackages), undefined);
  for (const candidate of fromPackages) push(candidate);

  return [...byName.values()];
}
