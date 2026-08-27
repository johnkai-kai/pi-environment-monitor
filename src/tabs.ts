import { KINDS, type Entry, type Kind } from "./inventory.ts";
import type { Skin } from "./skin.ts";
import { visibleWidth } from "./width.ts";

// The tab strip, as data. Pure: no pi, no pi-tui, so which tabs exist and what they hold is
// testable without a terminal.
//
// The structure encodes something true rather than decorative: `package` is a container and the
// other kinds are its contents, so Packages sits past a divider instead of alongside them. Left
// of the divider everything is a thing pi loaded; right of it is the boxes those things came in.
// Counting boxes and contents in one total is what made "41 entries" mislead.

export type TabId = "overview" | "all" | "packages" | Kind;

export interface Tab {
  id: TabId;
  label: string;
  /** Absent on Overview, which counts nothing. */
  count: number | null;
  /** True for the first tab past the divider. */
  startsGroup: boolean;
}

/** Kinds that are contents rather than containers — everything except `package`. */
const CONTENT_KINDS = KINDS.filter((kind): kind is Kind => kind !== "package");

/**
 * Kinds worth a tab even when empty, because absence is itself an answer: an empty prompt tab
 * says "supported, you have none", where no tab at all would suggest "not supported".
 *
 * `mcp` is deliberately not in here. pi has no MCP support of its own — servers come from a
 * third-party adapter — so on an install without one, an MCP tab would name a concept that does
 * not exist there. Finding a server is the only honest evidence that it does.
 */
const ALWAYS_SHOWN = new Set<Kind>(["skill", "extension", "theme", "prompt"]);

const SHORT_LABELS: Partial<Record<Kind, string>> = { extension: "ext" };

function labelFor(kind: Kind): string {
  return SHORT_LABELS[kind] ?? kind;
}

export function isContentEntry(entry: Entry): boolean {
  return entry.kind !== "package";
}

export function buildTabs(entries: readonly Entry[]): Tab[] {
  const counts = new Map<Kind, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);

  const contentTotal = entries.filter(isContentEntry).length;
  const tabs: Tab[] = [
    { id: "overview", label: "Overview", count: null, startsGroup: false },
    { id: "all", label: "All", count: contentTotal, startsGroup: false },
  ];

  for (const kind of CONTENT_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count === 0 && !ALWAYS_SHOWN.has(kind)) continue;
    tabs.push({ id: kind, label: labelFor(kind), count, startsGroup: false });
  }

  tabs.push({ id: "packages", label: "Packages", count: counts.get("package") ?? 0, startsGroup: true });
  return tabs;
}

export function entriesForTab(tab: Tab, entries: readonly Entry[]): Entry[] {
  if (tab.id === "overview") return [];
  if (tab.id === "all") return entries.filter(isContentEntry);
  if (tab.id === "packages") return entries.filter((entry) => entry.kind === "package");
  return entries.filter((entry) => entry.kind === tab.id);
}

/** On a single-kind tab the kind column is the same word on every row, so it earns no space. */
export function tabShowsKindColumn(tab: Tab): boolean {
  return tab.id === "all";
}

function tabText(tab: Tab): string {
  return tab.count === null ? tab.label : `${tab.label} ${tab.count}`;
}

const SEP = "│";
const GROUP_SEP = "║";
/** The same marker the list uses for its cursor row, so one glyph means one thing. */
const CURSOR_MARK = "▌";

export interface TabBarOptions {
  skin: Skin;
  /** True when the cursor is on the strip rather than down in the list. */
  focused: boolean;
  /** Set for plain-text rendering: the active tab is bracketed instead of coloured. */
  plain?: boolean;
}

/**
 * The strip, or a single-tab indicator when it will not fit.
 *
 * Without a paint function the active tab is bracketed, so the strip stays readable where colour
 * does not survive — a pipe, a screenshot in a bug report, a test asserting on plain text.
 */
export function renderTabBar(
  tabs: readonly Tab[],
  activeIndex: number,
  width: number,
  options: TabBarOptions,
): string {
  const active = tabs[activeIndex];
  if (active === undefined) return "";
  const { skin, focused } = options;

  // The active tab wears the same clothes as the cursor row in the list: filled with
  // selectedBg, an accent marker and bold text while it holds the cursor, the fill alone once
  // the cursor has moved down into the list. One vocabulary, two places.
  const cell = (tab: Tab, index: number): string => {
    const text = tabText(tab);
    if (index !== activeIndex) return skin.muted(` ${text} `);
    if (options.plain === true) return `[${text}]`;
    return focused
      ? skin.accent(CURSOR_MARK) + skin.fill(skin.bold(skin.text(`${text} `)))
      : skin.fill(skin.muted(` ${text} `));
  };

  let full = "";
  for (const [index, tab] of tabs.entries()) {
    if (index > 0) full += skin.dim(tab.startsGroup ? GROUP_SEP : SEP);
    full += cell(tab, index);
  }
  if (visibleWidth(full) <= width) return full;

  // Too narrow for the strip: name where you are and that there is more either side.
  const label = `‹ ${tabText(active)} ›  (${activeIndex + 1}/${tabs.length})`;
  if (visibleWidth(label) > width) return tabText(active).slice(0, Math.max(0, width));
  if (options.plain === true) return label;
  return focused ? skin.fill(skin.bold(skin.text(label))) : skin.fill(skin.muted(label));
}

export function stepTab(tabs: readonly Tab[], activeIndex: number, delta: number): number {
  if (tabs.length === 0) return 0;
  return (activeIndex + delta + tabs.length) % tabs.length;
}

export function indexOfTab(tabs: readonly Tab[], id: TabId): number {
  const at = tabs.findIndex((tab) => tab.id === id);
  return at === -1 ? 0 : at;
}
