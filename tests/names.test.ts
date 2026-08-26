import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, packageName, pathName } from "../src/collect/names.ts";

test("a skill is named by the directory holding its SKILL.md", () => {
  assert.equal(pathName("skill", "/base/u/.pi/agent/skills/herdr/SKILL.md"), "herdr");
});

test("a bare markdown skill is named by its stem", () => {
  assert.equal(pathName("skill", "/base/u/.pi/agent/skills/lifenote.md"), "lifenote");
});

test("SKILL.md matching ignores case", () => {
  assert.equal(pathName("skill", "/a/b/my-skill/skill.md"), "my-skill");
});

test("an extension entry point is named by its directory", () => {
  assert.equal(pathName("extension", "/a/b/autosave/index.ts"), "autosave");
  assert.equal(pathName("extension", "/a/b/autosave/index.js"), "autosave");
});

test("a standalone extension file is named by its stem", () => {
  assert.equal(pathName("extension", "/base/u/.pi/agent/extensions/herdr-agent-state.ts"), "herdr-agent-state");
});

test("prompts and themes are named by their stem, never their directory", () => {
  assert.equal(pathName("prompt", "/a/prompts/review.md"), "review");
  assert.equal(pathName("theme", "/a/themes/cc-dark.json"), "cc-dark");
});

test("windows separators are handled", () => {
  assert.equal(pathName("skill", "C:\\Users\\u\\.pi\\agent\\skills\\herdr\\SKILL.md"), "herdr");
});

test("a package spec reduces to its last segment", () => {
  assert.equal(packageName("npm:@llblab/pi-telegram"), "pi-telegram");
  assert.equal(packageName("git:github.com/johnkai-kai/pi-eli5"), "pi-eli5");
  assert.equal(packageName("npm:pi-mcp-adapter"), "pi-mcp-adapter");
});

// The bug this rule exists for: the first real run against an install named four different
// packages "dist", "src", "extensions" and "pi", because that is what the directory above
// index.ts is called. Nobody looks for an extension under those names.
test("an extension inside a package is named by the package, not its build directory", () => {
  const cases = [
    ["/a/npm/node_modules/@narumitw/pi-btw/dist/index.ts", "npm:@narumitw/pi-btw", "pi-btw"],
    ["/a/npm/node_modules/cc-safety-net/dist/pi/index.js", "npm:cc-safety-net", "cc-safety-net"],
    ["/a/git/github.com/o/pi-eli5/src/index.ts", "git:github.com/o/pi-eli5", "pi-eli5"],
  ] as const;
  for (const [path, source, expected] of cases) {
    assert.equal(displayName({ kind: "extension", path, origin: "package", source }), expected);
  }
});

test("a top-level extension keeps its path-derived name", () => {
  assert.equal(
    displayName({
      kind: "extension",
      path: "/base/u/.pi/agent/extensions/autosave.ts",
      origin: "top-level",
      source: "local",
    }),
    "autosave",
  );
});

test("a skill inside a package keeps its own name — only extensions take the package name", () => {
  assert.equal(
    displayName({
      kind: "skill",
      path: "/a/npm/node_modules/@llblab/pi-telegram/skills/telegram-bridge/SKILL.md",
      origin: "package",
      source: "npm:@llblab/pi-telegram",
    }),
    "telegram-bridge",
  );
});
