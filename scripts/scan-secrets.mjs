import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: "windows-path", re: /[A-Za-z]:\\Users\\/ },
  { name: "home-path", re: /\/(?:home|Users)\/[A-Za-z0-9_-]+\// },
  { name: "api-key", re: /(sk-|gho_|ghp_|AKIA)[A-Za-z0-9_-]{8,}/ },
];

// This walks everything from the repo root, docs/ included. This package quotes real paths out
// of a real install while it is being developed, so a stray home directory or account name in a
// doc or a test fixture is the likeliest leak here. A directory the scanner skips is a directory
// nobody is looking at.
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_FILES = new Set([
  "LICENSE",
  "scan-secrets.mjs",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!SKIP_FILES.has(entry)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(process.cwd())) {
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    const hit = text.match(re);
    if (hit) findings.push(`${file}: ${name} → ${hit[0]}`);
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log("Secret scan passed");
