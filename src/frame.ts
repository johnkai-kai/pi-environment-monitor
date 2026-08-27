import type { Paint } from "./skin.ts";
import { fit, visibleWidth } from "./width.ts";

// The box around the panel.
//
// pi ships no Border, Frame or Panel component, and no box-drawing helper — its own house style
// is two full-width horizontal rules sandwiching the content, which fifteen-odd components use.
// A four-sided box is therefore ours to draw, so it is drawn in pi's own characters: the SQUARE
// set ┌ ┐ └ ┘ ├ ┤ │ ─, which pi uses for markdown tables. Rounded corners ╭ ╮ ╰ ╯ and heavy
// lines ┏ ━ ┃ appear nowhere in pi's source — zero occurrences across both packages — so they
// would read as foreign the moment the panel opened.
//
// Every function here returns a line of EXACTLY `width` cells as pi measures them. That is the
// whole contract: a border is the one piece of UI where being one cell out is visible on every
// single row.

const TOP_LEFT = "┌";
const TOP_RIGHT = "┐";
const BOTTOM_LEFT = "└";
const BOTTOM_RIGHT = "┘";
const TEE_LEFT = "├";
const TEE_RIGHT = "┤";
const VERTICAL = "│";
const HORIZONTAL = "─";

/** Border, space, content, space, border. */
const CHROME = 4;

/**
 * Narrower than this and the frame costs more than it explains, so the panel drops it and falls
 * back to the unframed layout rather than drawing a box around three characters.
 */
export const MIN_FRAME_WIDTH = 32;

export function canFrame(width: number): boolean {
  return width >= MIN_FRAME_WIDTH;
}

export function innerWidth(width: number): number {
  return Math.max(1, width - CHROME);
}

/**
 * The top edge, with the title set into it.
 *
 * pi does this too — the editor's rule doubles as its scroll indicator — so a rule carrying a
 * label is the host's idiom rather than an invention.
 */
export function frameTop(title: string, width: number, paint: Paint): string {
  const label = ` ${title} `;
  const room = width - 3 - visibleWidth(label);
  if (room < 0) return paint(TOP_LEFT + HORIZONTAL.repeat(Math.max(0, width - 2)) + TOP_RIGHT);
  return paint(TOP_LEFT + HORIZONTAL) + paint(label) + paint(HORIZONTAL.repeat(room) + TOP_RIGHT);
}

export function frameDivider(width: number, paint: Paint): string {
  return paint(TEE_LEFT + HORIZONTAL.repeat(Math.max(0, width - 2)) + TEE_RIGHT);
}

export function frameBottom(width: number, paint: Paint): string {
  return paint(BOTTOM_LEFT + HORIZONTAL.repeat(Math.max(0, width - 2)) + BOTTOM_RIGHT);
}

/**
 * One content line, padded or truncated to sit exactly inside the borders.
 *
 * `content` may already carry colour; fit() goes through pi-tui's ANSI-aware truncation, so a
 * line cut short still closes its escapes instead of leaking colour into the border.
 */
export function frameRow(content: string, width: number, paint: Paint): string {
  return `${paint(VERTICAL)} ${fit(content, innerWidth(width))} ${paint(VERTICAL)}`;
}
