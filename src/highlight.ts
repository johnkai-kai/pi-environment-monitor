// The cursor block.
//
// One cursor moves through the whole panel — along the tab strip, then down into the list — so
// there has to be one unmistakable mark saying where it is. A block of colour does that at a
// glance in a way a "→" prefix does not, especially with the tab strip and the list on screen
// together.
//
// Truecolor rather than a theme colour: pi's themes have no orange role, and the point of this
// block is to be the one thing on screen that is not part of the theme's normal palette.

const LIGHT_ORANGE = "255;186;114";
const INK = "24;20;16";

// The resting mark is the same hue burnt down almost to the background. Colour alone cannot
// separate "here" from "where you left off" — two oranges on screen read as two selections — so
// the two differ in brightness, which the eye ranks before it compares hue.
const EMBER = "62;48;36";
const ASH = "150;134;120";

const BLOCK = `\x1b[48;2;${LIGHT_ORANGE}m\x1b[38;2;${INK}m`;
const REST = `\x1b[48;2;${EMBER}m\x1b[38;2;${ASH}m`;
const RESET = "\x1b[0m";

/** Where the cursor actually is. Only one of these is painted bright at any moment. */
export type Focus = "tabs" | "list";

/** The bright block: this is where you are. */
export function block(text: string): string {
  return `${BLOCK}${text}${RESET}`;
}

/**
 * The banked block: this is where you would land, not where you are.
 *
 * The list keeps a marked row while the cursor is up on the tab strip, because losing it would
 * mean forgetting your place every time you looked at the tabs — but it has to lose the argument
 * about which mark is live, so it keeps the shape and gives up the brightness.
 */
export function rest(text: string): string {
  return `${REST}${text}${RESET}`;
}

/** Bright when this half of the panel holds the cursor, banked when it does not. */
export function cursorPaint(hasCursor: boolean): (text: string) => string {
  return hasCursor ? block : rest;
}
