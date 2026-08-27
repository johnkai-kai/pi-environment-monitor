import { plainSkin } from "../src/skin.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry, Kind } from "../src/inventory.ts";
import {
  buildTabs,
  entriesForTab,
  indexOfTab,
  renderTabBar,
  stepTab,
  tabShowsKindColumn,
} from "../src/tabs.ts";

function entry(kind: Kind, name: string, over: Partial<Entry> = {}): Entry {
  return {
    kind,
    name,
    path: `/base/${kind}/${name}`,
    scope: "user",
    origin: "top-level",
    source: "local",
    enabled: true,
    ...over,
  };
}

const SAMPLE: Entry[] = [
  entry("skill", "herdr"),
  entry("skill", "eli5", { origin: "package", source: "npm:pi-eli5" }),
  entry("extension", "autosave"),
  entry("theme", "cc-dark", { origin: "package", source: "npm:pi-cc" }),
  entry("package", "npm:pi-eli5"),
  entry("package", "npm:pi-cc"),
];

const ids = (entries: Entry[]) => buildTabs(entries).map((tab) => tab.id);

test("the tab order is Overview, All, the content kinds, then Packages", () => {
  assert.deepEqual(ids(SAMPLE), ["overview", "all", "skill", "extension", "theme", "prompt", "packages"]);
});

// A count that mixes boxes and their contents is what made "41 entries" mislead: 12 of those 41
// were the packages the other 29 came in.
test("All counts the contents only, never the packages", () => {
  const all = buildTabs(SAMPLE).find((tab) => tab.id === "all");
  assert.equal(all?.count, 4);
  assert.equal(buildTabs(SAMPLE).find((tab) => tab.id === "packages")?.count, 2);
});

test("an empty kind still gets a tab, so absence reads as 'none' rather than 'unsupported'", () => {
  const prompt = buildTabs(SAMPLE).find((tab) => tab.id === "prompt");
  assert.equal(prompt?.count, 0);
});

// pi has no MCP support of its own; servers come from a third-party adapter. On an install
// without one, an MCP tab would name a concept that does not exist there.
test("mcp gets a tab only when a server was actually found", () => {
  assert.ok(!ids(SAMPLE).includes("mcp"));
  assert.ok(ids([...SAMPLE, entry("mcp", "exa")]).includes("mcp"));
});

test("Packages is the only tab past the divider", () => {
  const grouped = buildTabs(SAMPLE).filter((tab) => tab.startsGroup);
  assert.deepEqual(grouped.map((tab) => tab.id), ["packages"]);
});

test("each tab holds exactly its own entries", () => {
  const tabs = buildTabs(SAMPLE);
  const forId = (id: string) => entriesForTab(tabs.find((tab) => tab.id === id)!, SAMPLE);
  assert.deepEqual(forId("skill").map((item) => item.name), ["herdr", "eli5"]);
  assert.equal(forId("all").length, 4);
  assert.equal(forId("packages").length, 2);
  assert.deepEqual(forId("overview"), []);
});

test("the kind column shows on All and nowhere else — elsewhere it repeats one word", () => {
  const tabs = buildTabs(SAMPLE);
  assert.ok(tabShowsKindColumn(tabs.find((tab) => tab.id === "all")!));
  assert.ok(!tabShowsKindColumn(tabs.find((tab) => tab.id === "skill")!));
});

test("the strip marks the active tab with brackets, not colour alone", () => {
  const bar = renderTabBar(buildTabs(SAMPLE), 2, 200, { skin: plainSkin(), focused: true, plain: true });
  assert.match(bar, /\[skill 2\]/);
  assert.match(bar, /Overview/);
  // Packages sits past a heavier divider because it is a different layer.
  assert.match(bar, /║ {1,2}Packages/);
});

test("a strip too wide for the terminal degrades to naming where you are", () => {
  const bar = renderTabBar(buildTabs(SAMPLE), 2, 30, { skin: plainSkin(), focused: true, plain: true });
  assert.ok(bar.length <= 30, `"${bar}" is ${bar.length} wide`);
  assert.match(bar, /skill/);
  assert.match(bar, /3\/7/);
});

test("an absurdly narrow terminal still returns something that fits", () => {
  const bar = renderTabBar(buildTabs(SAMPLE), 0, 5, { skin: plainSkin(), focused: true, plain: true });
  assert.ok(bar.length <= 5);
});

test("stepping past either end wraps", () => {
  const tabs = buildTabs(SAMPLE);
  assert.equal(stepTab(tabs, 0, -1), tabs.length - 1);
  assert.equal(stepTab(tabs, tabs.length - 1, 1), 0);
  assert.equal(stepTab(tabs, 2, 1), 3);
});

test("an unknown tab id falls back to the first tab rather than -1", () => {
  const tabs = buildTabs(SAMPLE);
  assert.equal(indexOfTab(tabs, "packages"), tabs.length - 1);
  assert.equal(indexOfTab(tabs, "mcp"), 0);
});

test("an empty inventory still produces a usable strip", () => {
  const tabs = buildTabs([]);
  assert.deepEqual(tabs.map((tab) => tab.id), ["overview", "all", "skill", "extension", "theme", "prompt", "packages"]);
  assert.ok(renderTabBar(tabs, 0, 120, { skin: plainSkin(), focused: true, plain: true }).length > 0);
});
