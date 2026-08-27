import { homedir } from "node:os";
import { join } from "node:path";
import {
  DefaultPackageManager,
  getPackageDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  SettingsManager,
  type ResolvedPaths,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import type { Entry, Environment, Inventory, Kind, Scope } from "../inventory.ts";
import { compareEntries } from "../inventory.ts";
import { builtinThemes } from "./builtins.ts";
import { FS_READERS } from "./fs-readers.ts";
import { scanMcp } from "./mcp.ts";
import { displayName } from "./names.ts";
import type { Readers } from "./readers.ts";

// Where the inventory actually comes from.
//
// The original plan was to re-derive pi's discovery rules. That turned out to be unnecessary
// for four of the six kinds: pi's own PackageManager.resolve() already returns exactly what
// the panel needs — an absolute path, an `enabled` flag, and metadata saying which scope and
// which package each resource came from. Re-implementing that would have meant maintaining a
// second copy of rules that change with every pi release, and being wrong whenever it drifted.
//
// resolve() is the same call pi makes at startup, so its answer is what pi would load, not an
// approximation of it. Packages come from listConfiguredPackages(); only MCP has no such API
// and is scanned separately.

/**
 * resolve() installs anything configured but missing unless it is told otherwise. This package
 * reads the user's live install and never writes to it, so every missing source is skipped and
 * simply reported as absent — a diagnostic panel that silently npm-installs while you look at
 * it would be a very unpleasant surprise.
 */
const NEVER_INSTALL = async (): Promise<"skip"> => "skip";

const RESOURCE_KINDS: Array<[keyof ResolvedPaths, Kind]> = [
  ["skills", "skill"],
  ["extensions", "extension"],
  ["prompts", "prompt"],
  ["themes", "theme"],
];

function toScope(value: string): Scope {
  return value === "user" || value === "project" || value === "temporary" ? value : "unknown";
}

function toEntry(kind: Kind, resource: ResolvedResource): Entry {
  const { origin, source } = resource.metadata;
  return {
    kind,
    name: displayName({ kind, path: resource.path, origin, source }),
    path: resource.path,
    scope: toScope(resource.metadata.scope),
    origin,
    source,
    enabled: resource.enabled,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface CollectOptions {
  cwd: string;
  agentDir: string;
  home?: string;
  readers?: Readers;
}

/**
 * pi's own rule, copied from its startup path rather than guessed: a project with nothing that
 * needs trust is trusted for want of a question; otherwise the stored decision governs.
 *
 * Getting this wrong is not cosmetic. `SettingsManager.create()` defaults `projectTrusted` to
 * true, so a panel that omits it reports `.pi/` skills and extensions as live in a project where
 * pi is loading none of them.
 */
function resolveTrust(cwd: string, agentDir: string): { trusted: boolean; needsTrust: boolean } {
  const needsTrust = safeCall(() => hasTrustRequiringProjectResources(cwd), false);
  if (!needsTrust) return { trusted: true, needsTrust: false };
  const decision = safeCall<unknown>(() => new ProjectTrustStore(agentDir).get(cwd), undefined);
  return { trusted: decision === true, needsTrust: true };
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Which installed package supplies MCP support. pi has none of its own, so without one of these
 * an mcp.json on disk is read by nobody.
 */
function findMcpProvider(sources: readonly string[], readers: Readers, roots: readonly string[]): string | null {
  for (const [index, root] of roots.entries()) {
    const declaresMcp = safeCall(() => {
      const manifest = readers.readJson(join(root, "package.json"));
      const pi = manifest !== null && typeof manifest === "object" ? (manifest as Record<string, unknown>).pi : undefined;
      return pi !== null && typeof pi === "object" && "mcp" in (pi as Record<string, unknown>);
    }, false);
    if (declaresMcp) return sources[index] ?? root;
  }
  // A package can implement MCP without declaring `pi.mcp` — the adapter this was developed
  // against does exactly that, shipping only an extension. Naming is the remaining signal.
  return sources.find((source) => /mcp/i.test(source)) ?? null;
}

export async function collectInventory(options: CollectOptions): Promise<Inventory> {
  const { cwd, agentDir } = options;
  const home = options.home ?? homedir();
  const readers = options.readers ?? FS_READERS;
  const entries: Entry[] = [];
  const errors: string[] = [];

  const trust = resolveTrust(cwd, agentDir);
  const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: trust.trusted });
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });

  const packageRoots: string[] = [];
  const packageSources: string[] = [];
  try {
    for (const pkg of packageManager.listConfiguredPackages()) {
      const path = pkg.installedPath;
      if (path !== undefined && path !== "") {
        packageRoots.push(path);
        packageSources.push(pkg.source);
      }
      entries.push({
        kind: "package",
        name: pkg.source,
        // A package configured but not installed has no path; say so rather than showing a
        // path that is not there.
        path: path ?? "(not installed)",
        scope: toScope(pkg.scope),
        origin: "top-level",
        source: pkg.source,
        // `filtered` means the package's manifest only contributes part of what it ships.
        enabled: path !== undefined,
      });
    }
  } catch (error) {
    errors.push(`packages: ${describe(error)}`);
  }

  try {
    const resolved = await packageManager.resolve(NEVER_INSTALL);
    for (const [key, kind] of RESOURCE_KINDS) {
      for (const resource of resolved[key]) entries.push(toEntry(kind, resource));
    }
  } catch (error) {
    errors.push(`resources: ${describe(error)}`);
  }

  try {
    entries.push(...scanMcp({ agentDir, cwd, home, packageRoots, readers }));
  } catch (error) {
    errors.push(`mcp: ${describe(error)}`);
  }

  try {
    entries.push(...builtinThemes(getPackageDir(), readers));
  } catch (error) {
    errors.push(`built-in themes: ${describe(error)}`);
  }

  entries.sort(compareEntries);

  const environment: Environment = {
    agentDir,
    cwd,
    projectTrusted: trust.trusted,
    projectNeedsTrust: trust.needsTrust,
    mcpProvider: safeCall(() => findMcpProvider(packageSources, readers, packageRoots), null),
  };

  return { entries, environment, errors };
}
