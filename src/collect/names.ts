import type { Kind } from "../inventory.ts";

// pi's resolver hands back file paths, not display names, so the name has to come from the
// path. Each kind stores itself differently, and the rules are pi's own conventions:
//
//   skill      <dir>/SKILL.md            -> the directory name
//   extension  <dir>/index.ts            -> the directory name
//   prompt     <name>.md                 -> the stem
//   theme      <name>.json               -> the stem
//
// A skill or extension can also be a bare file, in which case the stem is the name.
//
// Extensions inside a package are the exception, and the first real run of this package is
// what found it: a package's entry point is nearly always a build or source directory, so the
// directory rule named four different packages "dist", "src", "extensions" and "pi". Nobody
// looks for an extension under those names. A package-provided extension is known by its
// package, and the package spec is already in the metadata — no filesystem walk, and no list
// of build-directory names to keep up to date.

const SEPARATORS = /[\\/]+/;
const SPEC_PREFIX = /^[a-z]+:/;
const INDEX_STEM = "index";
const SKILL_FILE = "skill.md";

function segments(path: string): string[] {
  return path.split(SEPARATORS).filter((part) => part !== "");
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** True when the basename is a container's fixed entry point rather than a name. */
function isEntryPoint(kind: Kind, base: string): boolean {
  const lower = base.toLowerCase();
  if (kind === "skill") return lower === SKILL_FILE;
  if (kind === "extension") return stem(lower) === INDEX_STEM;
  return false;
}

/** `npm:@llblab/pi-telegram` and `git:github.com/owner/pi-eli5` both name "pi-telegram" / "pi-eli5". */
export function packageName(source: string): string | null {
  const withoutPrefix = source.replace(SPEC_PREFIX, "");
  const last = segments(withoutPrefix).at(-1);
  return last === undefined || last === "" ? null : last;
}

export function pathName(kind: Kind, path: string): string {
  const parts = segments(path);
  const base = parts.at(-1);
  if (base === undefined) return path;
  if (isEntryPoint(kind, base)) {
    const parent = parts.at(-2);
    if (parent !== undefined) return parent;
  }
  return stem(base);
}

export interface NameInput {
  kind: Kind;
  path: string;
  origin: "package" | "top-level";
  source: string;
}

export function displayName(input: NameInput): string {
  if (input.kind === "extension" && input.origin === "package") {
    const fromPackage = packageName(input.source);
    if (fromPackage !== null) return fromPackage;
  }
  return pathName(input.kind, input.path);
}
