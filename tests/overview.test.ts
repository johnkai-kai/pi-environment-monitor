import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry, Environment, Inventory, Kind } from "../src/inventory.ts";
import { overviewLines, shortenPath } from "../src/overview.ts";

function entry(kind: Kind, name: string, over: Partial<Entry> = {}): Entry {
  return {
    kind,
    name,
    path: `/base/u/.pi/agent/${kind}/${name}`,
    scope: "user",
    origin: "top-level",
    source: "local",
    enabled: true,
    ...over,
  };
}

function inventory(entries: Entry[], env: Partial<Environment> = {}, errors: string[] = []): Inventory {
  return {
    entries,
    errors,
    environment: {
      agentDir: "/base/u/.pi/agent",
      cwd: "/base/work/proj",
      projectTrusted: true,
      projectNeedsTrust: false,
      mcpProvider: null,
      ...env,
    },
  };
}

const text = (inv: Inventory): string => overviewLines(inv, 100).join("\n");

const BASE = [
  entry("skill", "herdr"),
  entry("skill", "eli5", { origin: "package", source: "npm:pi-eli5" }),
  entry("extension", "pi-eli5", { origin: "package", source: "npm:pi-eli5" }),
  entry("package", "npm:pi-eli5"),
];

test("the headline separates the boxes from what is inside them", () => {
  const out = text(inventory(BASE));
  assert.match(out, /1 package {2}\+ {2}3 things installed/);
  assert.match(out, /2 came inside a package · 1 standalone/);
});

// pi ships dark and light, so counting only what the user installed says "2 themes" to someone
// who can actually choose from four.
test("built-in themes are counted apart from installed ones, never blended in", () => {
  const out = text(
    inventory([
      ...BASE,
      entry("theme", "cc-dark", { origin: "package", source: "npm:pi-cc" }),
      entry("theme", "dark", { scope: "builtin", source: "builtin" }),
      entry("theme", "light", { scope: "builtin", source: "builtin" }),
    ]),
  );
  assert.match(out, /theme\s+3\s+1 from packages\s+2 built into pi/);
  // They were not installed, so they must not inflate the installed total.
  assert.match(out, /1 package {2}\+ {2}4 things installed/);
  assert.match(out, /plus 2 built into pi/);
});

test("each kind reports how many came from packages and how many stand alone", () => {
  const out = text(inventory(BASE));
  assert.match(out, /skill\s+2\s+1 from packages\s+1 standalone/);
});

test("a kind with nothing installed says so rather than vanishing", () => {
  assert.match(text(inventory(BASE)), /prompt\s+0\s+none installed/);
});

// This is the single most common cause of "I put a skill in .pi/ and pi ignored it".
test("an untrusted project is called out in capitals, not buried", () => {
  const out = text(inventory(BASE, { projectNeedsTrust: true, projectTrusted: false }));
  assert.match(out, /NOT TRUSTED/);
  assert.match(out, /are NOT loading/);
});

test("a project with nothing to trust says the question never came up", () => {
  assert.match(text(inventory(BASE)), /not needed · this project contributes nothing/);
});

test("a trusted project confirms its resources are live", () => {
  const out = text(inventory(BASE, { projectNeedsTrust: true, projectTrusted: true }));
  assert.match(out, /trusted · project resources are loading/);
  assert.ok(!out.includes("NOT TRUSTED"));
});

test("mcp names the package that reads it, because pi does not", () => {
  const out = text(inventory([...BASE, entry("mcp", "exa")], { mcpProvider: "npm:pi-mcp-adapter" }));
  assert.match(out, /read by npm:pi-mcp-adapter, not by pi/);
});

// Only this panel can answer "my mcp.json is right and nothing happens".
test("servers with no package to read them are flagged as doing nothing", () => {
  const out = text(inventory([...BASE, entry("mcp", "exa")], { mcpProvider: null }));
  assert.match(out, /NO package reads them/);
  assert.match(out, /pi has no MCP support/);
});

test("with no mcp at all the section stays quiet", () => {
  assert.ok(!text(inventory(BASE)).includes("mcp"));
});

test("a name defined twice is reported as overridden", () => {
  const out = text(inventory([...BASE, entry("mcp", "dup", { shadows: ["/a/mcp.json"] })]));
  assert.match(out, /1 name defined more than once · dup/);
});

test("disabled items are counted and named", () => {
  const out = text(inventory([...BASE, entry("skill", "sleepy", { enabled: false })]));
  assert.match(out, /disabled\s+1 item · sleepy/);
  assert.match(text(inventory(BASE)), /disabled\s+none/);
});

test("a package configured but missing from disk is called out", () => {
  const out = text(inventory([...BASE, entry("package", "npm:ghost", { enabled: false })]));
  assert.match(out, /1 package configured but missing from disk/);
});

test("read errors surface on the page instead of being swallowed", () => {
  assert.match(text(inventory(BASE, {}, ["mcp: boom"])), /could not read\s+mcp: boom/);
});

test("the home prefix shortens for display only", () => {
  assert.equal(shortenPath("/base/u/.pi/agent/x", "/base/u"), "~/.pi/agent/x");
  assert.equal(shortenPath("C:\\Users\\u\\.pi\\x", "C:\\Users\\u"), "~/.pi/x");
  assert.equal(shortenPath("/elsewhere/x", "/base/u"), "/elsewhere/x");
  assert.equal(shortenPath("/base/u/x", ""), "/base/u/x");
});

test("an empty inventory renders without throwing", () => {
  assert.ok(overviewLines(inventory([]), 80).length > 0);
});
