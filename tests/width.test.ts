import { test } from "node:test";
import assert from "node:assert/strict";
import { clip, fit, padTo, visibleWidth } from "../src/width.ts";

const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;
const CJK = "工作區及課程專案";
const EMOJI = "👨‍💻";

test("a CJK string measures wider than its length, which is the whole reason this file exists", () => {
  assert.equal(CJK.length, 8);
  assert.equal(visibleWidth(CJK), 16);
});

test("padding reaches an exact display width for wide characters too", () => {
  assert.equal(visibleWidth(padTo(CJK, 30)), 30);
  assert.equal(visibleWidth(padTo("ascii", 30)), 30);
  // Already wider than asked: padding must not make it worse by adding anyway.
  assert.equal(padTo(CJK, 4), CJK);
});

test("fit lands on exactly the width it was given, long or short", () => {
  for (const text of ["short", CJK, `${CJK}/002-Agent_workspace/070-pi_plugin_build`, EMOJI]) {
    for (const width of [1, 2, 8, 17, 40]) {
      assert.equal(visibleWidth(fit(text, width)), width, `"${text}" at ${width}`);
    }
  }
});

test("clip never returns more cells than asked for", () => {
  for (const text of [CJK, `a${CJK}b`, EMOJI.repeat(6), "plain ascii text"]) {
    for (const width of [1, 3, 7, 12]) {
      assert.ok(visibleWidth(clip(text, width)) <= width, `"${text}" at ${width}`);
    }
  }
});

// The bug this test exists for: pi-tui's truncateToWidth wraps its ellipsis in a FULL reset,
// and a full reset clears the background as well as the foreground. The cursor row wraps its
// entire width in bg("selectedBg"), so one truncated description switched the fill off halfway
// across and left the rest of the row unpainted — invisible in a plain-text render, obvious the
// moment a real theme was attached.
test("clipping uncoloured text emits no escape sequence at all", () => {
  const long = "package git:github.com/johnkai-kai/pi-environment-monitor";
  const cut = clip(long, 20);
  assert.ok(!cut.includes(ESC), `clip leaked an escape sequence: ${JSON.stringify(cut)}`);
  assert.ok(cut.endsWith("…"));
  assert.ok(!clip(CJK, 5).includes(ESC));
});

test("clipping text that already carries colour keeps it valid rather than cutting it in half", () => {
  const coloured = `${ESC}[38;2;1;2;3mhello there friend${RESET}`;
  const cut = clip(coloured, 8);
  assert.ok(visibleWidth(cut) <= 8);
  // Whatever it does with the escapes, it must not leave a half-written one behind.
  assert.ok(!/\x1b\[[0-9;]*$/.test(cut), `a truncated escape sequence survived: ${JSON.stringify(cut)}`);
});

test("a wide character straddling the boundary is dropped, not half-drawn", () => {
  // "工" is two cells; asking for a width that only half-covers it must not report 1.5 cells.
  const cut = clip(`abc${CJK}`, 4);
  assert.ok(visibleWidth(cut) <= 4);
});
