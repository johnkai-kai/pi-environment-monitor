import { KINDS, countByKind, countDisabled, type Entry, type Inventory, type Kind } from "./inventory.ts";
import { sanitizeText } from "./sanitize.ts";

// Turning the inventory into rows. Pure: it touches neither pi nor pi-tui, so the layout that
// the user actually reads can be tested without a running agent.

/** Fixed-width kind column, so names line up whatever the mix of kinds is. */
const KIND_WIDTH = Math.max(...KINDS.map((kind) => kind.length));

export const DISABLED_MARK = "off";

export interface Row {
  /** Stable identity for the row — the path, which is what the user came here for. */
  value: string;
  label: string;
  description: string;
  entry: Entry;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function scopeLabel(entry: Entry): string {
  if (entry.origin === "package") return `package ${entry.source}`;
  return entry.scope;
}

function shadowNote(entry: Entry): string {
  const count = entry.shadows?.length ?? 0;
  return count === 0 ? "" : `  ·  overrides ${count} other definition${count === 1 ? "" : "s"}`;
}

export function buildRow(entry: Entry): Row {
  const name = sanitizeText(entry.name);
  const path = sanitizeText(entry.path);
  const flag = entry.enabled ? "" : `  [${DISABLED_MARK}]`;
  return {
    value: path,
    label: `${pad(entry.kind, KIND_WIDTH)}  ${name}${flag}`,
    description: `${path}  ·  ${scopeLabel(entry)}${shadowNote(entry)}`,
    entry,
  };
}

export function buildRows(entries: readonly Entry[]): Row[] {
  return entries.map(buildRow);
}

/** One line naming what was found, so the panel says something before anyone scrolls. */
export function summaryLine(entries: readonly Entry[]): string {
  const counts = countByKind(entries);
  const parts = KINDS.filter((kind) => counts[kind] > 0).map((kind) => `${counts[kind]} ${kind}`);
  if (parts.length === 0) return "nothing found";
  const off = countDisabled(entries);
  const tail = off > 0 ? `  ·  ${off} disabled` : "";
  return `${parts.join("  ·  ")}${tail}`;
}

const KEYS = "↑↓ move   enter copy path   esc close";

/** The footer line: what is being filtered, and what the keys do. */
export function filterHint(filter: string): string {
  const typed = sanitizeText(filter);
  return typed === "" ? `type to filter   ${KEYS}` : `filter: ${typed}   ${KEYS}`;
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
    const row = buildRow(entry);
    lines.push(`  ${sanitizeText(entry.name)}${entry.enabled ? "" : ` [${DISABLED_MARK}]`}`);
    lines.push(`    ${row.description}`);
  }
  lines.push(...errorLines(inventory));
  return lines;
}
