import { join } from "node:path";
import type { Entry } from "../inventory.ts";
import { safe, type Readers } from "./readers.ts";

// Themes that ship inside pi itself.
//
// Nothing else reports these. `PackageManager.resolve()` returns installed resources, and so
// does `ResourceLoader.getThemes()` — both stop at what the user added. But pi ships `dark` and
// `light` too, so a panel counting only the installed ones says "2 themes" to someone who can
// pick from four. That is the wrong answer to "what do I have".
//
// They are marked with their own scope rather than blended in: they were not installed, cannot
// be removed, and are the one kind of row here that exists on every pi install.

const THEME_DIR = ["dist", "modes", "interactive", "theme"];
const JSON_SUFFIX = ".json";
/** Not a theme — the schema themes are validated against, shipped alongside them. */
const SCHEMA_SUFFIX = "-schema";

export const BUILTIN_SOURCE = "builtin";

/**
 * Reads pi's own theme directory. The package root comes from pi's exported `getPackageDir()`;
 * only the path within it is an assumption, so if pi moves the directory this quietly reports
 * none rather than failing — the panel loses a row, not its footing.
 */
export function builtinThemes(packageDir: string, readers: Readers): Entry[] {
  const dir = join(packageDir, ...THEME_DIR);
  const files = safe(() => readers.listDir(dir), []);
  return files
    .filter((file) => !file.isDirectory && file.name.endsWith(JSON_SUFFIX))
    .map((file) => file.name.slice(0, -JSON_SUFFIX.length))
    .filter((name) => !name.endsWith(SCHEMA_SUFFIX))
    .map((name) => ({
      kind: "theme" as const,
      name,
      path: join(dir, `${name}${JSON_SUFFIX}`),
      scope: "builtin" as const,
      origin: "top-level" as const,
      source: BUILTIN_SOURCE,
      enabled: true,
    }));
}
