import { sliceByColumn, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// Every measurement goes through pi-tui rather than String.length.
//
// String.length lies about anything outside ASCII, and it lies in the direction that breaks a
// frame: a path containing "工作區" measures shorter than it draws, so the right-hand border is
// pushed out one cell per wide character. pi-tui's visibleWidth is grapheme-based on top of
// get-east-asian-width and knows CJK, emoji including ZWJ sequences, combining marks and
// embedded ANSI. Its layout and ours therefore agree by construction, which is the only way a
// border can be trusted.
//
// Not guarded by a try/catch: panel.ts already imports matchesKey from the same package, so
// pi-tui is a hard requirement whether or not this file pretends otherwise. A fallback here
// would only hide the real failure one import later.
//
// One gotcha inherited on purpose: pi counts a TAB as three cells. Text reaching the panel is
// sanitised before it gets here, so tabs should never arrive, but any width arithmetic added
// later must not assume 1 or 8.

export { truncateToWidth, visibleWidth };

/** Right-pads to an exact display width. Never truncates — see `fit` for that. */
export function padTo(text: string, width: number): string {
  const room = width - visibleWidth(text);
  return room > 0 ? text + " ".repeat(room) : text;
}

/**
 * Exactly `width` cells: truncated with an ellipsis if too long, padded if too short.
 *
 * ANSI-safe in both directions, because truncateToWidth re-emits the resets and closes any open
 * hyperlink rather than cutting an escape sequence in half.
 */
export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  return truncateToWidth(text, width, "…", true);
}

const ESC = String.fromCharCode(27);

/**
 * Truncates to a display width without padding.
 *
 * Uncoloured text is cut with sliceByColumn rather than truncateToWidth, because
 * truncateToWidth emits a FULL reset (ESC[0m) around its ellipsis — and a full reset clears the
 * background as well as the foreground. On the cursor row, whose whole width is wrapped in
 * bg("selectedBg"), one truncated description would therefore switch the fill off halfway
 * across and leave the rest of the row unpainted. Invisible in a plain-text render, obvious the
 * moment a real theme is attached.
 *
 * Text that already carries escapes still goes through truncateToWidth, which is the only thing
 * that can cut it without slicing a sequence in half; callers colour after clipping precisely so
 * they land on the cheap path.
 */
export function clip(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (text.includes(ESC)) return truncateToWidth(text, width, "…", false);
  // strict: a wide grapheme straddling the boundary is dropped rather than half-drawn.
  return sliceByColumn(text, 0, Math.max(0, width - 1), true) + "…";
}
