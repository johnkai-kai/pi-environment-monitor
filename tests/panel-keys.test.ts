import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry, Inventory, Kind } from "../src/inventory.ts";
import { Panel } from "../src/panel.ts";
import { buildTabs } from "../src/tabs.ts";

// The bug this file exists for: the panel shipped comparing raw byte sequences ("\x1b[D" for
// left, "\x1b" for escape). Real terminals also send the kitty keyboard protocol and
// modifyOtherKeys forms, so nothing matched. It opened on Overview, the one tab with no list to
// fall through to, and swallowed every key — no tab switching, no exit. It read as a hang, and
// every test passed, because nothing here drove a key.
//
// So these tests send the encodings a terminal actually sends.

const LEGACY = { up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D" };
const APPLICATION = { up: "\x1bOA", down: "\x1bOB", right: "\x1bOC", left: "\x1bOD" };
const ESC = "\x1b";
const ENTER = "\r";
const BACKSPACE = "\x7f";
// Kitty encodes escape as CSI 27 u.
const KITTY_ESC = "\x1b[27u";

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

const ENTRIES: Entry[] = [
  entry("skill", "alpha"),
  entry("skill", "beta"),
  entry("skill", "gamma", { origin: "package", source: "npm:box" }),
  entry("extension", "ext-one", { origin: "package", source: "npm:box" }),
  entry("package", "npm:box", { source: "npm:box" }),
];

const INVENTORY: Inventory = {
  entries: ENTRIES,
  errors: [],
  environment: {
    agentDir: "/base/agent",
    cwd: "/base/proj",
    projectTrusted: true,
    projectNeedsTrust: false,
    mcpProvider: null,
  },
};

interface Harness {
  panel: Panel;
  closed: () => boolean;
  copied: () => string[];
  press: (...keys: string[]) => void;
  screen: () => string;
}

function harness(): Harness {
  let closed = false;
  const copied: string[] = [];
  const panel = new Panel(
    INVENTORY,
    "/base",
    buildTabs(ENTRIES),
    () => {
      closed = true;
    },
    (path) => copied.push(path),
  );
  return {
    panel,
    closed: () => closed,
    copied: () => copied,
    press: (...keys) => {
      for (const key of keys) panel.handleInput(key);
    },
    screen: () => panel.render(120).join("\n"),
  };
}

const tabId = (h: Harness): string => h.panel.tabs[h.panel.activeIndex]?.id ?? "";

test("the panel opens on Overview", () => {
  assert.equal(tabId(harness()), "overview");
});

// Overview has no list, so if arrows do not match there is nothing else to respond and the
// panel is a dead end from the first frame. That is exactly what shipped.
test("arrows switch tabs from the Overview page", () => {
  const h = harness();
  h.press(LEGACY.right);
  assert.equal(tabId(h), "all");
  h.press(LEGACY.left);
  assert.equal(tabId(h), "overview");
});

test("arrows work in the application-cursor encoding too", () => {
  const h = harness();
  h.press(APPLICATION.right);
  assert.equal(tabId(h), "all");
  h.press(APPLICATION.left);
  assert.equal(tabId(h), "overview");
});

test("escape closes the panel, in both the bare and kitty encodings", () => {
  const bare = harness();
  bare.press(ESC);
  assert.ok(bare.closed());

  const kitty = harness();
  kitty.press(KITTY_ESC);
  assert.ok(kitty.closed(), "kitty-encoded escape did not close the panel");
});

test("escape closes from a list tab as well as from Overview", () => {
  const h = harness();
  h.press(LEGACY.right, ESC);
  assert.ok(h.closed());
});

test("tabs wrap rather than dead-ending at either edge", () => {
  const h = harness();
  h.press(LEGACY.left);
  assert.equal(tabId(h), "packages");
  h.press(LEGACY.right);
  assert.equal(tabId(h), "overview");
});

test("up and down move the cursor and stop at the ends", () => {
  const h = harness();
  h.press(LEGACY.right); // All
  assert.equal(h.panel.selectedIndex, 0);
  h.press(LEGACY.down, LEGACY.down);
  assert.equal(h.panel.selectedIndex, 2);
  h.press(LEGACY.up);
  assert.equal(h.panel.selectedIndex, 1);
  // Clamped, not wrapped — wrapping past the end reads as a glitch.
  h.press(LEGACY.up, LEGACY.up, LEGACY.up);
  assert.equal(h.panel.selectedIndex, 0);
});

test("typing filters the current tab and shows in the search box", () => {
  const h = harness();
  h.press(LEGACY.right, "b", "e");
  assert.equal(h.panel.filter, "be");
  assert.match(h.screen(), /search {2}be/);
  assert.match(h.screen(), /1 of 4/);
  assert.match(h.screen(), /beta/);
  assert.ok(!h.screen().includes("alpha"));
});

test("backspace deletes one character and an empty filter is a no-op", () => {
  const h = harness();
  h.press(LEGACY.right, "b", "e", BACKSPACE);
  assert.equal(h.panel.filter, "b");
  h.press(BACKSPACE, BACKSPACE);
  assert.equal(h.panel.filter, "");
});

test("switching tabs clears the filter, so a tab never looks empty by accident", () => {
  const h = harness();
  h.press(LEGACY.right, "z", "z", "z");
  assert.equal(h.panel.filter, "zzz");
  h.press(LEGACY.right);
  assert.equal(h.panel.filter, "");
});

test("filtering resets the cursor, so it cannot point past the matches", () => {
  const h = harness();
  h.press(LEGACY.right, LEGACY.down, LEGACY.down, LEGACY.down);
  assert.ok(h.panel.selectedIndex > 0);
  h.press("b");
  assert.equal(h.panel.selectedIndex, 0);
});

test("enter copies the selected path and closes", () => {
  const h = harness();
  h.press(LEGACY.right, ENTER);
  assert.deepEqual(h.copied(), ["/base/skill/alpha"]);
  assert.ok(h.closed());
});

test("enter on the Packages tab opens the package instead of copying", () => {
  const h = harness();
  h.press(LEGACY.left, ENTER); // wrap left to Packages
  assert.equal(h.panel.drilledInto?.source, "npm:box");
  assert.deepEqual(h.copied(), []);
  assert.ok(!h.closed());
  // Only what that package contributed.
  assert.match(h.screen(), /Packages \/ npm:box/);
  assert.match(h.screen(), /gamma/);
  assert.ok(!h.screen().includes("alpha"));
});

test("escape inside a package goes back rather than closing the panel", () => {
  const h = harness();
  h.press(LEGACY.left, ENTER, ESC);
  assert.equal(h.panel.drilledInto, null);
  assert.ok(!h.closed(), "escape closed the panel instead of stepping back");
  h.press(ESC);
  assert.ok(h.closed());
});

test("every view renders without throwing, at wide and narrow widths", () => {
  for (const width of [200, 120, 80, 40]) {
    const h = harness();
    for (let step = 0; step < h.panel.tabs.length; step += 1) {
      assert.ok(h.panel.render(width).length > 0);
      h.press(LEGACY.right);
    }
  }
});

test("the cursor row is marked in the list and named underneath it", () => {
  const h = harness();
  h.press(LEGACY.right, LEGACY.down);
  const screen = h.screen();
  assert.match(screen, /▌ .*beta/);
  assert.match(screen, /▌ beta {3}skill · user/);
});
