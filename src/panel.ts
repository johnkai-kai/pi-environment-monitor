import { homedir } from "node:os";
import {
  copyToClipboard,
  getAgentDir,
  getSelectListTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { SelectList } from "@earendil-works/pi-tui";
import { collectInventory } from "./collect/resources.ts";
import { debugLogPath, writeDebug } from "./debug.ts";
import type { Entry, Inventory } from "./inventory.ts";
import { overviewLines } from "./overview.ts";
import {
  buildRows,
  detailLines,
  errorLines,
  filterEntries,
  keyHint,
  primaryColumnWidth,
  textReport,
  type KeyHintMode,
} from "./rows.ts";
import { buildTabs, entriesForTab, renderTabBar, stepTab, tabShowsKindColumn, type Tab } from "./tabs.ts";

const COMMANDS = ["pi-env", "pi-environment-monitor"] as const;
const MAX_VISIBLE = 14;

const PRINTABLE = /^[\x20-\x7e]$/;
const BACKSPACE = new Set(["\x7f", "\b"]);
const LEFT = new Set(["\x1b[D", "\x1bOD"]);
const RIGHT = new Set(["\x1b[C", "\x1bOC"]);
const ESCAPE = "\x1b";
const RULE = "─";

// The panel renders itself rather than delegating to a Container. Two reasons: the tab strip has
// to be laid out against the render-time width, which a pre-built child cannot see; and Container
// has no handleInput, so anything built on one has to hand-forward every key anyway.
//
// Do not use TypeScript parameter properties here (constructor(private readonly x)). Node's
// --experimental-strip-types cannot parse them and the module explodes at load, while
// tsc --noEmit says nothing. tests/loadable.test.ts is the guard.
//
// Exported so scripts/render-panel.mjs can render it at any width with no terminal attached.
export class Panel {
  readonly inventory: Inventory;
  readonly home: string;
  readonly tabs: Tab[];
  readonly done: (result: null) => void;
  readonly onCopy: (path: string) => void;

  activeIndex = 0;
  filter = "";
  /** The package being looked inside, or null at the top level. */
  drilledInto: Entry | null = null;
  list: SelectList | null = null;
  /** The column layout depends on terminal width, which is only known at render time. */
  lastWidth = 120;

  constructor(
    inventory: Inventory,
    home: string,
    tabs: Tab[],
    done: (result: null) => void,
    onCopy: (path: string) => void,
  ) {
    this.inventory = inventory;
    this.home = home;
    this.tabs = tabs;
    this.done = done;
    this.onCopy = onCopy;
    this.rebuild();
  }

  private get activeTab(): Tab {
    return this.tabs[this.activeIndex] as Tab;
  }

  /** Entries the current view is showing, before filtering. */
  private baseEntries(): Entry[] {
    const drilled = this.drilledInto;
    if (drilled !== null) {
      return this.inventory.entries.filter(
        (entry) => entry.kind !== "package" && entry.source === drilled.source,
      );
    }
    return entriesForTab(this.activeTab, this.inventory.entries);
  }

  private mode(): KeyHintMode {
    if (this.activeTab.id === "overview") return "page";
    if (this.drilledInto !== null) return "drill";
    return this.activeTab.id === "packages" ? "packages" : "list";
  }

  /** SelectList has no setItems, so a changed view means a new list. */
  private rebuild(): void {
    if (this.activeTab.id === "overview") {
      this.list = null;
      return;
    }
    // Inside a package the rows are a mix of kinds, so the column earns its space again.
    const showKind = this.drilledInto !== null || tabShowsKindColumn(this.activeTab);
    const entries = filterEntries(this.baseEntries(), this.filter);
    const rows = buildRows(entries, { showKind, context: this.inventory.entries });
    const items = rows.map((row) => ({
      value: row.value,
      label: row.label,
      description: row.description,
    }));

    // Sized to the longest name instead of pi-tui's fixed 32 columns, which truncated names to
    // the point where two different packages read identically.
    const column = primaryColumnWidth(rows, this.lastWidth);
    const list = new SelectList(items, MAX_VISIBLE, getSelectListTheme(), {
      minPrimaryColumnWidth: column,
      maxPrimaryColumnWidth: column,
    });
    list.onCancel = (): void => this.goBack();
    list.onSelect = (item): void => this.confirm(item.value);
    this.list = list;
  }

  private selectedEntry(): Entry | null {
    const value = this.list?.getSelectedItem()?.value;
    if (value === undefined) return null;
    return filterEntries(this.baseEntries(), this.filter).find((entry) => entry.path === value) ?? null;
  }

  private confirm(path: string): void {
    const entry = this.selectedEntry();
    // On the Packages tab, Enter means "show me what is in this box" rather than "copy the box".
    if (this.activeTab.id === "packages" && this.drilledInto === null && entry !== null) {
      this.drilledInto = entry;
      this.filter = "";
      this.rebuild();
      return;
    }
    this.onCopy(path);
    this.done(null);
  }

  private goBack(): void {
    if (this.drilledInto !== null) {
      this.drilledInto = null;
      this.filter = "";
      this.rebuild();
      return;
    }
    this.done(null);
  }

  private switchTab(delta: number): void {
    this.activeIndex = stepTab(this.tabs, this.activeIndex, delta);
    this.drilledInto = null;
    // A filter typed for one tab means nothing on the next, and carrying it over looks like an
    // empty tab rather than a filtered one.
    this.filter = "";
    this.rebuild();
  }

  handleInput(data: string): void {
    // Switching tabs is available everywhere, including from inside a package.
    if (LEFT.has(data)) return this.switchTab(-1);
    if (RIGHT.has(data)) return this.switchTab(1);

    if (this.list === null) {
      if (data === ESCAPE) this.done(null);
      return;
    }

    if (BACKSPACE.has(data)) {
      if (this.filter !== "") {
        this.filter = this.filter.slice(0, -1);
        this.rebuild();
      }
      return;
    }
    if (PRINTABLE.test(data)) {
      this.filter += data;
      this.rebuild();
      return;
    }
    this.list.handleInput(data);
  }

  invalidate(): void {
    this.list?.invalidate();
  }

  render(width: number): string[] {
    if (width !== this.lastWidth) {
      this.lastWidth = width;
      this.rebuild();
    }
    const lines: string[] = [renderTabBar(this.tabs, this.activeIndex, width), ""];

    const drilled = this.drilledInto;
    if (drilled !== null) lines.push(`  ‹ Packages / ${drilled.name} ›`, "");

    if (this.list === null) {
      lines.push(...overviewLines(this.inventory, width, this.home));
    } else {
      const body = this.list.render(width);
      lines.push(...(body.length > 0 ? body : ["  nothing matches that filter"]));
      lines.push(`  ${RULE.repeat(Math.max(10, Math.min(width - 4, 70)))}`);
      lines.push(...detailLines(this.selectedEntry(), this.home));
    }

    lines.push("", keyHint(this.mode(), this.filter));
    return lines;
  }
}

function showPanel(ctx: ExtensionCommandContext, inventory: Inventory, home: string): Promise<null> {
  const tabs = buildTabs(inventory.entries);
  return ctx.ui.custom<null>((_tui, _theme, _keybindings, done) => {
    const onCopy = (path: string): void => {
      // Copying a path out is still read-only, and it is what anyone wants once they have found
      // the row they were looking for.
      void copyToClipboard(path).then(
        () => ctx.ui.notify(`Copied ${path}`, "info"),
        // Clipboard access fails over plain SSH and in bare terminals. Printing the path is a
        // worse answer than copying it, but it is still the answer.
        () => ctx.ui.notify(path, "info"),
      );
    };
    return new Panel(inventory, home, tabs, done, onCopy);
  });
}

async function run(ctx: ExtensionCommandContext): Promise<void> {
  const agentDir = getAgentDir();
  const home = homedir();
  const inventory = await collectInventory({ cwd: ctx.cwd, agentDir, home });

  if (inventory.entries.length === 0 && inventory.errors.length > 0) {
    ctx.ui.notify(errorLines(inventory).join("; "), "error");
    return;
  }

  // Print and piped modes have no dialog UI, but the report still has to come out somewhere.
  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify(textReport(inventory).join("\n"), "info");
    return;
  }

  await showPanel(ctx, inventory, home);
}

export default function activate(pi: ExtensionAPI): void {
  const logPath = debugLogPath(process.env, getAgentDir());

  for (const name of COMMANDS) {
    pi.registerCommand(name, {
      description:
        "List every installed skill, extension, MCP server, package, theme and prompt template, with its path on disk",
      handler: async (_args, ctx) => {
        try {
          await run(ctx);
        } catch (error) {
          // A diagnostic panel that takes the agent down with it would be worse than no panel.
          writeDebug(logPath, "panel", error);
          const reason = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`pi-environment-monitor failed: ${reason}`, "error");
        }
      },
    });
  }
}
