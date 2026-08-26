// Filesystem access is injected rather than imported directly, so the scanners can be tested
// against a virtual tree instead of whatever happens to be installed on the machine running
// the tests. The real implementation is in fs-readers.ts.

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface Readers {
  readJson(path: string): unknown;
  readText(path: string): string;
  exists(path: string): boolean;
  listDir(path: string): DirEntry[];
}

/** Runs `fn`, falling back to `fallback` on any throw. Missing files are the normal case here. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function strings(value: unknown, key: string): string[] {
  const list = field(value, key);
  return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
}
