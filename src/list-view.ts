import type { Skin } from "./skin.ts";
import type { Row } from "./rows.ts";
import { clip, padTo, visibleWidth } from "./width.ts";

// Rendering the list ourselves instead of using pi-tui's SelectList.
//
// SelectList was the common cause of three separate defects: its name column is a fixed 32
// characters, so long names were cut to the point of being indistinguishable; its filter is
// `value.startsWith()`, which matched nothing because every value is an absolute path sharing a
// prefix; and it has no setItems, so every keystroke meant rebuilding the component and losing
// the cursor. Forty lines of our own removes all three at the source.
//
// It also cannot do what the cursor needs: SelectList marks selection by recolouring the row,
// and pi's own heavier treatment — a filled background across the whole row — is hand-rolled in
// every component that wants it (session-selector, tree-selector). So we hand-roll it too.

const MARK = "▌";
/** The mark plus the space after it, present on every row so the columns never shift. */
const MARK_WIDTH = 2;
const GAP = 2;
const MIN_DESCRIPTION = 12;

export interface ListViewOptions {
  selectedIndex: number;
  /** How many rows fit. The window scrolls to keep the cursor inside it. */
  height: number;
  /** Content width — inside the frame, if there is one. */
  width: number;
  skin: Skin;
  /** True when the cursor is in the list rather than up on the tab strip. */
  focused: boolean;
}

/**
 * The slice of rows to draw, scrolled so the cursor is always inside it.
 *
 * Kept separate from rendering because "which rows are on screen" is the part with the awkward
 * edges — a cursor at either end, a list shorter than the window — and it is worth testing on
 * its own.
 */
export function visibleRange(total: number, selectedIndex: number, height: number): { start: number; end: number } {
  const size = Math.max(1, Math.min(height, total));
  if (total <= size) return { start: 0, end: total };
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, total - size));
  return { start, end: start + size };
}

/** Width of the kind column: the widest kind on screen, or nothing when no row shows one. */
export function kindColumnWidth(rows: readonly Row[]): number {
  return rows.reduce((max, row) => Math.max(max, visibleWidth(row.kindLabel)), 0);
}

/** Width of the name column: the longest name on screen, capped so the description survives. */
export function nameColumnWidth(rows: readonly Row[], width: number): number {
  const widest = rows.reduce((max, row) => Math.max(max, visibleWidth(row.name)), 0);
  const kind = kindColumnWidth(rows);
  const available = width - MARK_WIDTH - (kind > 0 ? kind + GAP : 0) - GAP - MIN_DESCRIPTION;
  return Math.max(1, Math.min(widest, Math.max(8, available)));
}

/**
 * Always exactly `height` rows plus one counter line, blank-padded.
 *
 * A list that shrinks to fit its contents makes the whole panel change height as you type or
 * move, so the rule underneath it, the path and the key hints all jump around the screen. Fixed
 * height costs a few blank lines and buys a panel that sits still.
 */
export function renderList(rows: readonly Row[], options: ListViewOptions): string[] {
  const height = Math.max(1, options.height);
  const { skin, width } = options;
  const fill = (lines: string[]): string[] => {
    while (lines.length < height + 1) lines.push("");
    return lines;
  };

  if (rows.length === 0) return fill([skin.muted("  nothing matches")]);

  const { start, end } = visibleRange(rows.length, options.selectedIndex, height);
  const kindWidth = kindColumnWidth(rows);
  const nameWidth = nameColumnWidth(rows, width);
  const descriptionRoom =
    width - MARK_WIDTH - (kindWidth > 0 ? kindWidth + GAP : 0) - nameWidth - GAP;
  const lines: string[] = [];

  for (let index = start; index < end; index += 1) {
    const row = rows[index];
    if (row === undefined) continue;
    const selected = index === options.selectedIndex;

    // Every column is clipped and padded BEFORE it is coloured. Colouring first and cutting
    // afterwards would slice an escape sequence in half, and padding after a background fill
    // would leave the tail of the row unfilled.
    const kind = kindWidth > 0 ? padTo(clip(row.kindLabel, kindWidth), kindWidth) : "";
    const name = padTo(clip(row.name, nameWidth), nameWidth);
    const description = clip(row.description, Math.max(0, descriptionRoom));

    const paintName = selected && options.focused ? (text: string) => skin.bold(skin.text(text)) : skin.text;
    const body =
      (kindWidth > 0 ? skin.dim(kind) + " ".repeat(GAP) : "") +
      (selected ? paintName(name) : skin.text(name)) +
      " ".repeat(GAP) +
      skin.muted(description);

    if (!selected) {
      lines.push(padTo(" ".repeat(MARK_WIDTH) + body, width));
      continue;
    }

    // The cursor: pi's own recipe — the row filled with selectedBg, an accent marker, the name
    // bold. When the cursor is elsewhere the fill stays but the marker and the bold go, so the
    // row still says "this is your place" without claiming to be live.
    // Both branches put the body at the same column as an unselected row — the marker occupies
    // the first cell, a space the second — so nothing shifts sideways as the cursor arrives or
    // leaves.
    lines.push(
      options.focused
        ? skin.accent(MARK) + skin.fill(padTo(" " + body, width - 1))
        : skin.fill(padTo(" ".repeat(MARK_WIDTH) + body, width)),
    );
  }

  // The counter line is always present, empty when the whole list is on screen, so its coming
  // and going cannot change the panel's height either.
  const scrolled = start > 0 || end < rows.length;
  lines.push(scrolled ? skin.dim(`    ${options.selectedIndex + 1} of ${rows.length}`) : "");
  return fill(lines);
}

/** Moves the cursor, clamped rather than wrapped — wrapping past the end feels like a glitch. */
export function moveSelection(total: number, selectedIndex: number, delta: number): number {
  if (total === 0) return 0;
  return Math.max(0, Math.min(total - 1, selectedIndex + delta));
}

export { MARK as SELECTED_MARK };
