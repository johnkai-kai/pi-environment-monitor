import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry } from "../src/inventory.ts";
import { SELECTED_MARK, moveSelection, nameColumnWidth, renderList, visibleRange } from "../src/list-view.ts";
import { buildRow, type Row } from "../src/rows.ts";

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
  assert.deepEqual(renderList([], { selectedIndex: 0, height: 10, width: 80 }), ["  nothing matches"]);
});

test("exactly one row carries the cursor mark", () => {
  const lines = renderList(many(5), { selectedIndex: 2, height: 10, width: 80 });
  const marked = lines.filter((line) => line.startsWith(SELECTED_MARK));
  assert.equal(marked.length, 1);
  assert.match(marked[0] as string, /item-2/);
});

test("a scrolled list says where you are in it", () => {
  const lines = renderList(many(40), { selectedIndex: 20, height: 10, width: 80 });
  assert.match(lines.at(-1) as string, /21 of 40/);
});

test("a list that fits gets no scroll counter", () => {
  const lines = renderList(many(4), { selectedIndex: 0, height: 10, width: 80 });
  assert.ok(!(lines.at(-1) as string).includes(" of "));
});

test("no line ever runs past the width it was given", () => {
  const rows = [row("a".repeat(200), "b".repeat(200)), ...many(5)];
  for (const width of [40, 80, 120, 200]) {
    for (const line of renderList(rows, { selectedIndex: 0, height: 10, width })) {
      assert.ok(line.length <= width, `"${line}" is ${line.length} at width ${width}`);
    }
  }
});

// pi-tui's fixed 32-column name field cut pi-statusline-hud-setup down to pi-statusline-hud-s,
// which was indistinguishable from pi-statusline-hud on the row above it.
test("the name column fits the longest name when there is room", () => {
  const rows = [row("pi-statusline-hud"), row("pi-statusline-hud-setup")];
  const lines = renderList(rows, { selectedIndex: 0, height: 10, width: 120 });
  assert.match(lines.join("\n"), /pi-statusline-hud-setup/);
  assert.ok(nameColumnWidth(rows, 120) >= "pi-statusline-hud-setup".length);
});

test("a narrow terminal keeps room for the description instead of giving it all to names", () => {
  const rows = [row("n".repeat(300))];
  assert.ok(nameColumnWidth(rows, 60) < 60);
});

test("a truncated name is marked as truncated rather than silently cut", () => {
  const lines = renderList([row("n".repeat(300))], { selectedIndex: 0, height: 5, width: 50 });
  assert.match(lines[0] as string, /…/);
});

test("the cursor moves within bounds and clamps rather than wrapping", () => {
  assert.equal(moveSelection(10, 0, -1), 0);
  assert.equal(moveSelection(10, 9, 1), 9);
  assert.equal(moveSelection(10, 4, 3), 7);
  assert.equal(moveSelection(10, 4, -12), 0);
  assert.equal(moveSelection(0, 0, 1), 0);
});

test("the paint callback is applied to the cursor row only", () => {
  const lines = renderList(many(3), {
    selectedIndex: 1,
    height: 10,
    width: 80,
    paint: (text) => `<${text}>`,
  });
  assert.equal(lines.filter((line) => line.startsWith("<")).length, 1);
  assert.match(lines[1] as string, /^<.*>$/);
});
