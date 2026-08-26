import { homedir } from "node:os";
import {
  DefaultPackageManager,
  SettingsManager,
  type ResolvedPaths,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import type { Entry, Inventory, Kind, Scope } from "../inventory.ts";
import { compareEntries } from "../inventory.ts";
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

export async function collectInventory(options: CollectOptions): Promise<Inventory> {
  const { cwd, agentDir } = options;
  const home = options.home ?? homedir();
  const readers = options.readers ?? FS_READERS;
  const entries: Entry[] = [];
  const errors: string[] = [];

  const settingsManager = SettingsManager.create(cwd, agentDir);
  const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });

  const packageRoots: string[] = [];
  try {
    for (const pkg of packageManager.listConfiguredPackages()) {
      const path = pkg.installedPath;
      if (path !== undefined && path !== "") packageRoots.push(path);
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

  entries.sort(compareEntries);
  return { entries, errors };
}
