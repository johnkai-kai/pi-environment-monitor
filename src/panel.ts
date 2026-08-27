import { homedir } from "node:os";
import {
  copyToClipboard,
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { collectInventory } from "./collect/resources.ts";
import { debugLogPath, writeDebug } from "./debug.ts";
import type { Entry, Inventory } from "./inventory.ts";
import { cursorPaint, type Focus } from "./highlight.ts";
import { moveSelection, renderList } from "./list-view.ts";
import { overviewLines } from "./overview.ts";
import {
  buildRows,
  detailLines,
  errorLines,
  filterEntries,
  DETAIL_LINES,
  keyHint,
  searchBox,
  selectionLine,
  textReport,
  type KeyHintMode,
  type Row,
} from "./rows.ts";
import { buildTabs, entriesForTab, renderTabBar, stepTab, tabShowsKindColumn, type Tab } from "./tabs.ts";

const COMMANDS = ["pi-env", "pi-environment-monitor"] as const;
const VISIBLE_ROWS = 12;
// Every view pads to this, so the panel never changes height — not when the cursor moves, not
// when a filter narrows the list, and not when switching between the Overview page and a tab.
// It is set by the tallest view, which is Overview; the list layout below comes to less.
//   tab strip, blank, search, blank, rows, counter, rule, selection, detail, blank, hint
const LIST_HEIGHT = 2 + 2 + VISIBLE_ROWS + 1 + 1 + 1 + DETAIL_LINES + 2;
const PANEL_HEIGHT = Math.max(LIST_HEIGHT, 28);
const PRINTABLE = /^[\x20-\x7e]$/;
const RULE = "─";

// Keys go through pi-tui's matchesKey, never raw byte comparison.
//
// The first version compared against "\x1b[D" and "\x1b" directly. That misses the kitty
// keyboard protocol and modifyOtherKeys encodings, which is what a real terminal actually sends,
// so no arrow and no escape ever matched. The panel opens on Overview — the one tab with no list
// to fall through to — and every key was swallowed there: no tab switching, no exit, nothing.
// It looked like a hang. matchesKey knows all three encodings.
//
// Do not use TypeScript parameter properties here (constructor(private readonly x)). Node's
// --experimental-strip-types cannot parse them and the module explodes at load, while
// tsc --noEmit says nothing. tests/loadable.test.ts is the guard.
//
// Exported so scripts/render-panel.mjs can drive it at any width with no terminal attached.
export class Panel {
  readonly inventory: Inventory;
  readonly home: string;
  readonly tabs: Tab[];
  readonly done: (result: null) => void;
  readonly onCopy: (path: string) => void;

  activeIndex = 0;
  filter = "";
  selectedIndex = 0;
  /**
   * Which half of the panel holds the cursor.
   *
   * One cursor moves through the whole panel rather than two independent modes — left and right
   * along the tabs, down into the list, up out of it again. The block of colour is always on the
   * thing the next keypress acts on, so "where am I" never needs working out.
   */
  focus: Focus = "tabs";
  /** The package being looked inside, or null at the top level. */
  drilledInto: Entry | null = null;

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
  }

  private get activeTab(): Tab {
    return this.tabs[this.activeIndex] as Tab;
  }

  private get isPage(): boolean {
    return this.activeTab.id === "overview";
  }

  /** Entries this view shows, before filtering. */
  private baseEntries(): Entry[] {
    const drilled = this.drilledInto;
    if (drilled !== null) {
      return this.inventory.entries.filter(
        (entry) => entry.kind !== "package" && entry.source === drilled.source,
      );
    }
    return entriesForTab(this.activeTab, this.inventory.entries);
  }

  private visibleEntries(): Entry[] {
    return filterEntries(this.baseEntries(), this.filter);
  }

  private visibleRows(): Row[] {
    const showKind = this.drilledInto !== null || tabShowsKindColumn(this.activeTab);
    return buildRows(this.visibleEntries(), { showKind, context: this.inventory.entries });
  }

  private selectedEntry(): Entry | null {
    return this.visibleEntries()[this.selectedIndex] ?? null;
  }

  private mode(): KeyHintMode {
    if (this.isPage) return "page";
    if (this.drilledInto !== null) return "drill";
    return this.activeTab.id === "packages" ? "packages" : "list";
  }

  private confirm(): void {
    const entry = this.selectedEntry();
    if (entry === null) return;
    // On the Packages tab, Enter means "show me what is in this box", not "copy the box".
    if (this.activeTab.id === "packages" && this.drilledInto === null) {
      this.drilledInto = entry;
      this.filter = "";
      this.selectedIndex = 0;
      this.focus = "list";
      return;
    }
    this.onCopy(entry.path);
    this.done(null);
  }

  private goBack(): void {
    if (this.drilledInto !== null) {
      this.drilledInto = null;
      this.filter = "";
      this.selectedIndex = 0;
      return;
    }
    this.done(null);
  }

  private switchTab(delta: number): void {
    this.activeIndex = stepTab(this.tabs, this.activeIndex, delta);
    this.drilledInto = null;
    // A filter typed for one tab means nothing on the next, and carrying it over would look
    // like an empty tab rather than a filtered one.
    this.filter = "";
    this.selectedIndex = 0;
    this.focus = "tabs";
  }

  handleInput(data: string): void {
    // Tab switching and exit work everywhere, including the Overview page and inside a package.
    if (matchesKey(data, "left")) return this.switchTab(-1);
    if (matchesKey(data, "right")) return this.switchTab(1);
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) return this.goBack();

    // Overview is a page, not a list, so there is nothing for the cursor to drop into.
    if (this.isPage) {
      if (matchesKey(data, "up")) return this.switchTab(-1);
      if (matchesKey(data, "down")) return this.switchTab(1);
      return;
    }

    const total = this.visibleEntries().length;

    if (matchesKey(data, "down")) {
      // Down from the tab strip is how you get into the list — the cursor moves, nothing else.
      if (this.focus === "tabs") this.focus = "list";
      else this.selectedIndex = moveSelection(total, this.selectedIndex, 1);
      return;
    }
    if (matchesKey(data, "up")) {
      // Up off the top row puts the cursor back on the tabs rather than sticking at row zero.
      if (this.focus === "list" && this.selectedIndex === 0) this.focus = "tabs";
      else if (this.focus === "list") this.selectedIndex = moveSelection(total, this.selectedIndex, -1);
      return;
    }
    if (matchesKey(data, "pageUp")) {
      this.focus = "list";
      this.selectedIndex = moveSelection(total, this.selectedIndex, -VISIBLE_ROWS);
      return;
    }
    if (matchesKey(data, "pageDown")) {
      this.focus = "list";
      this.selectedIndex = moveSelection(total, this.selectedIndex, VISIBLE_ROWS);
      return;
    }
    if (matchesKey(data, "home")) {
      this.focus = "list";
      this.selectedIndex = 0;
      return;
    }
    if (matchesKey(data, "end")) {
      this.focus = "list";
      this.selectedIndex = moveSelection(total, total - 1, 0);
      return;
    }
    if (matchesKey(data, "enter")) {
      // Enter on the tabs drops into the list; from there it acts on the selected row.
      if (this.focus === "tabs") {
        this.focus = "list";
        return;
      }
      return this.confirm();
    }
    if (matchesKey(data, "backspace")) {
      if (this.filter !== "") {
        this.filter = this.filter.slice(0, -1);
        this.selectedIndex = 0;
      }
      return;
    }
    // Whatever is left, if it is a single printable character, is search input.
    if (data.length === 1 && PRINTABLE.test(data)) {
      this.filter += data;
      this.selectedIndex = 0;
      // Typing is aimed at the results, so the cursor follows them down.
      this.focus = "list";
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const rule = `  ${RULE.repeat(Math.max(10, Math.min(width - 4, 70)))}`;
    // On a page the cursor has nowhere else to be, so the tab always holds it there.
    const onTabs = this.isPage || this.focus === "tabs";
    const lines: string[] = [
      renderTabBar(this.tabs, this.activeIndex, width, { paint: cursorPaint(onTabs) }),
      "",
    ];

    const drilled = this.drilledInto;
    if (drilled !== null) lines.push(`  ‹ Packages / ${drilled.name} ›`, "");

    if (this.isPage) {
      lines.push(...overviewLines(this.inventory, width, this.home));
    } else {
      const rows = this.visibleRows();
      lines.push(searchBox(this.filter, rows.length, this.baseEntries().length, width), "");
      lines.push(
        ...renderList(rows, {
          selectedIndex: this.selectedIndex,
          height: VISIBLE_ROWS,
          width,
          paint: cursorPaint(!onTabs),
        }),
      );
      lines.push(rule);
      lines.push(selectionLine(this.selectedEntry()));
      lines.push(...detailLines(this.selectedEntry(), this.home));
    }

    lines.push("", keyHint(this.mode(), this.filter));
    // A fixed height throughout: nothing below the list may shift when the cursor moves, the
    // filter changes, or a tab with fewer rows comes up.
    while (lines.length < PANEL_HEIGHT) lines.push("");
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
