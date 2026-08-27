import { KINDS, type Entry, type Inventory } from "./inventory.ts";
import { sanitizeText } from "./sanitize.ts";
import type { Skin } from "./skin.ts";
import { isContentEntry } from "./tabs.ts";
import { clip, padTo, visibleWidth } from "./width.ts";

// The Overview tab. Not a list — a situation report.
//
// The counts are the obvious half. The half that earns the page is underneath: the conditions
// that make an installed thing not work. Those are invisible everywhere else, and they are the
// reason someone opens this panel after "I installed it and nothing happened".
//
// The first version printed both halves in the same voice, so "disabled: none" and "this
// project's resources are NOT loading" carried identical weight and the eye had to read every
// line to find the one that mattered. Now each health line leads with a state marker and the
// two states are coloured apart, so a page with nothing wrong can be dismissed at a glance and
// a page with something wrong points at it.

const LABEL_WIDTH = 17;
const KIND_WIDTH = 12;
const COUNT_WIDTH = 4;
const COLUMN = 18;
const RULE = "─";

/** Fine, and attention. Nothing in between — an amber that means "maybe" helps nobody. */
type Health = "fine" | "attention";

interface HealthLine {
  state: Health;
  label: string;
  value: string;
  /** An extra line hanging under the entry, for the rare case that needs a sentence. */
  detail?: string;
}

function padStart(text: string, width: number): string {
  const room = width - visibleWidth(text);
  return room > 0 ? " ".repeat(room) + text : text;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Shortens a path for display only. What gets copied is always the full one. */
export function shortenPath(path: string, home: string): string {
  const slash = (value: string): string => value.replace(/\\/g, "/");
  const p = slash(path);
  const h = slash(home);
  if (h !== "" && p.toLowerCase().startsWith(h.toLowerCase())) return `~${p.slice(h.length)}`;
  return p;
}

function headline(inventory: Inventory, skin: Skin): string[] {
  const contents = inventory.entries.filter(isContentEntry);
  const packages = inventory.entries.filter((entry) => entry.kind === "package");
  const insidePackages = contents.filter((entry) => entry.origin === "package").length;
  const builtIn = contents.filter((entry) => entry.scope === "builtin").length;
  const installed = contents.length - builtIn;
  const standalone = installed - insidePackages;

  const lines = [
    `  ${skin.bold(skin.text(plural(packages.length, "package")))}${skin.muted("  +  ")}${skin.bold(skin.text(String(installed)))}${skin.muted(" things installed")}`,
    // The two clauses have to add up to the line above them, so built-ins — which nobody
    // installed — get their own line rather than a third clause that breaks the sum.
    skin.muted(`  ${insidePackages} came inside a package · ${standalone} standalone`),
  ];
  if (builtIn > 0) {
    lines.push(skin.dim(`  plus ${builtIn} built into pi, which you did not install and cannot remove`));
  }
  return lines;
}

function countsBlock(entries: readonly Entry[], skin: Skin): string[] {
  const lines: string[] = [];
  for (const kind of KINDS) {
    if (kind === "package") continue;
    const list = entries.filter((entry) => entry.kind === kind);
    if (list.length === 0 && kind === "mcp") continue;
    const builtIn = list.filter((entry) => entry.scope === "builtin").length;
    const fromPackages = list.filter((entry) => entry.origin === "package").length;
    const standalone = list.length - fromPackages - builtIn;
    // MCP servers come from config files rather than from an install, so "standalone" would be
    // the wrong word for them.
    const loose = kind === "mcp" ? "from config files" : "standalone";
    const parts = [
      fromPackages > 0 ? padTo(`${fromPackages} from packages`, COLUMN) : "",
      standalone > 0 ? padTo(`${standalone} ${loose}`, COLUMN + 4) : "",
      // Themes are the case: pi ships two, so counting only the installed ones says "2" to
      // someone who can choose from four.
      builtIn > 0 ? `${builtIn} built into pi` : "",
    ].filter((part) => part !== "");
    const detail = parts.length === 0 ? skin.dim("none installed") : skin.muted(parts.join("").trimEnd());
    // Counts are right-aligned so the column reads as a column, not as ragged prose.
    const count = list.length === 0 ? skin.dim(padStart("0", COUNT_WIDTH)) : skin.text(padStart(String(list.length), COUNT_WIDTH));
    lines.push(`  ${skin.dim(padTo(kind, KIND_WIDTH))}${count}   ${detail}`);
  }
  return lines;
}

/** The health entries as data, so what counts as a problem can be tested without rendering. */
export function healthEntries(inventory: Inventory): HealthLine[] {
  const { entries, environment } = inventory;
  const lines: HealthLine[] = [];

  const disabled = entries.filter((entry) => !entry.enabled && entry.kind !== "package");
  lines.push(
    disabled.length === 0
      ? { state: "fine", label: "disabled", value: "none" }
      : {
          state: "attention",
          label: "disabled",
          value: `${plural(disabled.length, "item")} · ${disabled.map((entry) => entry.name).slice(0, 3).join(", ")}`,
        },
  );

  // The single most common cause of "I put a skill in .pi/ and pi ignored it".
  if (!environment.projectNeedsTrust) {
    lines.push({ state: "fine", label: "project trust", value: "not needed · this project contributes nothing" });
  } else if (environment.projectTrusted) {
    lines.push({ state: "fine", label: "project trust", value: "trusted · project resources are loading" });
  } else {
    lines.push({
      state: "attention",
      label: "project trust",
      value: "NOT TRUSTED · this project's .pi/ resources are NOT loading",
    });
  }

  const mcpEntries = entries.filter((entry) => entry.kind === "mcp");
  if (environment.mcpProvider !== null) {
    lines.push({
      state: "fine",
      label: "mcp",
      value: `${plural(mcpEntries.length, "server")} · read by ${environment.mcpProvider}, not by pi`,
    });
  } else if (mcpEntries.length > 0) {
    // Config files exist and nothing is reading them. Only this panel can say so.
    lines.push({
      state: "attention",
      label: "mcp",
      value: `${plural(mcpEntries.length, "server")} defined, but NO package reads them`,
      detail: "an mcp.json alone does nothing — pi has no MCP support of its own",
    });
  }

  const shadowed = entries.filter((entry) => (entry.shadows?.length ?? 0) > 0);
  if (shadowed.length > 0) {
    lines.push({
      state: "attention",
      label: "overridden",
      value: `${plural(shadowed.length, "name")} defined more than once · ${shadowed.map((entry) => entry.name).join(", ")}`,
    });
  }

  const missing = entries.filter((entry) => entry.kind === "package" && !entry.enabled);
  if (missing.length > 0) {
    lines.push({
      state: "attention",
      label: "not installed",
      value: `${plural(missing.length, "package")} configured but missing from disk`,
    });
  }

  return lines;
}

const FINE_MARK = "·";
const ATTENTION_MARK = "!";

function healthBlock(inventory: Inventory, width: number, skin: Skin): string[] {
  const lines: string[] = [];
  for (const item of healthEntries(inventory)) {
    const attention = item.state === "attention";
    const mark = attention ? skin.warn(ATTENTION_MARK) : skin.dim(FINE_MARK);
    const label = attention ? skin.text(padTo(item.label, LABEL_WIDTH)) : skin.muted(padTo(item.label, LABEL_WIDTH));
    const room = Math.max(8, width - LABEL_WIDTH - 5);
    const value = attention ? skin.warn(clip(item.value, room)) : skin.muted(clip(item.value, room));
    lines.push(`  ${mark}  ${label}${value}`);
    if (item.detail !== undefined) {
      lines.push(`     ${skin.dim(clip(item.detail, Math.max(8, width - 5)))}`);
    }
  }
  return lines;
}

function whereBlock(inventory: Inventory, width: number, skin: Skin): string[] {
  const { environment } = inventory;
  const room = Math.max(8, width - LABEL_WIDTH - 5);
  const line = (label: string, value: string): string =>
    `  ${skin.dim(FINE_MARK)}  ${skin.muted(padTo(label, LABEL_WIDTH))}${skin.dim(clip(value, room))}`;
  const lines = [
    line("agent dir", sanitizeText(shortenPath(environment.agentDir, ""))),
    line("project", sanitizeText(shortenPath(environment.cwd, ""))),
  ];
  for (const error of inventory.errors) {
    lines.push(`  ${skin.warn(ATTENTION_MARK)}  ${skin.text(padTo("could not read", LABEL_WIDTH))}${skin.warn(clip(sanitizeText(error), room))}`);
  }
  return lines;
}

/**
 * The page as separate blocks.
 *
 * The panel puts its own dividers between them, because inside a frame a divider has to reach
 * both borders — something a block that only knows its own text cannot draw.
 */
export function overviewSections(inventory: Inventory, width: number, home: string, skin: Skin): string[][] {
  const withHome = {
    ...inventory,
    environment: {
      ...inventory.environment,
      agentDir: shortenPath(inventory.environment.agentDir, home),
      cwd: shortenPath(inventory.environment.cwd, home),
    },
  };
  return [
    ["", ...headline(inventory, skin), "", ...countsBlock(inventory.entries, skin)],
    healthBlock(inventory, width, skin),
    whereBlock(withHome, width, skin),
  ];
}

/** Flat rendering, for the narrow fallback where there is no frame to hang dividers on. */
export function overviewLines(inventory: Inventory, width: number, home: string, skin: Skin): string[] {
  const rule = skin.dim(`  ${RULE.repeat(Math.max(10, Math.min(width - 4, 70)))}`);
  const sections = overviewSections(inventory, width, home, skin);
  const lines: string[] = [];
  for (const [index, section] of sections.entries()) {
    if (index > 0) lines.push("", rule, "");
    lines.push(...section);
  }
  return lines;
}
