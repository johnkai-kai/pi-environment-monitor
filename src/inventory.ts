// The one shape everything in this package produces and consumes.
//
// Three of these fields are the whole reason the package exists: `path` is where the thing
// actually lives, `enabled` is whether it is doing anything, and `scope` is which of pi's
// several config layers put it there. A count would answer none of those.

export const KINDS = ["skill", "extension", "mcp", "package", "theme", "prompt"] as const;

export type Kind = (typeof KINDS)[number];

/** pi's own scope names, plus `unknown` for sources pi does not label. */
export type Scope = "user" | "project" | "temporary" | "unknown";

export interface Entry {
  kind: Kind;
  /** What pi calls it. Derived from the path when pi does not name it directly. */
  name: string;
  /** Absolute path to the file or directory on disk. The point of the whole panel. */
  path: string;
  scope: Scope;
  /** Whether it arrived inside an installed package or was declared at the top level. */
  origin: "package" | "top-level";
  /** The package spec it came from, or "local" for a top-level declaration. */
  source: string;
  enabled: boolean;
  /**
   * Other files that define this same name and lost.
   *
   * Only MCP servers can collide this way today, and the collision is the exact confusion this
   * package exists to end: a server defined in two configs is live in one of them, and opening
   * the wrong file to change it looks like the change did nothing.
   */
  shadows?: string[];
}

/**
 * Facts about the install that are not entries, but change what the entries mean.
 *
 * `projectTrusted` is the sharp one: pi loads `.pi/` resources and ancestor `.agents/skills`
 * only for a trusted project, and does not even read project settings otherwise. A panel that
 * ignores it reports resources that are not loading.
 */
export interface Environment {
  agentDir: string;
  cwd: string;
  projectTrusted: boolean;
  /**
   * False when the project has nothing that would need trust in the first place, in which case
   * `projectTrusted` is true for want of a question rather than by decision.
   */
  projectNeedsTrust: boolean;
  /** The package supplying MCP support, if one is installed. pi itself has none. */
  mcpProvider: string | null;
}

export interface Inventory {
  entries: Entry[];
  environment: Environment;
  /** Anything that could not be read. Shown to the user rather than swallowed. */
  errors: string[];
}

const KIND_ORDER = new Map<Kind, number>(KINDS.map((kind, index) => [kind, index]));

export function compareEntries(a: Entry, b: Entry): number {
  const byKind = (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0);
  if (byKind !== 0) return byKind;
  const byName = a.name.localeCompare(b.name);
  return byName !== 0 ? byName : a.path.localeCompare(b.path);
}

export function countByKind(entries: readonly Entry[]): Record<Kind, number> {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<Kind, number>;
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

export function countDisabled(entries: readonly Entry[]): number {
  return entries.filter((entry) => !entry.enabled).length;
}
