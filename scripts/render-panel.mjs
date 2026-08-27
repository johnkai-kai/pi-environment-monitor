// Renders the real panel at a given width with no terminal attached, so layout is measurable
// instead of eyeballed from a screenshot. Keys can be driven from the command line, which makes
// every view reachable: tab switching, filtering, and drilling into a package.
//
//   node scripts/render-panel.mjs . 120            Overview, as it opens
//   node scripts/render-panel.mjs . 120 right      one tab across
//   node scripts/render-panel.mjs . 120 right,right,type:tele
//   node scripts/render-panel.mjs . 120 end,enter  into the first package
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? ".");
const width = Number(process.argv[3] ?? 120);
const script = process.argv[4] ?? "";
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

const { collectInventory } = await load("src/collect/resources.ts");
const { Panel } = await load("src/panel.ts");
const { buildTabs } = await load("src/tabs.ts");

const KEYS = {
  left: "\x1b[D",
  right: "\x1b[C",
  up: "\x1b[A",
  down: "\x1b[B",
  enter: "\r",
  esc: "\x1b",
  backspace: "\x7f",
};

const home = homedir();
const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(home, ".pi", "agent");
const inventory = await collectInventory({ cwd: process.cwd(), agentDir, home });

let closed = false;
const panel = new Panel(
  inventory,
  home,
  buildTabs(inventory.entries),
  () => {
    closed = true;
  },
  (path) => console.log(`[would copy] ${path}`),
);

for (const step of script.split(",").map((s) => s.trim()).filter(Boolean)) {
  if (step.startsWith("type:")) {
    for (const ch of step.slice(5)) panel.handleInput(ch);
  } else if (step === "end") {
    // Walk to the last tab without needing to know how many there are.
    for (let i = 0; i < panel.tabs.length - 1; i += 1) panel.handleInput(KEYS.right);
  } else if (KEYS[step]) {
    panel.handleInput(KEYS[step]);
  } else {
    console.error(`unknown step "${step}"`);
    process.exit(1);
  }
}

const ruler = "-".repeat(width);
console.log(`${ruler}\nwidth=${width}  steps=${script || "(none)"}  closed=${closed}\n${ruler}`);
for (const line of panel.render(width)) {
  // Anything past the edge is invisible in a real session, so mark it rather than let it hide.
  const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
  console.log(line + (plain.length > width ? `  <<OVER ${plain.length - width}` : ""));
}
console.log(ruler);
