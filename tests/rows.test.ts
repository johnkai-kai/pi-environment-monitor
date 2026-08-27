import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareEntries,
  countByKind,
  countDisabled,
  type Entry,
  type Environment,
} from "../src/inventory.ts";
import {
  DETAIL_LINES,
  DISABLED_MARK,
  buildRow,
  detailLines,
  filterEntries,
  keyHint,
  matchesFilter,
  searchBox,
  selectionLine,
  sourceLabel,
  summaryLine,
  textReport,
} from "../src/rows.ts";

const ENV: Environment = {
  agentDir: "/base/u/.pi/agent",
  cwd: "/base/work/proj",
  projectTrusted: true,
  projectNeedsTrust: false,
  mcpProvider: null,
};

function entry(over: Partial<Entry> = {}): Entry {
  return {
    kind: "skill",
    name: "herdr",
    path: "/base/u/.pi/agent/skills/herdr/SKILL.md",
    scope: "user",
    origin: "top-level",
    source: "local",
    enabled: true,
    ...over,
  };
}

test("a row carries the path as its value — that is what selecting one hands back", () => {
  assert.equal(buildRow(entry()).value, "/base/u/.pi/agent/skills/herdr/SKILL.md");
});

// The path used to sit in every row, where it overflowed the terminal and spent most of the
// width on a prefix identical down the whole column.
test("the path is not in the row itself", () => {
  const row = buildRow(entry());
  assert.ok(!row.label.includes("SKILL.md"));
  assert.ok(!row.description.includes("SKILL.md"));
});

test("the kind column appears only when asked for", () => {
  assert.ok(buildRow(entry(), { showKind: true }).label.startsWith("skill"));
  assert.ok(buildRow(entry()).label.startsWith("herdr"));
});

test("the kind column is padded so names line up across kinds", () => {
  const short = buildRow(entry({ kind: "mcp", name: "exa" }), { showKind: true });
  const long = buildRow(entry({ kind: "extension", name: "autosave" }), { showKind: true });
  assert.equal(short.label.indexOf("exa"), long.label.indexOf("autosave"));
});

test("a disabled entry is marked, not quietly dropped", () => {
  assert.ok(buildRow(entry({ enabled: false })).label.includes(DISABLED_MARK));
  assert.ok(!buildRow(entry()).label.includes(DISABLED_MARK));
});

test("the source column names the package, the scope, or the tool imported from", () => {
  assert.equal(sourceLabel(entry({ origin: "package", source: "npm:x" })), "package npm:x");
  assert.equal(sourceLabel(entry()), "user");
  assert.equal(sourceLabel(entry({ source: "import:cursor" })), "imported from cursor");
});

test("the detail line shortens the home prefix but the row's value stays absolute", () => {
  const item = entry();
  assert.match(detailLines(item, "/base/u")[0] as string, /^ {2}~\/\.pi\/agent/);
  assert.equal(buildRow(item).value, item.path);
});

test("an overridden name lists what it beat, in the detail line", () => {
  const lines = detailLines(entry({ kind: "mcp", shadows: ["/base/u/.config/mcp/mcp.json"] }), "/base/u");
  const joined = lines.join("\n");
  assert.match(joined, /overrides a definition in:/);
  assert.match(joined, /\.config\/mcp\/mcp\.json/);
});

// The detail area used to grow with whatever the cursor was on, moving everything below it.
test("the detail area is always the same height, selected or not", () => {
  const none = detailLines(null, "/base/u");
  const plain = detailLines(entry(), "/base/u");
  const withShadows = detailLines(entry({ shadows: ["/a/one.json", "/a/two.json"] }), "/base/u");
  assert.equal(none.length, DETAIL_LINES);
  assert.equal(plain.length, DETAIL_LINES);
  assert.equal(withShadows.length, DETAIL_LINES);
  assert.deepEqual(none, ["", "", ""]);
});

// pi-tui's own filter is value.startsWith(), and value is an absolute path — so every row shared
// a prefix and typing anything at all matched nothing.
test("filtering matches a substring of the name, kind, source, scope or path", () => {
  const item = entry({ name: "telegram-bridge", origin: "package", source: "npm:@llblab/pi-telegram" });
  for (const needle of ["bridge", "TELE", "skill", "llblab", "user", "SKILL.md"]) {
    assert.ok(matchesFilter(item, needle), `"${needle}" should match`);
  }
  assert.ok(!matchesFilter(item, "nonsense"));
});

test("an empty filter keeps everything", () => {
  const all = [entry(), entry({ name: "other" })];
  assert.equal(filterEntries(all, "").length, 2);
  assert.equal(filterEntries(all, "other").length, 1);
});

// Names and paths come from third-party packages and the filesystem. An escape sequence in one
// would be zero-width to the layout and would still reach the terminal's control channel.
test("terminal escape sequences never reach a row or a detail line", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const item = entry({ name: `ev${ESC}]0;pwned${BEL}il`, path: `/a${ESC}[2Jb` });
  const row = buildRow(item);
  for (const text of [row.label, row.description, row.value, ...detailLines(item, "")]) {
    assert.ok(!text.includes(ESC), `escape survived in ${JSON.stringify(text)}`);
    assert.ok(!text.includes(BEL), `bell survived in ${JSON.stringify(text)}`);
  }
  assert.ok(row.label.includes("evil"));
});

test("the key hint lists the keys for the view you are in", () => {
  assert.match(keyHint("list", ""), /↑↓ move/);
  assert.match(keyHint("packages", ""), /enter open package/);
  assert.match(keyHint("drill", ""), /esc back/);
  // On Overview every arrow switches tabs, so the hint groups them rather than offering
  // "move", which there is nothing to move.
  assert.match(keyHint("page", ""), /↑↓←→ tab/);
  assert.ok(!keyHint("page", "").includes("move"));
});

// A filter mentioned only in a footer hint is a filter nobody finds — and in the first version
// that hint advertised one that did not work at all.
test("the search box is drawn whether or not anything is typed", () => {
  assert.match(searchBox("", 12, 12, 80), /search/);
  assert.match(searchBox("", 12, 12, 80), /12 items/);
  assert.match(searchBox("tele", 4, 12, 80), /search {2}tele/);
  assert.match(searchBox("tele", 4, 12, 80), /4 of 12/);
  assert.match(searchBox("", 1, 1, 80), /1 item$/);
});

test("the search box fits the width it is given", () => {
  for (const width of [40, 80, 200]) {
    assert.ok(searchBox("abc", 2, 9, width).length <= width, `too wide at ${width}`);
  }
});

test("the selection line names what the cursor is on, without relying on colour", () => {
  assert.match(selectionLine(entry({ name: "herdr" })), /▌ herdr/);
  assert.match(selectionLine(entry({ name: "herdr" })), /skill · user/);
  assert.match(selectionLine(entry({ enabled: false })), /\[off\]/);
  assert.equal(selectionLine(null), "  nothing selected");
});

test("the summary names every kind present and the disabled total", () => {
  const entries = [entry(), entry({ kind: "mcp" }), entry({ kind: "mcp", enabled: false })];
  const line = summaryLine(entries);
  assert.match(line, /1 skill/);
  assert.match(line, /2 mcp/);
  assert.match(line, /1 disabled/);
});

test("the summary omits kinds that are absent, and says so when nothing is found", () => {
  assert.ok(!summaryLine([entry()]).includes("theme"));
  assert.equal(summaryLine([]), "nothing found");
});

test("entries sort by kind first, then name", () => {
  const sorted = [
    entry({ kind: "mcp", name: "zeta" }),
    entry({ kind: "skill", name: "beta" }),
    entry({ kind: "skill", name: "alpha" }),
  ].sort(compareEntries);
  assert.deepEqual(sorted.map((item) => item.name), ["alpha", "beta", "zeta"]);
});

test("counts cover every kind, including the ones with nothing in them", () => {
  const counts = countByKind([entry(), entry({ kind: "theme" })]);
  assert.equal(counts.skill, 1);
  assert.equal(counts.theme, 1);
  assert.equal(counts.prompt, 0);
  assert.equal(countDisabled([entry({ enabled: false }), entry()]), 1);
});

test("the text report groups by kind and still shows every full path", () => {
  const lines = textReport({
    entries: [entry(), entry({ kind: "theme", name: "cc-dark", path: "/a/cc-dark.json" })],
    environment: ENV,
    errors: ["mcp: boom"],
  });
  const joined = lines.join("\n");
  assert.match(joined, /^skill:$/m);
  assert.match(joined, /^theme:$/m);
  assert.match(joined, /\/a\/cc-dark\.json/);
  assert.match(joined, /could not read mcp: boom/);
});

test("a package row says what is in the box, not its scope", () => {
  const context = [
    entry({ kind: "package", name: "npm:x", source: "npm:x" }),
    entry({ kind: "skill", name: "a", origin: "package", source: "npm:x" }),
    entry({ kind: "skill", name: "b", origin: "package", source: "npm:x" }),
    entry({ kind: "extension", name: "c", origin: "package", source: "npm:x" }),
  ];
  const row = buildRow(context[0] as Entry, { context });
  assert.equal(row.description, "2 skills · 1 extension");
});

test("a package contributing nothing says so rather than showing a blank", () => {
  const pkg = entry({ kind: "package", name: "npm:empty", source: "npm:empty" });
  assert.equal(buildRow(pkg, { context: [pkg] }).description, "contributes nothing");
});

test("without context a package row falls back to its scope instead of lying", () => {
  const pkg = entry({ kind: "package", name: "npm:x", source: "npm:x" });
  assert.equal(buildRow(pkg).description, "user");
});


test("a built-in says it came with pi rather than showing a scope nobody asked about", () => {
  assert.equal(sourceLabel(entry({ kind: "theme", scope: "builtin", source: "builtin" })), "built into pi");
});
