import { homedir } from "node:os";
import {
  copyToClipboard,
  getAgentDir,
  getSelectListTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";
import { collectInventory } from "./collect/resources.ts";
import { debugLogPath, writeDebug } from "./debug.ts";
import type { Inventory } from "./inventory.ts";
import { buildRows, errorLines, filterHint, summaryLine, textReport } from "./rows.ts";

const COMMANDS = ["pi-env", "pi-environment-monitor"] as const;
const MAX_VISIBLE = 16;

const PRINTABLE = /^[\x20-\x7e]$/;
const BACKSPACE = new Set(["\x7f", "\b"]);

// Container is only a layout box — it has no handleInput — so a panel built on one must
// forward keys to its inner component itself. Forget that and every key is silently swallowed
// with no error to explain it; pi's own submenus are written the same way.
//
// SelectList handles only up / down / enter / escape. Typing is ours: with six kinds and every
// package's contents in one list, an inventory of any size is unusable without a filter.
//
// Do not use TypeScript parameter properties here (constructor(private readonly x)). Node's
// --experimental-strip-types cannot parse them and the module explodes at load, while
// tsc --noEmit says nothing. tests/loadable.test.ts is the guard.
class Panel {
  readonly list: SelectList;
  readonly box: Container;
  readonly status: Text;
  filter = "";

  constructor(list: SelectList, box: Container, status: Text) {
    this.list = list;
    this.box = box;
    this.status = status;
  }

  private applyFilter(next: string): void {
    this.filter = next;
    this.list.setFilter(next);
    this.status.setText(filterHint(next));
  }

  handleInput(data: string): void {
    if (BACKSPACE.has(data)) {
      if (this.filter !== "") this.applyFilter(this.filter.slice(0, -1));
      return;
    }
    if (PRINTABLE.test(data)) {
      this.applyFilter(this.filter + data);
      return;
    }
    this.list.handleInput(data);
  }

  invalidate(): void {
    this.box.invalidate();
  }

  render(width: number): string[] {
    return this.box.render(width);
  }
}

function showPanel(ctx: ExtensionCommandContext, inventory: Inventory): Promise<null> {
  const items = buildRows(inventory.entries).map((row) => ({
    value: row.value,
    label: row.label,
    description: row.description,
  }));

  return ctx.ui.custom<null>((_tui, _theme, _keybindings, done) => {
    const list = new SelectList(items, MAX_VISIBLE, getSelectListTheme());
    const status = new Text(filterHint(""));

    list.onCancel = (): void => done(null);
    list.onSelect = (item): void => {
      // Copying a path out is still read-only, and it is what anyone actually wants once they
      // have found the row they were looking for.
      void copyToClipboard(item.value).then(
        () => ctx.ui.notify(`Copied ${item.value}`, "info"),
        // Clipboard access fails over plain SSH and in bare terminals. Printing the path is a
        // worse answer than copying it, but it is still the answer.
        () => ctx.ui.notify(item.value, "info"),
      );
      done(null);
    };

    const box = new Container();
    box.addChild(new Text(summaryLine(inventory.entries)));
    for (const line of errorLines(inventory)) box.addChild(new Text(line));
    box.addChild(list);
    box.addChild(status);
    return new Panel(list, box, status);
  });
}

async function run(ctx: ExtensionCommandContext): Promise<void> {
  const agentDir = getAgentDir();
  const inventory = await collectInventory({ cwd: ctx.cwd, agentDir, home: homedir() });

  if (inventory.entries.length === 0 && inventory.errors.length > 0) {
    ctx.ui.notify(errorLines(inventory).join("; "), "error");
    return;
  }

  // Print and piped modes have no dialog UI, but the report still has to come out somewhere.
  if (!ctx.hasUI || ctx.mode !== "tui") {
    ctx.ui.notify(textReport(inventory).join("\n"), "info");
    return;
  }

  await showPanel(ctx, inventory);
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
