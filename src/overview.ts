import { KINDS, type Entry, type Inventory, type Kind } from "./inventory.ts";
import { sanitizeText } from "./sanitize.ts";
import { isContentEntry } from "./tabs.ts";

// The Overview tab. Not a list — a situation report.
//
// The counts are the obvious half. The half that earns the page is underneath: the conditions
// that make an installed thing not work. Those are invisible everywhere else, and they are the
// reason someone opens this panel after "I installed it and nothing happened".

const LABEL_WIDTH = 18;
const RULE = "─";

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function row(label: string, value: string): string {
  return `  ${pad(label, LABEL_WIDTH)}${value}`;
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

function countsBlock(entries: readonly Entry[]): string[] {
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
    const detail =
      list.length === 0
        ? "none installed"
        : [
            fromPackages > 0 ? pad(`${fromPackages} from packages`, 20) : "",
            standalone > 0 ? pad(`${standalone} ${loose}`, 22) : "",
            // Themes are the case: pi ships two, so counting only the installed ones says "2"
            // to someone who can choose from four.
            builtIn > 0 ? `${builtIn} built into pi` : "",
          ]
            .filter((part) => part !== "")
            .join("");
    lines.push(`  ${pad(kind, 12)}${pad(String(list.length), 6)}${detail.trimEnd()}`);
  }
  return lines;
}

function healthBlock(inventory: Inventory): string[] {
  const { entries, environment } = inventory;
  const lines: string[] = [];

  const disabled = entries.filter((entry) => !entry.enabled);
  lines.push(
    row(
      "disabled",
      disabled.length === 0
        ? "none"
        : `${plural(disabled.length, "item")} · ${disabled.map((entry) => entry.name).slice(0, 3).join(", ")}`,
    ),
  );

  // The single most common cause of "I put a skill in .pi/ and pi ignored it".
  if (!environment.projectNeedsTrust) {
    lines.push(row("project trust", "not needed · this project contributes nothing"));
  } else if (environment.projectTrusted) {
    lines.push(row("project trust", "trusted · project resources are loading"));
  } else {
    lines.push(row("project trust", "NOT TRUSTED · this project's .pi/ resources are NOT loading"));
  }

  const mcpEntries = entries.filter((entry) => entry.kind === "mcp");
  if (environment.mcpProvider !== null) {
    lines.push(row("mcp", `${plural(mcpEntries.length, "server")} · read by ${environment.mcpProvider}, not by pi`));
  } else if (mcpEntries.length > 0) {
    // Config files exist and nothing is reading them. Only this panel can say so.
    lines.push(row("mcp", `${plural(mcpEntries.length, "server")} defined, but NO package reads them`));
    lines.push(row("", "an mcp.json alone does nothing — pi has no MCP support"));
  }

  const shadowed = entries.filter((entry) => (entry.shadows?.length ?? 0) > 0);
  if (shadowed.length > 0) {
    lines.push(
      row(
        "overridden",
        `${plural(shadowed.length, "name")} defined more than once · ${shadowed.map((entry) => entry.name).join(", ")}`,
      ),
    );
  }

  const missing = entries.filter((entry) => entry.kind === "package" && !entry.enabled);
  if (missing.length > 0) {
    lines.push(row("not installed", `${plural(missing.length, "package")} configured but missing from disk`));
  }

  return lines;
}

export function overviewLines(inventory: Inventory, width: number, home = ""): string[] {
  const { entries, environment } = inventory;
  const contents = entries.filter(isContentEntry);
  const packages = entries.filter((entry) => entry.kind === "package");
  const insidePackages = contents.filter((entry) => entry.origin === "package").length;
  const rule = RULE.repeat(Math.max(10, Math.min(width - 4, 70)));

  const builtIn = contents.filter((entry) => entry.scope === "builtin").length;
  const installed = contents.length - builtIn;
  const standalone = installed - insidePackages;

  const lines: string[] = [
    "",
    `  ${plural(packages.length, "package")}  +  ${installed} things installed`,
    // The two clauses have to add up to the line above them, so built-ins — which nobody
    // installed — get their own line rather than a third clause that breaks the sum.
    `  ${insidePackages} came inside a package · ${standalone} standalone`,
    ...(builtIn > 0 ? [`  plus ${builtIn} built into pi, which you did not install and cannot remove`] : []),
    "",
    ...countsBlock(entries),
    "",
    `  ${rule}`,
    "",
    ...healthBlock(inventory),
    "",
    `  ${rule}`,
    "",
    row("agent dir", sanitizeText(shortenPath(environment.agentDir, home))),
    row("project", sanitizeText(shortenPath(environment.cwd, home))),
  ];

  for (const error of inventory.errors) lines.push(row("could not read", sanitizeText(error)));
  return lines;
}
