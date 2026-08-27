import { KINDS, countByKind, countDisabled, type Entry, type Inventory, type Kind } from "./inventory.ts";
import { shortenPath } from "./overview.ts";
import { sanitizeText } from "./sanitize.ts";

// Turning entries into rows. Pure: it touches neither pi nor pi-tui, so the layout the user
// actually reads can be tested without a running agent.
//
// The path is not in the row. Every path here shares a long prefix — the agent directory, then
// npm/node_modules — so putting it in the row spends most of the width on characters that are
// identical down the column, and still overflows. It moves to a detail line under the list,
// shown for the cursor row only. Enter still copies the full absolute path.

const KIND_WIDTH = Math.max(...KINDS.map((kind) => kind.length));

export const DISABLED_MARK = "off";

export interface Row {
  /** Stable identity, and what selecting the row hands back: the real path on disk. */
  value: string;
  label: string;
  description: string;
  entry: Entry;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** Where the entry came from, in the fewest words that stay unambiguous. */
export function sourceLabel(entry: Entry): string {
  // Says "you did not install this and cannot remove it", which is the useful fact about a
  // built-in — its scope alone would just read "builtin".
  if (entry.scope === "builtin") return "built into pi";
  if (entry.origin === "package") return `package ${entry.source}`;
  if (entry.source.startsWith("import:")) return entry.source.replace("import:", "imported from ");
  return entry.scope;
}

/**
 * What a package puts into the install, as "3 skills · 1 extension".
 *
 * A package row's own scope is nearly always "user", which tells nobody anything. What the box
 * contains is the reason to look at it at all.
 */
export function contributionSummary(entries: readonly Entry[], source: string): string {
  const counts = new Map<Kind, number>();
  for (const entry of entries) {
    if (entry.kind === "package" || entry.source !== source) continue;
    counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  }
  const parts = KINDS.filter((kind) => counts.has(kind)).map((kind) => {
    const count = counts.get(kind) ?? 0;
    return `${count} ${kind}${count === 1 ? "" : "s"}`;
  });
  return parts.length === 0 ? "contributes nothing" : parts.join(" · ");
}

export interface RowOptions {
  /** Off on a single-kind tab, where the column would repeat one word down the screen. */
  showKind?: boolean;
  /** All entries, so a package row can describe what it contains. */
  context?: readonly Entry[];
}

export function buildRow(entry: Entry, options: RowOptions = {}): Row {
  const name = sanitizeText(entry.name);
  const flag = entry.enabled ? "" : `  [${DISABLED_MARK}]`;
  const prefix = options.showKind === true ? `${pad(entry.kind, KIND_WIDTH)}  ` : "";
  const describe =
    entry.kind === "package" && options.context !== undefined
      ? contributionSummary(options.context, entry.source)
      : sourceLabel(entry);
  return {
    value: sanitizeText(entry.path),
    label: `${prefix}${name}${flag}`,
    description: sanitizeText(describe),
    entry,
  };
}

export function buildRows(entries: readonly Entry[], options: RowOptions = {}): Row[] {
  return entries.map((entry) => buildRow(entry, options));
}

/**
 * The detail line for the cursor row. This is where the path lives now, so it gets the full
 * width and never competes with a column.
 */
export function detailLines(entry: Entry | null, home: string): string[] {
  if (entry === null) return [""];
  const lines = [`  ${sanitizeText(shortenPath(entry.path, home))}`];
  const shadows = entry.shadows ?? [];
  if (shadows.length > 0) {
    lines.push(`  overrides ${shadows.length === 1 ? "a definition" : `${shadows.length} definitions`} in:`);
    for (const path of shadows) lines.push(`    ${sanitizeText(shortenPath(path, home))}`);
  }
  return lines;
}

/**
 * Our own filtering, because pi-tui's is `value.startsWith(filter)` — and `value` is an absolute
 * path, so every row shares a prefix and typing anything at all matched nothing. Substring
 * across the fields someone would actually search by.
 */
export function matchesFilter(entry: Entry, filter: string): boolean {
  if (filter === "") return true;
  const needle = filter.toLowerCase();
  return [entry.name, entry.kind, entry.source, entry.path, entry.scope].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

export function filterEntries(entries: readonly Entry[], filter: string): Entry[] {
  return entries.filter((entry) => matchesFilter(entry, filter));
}

/** One line naming what was found. Used by the text report; the panel has the Overview tab. */
export function summaryLine(entries: readonly Entry[]): string {
  const counts = countByKind(entries);
  const parts = KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${counts[kind]} ${kind}`);
  if (parts.length === 0) return "nothing found";
  const off = countDisabled(entries);
  return `${parts.join("  ·  ")}${off > 0 ? `  ·  ${off} disabled` : ""}`;
}

const CARET = "█";

/**
 * The search box. Drawn even when empty, because a filter nobody can see is a filter nobody
 * uses — the first version only mentioned it in a footer hint, and the hint was for a filter
 * that did not work.
 */
export function searchBox(filter: string, matches: number, total: number, width: number): string {
  const typed = sanitizeText(filter);
  const count = typed === "" ? `${total} item${total === 1 ? "" : "s"}` : `${matches} of ${total}`;
  const left = `  search  ${typed}${CARET}`;
  const gap = Math.max(2, width - left.length - count.length - 2);
  return `${left}${" ".repeat(gap)}${count}`;
}

/** Names the row the cursor is on, so "what am I looking at" never depends on colour. */
export function selectionLine(entry: Entry | null): string {
  if (entry === null) return "  nothing selected";
  const off = entry.enabled ? "" : `  [${DISABLED_MARK}]`;
  return `  ▌ ${sanitizeText(entry.name)}${off}   ${entry.kind} · ${sanitizeText(sourceLabel(entry))}`;
}

const LIST_KEYS = "↑↓ move   home/end ends   ←→ tab   enter copy   esc close";
const DRILL_KEYS = "↑↓ move   enter copy path   esc back";
const PACKAGE_KEYS = "↑↓ move   ←→ tab   enter open package   esc close";
const PAGE_KEYS = "↑↓←→ tab   esc close";

export type KeyHintMode = "list" | "packages" | "drill" | "page";

export function keyHint(mode: KeyHintMode, filter: string): string {
  const keys =
    mode === "drill" ? DRILL_KEYS : mode === "packages" ? PACKAGE_KEYS : mode === "page" ? PAGE_KEYS : LIST_KEYS;
  // The search box shows the filter now, so the hint only has to list keys.
  return ` ${keys}`;
}

export function errorLines(inventory: Inventory): string[] {
  return inventory.errors.map((message) => `could not read ${sanitizeText(message)}`);
}

/** Plain-text report, for non-interactive modes where there is no panel to mount. */
export function textReport(inventory: Inventory): string[] {
  const lines: string[] = [summaryLine(inventory.entries), ""];
  let current: Kind | null = null;
  for (const entry of inventory.entries) {
    if (entry.kind !== current) {
      if (current !== null) lines.push("");
      lines.push(`${entry.kind}:`);
      current = entry.kind;
    }
    lines.push(`  ${sanitizeText(entry.name)}${entry.enabled ? "" : ` [${DISABLED_MARK}]`}`);
    lines.push(`    ${sanitizeText(entry.path)}  ·  ${sanitizeText(sourceLabel(entry))}`);
  }
  lines.push(...errorLines(inventory));
  return lines;
}
