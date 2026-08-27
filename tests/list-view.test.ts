import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry } from "../src/inventory.ts";
import { SELECTED_MARK, moveSelection, nameColumnWidth, renderList, visibleRange } from "../src/list-view.ts";
import { buildRow, type Row } from "../src/rows.ts";
import { plainSkin, type Skin } from "../src/skin.ts";
import { visibleWidth } from "../src/width.ts";

// No colour in these tests: layout is what is being asserted, and an escape sequence in the
// middle of an expected string turns a layout failure into an unreadable diff.
const RESET = String.fromCharCode(27) + "[0m";
const SKIN = plainSkin();
const opts = (over: Record<string, unknown> = {}) => ({ skin: SKIN, focused: true, ...over });

function row(name: string, description = "user"): Row {
  const entry: Entry = {
    kind: "skill",
    name,
    path: `/base/skills/${name}/SKILL.md`,
    scope: "user",
    origin: "top-level",
    source: "local",
    enabled: true,
  };
  return { ...buildRow(entry), description };
}

const many = (count: number): Row[] => Array.from({ length: count }, (_, index) => row(`item-${index}`));

test("a list shorter than the window shows all of it", () => {
  assert.deepEqual(visibleRange(3, 0, 10), { start: 0, end: 3 });
});

test("the window scrolls to keep the cursor inside it", () => {
  const { start, end } = visibleRange(100, 50, 10);
  assert.ok(start <= 50 && 50 < end, `cursor 50 outside ${start}..${end}`);
  assert.equal(end - start, 10);
});

test("the window stops at both ends instead of scrolling past them", () => {
  assert.deepEqual(visibleRange(100, 0, 10), { start: 0, end: 10 });
  assert.deepEqual(visibleRange(100, 99, 10), { start: 90, end: 100 });
});

test("the cursor is always on screen, wherever it is", () => {
  for (let index = 0; index < 100; index += 1) {
    const { start, end } = visibleRange(100, index, 12);
    assert.ok(start <= index && index < end, `cursor ${index} outside ${start}..${end}`);
  }
});

test("an empty list says so rather than rendering nothing", () => {
  const lines = renderList([], { selectedIndex: 0, height: 10, width: 80, skin: SKIN, focused: true });
  assert.equal(lines[0], "  nothing matches");
});

// A list that shrank to fit its contents moved the rule, the path and the key hints every time
// the filter changed, so the whole panel jumped around while you typed.
test("the list is always the same height, whatever it holds", () => {
  const heights = [[], many(1), many(5), many(400)].map(
    (rows) => renderList(rows, { selectedIndex: 0, height: 10, width: 80, skin: SKIN, focused: true }).length,
  );
  assert.equal(new Set(heights).size, 1, `heights differed: ${heights.join(", ")}`);
});

test("the scroll counter keeps its line even when the list fits", () => {
  const short = renderList(many(3), { selectedIndex: 0, height: 10, width: 80, skin: SKIN, focused: true });
  const long = renderList(many(30), { selectedIndex: 0, height: 10, width: 80, skin: SKIN, focused: true });
  assert.equal(short.length, long.length);
  assert.match(long[10] as string, /1 of 30/);
  assert.equal(short[10], "");
});

test("exactly one row carries the cursor mark", () => {
  const lines = renderList(many(5), { selectedIndex: 2, height: 10, width: 80, skin: SKIN, focused: true });
  const marked = lines.filter((line) => line.startsWith(SELECTED_MARK));
  assert.equal(marked.length, 1);
  assert.match(marked[0] as string, /item-2/);
});

test("a scrolled list says where you are in it", () => {
  const lines = renderList(many(40), { selectedIndex: 20, height: 10, width: 80, skin: SKIN, focused: true });
  assert.match(lines.join("\n"), /21 of 40/);
});

test("a list that fits gets no scroll counter", () => {
  const lines = renderList(many(4), { selectedIndex: 0, height: 10, width: 80, skin: SKIN, focused: true });
  assert.ok(!lines.join("\n").includes(" of "));
});

test("no line ever runs past the width it was given", () => {
  const rows = [row("a".repeat(200), "b".repeat(200)), ...many(5)];
  for (const width of [40, 80, 120, 200]) {
    for (const line of renderList(rows, { selectedIndex: 0, height: 10, width, skin: SKIN, focused: true })) {
      assert.ok(visibleWidth(line) <= width, `"${line}" is ${visibleWidth(line)} at width ${width}`);
    }
  }
});

// pi-tui's fixed 32-column name field cut pi-statusline-hud-setup down to pi-statusline-hud-s,
// which was indistinguishable from pi-statusline-hud on the row above it.
test("the name column fits the longest name when there is room", () => {
  const rows = [row("pi-statusline-hud"), row("pi-statusline-hud-setup")];
  const lines = renderList(rows, { selectedIndex: 0, height: 10, width: 120, skin: SKIN, focused: true });
  assert.match(lines.join("\n"), /pi-statusline-hud-setup/);
  assert.ok(nameColumnWidth(rows, 120) >= "pi-statusline-hud-setup".length);
});

test("a narrow terminal keeps room for the description instead of giving it all to names", () => {
  const rows = [row("n".repeat(300))];
  assert.ok(nameColumnWidth(rows, 60) < 60);
});

test("a truncated name is marked as truncated rather than silently cut", () => {
  const lines = renderList([row("n".repeat(300))], { selectedIndex: 0, height: 5, width: 50, skin: SKIN, focused: true });
  assert.match(lines[0] as string, /…/);
});

test("the cursor moves within bounds and clamps rather than wrapping", () => {
  assert.equal(moveSelection(10, 0, -1), 0);
  assert.equal(moveSelection(10, 9, 1), 9);
  assert.equal(moveSelection(10, 4, 3), 7);
  assert.equal(moveSelection(10, 4, -12), 0);
  assert.equal(moveSelection(0, 0, 1), 0);
});

// The skin is the only thing that colours anything, so a skin that marks instead of colouring
// proves the cursor row is the only row that gets the treatment.
test("only the cursor row is painted, and only when the list holds the cursor", () => {
  const marking: Skin = { ...plainSkin(), fill: (text) => `<${text}>`, accent: (text) => `[${text}]` };
  const focused = renderList(many(3), { selectedIndex: 1, height: 10, width: 80, skin: marking, focused: true });
  assert.equal(focused.filter((line) => line.includes("<")).length, 1);
  assert.match(focused[1] as string, /^\[▌\]</);

  // Cursor up on the tabs: the row keeps its fill so you do not lose your place, but loses the
  // accent marker, because only one thing on screen may claim to be live.
  const resting = renderList(many(3), { selectedIndex: 1, height: 10, width: 80, skin: marking, focused: false });
  assert.equal(resting.filter((line) => line.includes("<")).length, 1);
  assert.ok(!(resting[1] as string).includes("["), "a resting row must not wear the accent marker");
});

// Columns have to line up whether or not the cursor is on the row, or the list appears to
// twitch sideways as you move through it.
test("the body starts at the same column selected or not", () => {
  const lines = renderList(many(3), { selectedIndex: 1, height: 10, width: 80, skin: SKIN, focused: true });
  const at = (line: string) => line.indexOf("item-");
  assert.equal(at(lines[1] as string), at(lines[0] as string));
  assert.equal(at(lines[2] as string), at(lines[0] as string));
});

// The cursor row wraps its whole width in a background fill. Anything inside that emits a full
// reset — pi-tui's truncateToWidth used to, around its ellipsis — switches the fill off midway
// and leaves the rest of the row unpainted.
test("a truncated cursor row keeps its fill unbroken to the end", () => {
  const wide = [row("eli5", "package git:github.com/johnkai-kai/pi-environment-monitor"), ...many(3)];
  const marking: Skin = { ...plainSkin(), fill: (text) => `<${text}>`, accent: (text) => `|${text}|` };
  for (const width of [30, 44, 60]) {
    const line = renderList(wide, { selectedIndex: 0, height: 5, width, skin: marking, focused: true })[0] as string;
    assert.match(line, /^\|▌\|<.*>$/, `fill broken at width ${width}: ${JSON.stringify(line)}`);
    assert.equal(line.split("<").length - 1, 1, "the fill must open exactly once");
    // The part that actually caught the bug: a full reset anywhere inside the fill turns the
    // background off for the remainder of the row.
    const inside = line.slice(line.indexOf("<") + 1, line.lastIndexOf(">"));
    assert.ok(!inside.includes(RESET), `a full reset inside the fill at width ${width}`);
  }
});
