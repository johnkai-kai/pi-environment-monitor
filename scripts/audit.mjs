// Cross-checks this package's inventory against pi's own ResourceLoader, which loads the same
// resources by a different path through the same library. Anything the two disagree about is a
// bug in one of them, and it is nearly always this one.
//
// Also reports duplicates, paths that do not exist, and the project trust state, since untrusted
// projects silently contribute nothing.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DefaultPackageManager,
  DefaultResourceLoader,
  ProjectTrustStore,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const root = resolve(process.argv[2] ?? ".");
const cwd = resolve(process.argv[3] ?? process.cwd());
const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const { collectInventory } = await import(pathToFileURL(join(root, "src/collect/resources.ts")).href);

const norm = (p) => p.replace(/\\/g, "/").toLowerCase();
const head = (title) => console.log(`\n=== ${title} ===`);

// ---------------------------------------------------------------- trust
const trust = new ProjectTrustStore(agentDir).get(cwd);
head("project trust");
console.log(`cwd:      ${cwd}`);
console.log(`decision: ${JSON.stringify(trust)}`);
console.log("pi loads project .pi/ resources and ancestor .agents/ skills only when trusted.");

// ---------------------------------------------------------------- ours
const ours = await collectInventory({ cwd, agentDir });
head("ours");
const byKind = {};
for (const e of ours.entries) (byKind[e.kind] ??= []).push(e);
for (const [kind, list] of Object.entries(byKind)) console.log(`${kind}: ${list.length}`);
if (ours.errors.length > 0) console.log("errors:", ours.errors);

// ---------------------------------------------------------------- pi's own loader
const settingsManager = SettingsManager.create(cwd, agentDir);
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
await loader.reload();

const piSets = {
  skill: loader.getSkills().skills.map((s) => s.filePath),
  prompt: loader.getPrompts().prompts.map((p) => p.filePath),
  theme: loader.getThemes().themes.map((t) => t.sourcePath).filter(Boolean),
};
const piDiagnostics = [
  ...loader.getSkills().diagnostics,
  ...loader.getPrompts().diagnostics,
  ...loader.getThemes().diagnostics,
];

head("ours vs pi's ResourceLoader");
for (const [kind, piPaths] of Object.entries(piSets)) {
  const oursPaths = (byKind[kind] ?? []).filter((e) => e.enabled).map((e) => e.path);
  const o = new Set(oursPaths.map(norm));
  const p = new Set(piPaths.map(norm));
  const missing = [...p].filter((x) => !o.has(x));
  const extra = [...o].filter((x) => !p.has(x));
  const verdict = missing.length === 0 && extra.length === 0 ? "match" : "MISMATCH";
  console.log(`${kind}: ours=${o.size} pi=${p.size} ${verdict}`);
  for (const x of missing) console.log(`   pi has, we miss: ${x}`);
  for (const x of extra) console.log(`   we have, pi does not: ${x}`);
}
const piExt = loader.getExtensions();
console.log(`extension: ours=${(byKind.extension ?? []).length} pi=${piExt.extensions.length} (pi counts loaded modules)`);
for (const err of piExt.errors) console.log(`   pi failed to load: ${err.path} — ${err.error}`);
if (piDiagnostics.length > 0) {
  console.log("pi diagnostics this panel does not surface:");
  for (const d of piDiagnostics) console.log(`   ${JSON.stringify(d)}`);
}

// ---------------------------------------------------------------- duplicates and dead paths
head("duplicates");
const seenKey = new Map();
const seenPath = new Map();
for (const e of ours.entries) {
  const key = `${e.kind}/${e.name}`;
  (seenKey.get(key) ?? seenKey.set(key, []).get(key)).push(e.path);
  const pk = `${e.kind}/${norm(e.path)}`;
  (seenPath.get(pk) ?? seenPath.set(pk, []).get(pk)).push(e.name);
}
let dupes = 0;
for (const [key, paths] of seenKey) {
  if (paths.length > 1) {
    dupes += 1;
    console.log(`same kind+name ${paths.length}x: ${key}`);
    for (const p of paths) console.log(`   ${p}`);
  }
}
for (const [key, names] of seenPath) {
  if (names.length > 1) {
    dupes += 1;
    console.log(`same path listed ${names.length}x: ${key} as ${names.join(", ")}`);
  }
}
if (dupes === 0) console.log("none");

head("paths that do not exist on disk");
const dead = ours.entries.filter((e) => e.path !== "(not installed)" && !existsSync(e.path));
console.log(dead.length === 0 ? "none" : dead.map((e) => `${e.kind} ${e.name}: ${e.path}`).join("\n"));

// ---------------------------------------------------------------- what each package contributes
head("what each package actually contributes");
const pm = new DefaultPackageManager({ cwd, agentDir, settingsManager });
const configured = pm.listConfiguredPackages();
for (const pkg of configured) {
  const contributions = ours.entries.filter((e) => e.kind !== "package" && e.source === pkg.source);
  const counts = {};
  for (const c of contributions) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  const summary = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing";
  console.log(`${pkg.source}${pkg.filtered ? "  [filtered]" : ""}\n    -> ${summary}`);
}

// ---------------------------------------------------------------- disabled
head("anything disabled");
const off = ours.entries.filter((e) => !e.enabled);
console.log(off.length === 0 ? "none" : off.map((e) => `${e.kind} ${e.name} (${e.source})`).join("\n"));
