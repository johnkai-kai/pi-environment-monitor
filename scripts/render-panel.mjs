// Renders the panel's list exactly as pi would, at a given width, with no TUI.
// Colour is stripped so the output is plain text and the column maths is visible.
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SelectList } from "@earendil-works/pi-tui";

const root = resolve(process.argv[2]);
const width = Number(process.argv[3] ?? 200);
const rows = Number(process.argv[4] ?? 18);
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

const { collectInventory } = await load("src/collect/resources.ts");
const { buildRows } = await load("src/rows.ts");

const plain = (text) => text;
const THEME = {
  selectedPrefix: plain,
  selectedText: plain,
  description: plain,
  scrollInfo: plain,
  noMatch: plain,
};

const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const inv = await collectInventory({ cwd: process.cwd(), agentDir });
const items = buildRows(inv.entries).map((row) => ({
  value: row.value,
  label: row.label,
  description: row.description,
}));

const layout = process.env.PANEL_LAYOUT ? JSON.parse(process.env.PANEL_LAYOUT) : {};
const list = new SelectList(items, rows, THEME, layout);

const ruler = "".padEnd(width, "-");
console.log(`${ruler}\nwidth=${width}  items=${items.length}  layout=${JSON.stringify(layout)}\n${ruler}`);
for (const line of list.render(width)) {
  // Mark any line that runs past the terminal, which is invisible in a real session.
  const over = line.length > width ? `  <<OVER by ${line.length - width}` : "";
  console.log(line + over);
}
