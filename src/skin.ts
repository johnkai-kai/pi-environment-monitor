import type { Theme } from "@earendil-works/pi-coding-agent";

// Colour comes from the user's pi theme, not from us.
//
// The first version hardcoded truecolor escapes — a light orange cursor, a hand-picked grey
// ramp. That looks the same on every machine, which sounds like a feature until someone runs a
// light theme and gets a dark block of our choosing pasted into their terminal. pi already
// carries a vocabulary for exactly this: 46 foreground roles and 8 background roles, and its own
// components colour themselves entirely through them.
//
// Two facts shape this file:
//
//   pi has no cursor role. Selection in pi is bg("selectedBg") across the row plus fg("accent")
//   on a marker glyph, optionally bold — that is what session-selector and tree-selector do. We
//   copy that rather than invent an accent of our own.
//
//   pi has no dim STYLE. Theme deliberately exposes bold/italic/underline/inverse but not SGR 2,
//   because a real dim escape ignores the theme. Tertiary text goes through the `dim` colour
//   ROLE instead, so it follows whatever the user is running.

export type Paint = (text: string) => string;

export interface Skin {
  /** Primary text: the thing you came to read. */
  text: Paint;
  /** Secondary text: true, useful, not what you are scanning for. */
  muted: Paint;
  /** Tertiary text: structure, labels, punctuation. */
  dim: Paint;
  /** The highlight hue, the same one pi uses for its own cursors. */
  accent: Paint;
  /** Something needs attention. Separate from the accent, which only means "you are here". */
  warn: Paint;
  bold: Paint;
  /** Selection background, painted across a whole padded row. */
  fill: Paint;
}

const identity: Paint = (text) => text;

/**
 * No colour at all.
 *
 * Used by every test and by scripts/render-panel.mjs, so what the panel lays out can be asserted
 * as plain text. Layout bugs and colour bugs then fail separately instead of hiding each other.
 */
export function plainSkin(): Skin {
  return {
    text: identity,
    muted: identity,
    dim: identity,
    accent: identity,
    warn: identity,
    bold: identity,
    fill: identity,
  };
}

/**
 * The live theme, wrapped.
 *
 * Never cache the strings these produce. `theme` is a live Proxy onto whatever Theme is current,
 * and pi invalidates mounted overlays when the user switches theme — so colouring inside render()
 * tracks the switch for free, while a cached escape sequence would freeze the old palette.
 *
 * Deliberately NOT registering with pi's onThemeChange: that is a single global slot which
 * interactive-mode already occupies, and taking it would disable pi's own re-render on theme
 * change for the whole session.
 */
export function skinFromTheme(theme: Theme): Skin {
  return {
    text: (value) => theme.fg("text", value),
    muted: (value) => theme.fg("muted", value),
    dim: (value) => theme.fg("dim", value),
    accent: (value) => theme.fg("accent", value),
    warn: (value) => theme.fg("warning", value),
    bold: (value) => theme.bold(value),
    // ThemeBg is not exported from the package root, so the role is written as a literal. It is
    // checked against the unexported union at the call boundary, which is enough.
    fill: (value) => theme.bg("selectedBg", value),
  };
}
