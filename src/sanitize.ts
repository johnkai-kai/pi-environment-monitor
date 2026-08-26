// Sanitising external text before it reaches the screen.
//
// Every row of this panel is a string we did not produce: skill and server names come from
// third-party packages, and paths come from the filesystem. Both are attacker-controllable in
// the only sense that matters here — installing a package is enough.
//
// Emitting those unsanitised hands the terminal control channel to them: OSC 52 writes the
// clipboard, OSC 0 changes the window title, CSI moves the cursor and clears the screen. And
// because the list computes width by visible columns, escape sequences count as zero-width and
// the layout does not shift at all: nothing looks wrong.
//
// Order matters: OSC is terminated by BEL, which has to be handled before C0 is stripped, or
// the OSC loses its terminator and stops matching.

const OSC_TERMINATED = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const OSC_UNTERMINATED = /\u001b\][^\u0007\u001b]*/g;
const CSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;
const ESC_FE = /\u001b[@-Z\\-_]/g;
const LONE_ESC = /\u001b/g;
const C0_C1 = /[\u0000-\u001f\u007f-\u009f]/g;
// LRM/RLM, direction overrides, isolates — zero-width to the width calculation, yet able to
// reverse text visually.
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\u206a-\u206f]/g;

export function sanitizeText(input: string): string {
  if (typeof input !== "string" || input === "") return "";
  return input
    .replace(OSC_TERMINATED, "")
    .replace(OSC_UNTERMINATED, "")
    .replace(CSI, "")
    .replace(ESC_FE, "")
    .replace(LONE_ESC, "")
    .replace(C0_C1, "")
    .replace(BIDI, "");
}
