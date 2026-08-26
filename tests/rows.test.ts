import { test } from "node:test";
import assert from "node:assert/strict";
import { compareEntries, countByKind, countDisabled, type Entry } from "../src/inventory.ts";
import { DISABLED_MARK, buildRow, filterHint, summaryLine, textReport } from "../src/rows.ts";

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
  const row = buildRow(entry());
  assert.equal(row.value, "/base/u/.pi/agent/skills/herdr/SKILL.md");
  assert.match(row.description, /skills\/herdr\/SKILL\.md/);
});

test("the kind column is padded so names line up across kinds", () => {
  const short = buildRow(entry({ kind: "mcp", name: "exa" }));
  const long = buildRow(entry({ kind: "extension", name: "autosave" }));
  assert.equal(short.label.indexOf("exa"), long.label.indexOf("autosave"));
});

test("a disabled entry is marked, not quietly dropped", () => {
  assert.ok(buildRow(entry({ enabled: false })).label.includes(DISABLED_MARK));
  assert.ok(!buildRow(entry()).label.includes(DISABLED_MARK));
});

test("a package entry names its package rather than a bare scope", () => {
  const row = buildRow(entry({ origin: "package", source: "npm:@llblab/pi-telegram" }));
  assert.match(row.description, /package npm:@llblab\/pi-telegram/);
});

test("an overriding entry says how many definitions it beat", () => {
  const row = buildRow(entry({ kind: "mcp", shadows: ["/a/mcp.json"] }));
  assert.match(row.description, /overrides 1 other definition/);
});

// Names and paths come from third-party packages and the filesystem. An escape sequence in one
// would be zero-width to the layout and would still reach the terminal's control channel.
test("terminal escape sequences in a name or path never reach the row", () => {
  const ESC = String.fromCharCode(27);
  const BEL = String.fromCharCode(7);
  const row = buildRow(entry({ name: `ev${ESC}]0;pwned${BEL}il`, path: `/a${ESC}[2Jb` }));
  for (const text of [row.label, row.description, row.value]) {
    assert.ok(!text.includes(ESC), `escape survived in ${JSON.stringify(text)}`);
    assert.ok(!text.includes(BEL), `bell survived in ${JSON.stringify(text)}`);
  }
  assert.ok(row.label.includes("evil"));
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

test("the footer says what is being filtered", () => {
  assert.match(filterHint(""), /type to filter/);
  assert.match(filterHint("tele"), /filter: tele/);
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

test("the text report groups by kind and shows every path", () => {
  const lines = textReport({
    entries: [entry(), entry({ kind: "theme", name: "cc-dark", path: "/a/cc-dark.json" })],
    errors: ["mcp: boom"],
  });
  const joined = lines.join("\n");
  assert.match(joined, /^skill:$/m);
  assert.match(joined, /^theme:$/m);
  assert.match(joined, /\/a\/cc-dark\.json/);
  assert.match(joined, /could not read mcp: boom/);
});
