import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// Every file under src must be loadable under Node's --experimental-strip-types, which is how
// pi loads an extension. Strip-only cannot parse parameter properties, enum, namespace,
// decorators or `import x = require(...)`; tsc --noEmit accepts all of them, so type-checking
// alone lets a module that cannot even be imported pass CI.
//
// This test asks one thing: does it import?

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const FILES = tsFiles(SRC);

test("src is not empty — a guard that finds nothing is no guard", () => {
  assert.ok(FILES.length >= 1, `no .ts files found under ${SRC}`);
});

for (const file of FILES) {
  const name = file.slice(SRC.length + 1).replace(/\\/g, "/");
  test(`src/${name} loads in strip-only mode`, async () => {
    await assert.doesNotReject(
      () => import(pathToFileURL(file).href),
      `src/${name} failed to load — most likely syntax strip-only does not support (parameter properties, enum, namespace, decorators)`,
    );
  });
}
