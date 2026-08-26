import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// package.json is the only thing pi reads to find this package's parts. A path in "pi" that
// does not exist fails silently at load time: pi skips the entry and the user sees a package
// that installed cleanly and does nothing.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Manifest {
  pi?: { extensions?: string[]; skills?: string[] };
  dependencies?: Record<string, string>;
  files?: string[];
}

const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as Manifest;

test("every declared pi path exists on disk", () => {
  const declared = [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? [])];
  assert.ok(declared.length > 0, "package.json declares no pi entry points");
  for (const rel of declared) {
    assert.ok(existsSync(join(ROOT, rel)), `pi entry ${rel} does not exist`);
  }
});

// The panel reads the user's install; it has no business pulling a dependency tree into it.
// pi and pi-tui stay peers, marked optional, so installing this package adds nothing.
test("no runtime dependencies", () => {
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
});

test("published files list covers the pi entry points", () => {
  const roots = manifest.files ?? [];
  for (const rel of [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? [])]) {
    const top = rel.replace(/^\.\//, "").split("/")[0];
    assert.ok(roots.includes(top as string), `"files" omits ${top}, so ${rel} would not publish`);
  }
});
