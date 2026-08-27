import type { Row } from "./rows.ts";

// Rendering the list ourselves instead of using pi-tui's SelectList.
//
// SelectList was the common cause of three separate defects: its name column is a fixed 32
// characters, so long names were cut to the point of being indistinguishable; its filter is
// `value.startsWith()`, which matched nothing because every value is an absolute path sharing a
// prefix; and it has no setItems, so every keystroke meant rebuilding the component and losing
// the cursor. Forty lines of our own removes all three at the source.
//
// Pure — no pi, no pi-tui — so what the user reads is testable without a terminal.

export const SELECTED_MARK = "▌ ";
const UNSELECTED_MARK = "  ";
const GAP = 2;
const ELLIPSIS = "…";
const MIN_DESCRIPTION = 12;

export interface ListViewOptions {
  selectedIndex: number;
  /** How many rows fit. The window scrolls to keep the cursor inside it. */
  height: number;
  width: number;
  /** Applied to the cursor row, when the caller has a theme. Identity by default. */
  paint?: (text: string) => string;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function clip(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  return width <= ELLIPSIS.length ? text.slice(0, width) : text.slice(0, width - 1) + ELLIPSIS;
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

/** Width of the name column: the longest name on screen, capped so the description survives. */
export function nameColumnWidth(rows: readonly Row[], width: number): number {
  const widest = rows.reduce((max, row) => Math.max(max, row.label.length), 0);
  const available = width - SELECTED_MARK.length - GAP - MIN_DESCRIPTION;
  return Math.max(1, Math.min(widest, Math.max(8, available)));
}

export function renderList(rows: readonly Row[], options: ListViewOptions): string[] {
  if (rows.length === 0) return ["  nothing matches"];

  const paint = options.paint ?? ((text: string): string => text);
  const { start, end } = visibleRange(rows.length, options.selectedIndex, options.height);
  const column = nameColumnWidth(rows, options.width);
  const lines: string[] = [];

  for (let index = start; index < end; index += 1) {
    const row = rows[index];
    if (row === undefined) continue;
    const selected = index === options.selectedIndex;
    const name = pad(clip(row.label, column), column);
    const room = options.width - SELECTED_MARK.length - column - GAP;
    const description = clip(row.description, Math.max(0, room));
    const text = `${selected ? SELECTED_MARK : UNSELECTED_MARK}${name}${" ".repeat(GAP)}${description}`.trimEnd();
    lines.push(selected ? paint(text) : text);
  }

  if (start > 0 || end < rows.length) {
    lines.push(`    ${options.selectedIndex + 1} of ${rows.length}`);
  }
  return lines;
}

/** Moves the cursor, clamped rather than wrapped — wrapping past the end feels like a glitch. */
export function moveSelection(total: number, selectedIndex: number, delta: number): number {
  if (total === 0) return 0;
  return Math.max(0, Math.min(total - 1, selectedIndex + delta));
}
